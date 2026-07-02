import os
import argparse
import torch
import numpy as np
from quoridor_model import QuoridorNet, encode_state, map_action_to_index_perspective
from train_alphazero import QuoridorGame, MCTS

# --- PYTHON MINIMAX IMPLEMENTATION ---

def evaluate_board_py(game: QuoridorGame, is_p1_turn: bool):
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
    
    # Complete dominance check
    if p1_walls == 0 and (p1_dist - p2_dist) >= 2:
        return -500.0
    if p2_walls == 0 and (p2_dist - p1_dist) >= 2:
        return 500.0
        
    score = (p2_dist - p1_dist) * 15.0
    
    # Urgency bonus
    if p1_dist <= 3: score += (4 - p1_dist) * 8.0
    if p2_dist <= 3: score -= (4 - p2_dist) * 8.0
    
    # Wall reserve advantage
    score += (p1_walls - p2_walls) * 3.0
    
    # Pawn advancement bonus
    score += game.p1_pos[1] * 1.0
    score -= (8 - game.p2_pos[1]) * 1.0
    
    # Tempo bonus
    score += 7.5 if is_p1_turn else -7.5
    
    return score

def get_ordered_actions(game: QuoridorGame, player_num: int):
    actions = game.get_valid_actions()
    
    is_p1 = (player_num == 1)
    my_pos = game.p1_pos if is_p1 else game.p2_pos
    opp_pos = game.p2_pos if is_p1 else game.p1_pos
    my_goal_y = 8 if is_p1 else 0
    opp_goal_y = 0 if is_p1 else 8
    
    my_path = game.get_shortest_path(my_pos, my_goal_y, opp_pos=opp_pos)
    my_path_set = set(my_path) if my_path else set()
    
    opp_path = game.get_shortest_path(opp_pos, opp_goal_y, opp_pos=my_pos)
    opp_path_set = set(opp_path) if opp_path else set()
    
    def score_action(act):
        if act['type'] == 'move':
            dest = act['to']
            on_path = dest in my_path_set
            y_gain = (dest[1] - my_pos[1]) if is_p1 else (my_pos[1] - dest[1])
            return 100 + (6 if on_path else 0) + y_gain * 3
        else:
            wx, wy = act['x'], act['y']
            score = 10
            # Distance from opponent
            dist = abs(wx - opp_pos[0]) + abs(wy - opp_pos[1])
            score += max(0, 10 - dist)
            
            # Distance from opponent's path
            is_near_path = any(abs(wx - px) <= 1 and abs(wy - py) <= 1 for px, py in opp_path_set)
            if is_near_path:
                score += 20
            return score
            
    actions.sort(key=score_action, reverse=True)
    return actions

def minimax_search(game: QuoridorGame, depth: int, alpha: float, beta: float, maximizing_player: bool):
    p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
    p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)
    
    if not p1_path: return -float('inf'), None
    if not p2_path: return float('inf'), None
    
    if len(p1_path) == 1: return float('inf'), None
    if len(p2_path) == 1: return -float('inf'), None
    
    if depth == 0:
        return evaluate_board_py(game, game.is_p1_turn), None
        
    best_move = None
    if maximizing_player:
        max_score = -float('inf')
        actions = get_ordered_actions(game, 1)
        if not actions:
            return evaluate_board_py(game, True), None
        for act in actions:
            next_game = game.clone()
            next_game.step(act)
            score, _ = minimax_search(next_game, depth - 1, alpha, beta, False)
            if score > max_score:
                max_score = score
                best_move = act
            alpha = max(alpha, score)
            if beta <= alpha:
                break
        return max_score, best_move
    else:
        min_score = float('inf')
        actions = get_ordered_actions(game, 2)
        if not actions:
            return evaluate_board_py(game, False), None
        for act in actions:
            next_game = game.clone()
            next_game.step(act)
            score, _ = minimax_search(next_game, depth - 1, alpha, beta, True)
            if score < min_score:
                min_score = score
                best_move = act
            beta = min(beta, score)
            if beta <= alpha:
                break
        return min_score, best_move

# --- BATTLE LOGIC ---

def run_battle(checkpoint_path, depth=2, simulations=100, num_games=10, visualize=False):
    print("=" * 60)
    print("             QUORIDOR bot BATTLE ARENA")
    print(f"       AlphaZero MCTS ({simulations} sims) vs Minimax (depth {depth})")
    print("=" * 60)
    
    # Load AlphaZero Model
    model = QuoridorNet(num_residual_blocks=6, channels=128)
    if os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            model.load_state_dict(checkpoint['model_state_dict'])
            print(f"Loaded AlphaZero model checkpoint from {checkpoint_path}")
        except Exception as e:
            print(f"Failed to load checkpoint ({e}). Using random init weights.")
    else:
        print(f"Checkpoint not found at {checkpoint_path}. Using random init weights.")
    model.eval()
    
    mcts = MCTS(model, dirichlet_eps=0.0) # Set dirichlet_eps to 0 for pure exploitation
    
    az_wins = 0
    mm_wins = 0
    draws = 0
    
    for g in range(num_games):
        game = QuoridorGame()
        # Alternate who plays Player 1 (starts first, moving North to y=8)
        az_is_p1 = (g % 2 == 0)
        
        az_player_str = "P1" if az_is_p1 else "P2"
        mm_player_str = "P2" if az_is_p1 else "P1"
        
        print(f"\n--- Game {g+1}/{num_games} | AlphaZero is {az_player_str} | Minimax is {mm_player_str} ---")
        
        move_count = 0
        state_history = {}
        is_draw = False
        
        if visualize:
            game.print_board()
            
        while game.is_game_over() == 0 and move_count < 300:
            state_key = (
                game.p1_pos,
                game.p2_pos,
                frozenset(game.h_walls),
                frozenset(game.v_walls),
                game.p1_walls_left,
                game.p2_walls_left,
                game.is_p1_turn
            )
            state_history[state_key] = state_history.get(state_key, 0) + 1
            if state_history[state_key] >= 3:
                is_draw = True
                break
                
            is_az_turn = (game.is_p1_turn == az_is_p1)
            active_player_label = "AlphaZero" if is_az_turn else "Minimax"
            
            if is_az_turn:
                # AlphaZero move selection via MCTS
                root = mcts.run_search(game, num_simulations=simulations)
                best_idx = max(root.children.keys(), key=lambda idx: root.children[idx].N)
                
                selected_action = None
                for act in game.get_valid_actions():
                    if map_action_to_index_perspective(act, game.is_p1_turn) == best_idx:
                        selected_action = act
                        break
                if selected_action is None:
                    # Fallback
                    selected_action = game.get_valid_actions()[0]
            else:
                # Minimax move selection
                # P1 is maximizing, P2 is minimizing
                _, selected_action = minimax_search(game, depth, -float('inf'), float('inf'), game.is_p1_turn)
                if selected_action is None:
                    selected_action = game.get_valid_actions()[0]
                    
            game.step(selected_action)
            move_count += 1
            
            if visualize:
                print(f"Move {move_count}: {active_player_label} -> {selected_action}")
                game.print_board()
                
        winner = 0 if is_draw else game.is_game_over()
        
        if winner == 0:
            draws += 1
            print(f"Result: Draw after {move_count} moves.")
        elif (winner == 1 and az_is_p1) or (winner == -1 and not az_is_p1):
            az_wins += 1
            print(f"Result: AlphaZero ({az_player_str}) wins in {move_count} moves!")
        else:
            mm_wins += 1
            print(f"Result: Minimax ({mm_player_str}) wins in {move_count} moves!")
            
    print("\n" + "=" * 60)
    print("                      FINAL RESULTS")
    print("=" * 60)
    print(f"AlphaZero wins: {az_wins} / {num_games} ({az_wins / num_games * 100:.1f}%)")
    print(f"Minimax wins:   {mm_wins} / {num_games} ({mm_wins / num_games * 100:.1f}%)")
    print(f"Draws:          {draws} / {num_games} ({draws / num_games * 100:.1f}%)")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Battle AlphaZero MCTS agent against Heuristic Minimax bot.")
    parser.add_argument("--checkpoint", type=str, default="quoridor_checkpoint.pth", help="Path to AlphaZero checkpoint")
    parser.add_argument("--depth", type=int, default=2, help="Search depth for Minimax agent")
    parser.add_argument("--simulations", type=int, default=100, help="Number of MCTS simulations for AlphaZero agent")
    parser.add_argument("--games", type=int, default=10, help="Number of battle games to play")
    parser.add_argument("--visualize", "-v", action="store_true", help="Print game boards step-by-step")
    args = parser.parse_args()
    
    run_battle(
        checkpoint_path=args.checkpoint,
        depth=args.depth,
        simulations=args.simulations,
        num_games=args.games,
        visualize=args.visualize
    )
