import os
import sys
import math
import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import quoridor_cpp
from quoridor_model import QuoridorNet, map_action_to_index_perspective, map_index_to_action_perspective
from onnx_inference import ONNXModelEvaluator


def _cpp_to_py(act):
    if act.type == 'move':
        return {'type': 'move', 'dir': act.move_dir, 'to': (act.to_x, act.to_y)}
    return {'type': 'wall', 'wallType': act.wall_type, 'x': act.wall_x, 'y': act.wall_y}


def _load_evaluator(model_path):
    if model_path.endswith('.onnx') and os.path.exists(model_path):
        onnx_eval = ONNXModelEvaluator(model_path)
        def onnx_eval_cb(input_array):
            arr = np.asarray(input_array, dtype=np.float32)
            if arr.ndim == 1:
                arr = arr.reshape(1, 11, 9, 9)
            elif arr.ndim == 3:
                arr = arr.reshape(1, *arr.shape)
            return onnx_eval.evaluate_batch(arr)
        return onnx_eval_cb

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")

    checkpoint = torch.load(model_path, map_location='cpu', weights_only=False)
    state_dict = checkpoint.get('model_state_dict', checkpoint)
    
    conv_init_weight = state_dict.get('conv_init.weight')
    channels = conv_init_weight.shape[0] if conv_init_weight is not None else 192
    
    resblock_indices = {int(k.split('.')[1]) for k in state_dict if k.startswith('res_blocks.')}
    num_res_blocks = len(resblock_indices) if resblock_indices else 20

    model = QuoridorNet(num_residual_blocks=num_res_blocks, channels=channels)
    model.load_state_dict(state_dict)
    model.eval()

    def pytorch_eval_cb(input_array):
        arr = np.asarray(input_array, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, 11, 9, 9)
        elif arr.ndim == 3:
            arr = arr.reshape(1, *arr.shape)
        with torch.no_grad():
            x = torch.from_numpy(arr).float()
            logits, vals = model(x)
            l_np = logits.numpy()
            e_x = np.exp(l_np - np.max(l_np, axis=1, keepdims=True))
            p_np = e_x / np.sum(e_x, axis=1, keepdims=True)
            return p_np.astype(np.float32), vals.numpy().ravel().astype(np.float32)

    return pytorch_eval_cb


def _select_mcts_action(game, mcts, eval_cb, simulations, state_history):
    visit_counts_list, _ = mcts.run_search_batched([game], eval_cb, simulations)
    visits = np.array(visit_counts_list[0], dtype=np.float32)
    valid_actions = game.get_valid_actions()
    
    adjusted_visits = visits.copy()
    for act in valid_actions:
        py_act = _cpp_to_py(act)
        idx = map_action_to_index_perspective(py_act, game.is_p1_turn)
        
        next_game = game.clone_and_step(act)
        next_key = (
            next_game.p1_pos, next_game.p2_pos,
            frozenset(next_game.h_walls), frozenset(next_game.v_walls),
            next_game.p1_walls_left, next_game.p2_walls_left,
            next_game.is_p1_turn
        )
        seen_count = state_history.get(next_key, 0)
        if seen_count >= 2:
            adjusted_visits[idx] = -1.0
        elif seen_count == 1:
            adjusted_visits[idx] *= 0.1

    best_idx = int(np.argmax(adjusted_visits))
    for act in valid_actions:
        py_act = _cpp_to_py(act)
        if map_action_to_index_perspective(py_act, game.is_p1_turn) == best_idx:
            return act
    return valid_actions[0]


def run_arena_battle(model_a_path, model_b_path, num_games=10, simulations=400, verbose=False):
    eval_a = _load_evaluator(model_a_path)
    eval_b = _load_evaluator(model_b_path)
    
    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.0, dirichlet_eps=0.0)
    
    a_wins = 0
    b_wins = 0
    draws = 0
    a_p1_wins = 0
    a_p2_wins = 0
    game_lengths = []
    
    name_a = os.path.basename(model_a_path)
    name_b = os.path.basename(model_b_path)

    for g in range(num_games):
        game = quoridor_cpp.QuoridorGame()
        a_is_p1 = (g % 2 == 0)
        
        p1_label = name_a if a_is_p1 else name_b
        p2_label = name_b if a_is_p1 else name_a
        
        if verbose:
            print(f"--- Game {g+1}/{num_games}: P1({p1_label}) vs P2({p2_label}) ---")

        move_count = 0
        state_history = {}
        is_draw = False

        while game.is_game_over() == 0 and move_count < 250:
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

            current_is_a = (game.is_p1_turn == a_is_p1)
            current_eval = eval_a if current_is_a else eval_b
            
            chosen_action = _select_mcts_action(game, mcts, current_eval, simulations, state_history)
            game.step(chosen_action)
            move_count += 1

        winner = 0 if is_draw else game.is_game_over()
        game_lengths.append(move_count)

        if winner == 0:
            draws += 1
            if verbose: print(f"Game {g+1} Result: Draw in {move_count} moves")
        elif (winner == 1 and a_is_p1) or (winner == -1 and not a_is_p1):
            a_wins += 1
            if a_is_p1: a_p1_wins += 1
            else: a_p2_wins += 1
            if verbose: print(f"Game {g+1} Result: {name_a} wins in {move_count} moves")
        else:
            b_wins += 1
            if verbose: print(f"Game {g+1} Result: {name_b} wins in {move_count} moves")

    # Score calculation
    score_a = (a_wins + 0.5 * draws) / num_games
    score_b = (b_wins + 0.5 * draws) / num_games
    
    if score_a >= 0.999:
        elo_delta = 800.0
    elif score_a <= 0.001:
        elo_delta = -800.0
    else:
        elo_delta = round(-400.0 * math.log10(1.0 / score_a - 1.0), 1)

    return {
        'model_a': model_a_path,
        'model_b': model_b_path,
        'num_games': num_games,
        'simulations': simulations,
        'model_a_wins': a_wins,
        'model_b_wins': b_wins,
        'draws': draws,
        'model_a_win_rate': round(a_wins / num_games * 100, 1),
        'model_b_win_rate': round(b_wins / num_games * 100, 1),
        'draw_rate': round(draws / num_games * 100, 1),
        'model_a_p1_wins': a_p1_wins,
        'model_a_p2_wins': a_p2_wins,
        'avg_game_length': round(float(np.mean(game_lengths)), 1),
        'elo_delta_a_vs_b': elo_delta
    }


def print_arena_report(report):
    name_a = os.path.basename(report['model_a'])
    name_b = os.path.basename(report['model_b'])
    
    print("=" * 65)
    print("           QUORIDOR ALPHAZERO ARENA TOURNAMENT")
    print(f"Model A: {name_a}")
    print(f"Model B: {name_b}")
    print(f"Games: {report['num_games']} | MCTS Simulations per Move: {report['simulations']}")
    print("=" * 65)
    print(f"{name_a} Wins: {report['model_a_wins']} ({report['model_a_win_rate']}%)")
    print(f"  - As Player 1: {report['model_a_p1_wins']} wins")
    print(f"  - As Player 2: {report['model_a_p2_wins']} wins")
    print(f"{name_b} Wins: {report['model_b_wins']} ({report['model_b_win_rate']}%)")
    print(f"Draws:          {report['draws']} ({report['draw_rate']}%)")
    print(f"Average Moves:  {report['avg_game_length']} moves / game")
    print("-" * 65)
    print(f"Estimated Elo Delta (A - B): {report['elo_delta_a_vs_b']:+0.1f} Elo")
    print("=" * 65)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python eval_arena.py <model_a_path> <model_b_path> [num_games] [simulations]")
        sys.exit(1)
        
    m_a = sys.argv[1]
    m_b = sys.argv[2]
    n_games = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    sims = int(sys.argv[4]) if len(sys.argv) > 4 else 400
    
    res = run_arena_battle(m_a, m_b, num_games=n_games, simulations=sims, verbose=True)
    print_arena_report(res)
