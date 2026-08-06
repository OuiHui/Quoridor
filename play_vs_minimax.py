import os
import argparse
import torch
from quoridor_model import QuoridorNet, map_action_to_index_perspective
import quoridor_cpp


def _cpp_to_py(act):
    """Convert C++ Action to Python dict for action index mapping."""
    if act.type == 'move':
        return {'type': 'move', 'dir': act.move_dir, 'to': (act.to_x, act.to_y)}
    return {'type': 'wall', 'wallType': act.wall_type, 'x': act.wall_x, 'y': act.wall_y}


def evaluate_board(game, is_p1_turn):
    """Heuristic from P1's perspective. Mirrors the JS evaluateBoard function."""
    p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
    p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)

    if not p1_path: return -float('inf')
    if not p2_path: return float('inf')

    p1_dist = len(p1_path) - 1
    p2_dist = len(p2_path) - 1

    if p1_dist == 0: return float('inf')
    if p2_dist == 0: return -float('inf')

    p1_walls = game.p1_walls_left
    p2_walls = game.p2_walls_left

    if p1_walls == 0 and (p1_dist - p2_dist) >= 2: return -500.0
    if p2_walls == 0 and (p2_dist - p1_dist) >= 2: return  500.0

    score = (p2_dist - p1_dist) * 15.0
    if p1_dist <= 3: score += (4 - p1_dist) * 8.0
    if p2_dist <= 3: score -= (4 - p2_dist) * 8.0
    score += (p1_walls - p2_walls) * 3.0
    score += game.p1_pos[1] * 1.0
    score -= (8 - game.p2_pos[1]) * 1.0
    score += 7.5 if is_p1_turn else -7.5
    return score


def get_ordered_actions(game, player_num):
    """Return valid actions ordered best-first for alpha-beta pruning efficiency."""
    is_p1 = (player_num == 1)
    my_pos  = game.p1_pos if is_p1 else game.p2_pos
    opp_pos = game.p2_pos if is_p1 else game.p1_pos
    my_goal_y  = 8 if is_p1 else 0
    opp_goal_y = 0 if is_p1 else 8

    my_path  = game.get_shortest_path(my_pos,  my_goal_y,  opp_pos=opp_pos)
    opp_path = game.get_shortest_path(opp_pos, opp_goal_y, opp_pos=my_pos)
    my_path_set  = set(my_path)  if my_path  else set()
    opp_path_set = set(opp_path) if opp_path else set()

    def score_action(act):
        if act.type == 'move':
            dest = (act.to_x, act.to_y)
            y_gain = (dest[1] - my_pos[1]) if is_p1 else (my_pos[1] - dest[1])
            return 100 + (6 if dest in my_path_set else 0) + y_gain * 3
        wx, wy = act.wall_x, act.wall_y
        dist = abs(wx - opp_pos[0]) + abs(wy - opp_pos[1])
        near_path = any(abs(wx - px) <= 1 and abs(wy - py) <= 1 for px, py in opp_path_set)
        return 10 + max(0, 10 - dist) + (20 if near_path else 0)

    actions = game.get_valid_actions()
    actions.sort(key=score_action, reverse=True)
    return actions


def minimax_search(game, depth, alpha, beta, maximizing_player):
    """Alpha-beta minimax search. Returns (score, best_action)."""
    p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
    p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)

    if not p1_path or len(p1_path) == 1: return float('inf'),  None
    if not p2_path or len(p2_path) == 1: return -float('inf'), None

    if depth == 0:
        return evaluate_board(game, game.is_p1_turn), None

    best_move = None
    if maximizing_player:
        max_score = -float('inf')
        for act in get_ordered_actions(game, 1):
            score, _ = minimax_search(game.clone_and_step(act), depth - 1, alpha, beta, False)
            if score > max_score:
                max_score, best_move = score, act
            alpha = max(alpha, score)
            if beta <= alpha: break
        return max_score, best_move
    else:
        min_score = float('inf')
        for act in get_ordered_actions(game, 2):
            score, _ = minimax_search(game.clone_and_step(act), depth - 1, alpha, beta, True)
            if score < min_score:
                min_score, best_move = score, act
            beta = min(beta, score)
            if beta <= alpha: break
        return min_score, best_move


def print_game_board(game):
    """Print ASCII board visualization for C++ QuoridorGame."""
    p1 = game.p1_pos
    p2 = game.p2_pos
    h_walls = set(game.h_walls)
    v_walls = set(game.v_walls)
    
    print(f"P1 (Row 0 -> Row 8): {p1} [Walls left: {game.p1_walls_left}]")
    print(f"P2 (Row 8 -> Row 0): {p2} [Walls left: {game.p2_walls_left}]")
    print("  0 1 2 3 4 5 6 7 8")
    for y in range(9):
        row_str = f"{y} "
        for x in range(9):
            if (x, y) == p1:
                row_str += "1 "
            elif (x, y) == p2:
                row_str += "2 "
            else:
                row_str += ". "
        print(row_str)
    print(f"H-Walls: {list(h_walls)}")
    print(f"V-Walls: {list(v_walls)}\n")


def run_battle(checkpoint_path, depth=2, simulations=100, num_games=10, visualize=False):
    print("=" * 60)
    print("             QUORIDOR BOT BATTLE ARENA")
    print(f"       AlphaZero MCTS ({simulations} sims) vs Minimax (depth {depth})")
    print("=" * 60)

    import numpy as np

    model = QuoridorNet(num_residual_blocks=15, channels=128)
    if os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            model.load_state_dict(checkpoint['model_state_dict'])
            epoch = checkpoint.get('epoch', '?')
            print(f"Loaded AlphaZero model from {checkpoint_path} (epoch {epoch})")
        except Exception as e:
            print(f"Failed to load checkpoint ({e}). Using random init weights.")
    else:
        print(f"Checkpoint not found at {checkpoint_path}. Using random init weights.")
    model.eval()

    def pytorch_evaluate_batch(input_array):
        """Local PyTorch evaluator for C++ MCTS."""
        with torch.no_grad():
            x = torch.from_numpy(input_array).float()
            logits, values = model(x)
            logits_np = logits.numpy()
            logits_max = np.max(logits_np, axis=1, keepdims=True)
            e_x = np.exp(logits_np - logits_max)
            policies = e_x / np.sum(e_x, axis=1, keepdims=True)
            return policies.astype(np.float32), values.numpy().ravel().astype(np.float32)

    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.07, dirichlet_eps=0.0)

    az_wins = mm_wins = draws = 0

    for g in range(num_games):
        game = quoridor_cpp.QuoridorGame()
        az_is_p1 = (g % 2 == 0)
        az_str = "P1" if az_is_p1 else "P2"
        mm_str = "P2" if az_is_p1 else "P1"
        print(f"\n--- Game {g+1}/{num_games} | AlphaZero={az_str}  Minimax={mm_str} ---")

        move_count = 0
        state_history = {}
        is_draw = False

        if visualize:
            print_game_board(game)

        while game.is_game_over() == 0 and move_count < 300:
            state_key = (
                game.p1_pos, game.p2_pos,
                frozenset(game.h_walls), frozenset(game.v_walls),
                game.p1_walls_left, game.p2_walls_left,
                game.is_p1_turn
            )
            state_history[state_key] = state_history.get(state_key, 0) + 1
            if state_history[state_key] >= 3:
                is_draw = True
                break

            is_az_turn = (game.is_p1_turn == az_is_p1)

            if is_az_turn:
                visit_counts_list, _ = mcts.run_search_batched(
                    [game], pytorch_evaluate_batch, simulations
                )
                visits = np.array(visit_counts_list[0], dtype=np.float32)
                best_idx = int(np.argmax(visits))
                valid_actions = game.get_valid_actions()
                selected_action = None
                for act in valid_actions:
                    py_act = _cpp_to_py(act)
                    if map_action_to_index_perspective(py_act, game.is_p1_turn) == best_idx:
                        selected_action = act
                        break
                if selected_action is None:
                    selected_action = valid_actions[0]
            else:
                _, selected_action = minimax_search(game, depth, -float('inf'), float('inf'), game.is_p1_turn)
                if selected_action is None:
                    selected_action = game.get_valid_actions()[0]

            game.step(selected_action)
            move_count += 1

            if visualize:
                label = "AlphaZero" if is_az_turn else "Minimax"
                print(f"Move {move_count}: {label} -> {selected_action}")
                print_game_board(game)

        winner = 0 if is_draw else game.is_game_over()

        if winner == 0:
            draws += 1
            print(f"Result: Draw after {move_count} moves.")
        elif (winner == 1 and az_is_p1) or (winner == -1 and not az_is_p1):
            az_wins += 1
            print(f"Result: AlphaZero ({az_str}) wins in {move_count} moves!")
        else:
            mm_wins += 1
            print(f"Result: Minimax ({mm_str}) wins in {move_count} moves!")

    print("\n" + "=" * 60)
    print("                      FINAL RESULTS")
    print("=" * 60)
    print(f"AlphaZero wins: {az_wins} / {num_games} ({az_wins / num_games * 100:.1f}%)")
    print(f"Minimax wins:   {mm_wins} / {num_games} ({mm_wins / num_games * 100:.1f}%)")
    print(f"Draws:          {draws} / {num_games} ({draws / num_games * 100:.1f}%)")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Battle AlphaZero MCTS agent against Heuristic Minimax bot.")
    parser.add_argument("--checkpoint", type=str, default="quoridor_checkpoint.pth")
    parser.add_argument("--depth", type=int, default=2, help="Minimax search depth")
    parser.add_argument("--simulations", type=int, default=100, help="MCTS simulations per move")
    parser.add_argument("--games", type=int, default=10, help="Number of battle games")
    parser.add_argument("--visualize", "-v", action="store_true", help="Print boards step-by-step")
    args = parser.parse_args()

    run_battle(
        checkpoint_path=args.checkpoint,
        depth=args.depth,
        simulations=args.simulations,
        num_games=args.games,
        visualize=args.visualize
    )
