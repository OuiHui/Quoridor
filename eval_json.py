import os
import sys
import json
import argparse
import numpy as np
import torch

os.environ["TORCHDYNAMO_DISABLE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import quoridor_cpp
from quoridor_model import QuoridorNet, map_index_to_action_perspective, map_action_to_index_perspective, flip_horizontal_policy


def parse_json_state(json_data):
    """
    Parses a Quoridor JSON game payload or full history object into board parameters.
    Supports formats:
    1. Full game export with 'p1Pos', 'p2Pos', 'hWalls', 'vWalls', 'turn', 'p1Walls', 'p2Walls'
    2. Minimal state dict: {"p1Pos": [x, y], "p2Pos": [x, y], "hWalls": [...], "vWalls": [...], "turn": 1|2}
    """
    if isinstance(json_data, str):
        json_data = json.loads(json_data)

    # 1. Player positions (handle dict {"x": 1, "y": 2} or list [1, 2] or tuple)
    def parse_pos(p):
        if isinstance(p, dict):
            return (p['x'], p['y'])
        elif isinstance(p, (list, tuple)):
            return (int(p[0]), int(p[1]))
        raise ValueError(f"Invalid position format: {p}")

    p1_pos = parse_pos(json_data.get('p1Pos', [4, 0]))
    p2_pos = parse_pos(json_data.get('p2Pos', [4, 8]))

    # 2. Turn (1 or 2, default 1)
    turn = json_data.get('turn', 1)
    is_p1_turn = (turn == 1)

    # 3. Walls count
    p1_walls = json_data.get('p1Walls', json_data.get('p1_walls', 10))
    p2_walls = json_data.get('p2Walls', json_data.get('p2_walls', 10))

    # 4. Parse horizontal walls
    h_walls = []
    raw_h = json_data.get('hWalls', json_data.get('h_walls', []))
    for item in raw_h:
        if isinstance(item, str):
            # e.g., "4,2:1" -> x=4, y=2
            coord_part = item.split(':')[0]
            parts = coord_part.split(',')
            h_walls.append((int(parts[0]), int(parts[1])))
        elif isinstance(item, (list, tuple)):
            h_walls.append((int(item[0]), int(item[1])))

    # 5. Parse vertical walls
    v_walls = []
    raw_v = json_data.get('vWalls', json_data.get('v_walls', []))
    for item in raw_v:
        if isinstance(item, str):
            coord_part = item.split(':')[0]
            parts = coord_part.split(',')
            v_walls.append((int(parts[0]), int(parts[1])))
        elif isinstance(item, (list, tuple)):
            v_walls.append((int(item[0]), int(item[1])))

    # Create C++ game object
    game = quoridor_cpp.QuoridorGame()
    game.p1_pos = p1_pos
    game.p2_pos = p2_pos
    game.p1_walls_left = p1_walls
    game.p2_walls_left = p2_walls
    game.is_p1_turn = is_p1_turn

    # Set walls on C++ game board using Action.Wall
    for wx, wy in h_walls:
        if 0 <= wx < 8 and 0 <= wy < 8:
            game.step(quoridor_cpp.Action.Wall('h', wx, wy))
    for wx, wy in v_walls:
        if 0 <= wx < 8 and 0 <= wy < 8:
            game.step(quoridor_cpp.Action.Wall('v', wx, wy))

    # Restore positions and turn which step() modified
    game.p1_pos = p1_pos
    game.p2_pos = p2_pos
    game.p1_walls_left = p1_walls
    game.p2_walls_left = p2_walls
    game.is_p1_turn = is_p1_turn

    return game, {
        'p1_pos': p1_pos,
        'p2_pos': p2_pos,
        'p1_walls': p1_walls,
        'p2_walls': p2_walls,
        'is_p1_turn': is_p1_turn,
        'h_walls': h_walls,
        'v_walls': v_walls
    }


def _cpp_to_py(act):
    if act.type == 'move':
        return {'type': 'move', 'dir': act.move_dir, 'to': (act.to_x, act.to_y)}
    return {'type': 'wall', 'wallType': act.wall_type, 'x': act.wall_x, 'y': act.wall_y}


def pos_to_algebraic(x, y):
    """Convert (x, y) coordinates to algebraic notation (e.g. 0,0 -> 'a1', 4,3 -> 'e4')."""
    return f"{chr(x + 97)}{y + 1}"


def action_to_algebraic(act):
    """Convert Action dict to clean algebraic notation (e.g. 'Move N -> e5', 'Wall e3h')."""
    if act['type'] == 'move':
        col = chr(act['to'][0] + 97)
        row = act['to'][1] + 1
        return f"Move {act['dir']} -> {col}{row}"
    else:
        col = chr(act['x'] + 97)
        row = act['y'] + 1
        return f"Wall {col}{row}{act['wallType']}"


def evaluate_json_state(json_input, checkpoint_path="quoridor_checkpoint.pth", mcts_simulations=800):
    """
    Hook function to evaluate any Quoridor board state provided in JSON format.
    Returns structured, LLM-optimized graph analysis dictionary.
    """
    game, info = parse_json_state(json_input)

    # 1. Shortest Path calculations
    raw_p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos) or []
    raw_p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos) or []

    p1_path_alg = [pos_to_algebraic(x, y) for x, y in raw_p1_path]
    p2_path_alg = [pos_to_algebraic(x, y) for x, y in raw_p2_path]

    p1_dist = len(raw_p1_path) - 1 if raw_p1_path else 999
    p2_dist = len(raw_p2_path) - 1 if raw_p2_path else 999
    path_adv = p2_dist - p1_dist  # Positive = P1 ahead, Negative = P2 ahead

    # Identify choke points (single-file path cells)
    p1_path_set = set(raw_p1_path)
    p2_path_set = set(raw_p2_path)
    intersection = [pos_to_algebraic(x, y) for (x, y) in p1_path_set.intersection(p2_path_set)]

    # 2. Neural Network Evaluation
    model = QuoridorNet(num_residual_blocks=15, channels=128)
    if os.path.exists(checkpoint_path):
        ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
        model.load_state_dict(ckpt['model_state_dict'])
    model.eval()

    state_enc = quoridor_cpp.MCTS.encode_state_cpp(game)
    input_tensor = torch.tensor(state_enc, dtype=torch.float32).reshape(1, 11, 9, 9)

    with torch.no_grad():
        policy_logits, value_tensor = model(input_tensor)
        policy_probs = torch.softmax(policy_logits, dim=-1).squeeze(0).numpy()
        nn_value_raw = value_tensor.item()

    nn_value_p1 = nn_value_raw if game.is_p1_turn else -nn_value_raw

    # 3. MCTS Search Evaluation
    def eval_cb(inputs_flat, num_items=1):
        with torch.no_grad():
            x = torch.from_numpy(inputs_flat).float().reshape(-1, 11, 9, 9)
            logits, vals = model(x)
            l_np = logits.numpy()
            e_x = np.exp(l_np - np.max(l_np, axis=1, keepdims=True))
            p_np = e_x / np.sum(e_x, axis=1, keepdims=True)
            return p_np.astype(np.float32), vals.numpy().ravel().astype(np.float32)

    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.0, dirichlet_eps=0.0)
    visit_counts, root_q = mcts.run_search_batched([game], eval_cb, mcts_simulations)

    visits = np.array(visit_counts[0], dtype=np.float32)
    mcts_q_raw = root_q[0]
    mcts_q_p1 = mcts_q_raw if game.is_p1_turn else -mcts_q_raw

    # Filter and rank valid actions
    valid_actions = game.get_valid_actions()
    action_evals = []
    total_visits = visits.sum() if visits.sum() > 0 else 1.0

    for act in valid_actions:
        py_act = _cpp_to_py(act)
        idx = map_action_to_index_perspective(py_act, game.is_p1_turn)
        v_count = int(visits[idx])
        v_prob = float(v_count / total_visits)
        nn_prior = float(policy_probs[idx])
        action_evals.append({
            'notation': action_to_algebraic(py_act),
            'action': py_act,
            'mcts_visits': v_count,
            'mcts_prob': round(v_prob, 4),
            'nn_prior': round(nn_prior, 4)
        })

    action_evals.sort(key=lambda item: item['mcts_visits'], reverse=True)

    # Format horizontal and vertical walls into algebraic strings
    h_walls_alg = [f"{pos_to_algebraic(x, y)}h" for x, y in info['h_walls']]
    v_walls_alg = [f"{pos_to_algebraic(x, y)}v" for x, y in info['v_walls']]

    return {
        'active_player': 1 if game.is_p1_turn else 2,
        'pawn_positions': {
            'P1': pos_to_algebraic(info['p1_pos'][0], info['p1_pos'][1]),
            'P2': pos_to_algebraic(info['p2_pos'][0], info['p2_pos'][1])
        },
        'shortest_paths': {
            'P1': p1_path_alg,
            'P2': p2_path_alg
        },
        'path_distances': {
            'P1': p1_dist,
            'P2': p2_dist,
            'differential_P2_minus_P1': path_adv
        },
        'walls_remaining': {
            'P1': info['p1_walls'],
            'P2': info['p2_walls']
        },
        'walls_placed': {
            'horizontal': h_walls_alg,
            'vertical': v_walls_alg,
            'total': len(h_walls_alg) + len(v_walls_alg)
        },
        'shared_choke_points': intersection,
        'engine_eval': {
            'nn_value_p1': round(nn_value_p1, 4),
            'mcts_q_p1': round(mcts_q_p1, 4),
            'status': 'P1 Advantage' if nn_value_p1 > 0.1 else 'P2 Advantage' if nn_value_p1 < -0.1 else 'Equal'
        },
        'top_mcts_actions': action_evals[:5]
    }


def render_ascii_board(game):
    p1 = game.p1_pos
    p2 = game.p2_pos
    h_walls = set(game.h_walls)
    v_walls = set(game.v_walls)
    p1_path = set(game.get_shortest_path(p1, 8, opp_pos=p2) or [])
    p2_path = set(game.get_shortest_path(p2, 0, opp_pos=p1) or [])

    lines = []
    lines.append("    a   b   c   d   e   f   g   h   i")
    lines.append("  +---+---+---+---+---+---+---+---+---+")
    for y in range(8, -1, -1):  # Row 9 (top) down to Row 1 (bottom)
        row_str = f"{y+1} |"
        for x in range(9):
            if (x, y) == p1:
                cell = "P1 "
            elif (x, y) == p2:
                cell = "P2 "
            elif (x, y) in p1_path and (x, y) in p2_path:
                cell = " * "
            elif (x, y) in p1_path:
                cell = " 1 "
            elif (x, y) in p2_path:
                cell = " 2 "
            else:
                cell = "   "
            
            # Check vertical wall on right of (x, y)
            v_wall = "|" if (x < 8 and ((x, y) in v_walls or (y > 0 and (x, y-1) in v_walls))) else "|"
            if x < 8 and ((x, y) in v_walls or (y > 0 and (x, y-1) in v_walls)):
                v_wall = "║"
            row_str += cell + v_wall
        lines.append(row_str)

        # Horizontal walls below row y
        if y > 0:
            h_line = "  +"
            for x in range(9):
                h_wall = (x < 8 and ((x, y-1) in h_walls or (x > 0 and (x-1, y-1) in h_walls)))
                segment = "===" if h_wall else "---"
                h_line += segment + "+"
            lines.append(h_line)

    lines.append("  +---+---+---+---+---+---+---+---+---+")
    lines.append("    a   b   c   d   e   f   g   h   i")
    return "\n".join(lines)


def print_evaluation_report(eval_res):
    info = eval_res['info']
    active_p = eval_res['active_player']
    game, _ = parse_json_state(json.dumps(info))

    print("=" * 65)
    print("           QUORIDOR BOARD STATE DISSECTION REPORT")
    print("=" * 65)
    print(render_ascii_board(game))
    print("=" * 65)
    print(f"Active Player: P{active_p}")
    print(f"P1 Position: {info['p1_pos']} (col {chr(info['p1_pos'][0]+97)}{info['p1_pos'][1]+1})  |  Walls Left: {info['p1_walls']}")
    print(f"P2 Position: {info['p2_pos']} (col {chr(info['p2_pos'][0]+97)}{info['p2_pos'][1]+1})  |  Walls Left: {info['p2_walls']}")
    print(f"H-Walls Placed: {len(info['h_walls'])}  |  V-Walls Placed: {len(info['v_walls'])}")
    print("-" * 65)
    print(f"Shortest Path Lengths: P1 = {eval_res['p1_dist']} steps, P2 = {eval_res['p2_dist']} steps")
    print(f"Path Distance Advantage (P2_dist - P1_dist): {eval_res['path_advantage']:+d} moves")
    print("-" * 65)
    print(f"Neural Net Value (P1 Perspective): {eval_res['nn_value_p1']:+.4f} "
          f"({'P1 Advantage' if eval_res['nn_value_p1'] > 0.1 else 'P2 Advantage' if eval_res['nn_value_p1'] < -0.1 else 'Balanced'})")
    print(f"MCTS Root Q-Value (P1 Perspective): {eval_res['mcts_q_p1']:+.4f}")
    print("-" * 65)
    print("Top Recommended Actions (MCTS 800 Simulations):")
    for rank, act_info in enumerate(eval_res['top_actions'], 1):
        act = act_info['action']
        if act['type'] == 'move':
            col = chr(act['to'][0] + 97)
            row = act['to'][1] + 1
            act_str = f"Move {act['dir']} -> {col}{row}"
        else:
            col = chr(act['x'] + 97)
            row = act['y'] + 1
            act_str = f"Place {act['wallType'].upper()}-Wall at {col}{row}"
        print(f"  {rank}. {act_str:<32} Visits: {act_info['mcts_visits']:<4} ({act_info['mcts_prob']*100:5.1f}%)  Prior: {act_info['nn_prior']:5.3f}")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate a Quoridor board state from JSON.")
    parser.add_argument("json_file", nargs="?", help="Path to JSON file containing game state (or pass JSON string)")
    parser.add_argument("--checkpoint", type=str, default="quoridor_checkpoint.pth", help="Checkpoint model path")
    parser.add_argument("--simulations", type=int, default=800, help="MCTS simulation count")
    args = parser.parse_args()

    if args.json_file:
        if os.path.exists(args.json_file):
            with open(args.json_file, 'r') as f:
                content = f.read()
        else:
            content = args.json_file
    elif not sys.stdin.isatty():
        content = sys.stdin.read()
    else:
        # Default sample state for quick verification if no file passed
        content = json.dumps({
            "p1Pos": [1, 2],
            "p2Pos": [6, 2],
            "p1Walls": 5,
            "p2Walls": 0,
            "hWalls": ["4,2:1", "5,5:2", "3,5:2", "2,2:1", "2,3:2", "7,5:2", "6,4:1", "6,3:2", "7,1:1", "6,0:2"],
            "vWalls": ["2,4:2", "3,3:2", "5,3:2", "4,4:1", "5,1:2"],
            "turn": 1
        })

    eval_result = evaluate_json_state(content, checkpoint_path=args.checkpoint, mcts_simulations=args.simulations)
    print_evaluation_report(eval_result)
