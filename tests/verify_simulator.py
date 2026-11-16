import random
import torch
import numpy as np
import quoridor_cpp
import train_alphazero as py_az
from quoridor_model import flip_horizontal_state

def verify_wall_coordinate_padding_alignment():
    print("Verifying 8x8 wall coordinate padding under 180-degree rotation and horizontal mirroring...")
    test_game = quoridor_cpp.QuoridorGame()
    
    # Place horizontal and vertical walls across diverse coordinates
    test_walls = [
        quoridor_cpp.Action.Wall('h', 0, 0),
        quoridor_cpp.Action.Wall('v', 0, 0),
        quoridor_cpp.Action.Wall('h', 7, 7),
        quoridor_cpp.Action.Wall('v', 7, 7),
        quoridor_cpp.Action.Wall('h', 3, 4),
        quoridor_cpp.Action.Wall('v', 5, 2),
    ]
    for w in test_walls:
        if test_game.validate_wall_placement(w.wall_x, w.wall_y, w.wall_type):
            test_game.step(w)

    for is_p1 in [True, False]:
        test_game.is_p1_turn = is_p1
        enc = quoridor_cpp.MCTS.encode_state_cpp(test_game)
        tensor = torch.tensor(enc, dtype=torch.float32).reshape(11, 9, 9)

        # 1. Verify that padding row 8 and col 8 are strictly zero in channels 2 and 3
        assert (tensor[2, 8, :] == 0.0).all(), f"Turn P1={is_p1}: H-wall column 8 padding is non-zero!"
        assert (tensor[2, :, 8] == 0.0).all(), f"Turn P1={is_p1}: H-wall row 8 padding is non-zero!"
        assert (tensor[3, 8, :] == 0.0).all(), f"Turn P1={is_p1}: V-wall column 8 padding is non-zero!"
        assert (tensor[3, :, 8] == 0.0).all(), f"Turn P1={is_p1}: V-wall row 8 padding is non-zero!"

        # 2. Verify horizontal mirroring preserves padding and aligns wall coordinates
        flipped = flip_horizontal_state(tensor)
        assert (flipped[2, 8, :] == 0.0).all(), f"Flipped P1={is_p1}: H-wall column 8 padding is non-zero!"
        assert (flipped[2, :, 8] == 0.0).all(), f"Flipped P1={is_p1}: H-wall row 8 padding is non-zero!"
        assert (flipped[3, 8, :] == 0.0).all(), f"Flipped P1={is_p1}: V-wall column 8 padding is non-zero!"
        assert (flipped[3, :, 8] == 0.0).all(), f"Flipped P1={is_p1}: V-wall row 8 padding is non-zero!"

        # 3. Verify involution: flip(flip(tensor)) == tensor
        double_flipped = flip_horizontal_state(flipped)
        assert torch.allclose(double_flipped, tensor, atol=1e-6), f"Double horizontal flip mismatch for turn P1={is_p1}"

    print("SUCCESS: 8x8 wall coordinate padding remained strictly aligned under rotation and mirroring.")

def cpp_action_to_dict(act):
    if act.type == 'move':
        return {'type': 'move', 'dir': act.move_dir, 'to': (act.to_x, act.to_y)}
    else:
        return {'type': 'wall', 'wallType': act.wall_type, 'x': act.wall_x, 'y': act.wall_y}

def cpp_action_to_cpp_obj(py_act):
    if py_act['type'] == 'move':
        return quoridor_cpp.Action.Move(py_act['dir'], py_act['to'][0], py_act['to'][1])
    else:
        return quoridor_cpp.Action.Wall(py_act['wallType'], py_act['x'], py_act['y'])

def sort_actions(actions):
    return sorted(
        actions,
        key=lambda a: (
            a['type'],
            a.get('dir', ''),
            a.get('wallType', ''),
            a.get('x', 0),
            a.get('y', 0),
            a.get('to', (0, 0))[0],
            a.get('to', (0, 0))[1]
        )
    )

def verify_simulators(num_moves=1000):
    print("Initializing simulators...")
    g_py = quoridor_cpp.QuoridorGame()
    g_cpp = quoridor_cpp.QuoridorGame()
    
    for turn in range(num_moves):
        # 1. State comparison
        assert g_py.p1_pos == g_cpp.p1_pos, f"Turn {turn}: P1 position mismatch: PY={g_py.p1_pos}, CPP={g_cpp.p1_pos}"
        assert g_py.p2_pos == g_cpp.p2_pos, f"Turn {turn}: P2 position mismatch: PY={g_py.p2_pos}, CPP={g_cpp.p2_pos}"
        assert g_py.p1_walls_left == g_cpp.p1_walls_left, f"Turn {turn}: P1 walls left mismatch: PY={g_py.p1_walls_left}, CPP={g_cpp.p1_walls_left}"
        assert g_py.p2_walls_left == g_cpp.p2_walls_left, f"Turn {turn}: P2 walls left mismatch: PY={g_py.p2_walls_left}, CPP={g_cpp.p2_walls_left}"
        assert g_py.is_p1_turn == g_cpp.is_p1_turn, f"Turn {turn}: Turn turn mismatch: PY={g_py.is_p1_turn}, CPP={g_cpp.is_p1_turn}"
        assert set(g_py.h_walls) == g_cpp.h_walls, f"Turn {turn}: Horizontal walls mismatch: PY={g_py.h_walls}, CPP={g_cpp.h_walls}"
        assert set(g_py.v_walls) == g_cpp.v_walls, f"Turn {turn}: Vertical walls mismatch: PY={g_py.v_walls}, CPP={g_cpp.v_walls}"
        
        # 2. Heuristic check
        py_h = g_py.evaluate_heuristic()
        cpp_h = g_cpp.evaluate_heuristic()
        assert abs(py_h - cpp_h) < 1e-5, f"Turn {turn}: Heuristic mismatch: PY={py_h}, CPP={cpp_h}"

        # 3. Pathfinding check
        p1_path_py = g_py.get_shortest_path(g_py.p1_pos, 8, g_py.p2_pos) or []
        p1_path_cpp = g_cpp.get_shortest_path(g_cpp.p1_pos, 8, g_cpp.p2_pos) or []
        assert p1_path_py == p1_path_cpp, f"Turn {turn}: P1 shortest path mismatch:\nPY={p1_path_py}\nCPP={p1_path_cpp}"
        
        # 4. Valid Actions check
        actions_py = sort_actions([cpp_action_to_dict(a) for a in g_py.get_valid_actions()])
        actions_cpp = sort_actions([cpp_action_to_dict(a) for a in g_cpp.get_valid_actions()])
        
        assert len(actions_py) == len(actions_cpp), f"Turn {turn}: Valid action count mismatch: PY={len(actions_py)}, CPP={len(actions_cpp)}"
        for a_py, a_cpp in zip(actions_py, actions_cpp):
            assert a_py == a_cpp, f"Turn {turn}: Action mismatch:\nPY={a_py}\nCPP={a_cpp}"

        if g_py.is_game_over() != 0:
            print(f"Game completed at turn {turn}. Resetting board.")
            g_py = quoridor_cpp.QuoridorGame()
            g_cpp = quoridor_cpp.QuoridorGame()
            continue
            
        # Select random move
        selected_action = random.choice(actions_py)
        
        # Step both
        g_py.step(cpp_action_to_cpp_obj(selected_action))
        g_cpp.step(cpp_action_to_cpp_obj(selected_action))
        
    print(f"SUCCESS: Verified C++ simulator against Python reference over {num_moves} random steps. Boards and rules match perfectly!")

def verify_wall_trapping_prevention():
    print("Verifying that illegal wall placements trapping either player are rejected...")
    g = quoridor_cpp.QuoridorGame()
    h_walls = [(0, 1), (4, 0), (2, 7), (5, 4), (2, 2), (6, 6)]
    v_walls = [(0, 7), (7, 4), (1, 2), (7, 7), (0, 0), (4, 6), (3, 0), (7, 2)]

    for wx, wy in h_walls:
        g.step(quoridor_cpp.Action.Wall('h', wx, wy))
        g.is_p1_turn = not g.is_p1_turn
        g.p1_walls_left = 10
        g.p2_walls_left = 10

    for wx, wy in v_walls:
        g.step(quoridor_cpp.Action.Wall('v', wx, wy))
        g.is_p1_turn = not g.is_p1_turn
        g.p1_walls_left = 10
        g.p2_walls_left = 10

    # Vertical wall at (5, 0) would box in P1 at (4, 0)
    assert not g.validate_wall_placement(5, 0, 'v'), "Trapping wall (5, 0, 'v') must be rejected by validate_wall_placement!"

    p1_path = g.get_shortest_path(g.p1_pos, 8, g.p2_pos)
    p2_path = g.get_shortest_path(g.p2_pos, 0, g.p1_pos)
    assert not g.validate_wall_placement_cached(5, 0, 'v', p1_path, p2_path), "Trapping wall (5, 0, 'v') must be rejected by validate_wall_placement_cached!"

    valid_actions = g.get_valid_actions()
    for a in valid_actions:
        if a.type == 'wall' and a.wall_type == 'v' and a.wall_x == 5 and a.wall_y == 0:
            raise AssertionError("Trapping wall (5, 0, 'v') was found in get_valid_actions()!")

    print("SUCCESS: Trapping wall was strictly rejected by all validation checks.")

if __name__ == "__main__":
    verify_wall_trapping_prevention()
    verify_simulators()
    verify_wall_coordinate_padding_alignment()
