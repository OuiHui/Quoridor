import os
import sys
import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import quoridor_cpp
from quoridor_model import QuoridorNet, map_index_to_action_perspective
from onnx_inference import ONNXModelEvaluator


def _create_model_evaluator(model_path):
    if model_path.endswith('.onnx') and os.path.exists(model_path):
        onnx_evaluator = ONNXModelEvaluator(model_path)
        def onnx_eval_cb(input_array):
            arr = np.asarray(input_array, dtype=np.float32)
            if arr.ndim == 1:
                arr = arr.reshape(1, 11, 9, 9)
            elif arr.ndim == 3:
                arr = arr.reshape(1, *arr.shape)
            return onnx_evaluator.evaluate_batch(arr)
        return onnx_eval_cb, None

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

    return pytorch_eval_cb, model


def _run_single_mcts(game, eval_cb, simulations):
    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.0, dirichlet_eps=0.0)
    visit_counts_list, root_q_list = mcts.run_search_batched([game], eval_cb, simulations)
    visits = np.array(visit_counts_list[0], dtype=np.float32)
    best_idx = int(np.argmax(visits))
    act = map_index_to_action_perspective(best_idx, game.is_p1_turn, game.p1_pos, game.p2_pos)
    return act, visits[best_idx], root_q_list[0]


def _test_immediate_win(eval_cb, simulations):
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = (4, 7)
    game.p2_pos = (4, 2)
    game.is_p1_turn = True
    
    best_act, visits, q_val = _run_single_mcts(game, eval_cb, simulations)
    passed = (best_act.get('type') == 'move' and best_act.get('to') == (4, 8))
    return {
        'name': 'Immediate 1-Step Goal Win',
        'passed': passed,
        'action': best_act,
        'visits': int(visits),
        'q_value': float(q_val),
        'expected': 'Move N -> (4, 8)'
    }


def _test_winning_jump(eval_cb, simulations):
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = (4, 7)
    game.p2_pos = (4, 8)
    game.is_p1_turn = True
    
    best_act, visits, q_val = _run_single_mcts(game, eval_cb, simulations)
    passed = (best_act.get('type') == 'move' and best_act.get('to') in [(3, 8), (5, 8)])
    return {
        'name': 'Diagonal Jump Win Around Opponent',
        'passed': passed,
        'action': best_act,
        'visits': int(visits),
        'q_value': float(q_val),
        'expected': 'Jump diagonally to (3, 8) or (5, 8)'
    }


def _test_urgent_defense(eval_cb, simulations):
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = (4, 5)
    game.p2_pos = (4, 1)
    game.is_p1_turn = True
    
    best_act, visits, q_val = _run_single_mcts(game, eval_cb, simulations)
    passed = (best_act.get('type') == 'wall')
    return {
        'name': 'Urgent Goal-Line Wall Defense',
        'passed': passed,
        'action': best_act,
        'visits': int(visits),
        'q_value': float(q_val),
        'expected': 'Place blocking wall (prevent P2 winning on next turn)'
    }


def _test_contact_jump_forward(eval_cb, simulations):
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = (4, 4)
    game.p2_pos = (4, 5)
    game.is_p1_turn = True
    
    best_act, visits, q_val = _run_single_mcts(game, eval_cb, simulations)
    passed = (best_act.get('type') == 'move' and best_act.get('to') == (4, 6))
    return {
        'name': 'Face-to-Face Forward Jump',
        'passed': passed,
        'action': best_act,
        'visits': int(visits),
        'q_value': float(q_val),
        'expected': 'Move N (Jump over P2 to (4, 6))'
    }


def _test_anti_self_trap(eval_cb, simulations):
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = (2, 3)
    game.p2_pos = (6, 6)
    game.step(quoridor_cpp.Action.Wall('v', 2, 3))
    game.step(quoridor_cpp.Action.Wall('h', 1, 4))
    game.is_p1_turn = True
    
    init_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
    init_len = len(init_path) - 1 if init_path else 999
    
    best_act, visits, q_val = _run_single_mcts(game, eval_cb, simulations)
    
    next_game = game.clone_and_step(quoridor_cpp.Action.Move(best_act['dir'], best_act['to'][0], best_act['to'][1]) 
                                    if best_act['type'] == 'move' else 
                                    quoridor_cpp.Action.Wall(best_act['wallType'], best_act['x'], best_act['y']))
    next_path = next_game.get_shortest_path(next_game.p1_pos, 8, opp_pos=next_game.p2_pos)
    next_len = len(next_path) - 1 if next_path else 999
    
    passed = (next_len <= init_len + 1)
    return {
        'name': 'Anti-Self-Trap Pathing',
        'passed': passed,
        'action': best_act,
        'visits': int(visits),
        'q_value': float(q_val),
        'expected': 'Action that does not dramatically lengthen own shortest path'
    }


def _test_opening_pawn_priority(eval_cb):
    game = quoridor_cpp.QuoridorGame()
    enc = quoridor_cpp.MCTS.encode_state_cpp(game)
    probs, _ = eval_cb(enc)
    pawn_mass = float(np.sum(probs[0][:12]))
    wall_mass = float(np.sum(probs[0][12:]))
    top_idx = int(np.argmax(probs[0]))
    passed = (top_idx < 12 and pawn_mass > 0.40)
    return {
        'name': 'Opening Pawn Move Priority',
        'passed': passed,
        'pawn_mass_pct': round(pawn_mass * 100, 2),
        'wall_mass_pct': round(wall_mass * 100, 2),
        'top_action_idx': top_idx,
        'expected': 'Top policy prior on pawn move with pawn mass > 40%'
    }


def _evaluate_representation_diversity(eval_cb, n_samples=50):
    np.random.seed(1337)
    logits_list = []
    pawn_masses = []
    
    for _ in range(n_samples):
        g = quoridor_cpp.QuoridorGame()
        steps = np.random.randint(2, 30)
        for _ in range(steps):
            if g.is_game_over() != 0:
                break
            valid = g.get_valid_actions()
            if not valid:
                break
            g.step(valid[np.random.choice(len(valid))])
        
        enc = quoridor_cpp.MCTS.encode_state_cpp(g)
        probs, _ = eval_cb(enc)
        log_prob = np.log(np.maximum(probs[0], 1e-8))
        centered_logits = log_prob - np.mean(log_prob)
        logits_list.append(centered_logits)
        pawn_masses.append(np.sum(probs[0][:12]))

    logits_mat = np.array(logits_list)
    norms = np.linalg.norm(logits_mat, axis=1, keepdims=True)
    normed = logits_mat / np.maximum(norms, 1e-8)
    sim_matrix = np.dot(normed, normed.T)
    triu_indices = np.triu_indices(n_samples, k=1)
    cos_sims = sim_matrix[triu_indices]
    
    mean_sim = float(np.mean(cos_sims))
    passed = (0.20 <= mean_sim <= 0.75)
    return {
        'mean_cosine_similarity': round(mean_sim, 4),
        'std_cosine_similarity': round(float(np.std(cos_sims)), 4),
        'avg_pawn_mass_pct': round(float(np.mean(pawn_masses)) * 100, 2),
        'passed': passed
    }


def run_tactical_suite(model_path="quoridor_model.onnx", simulations=400):
    eval_cb, _ = _create_model_evaluator(model_path)
    
    results = [
        _test_immediate_win(eval_cb, simulations),
        _test_winning_jump(eval_cb, simulations),
        _test_urgent_defense(eval_cb, simulations),
        _test_contact_jump_forward(eval_cb, simulations),
        _test_anti_self_trap(eval_cb, simulations)
    ]
    
    opening_check = _test_opening_pawn_priority(eval_cb)
    rep_diversity = _evaluate_representation_diversity(eval_cb)
    
    passed_count = sum(1 for r in results if r['passed']) + (1 if opening_check['passed'] else 0)
    total_tests = len(results) + 1
    accuracy_pct = (passed_count / total_tests) * 100.0

    # Symmetry calibration check
    g_start = quoridor_cpp.QuoridorGame()
    enc_start = quoridor_cpp.MCTS.encode_state_cpp(g_start)
    _, val_start = eval_cb(enc_start)
    sym_error = abs(float(val_start[0]))
    
    return {
        'model_path': model_path,
        'simulations': simulations,
        'tactical_puzzles': results,
        'opening_prior': opening_check,
        'representation_diversity': rep_diversity,
        'value_symmetry_error': round(sym_error, 4),
        'score': f"{passed_count}/{total_tests}",
        'accuracy_pct': round(accuracy_pct, 1)
    }


def print_tactical_report(report):
    print("=" * 65)
    print("        QUORIDOR ALPHAZERO TACTICAL BENCHMARK SUITE")
    print(f"Model: {report['model_path']} | Simulations: {report['simulations']}")
    print("=" * 65)
    
    for idx, r in enumerate(report['tactical_puzzles'], 1):
        status = "PASS" if r['passed'] else "FAIL"
        print(f"[{status}] Puzzle {idx}: {r['name']}")
        print(f"       Action: {r['action']} (Visits: {r['visits']}/{report['simulations']}, Q: {r['q_value']:+.3f})")
        if not r['passed']:
            print(f"       Expected: {r['expected']}")
    
    op = report['opening_prior']
    op_status = "PASS" if op['passed'] else "FAIL"
    print(f"\n[{op_status}] Opening Prior Distribution:")
    print(f"       Pawn Mass: {op['pawn_mass_pct']}% | Wall Mass: {op['wall_mass_pct']}% | Top Action Idx: {op['top_action_idx']}")
    
    rd = report['representation_diversity']
    rd_status = "PASS" if rd['passed'] else "FAIL"
    print(f"\n[{rd_status}] Representation Diversity (50 Random States):")
    print(f"       Pairwise Cosine Sim: {rd['mean_cosine_similarity']} +/- {rd['std_cosine_similarity']} (Target: 0.20 - 0.75)")
    print(f"       Avg Midgame Pawn Mass: {rd['avg_pawn_mass_pct']}%")
    
    print(f"\nInitial State Value Symmetry Error: {report['value_symmetry_error']} (Target: < 0.15)")
    print("-" * 65)
    print(f"OVERALL TACTICAL SCORE: {report['score']} ({report['accuracy_pct']}%)")
    print("=" * 65)


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "quoridor_model.onnx"
    sims = int(sys.argv[2]) if len(sys.argv) > 2 else 400
    res = run_tactical_suite(path, sims)
    print_tactical_report(res)
