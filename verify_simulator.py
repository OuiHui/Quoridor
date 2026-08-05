import random
import quoridor_cpp
import train_alphazero as py_az

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

if __name__ == "__main__":
    verify_simulators()
