import numpy as np
import quoridor_cpp

def test_guaranteed_winner_races():
    print("Testing Guaranteed Winner Solver across race scenarios...")

    # Scenario 1: P2 has 0 walls, P1 is strictly closer (dist 2 vs 4), P1 turn
    g1 = quoridor_cpp.QuoridorGame()
    g1.p1_pos = (4, 6) # dist 2 to row 8
    g1.p2_pos = (4, 4) # dist 4 to row 0
    g1.p1_walls_left = 5
    g1.p2_walls_left = 0
    g1.is_p1_turn = True
    assert g1.get_guaranteed_winner() == 1, "Scenario 1 failed: Expected P1 win"

    # Scenario 2: P1 has 0 walls, P2 is strictly closer (dist 2 vs 4), P2 turn
    g2 = quoridor_cpp.QuoridorGame()
    g2.p1_pos = (4, 4) # dist 4 to row 8
    g2.p2_pos = (4, 2) # dist 2 to row 0
    g2.p1_walls_left = 0
    g2.p2_walls_left = 5
    g2.is_p1_turn = False
    assert g2.get_guaranteed_winner() == -1, "Scenario 2 failed: Expected P2 win"

    # Scenario 3: Both players have 0 walls left, equal distance (dist 2 vs 2), P1 turn
    g3 = quoridor_cpp.QuoridorGame()
    g3.p1_pos = (4, 6) # dist 2
    g3.p2_pos = (4, 2) # dist 2
    g3.p1_walls_left = 0
    g3.p2_walls_left = 0
    g3.is_p1_turn = True
    assert g3.get_guaranteed_winner() == 1, "Scenario 3 failed: Expected P1 win on P1 turn in equal race"

    # Scenario 4: Both players have 0 walls left, equal distance (dist 2 vs 2), P2 turn
    g4 = quoridor_cpp.QuoridorGame()
    g4.p1_pos = (4, 6) # dist 2
    g4.p2_pos = (4, 2) # dist 2
    g4.p1_walls_left = 0
    g4.p2_walls_left = 0
    g4.is_p1_turn = False
    assert g4.get_guaranteed_winner() == -1, "Scenario 4 failed: Expected P2 win on P2 turn in equal race"

    # Scenario 5: Contested race with walls remaining on both sides (neither guaranteed yet)
    g5 = quoridor_cpp.QuoridorGame()
    g5.p1_pos = (4, 2)
    g5.p2_pos = (4, 6)
    g5.p1_walls_left = 8
    g5.p2_walls_left = 8
    g5.is_p1_turn = True
    assert g5.get_guaranteed_winner() == 0, "Scenario 5 failed: Expected game ongoing (0)"

    # Scenario 6: Head-to-head colliding race with tight margin (|l1 - l2| <= 1).
    # P1 at (4, 2) moving to row 8; P2 at (4, 6) moving to row 0.
    # Paths collide on column 4 -> DAGs intersect -> must NOT short-circuit (returns 0 due to jump parity)
    g6 = quoridor_cpp.QuoridorGame()
    g6.p1_pos = (4, 2)
    g6.p2_pos = (4, 6)
    g6.p1_walls_left = 0
    g6.p2_walls_left = 0
    g6.is_p1_turn = True
    disjoint, l1, l2 = g6.are_shortest_path_dags_disjoint()
    assert not disjoint, "Scenario 6 failed: Colliding paths must NOT be disjoint"
    assert g6.get_guaranteed_winner() == 0, f"Scenario 6 failed: Jump parity collision must return 0, got {g6.get_guaranteed_winner()}"

    # Scenario 7: High distance margin (>= 2) even when colliding
    # P1 at (4, 5) dist 3 to row 8; P2 at (4, 7) dist 7 to row 0. Margin = 4 >= 2.
    g7 = quoridor_cpp.QuoridorGame()
    g7.p1_pos = (4, 5)
    g7.p2_pos = (4, 7)
    g7.p1_walls_left = 0
    g7.p2_walls_left = 0
    g7.is_p1_turn = True
    assert g7.get_guaranteed_winner() == 1, "Scenario 7 failed: Margin >= 2 must guarantee P1 win"

    print("Guaranteed Winner Solver tests passed successfully.")

def test_channel_10_tempo_parity():
    print("Testing Channel 10 Path Advantage & Jump Parity checkerboard encoding...")

    # Case A: Even Manhattan distance between pawns (4,2) and (4,4) -> dist = 2 (even)
    # Even Manhattan distance grants active player the jump initiative (+1.0)
    ga = quoridor_cpp.QuoridorGame()
    ga.p1_pos = (4, 2)
    ga.p2_pos = (4, 4)
    ga.is_p1_turn = True
    tensor_a = np.array(quoridor_cpp.MCTS.encode_state_cpp(ga), dtype=np.float32).reshape(11, 9, 9)

    # (0, 0) is even -> path advantage
    # (0, 1) is odd -> jump parity (+1.0 for active jump initiative)
    assert abs(tensor_a[10, 0, 1] - 1.0) < 1e-5, f"Expected +1.0 for even distance jump initiative, got {tensor_a[10, 0, 1]}"

    # Case B: Odd Manhattan distance between pawns (4,2) and (4,5) -> dist = 3 (odd)
    # Odd Manhattan distance grants opponent the jump initiative (-1.0)
    gb = quoridor_cpp.QuoridorGame()
    gb.p1_pos = (4, 2)
    gb.p2_pos = (4, 5)
    gb.is_p1_turn = True
    tensor_b = np.array(quoridor_cpp.MCTS.encode_state_cpp(gb), dtype=np.float32).reshape(11, 9, 9)
    assert abs(tensor_b[10, 0, 1] - (-1.0)) < 1e-5, f"Expected -1.0 for odd distance jump initiative, got {tensor_b[10, 0, 1]}"

    print("Channel 10 Path Advantage & Jump Parity tests passed successfully.")

def test_bitboard_canonical_hashing():
    print("Testing Bitboard representation and horizontal canonical hashing...")

    g = quoridor_cpp.QuoridorGame()
    assert g.h_bitboard == 0 and g.v_bitboard == 0, "Initial bitboards must be 0"

    # Place wall at wx=1, wy=2
    g.step(quoridor_cpp.Action.Wall('h', 1, 2))
    expected_mask = 1 << (2 * 8 + 1)
    assert g.h_bitboard == expected_mask, f"Bitboard mismatch: expected {hex(expected_mask)}, got {hex(g.h_bitboard)}"

    # Horizontal reflection symmetry check
    # State A: p1=(2,3), p2=(6,7), h_wall at (0,0)
    ga = quoridor_cpp.QuoridorGame()
    ga.p1_pos = (2, 3)
    ga.p2_pos = (6, 7)
    ga.p1_walls_left = 9
    ga.p2_walls_left = 10
    ga.is_p1_turn = True
    ga.step(quoridor_cpp.Action.Wall('h', 0, 0))

    # State B (reflected horizontally): p1=(6,3), p2=(2,7), h_wall at (7,0)
    gb = quoridor_cpp.QuoridorGame()
    gb.p1_pos = (6, 3)
    gb.p2_pos = (2, 7)
    gb.p1_walls_left = 9
    gb.p2_walls_left = 10
    gb.is_p1_turn = True
    gb.step(quoridor_cpp.Action.Wall('h', 7, 0))

    ha, ma = ga.get_canonical_hash()
    hb, mb = gb.get_canonical_hash()
    assert ha == hb, f"Canonical hash must be invariant under horizontal reflection: {hex(ha)} vs {hex(hb)}"
    assert ma != mb, "One orientation must be flagged as mirrored relative to canonical"

    print("Bitboard canonical hashing tests passed successfully.")

def test_policy_mirror_involution():
    print("Testing C++ policy mirror involution...")
    policy = [float(i) for i in range(140)]
    mirrored = quoridor_cpp.MCTS.mirror_policy_cpp(policy)
    unmirrored = quoridor_cpp.MCTS.mirror_policy_cpp(mirrored)
    for i in range(140):
        assert abs(policy[i] - unmirrored[i]) < 1e-6, f"Policy mirror is not an involution at index {i}"
    print("C++ policy mirror involution test passed successfully.")

def test_mcts_solver_leaf_integration():
    print("Testing MCTS integration with Zero-Wall Race Solver and Transposition Table...")

    # Position where P1 is guaranteed to win
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = (4, 6) # dist 2
    game.p2_pos = (4, 2) # dist 4
    game.p1_walls_left = 0
    game.p2_walls_left = 0
    game.is_p1_turn = True

    mcts = quoridor_cpp.MCTS(1.4, 0.07, 0.15, 0.20, True) # use_gumbel = True

    # Dummy callback that should barely be called because leaves are solved
    eval_call_count = [0]
    def mock_eval(inputs):
        eval_call_count[0] += 1
        num_items = inputs.shape[0]
        policies = np.ones((num_items, 140), dtype=np.float32) / 140.0
        values = np.zeros(num_items, dtype=np.float32)
        return (policies, values)

    results = mcts.run_search_batched([game], mock_eval, 32)
    visit_counts = results[0][0]
    root_q = results[1][0]

    # Step north towards goal (y=7) should receive the dominant visits
    # Action index for ortho N is 0
    print(f"MCTS root Q: {root_q:.3f}, visits to move 0 (N): {visit_counts[0]}")
    assert root_q > 0.0, f"Expected positive winning confidence from leaf solver, got Q={root_q}"
    best_move = max(range(140), key=lambda i: visit_counts[i])
    assert best_move == 0, f"Move 0 (North toward goal) must be selected, got {best_move}"
    assert visit_counts[0] > 0, "Winning pawn move must receive visits"
    assert mcts.get_tt_size() > 0, "Transposition table should record solved and evaluated states"

    print("MCTS leaf evaluation solver integration test passed successfully.")

if __name__ == "__main__":
    test_guaranteed_winner_races()
    test_channel_10_tempo_parity()
    test_bitboard_canonical_hashing()
    test_policy_mirror_involution()
    test_mcts_solver_leaf_integration()
    print("ALL SOLVER AND TRANSPOSITION TABLE VERIFICATIONS PASSED.")
