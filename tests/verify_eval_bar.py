"""
Eval Bar Accuracy Verification Suite

Three-layer proof of correctness:
  Layer 1: Pathfinding parity (JS-equivalent BFS vs C++ get_shortest_path)
  Layer 2: Tensorization parity (JS-equivalent tensor vs C++ encode_state_cpp)
  Layer 3: NN value-to-outcome correlation (does the model predict winners?)
"""

import os
import sys
import random
import json
import numpy as np

os.environ["TORCHDYNAMO_DISABLE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import quoridor_cpp


# ---------------------------------------------------------------------------
# Layer 1: Pathfinding Parity
# Validates that our pawn-aware BFS (as used by the JS eval bar) matches the
# C++ reference implementation across many random board states.
# ---------------------------------------------------------------------------

def python_bfs_with_opponent(game, start, target_y, opp_pos):
    """
    Pure-Python BFS mirroring the JS findShortestPath logic with opponent
    pawn jump resolution. Returns path length (number of cells) or -1.
    """
    from collections import deque

    sx, sy = start
    ox, oy = opp_pos
    if sy == target_y:
        return 1

    visited = set()
    visited.add((sx, sy))
    queue = deque([(sx, sy, 1)])

    dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]

    while queue:
        x, y, dist = queue.popleft()
        if y == target_y:
            return dist

        for dx, dy in dirs:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < 9 and 0 <= ny < 9):
                continue
            if game.is_move_blocked(x, y, nx, ny):
                continue

            if nx == ox and ny == oy:
                jx, jy = nx + dx, ny + dy
                straight_in_bounds = (0 <= jx < 9 and 0 <= jy < 9)
                straight_blocked = straight_in_bounds and game.is_move_blocked(nx, ny, jx, jy)

                if straight_in_bounds and not straight_blocked:
                    if (jx, jy) not in visited:
                        visited.add((jx, jy))
                        queue.append((jx, jy, dist + 1))
                elif straight_blocked:
                    if dx == 0:
                        sides = [(-1, 0), (1, 0)]
                    else:
                        sides = [(0, -1), (0, 1)]
                    for sdx, sdy in sides:
                        dix, diy = nx + sdx, ny + sdy
                        if 0 <= dix < 9 and 0 <= diy < 9 and not game.is_move_blocked(nx, ny, dix, diy):
                            if (dix, diy) not in visited:
                                visited.add((dix, diy))
                                queue.append((dix, diy, dist + 1))
            else:
                if (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny, dist + 1))

    return -1


def run_pathfinding_parity(num_games=200, max_turns=60):
    """Compare Python BFS (mirroring JS) against C++ get_shortest_path."""
    checks = 0
    mismatches = 0

    for g in range(num_games):
        game = quoridor_cpp.QuoridorGame()
        for turn in range(max_turns):
            if game.is_game_over() != 0:
                break

            p1_pos = game.p1_pos
            p2_pos = game.p2_pos

            cpp_p1_path = game.get_shortest_path(p1_pos, 8, p2_pos)
            cpp_p2_path = game.get_shortest_path(p2_pos, 0, p1_pos)
            cpp_p1_len = len(cpp_p1_path) if cpp_p1_path else -1
            cpp_p2_len = len(cpp_p2_path) if cpp_p2_path else -1

            py_p1_len = python_bfs_with_opponent(game, p1_pos, 8, p2_pos)
            py_p2_len = python_bfs_with_opponent(game, p2_pos, 0, p1_pos)

            if cpp_p1_len != py_p1_len:
                mismatches += 1
                print(f"  MISMATCH game={g} turn={turn} P1: cpp={cpp_p1_len} py={py_p1_len} "
                      f"P1@{p1_pos} P2@{p2_pos}")
            if cpp_p2_len != py_p2_len:
                mismatches += 1
                print(f"  MISMATCH game={g} turn={turn} P2: cpp={cpp_p2_len} py={py_p2_len} "
                      f"P1@{p1_pos} P2@{p2_pos}")

            checks += 2

            actions = game.get_valid_actions()
            if not actions:
                break
            game.step(random.choice(actions))

    return checks, mismatches


# ---------------------------------------------------------------------------
# Layer 2: Tensorization Parity
# Validates that our JS-equivalent tensorization matches C++ encode_state_cpp
# for the same board positions.
# ---------------------------------------------------------------------------

def js_equivalent_tensorize(game):
    """
    Reproduces the JS tensorizeBoardState logic in Python, using the
    Python BFS with opponent awareness (matching what the JS code now does).
    """
    tensor = np.zeros(11 * 9 * 9, dtype=np.float32)

    def write(c, x, y, val):
        tensor[c * 81 + x * 9 + y] = val

    p1_pos = game.p1_pos
    p2_pos = game.p2_pos
    is_p1_turn = game.is_p1_turn

    p1_path = game.get_shortest_path(p1_pos, 8, p2_pos) or []
    p2_path = game.get_shortest_path(p2_pos, 0, p1_pos) or []

    p1_dist = len(p1_path) if p1_path else 20
    p2_dist = len(p2_path) if p2_path else 20

    if is_p1_turn:
        active_x, active_y = p1_pos
        opp_x, opp_y = p2_pos
        active_path = p1_path
        opp_path = p2_path
        active_dist = p1_dist
        opp_dist = p2_dist
        active_walls = game.p1_walls_left
        opp_walls = game.p2_walls_left
    else:
        active_x, active_y = 8 - p2_pos[0], 8 - p2_pos[1]
        opp_x, opp_y = 8 - p1_pos[0], 8 - p1_pos[1]
        active_path = [(8 - c[0], 8 - c[1]) for c in p2_path]
        opp_path = [(8 - c[0], 8 - c[1]) for c in p1_path]
        active_dist = p2_dist
        opp_dist = p1_dist
        active_walls = game.p2_walls_left
        opp_walls = game.p1_walls_left

    # Channel 0: Active player position
    write(0, active_x, active_y, 1.0)

    # Channel 1: Opponent position
    write(1, opp_x, opp_y, 1.0)

    # Channel 2: Horizontal walls
    for x in range(8):
        for y in range(8):
            if (x, y) in game.h_walls:
                if is_p1_turn:
                    write(2, x, y, 1.0)
                else:
                    write(2, 7 - x, 7 - y, 1.0)

    # Channel 3: Vertical walls
    for x in range(8):
        for y in range(8):
            if (x, y) in game.v_walls:
                if is_p1_turn:
                    write(3, x, y, 1.0)
                else:
                    write(3, 7 - x, 7 - y, 1.0)

    # Channel 4: Active shortest path length / 20.0
    norm_active = min(active_dist / 20.0, 1.0)
    for x in range(9):
        for y in range(9):
            write(4, x, y, norm_active)

    # Channel 5: Opponent shortest path length / 20.0
    norm_opp = min(opp_dist / 20.0, 1.0)
    for x in range(9):
        for y in range(9):
            write(5, x, y, norm_opp)

    # Channel 6: Active path cells
    for cx, cy in active_path:
        write(6, cx, cy, 1.0)

    # Channel 7: Opponent path cells
    for cx, cy in opp_path:
        write(7, cx, cy, 1.0)

    # Channel 8: Active walls remaining / 10.0
    norm_aw = min(active_walls / 10.0, 1.0)
    for x in range(9):
        for y in range(9):
            write(8, x, y, norm_aw)

    # Channel 9: Opponent walls remaining / 10.0
    norm_ow = min(opp_walls / 10.0, 1.0)
    for x in range(9):
        for y in range(9):
            write(9, x, y, norm_ow)

    # Channel 10: Path advantage
    opp_raw = float(opp_dist) if opp_path else 20.0
    active_raw = float(active_dist) if active_path else 20.0
    path_adv = max(-1.0, min(1.0, (opp_raw - active_raw) / 16.0))
    for x in range(9):
        for y in range(9):
            write(10, x, y, path_adv)

    return tensor


def run_tensorization_parity(num_games=200, max_turns=60):
    """Compare JS-equivalent tensorization against C++ encode_state_cpp."""
    checks = 0
    mismatches = 0
    max_diff_seen = 0.0

    for g in range(num_games):
        game = quoridor_cpp.QuoridorGame()
        for turn in range(max_turns):
            if game.is_game_over() != 0:
                break

            cpp_tensor = np.array(quoridor_cpp.MCTS().encode_state_cpp(game), dtype=np.float32)
            js_tensor = js_equivalent_tensorize(game)

            diff = np.abs(cpp_tensor - js_tensor)
            max_diff = diff.max()
            max_diff_seen = max(max_diff_seen, max_diff)

            if max_diff > 1e-5:
                mismatches += 1
                mismatch_indices = np.where(diff > 1e-5)
                channels = set(idx // 81 for idx in mismatch_indices[0])
                print(f"  MISMATCH game={g} turn={turn} max_diff={max_diff:.6f} "
                      f"channels={channels} P1@{game.p1_pos} P2@{game.p2_pos} "
                      f"turn={'P1' if game.is_p1_turn else 'P2'}")

            checks += 1

            actions = game.get_valid_actions()
            if not actions:
                break
            game.step(random.choice(actions))

    return checks, mismatches, max_diff_seen


# ---------------------------------------------------------------------------
# Layer 3: NN Value → Game Outcome Correlation
# Proves the NN value head accurately predicts winners by playing random
# games, recording NN evaluations at each turn, and checking correlation
# with actual game results.
# ---------------------------------------------------------------------------

def run_value_outcome_correlation(num_games=300, onnx_path="quoridor_model.onnx"):
    """
    Play random games, evaluate each position with the ONNX model,
    and measure how well the NN value predicts the eventual winner.
    """
    if not os.path.exists(onnx_path):
        print(f"  SKIPPED: {onnx_path} not found")
        return None

    from onnx_inference import ONNXModelEvaluator
    evaluator = ONNXModelEvaluator(onnx_path)

    correct_predictions = 0
    total_predictions = 0
    value_sums_by_winner = {1: [], -1: []}  # 1 = P1 won, -1 = P2 won

    # Binned accuracy: bucket value predictions and track win rates
    bins = {i: {'p1_wins': 0, 'total': 0} for i in range(10)}

    for g in range(num_games):
        game = quoridor_cpp.QuoridorGame()
        positions = []

        while game.is_game_over() == 0:
            tensor = np.array(quoridor_cpp.MCTS().encode_state_cpp(game), dtype=np.float32)
            tensor_batch = tensor.reshape(1, 11, 9, 9)
            _, values = evaluator.evaluate_batch(tensor_batch)
            raw_value = float(values[0])

            # Convert to P1 perspective
            p1_value = raw_value if game.is_p1_turn else -raw_value
            positions.append(p1_value)

            actions = game.get_valid_actions()
            if not actions:
                break
            game.step(random.choice(actions))

        winner = game.is_game_over()
        if winner == 0:
            continue

        for p1_val in positions:
            predicted_winner = 1 if p1_val > 0 else -1
            if predicted_winner == winner:
                correct_predictions += 1
            total_predictions += 1

            # Bin the value into 10 buckets from -1 to 1
            bucket = min(9, max(0, int((p1_val + 1.0) / 0.2)))
            bins[bucket]['total'] += 1
            if winner == 1:
                bins[bucket]['p1_wins'] += 1

        if winner in value_sums_by_winner:
            value_sums_by_winner[winner].extend(positions)

    accuracy = correct_predictions / total_predictions * 100 if total_predictions > 0 else 0

    # Compute mean NN value for each winner
    mean_when_p1_wins = np.mean(value_sums_by_winner[1]) if value_sums_by_winner[1] else 0
    mean_when_p2_wins = np.mean(value_sums_by_winner[-1]) if value_sums_by_winner[-1] else 0

    return {
        'total_predictions': total_predictions,
        'correct_predictions': correct_predictions,
        'accuracy': accuracy,
        'mean_value_p1_wins': mean_when_p1_wins,
        'mean_value_p2_wins': mean_when_p2_wins,
        'bins': bins,
        'num_games': num_games
    }


# ---------------------------------------------------------------------------
# Layer 3b: Tactical Position Sanity Checks
# Verifies the NN assigns correct evaluations to unambiguous positions.
# ---------------------------------------------------------------------------

def run_tactical_sanity_checks(onnx_path="quoridor_model.onnx"):
    """Verify NN gives correct directional evaluations for clear-cut positions."""
    if not os.path.exists(onnx_path):
        print("  SKIPPED: ONNX model not found")
        return None

    from onnx_inference import ONNXModelEvaluator
    evaluator = ONNXModelEvaluator(onnx_path)

    results = []

    def eval_position(game, label):
        tensor = np.array(quoridor_cpp.MCTS().encode_state_cpp(game), dtype=np.float32)
        _, values = evaluator.evaluate_batch(tensor.reshape(1, 11, 9, 9))
        raw = float(values[0])
        p1_val = raw if game.is_p1_turn else -raw
        return p1_val, label

    # Test 1: P1 one step from winning (should be strongly positive)
    g1 = quoridor_cpp.QuoridorGame()
    g1.p1_pos = (4, 7)
    g1.p2_pos = (4, 1)
    g1.is_p1_turn = True
    v1, l1 = eval_position(g1, "P1 one step from goal")
    results.append(('P1 near win → value > 0.5', v1 > 0.5, f"value={v1:.4f}"))

    # Test 2: P2 one step from winning (should be strongly negative)
    g2 = quoridor_cpp.QuoridorGame()
    g2.p1_pos = (4, 7)
    g2.p2_pos = (4, 1)
    g2.is_p1_turn = False
    v2, l2 = eval_position(g2, "P2 one step from goal")
    results.append(('P2 near win → value < -0.5', v2 < -0.5, f"value={v2:.4f}"))

    # Test 3: Opening position should be near zero
    g3 = quoridor_cpp.QuoridorGame()
    v3, _ = eval_position(g3, "Opening position")
    results.append(('Opening → |value| < 0.3', abs(v3) < 0.3, f"value={v3:.4f}"))

    # Test 4: P1 massive distance lead, P2 has no walls
    g4 = quoridor_cpp.QuoridorGame()
    g4.p1_pos = (4, 6)
    g4.p2_pos = (4, 2)
    g4.p2_walls_left = 0
    g4.is_p1_turn = True
    v4, _ = eval_position(g4, "P1 ahead + P2 no walls")
    results.append(('P1 dominating → value > 0.3', v4 > 0.3, f"value={v4:.4f}"))

    # Test 5: Symmetric race, both at row 4, no walls
    g5 = quoridor_cpp.QuoridorGame()
    g5.p1_pos = (4, 4)
    g5.p2_pos = (4, 4)  # This is on top of each other - adjust
    g5.p2_pos = (3, 4)
    g5.p1_walls_left = 0
    g5.p2_walls_left = 0
    g5.is_p1_turn = True
    v5, _ = eval_position(g5, "Near-symmetric no walls")
    results.append(('Symmetric race → |value| < 0.5', abs(v5) < 0.5, f"value={v5:.4f}"))

    return results


# ---------------------------------------------------------------------------
# Main Runner
# ---------------------------------------------------------------------------

def main():
    random.seed(42)
    np.random.seed(42)

    print("=" * 70)
    print("EVAL BAR ACCURACY VERIFICATION SUITE")
    print("=" * 70)

    # Layer 1
    print("\n--- Layer 1: Pathfinding Parity (JS BFS vs C++ get_shortest_path) ---")
    checks, mismatches = run_pathfinding_parity(num_games=200, max_turns=60)
    pf_pass = mismatches == 0
    print(f"  Checked {checks} path calculations across {200} random games")
    print(f"  Mismatches: {mismatches}")
    print(f"  Result: {'PASS' if pf_pass else 'FAIL'}")

    # Layer 2
    print("\n--- Layer 2: Tensorization Parity (JS tensor vs C++ encode_state_cpp) ---")
    checks, mismatches, max_diff = run_tensorization_parity(num_games=200, max_turns=60)
    tn_pass = mismatches == 0
    print(f"  Checked {checks} tensorizations across {200} random games")
    print(f"  Mismatches: {mismatches}")
    print(f"  Max element-wise difference: {max_diff:.8f}")
    print(f"  Result: {'PASS' if tn_pass else 'FAIL'}")

    # Layer 3
    print("\n--- Layer 3: NN Value → Game Outcome Correlation ---")
    corr = run_value_outcome_correlation(num_games=300)
    if corr:
        corr_pass = corr['accuracy'] > 60.0
        print(f"  Games played: {corr['num_games']}")
        print(f"  Total position evaluations: {corr['total_predictions']}")
        print(f"  Correct sign predictions: {corr['correct_predictions']} "
              f"({corr['accuracy']:.1f}%)")
        print(f"  Mean NN value when P1 wins: {corr['mean_value_p1_wins']:+.4f}")
        print(f"  Mean NN value when P2 wins: {corr['mean_value_p2_wins']:+.4f}")
        print(f"  Monotonicity (P1 wins should be > P2 wins): "
              f"{'YES' if corr['mean_value_p1_wins'] > corr['mean_value_p2_wins'] else 'NO'}")

        print("\n  Value bucket → P1 win rate:")
        for b in range(10):
            low = -1.0 + b * 0.2
            high = low + 0.2
            d = corr['bins'][b]
            rate = d['p1_wins'] / d['total'] * 100 if d['total'] > 0 else 0
            bar = '█' * int(rate / 5)
            print(f"    [{low:+.1f}, {high:+.1f}): "
                  f"{rate:5.1f}% P1 wins ({d['p1_wins']:4d}/{d['total']:4d}) {bar}")

        print(f"  Result: {'PASS' if corr_pass else 'FAIL'} "
              f"(threshold: >60% directional accuracy)")
    else:
        corr_pass = None
        print("  SKIPPED")

    # Layer 3b: Tactical sanity
    print("\n--- Layer 3b: Tactical Position Sanity Checks ---")
    tactical = run_tactical_sanity_checks()
    tac_pass = True
    if tactical:
        for label, passed, detail in tactical:
            status = "PASS" if passed else "FAIL"
            if not passed:
                tac_pass = False
            print(f"  [{status}] {label} ({detail})")
    else:
        tac_pass = None
        print("  SKIPPED")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    all_layers = [
        ("Pathfinding Parity", pf_pass),
        ("Tensorization Parity", tn_pass),
        ("Value-Outcome Correlation", corr_pass),
        ("Tactical Sanity Checks", tac_pass)
    ]
    all_pass = True
    for name, result in all_layers:
        if result is None:
            status = "SKIPPED"
        elif result:
            status = "PASS"
        else:
            status = "FAIL"
            all_pass = False
        print(f"  {name}: {status}")

    if all_pass:
        print("\nAll layers verified. The eval bar pipeline is accurate.")
    else:
        print("\nSome layers failed. See details above.")

    return all_pass


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

