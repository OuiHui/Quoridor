import json
import math
import os
import random
import time
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from collections import deque
from quoridor_model import QuoridorNet, encode_state, flip_horizontal_state, flip_horizontal_policy, map_action_to_index, map_action_to_index_perspective, map_index_to_action_perspective, export_to_onnx, NUM_ACTIONS

# Path to JSON state file served by Vite dev server
_STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'training_state.json')

_METRICS = {
    'epoch': 0,
    'total_epochs': 50,
    'game_idx': 0,
    'total_games': 20,
    'p1_wins': 0,
    'p2_wins': 0,
    'draws': 0,
    'policy_loss': 0.0,
    'value_loss': 0.0,
    'entropy': 0.0,
    'lr': 0.001
}

def write_training_state(game, move_count, active_player, status, last_move=''):
    """Serialize current game state for the browser overlay to poll."""
    payload = {
        'status': status,
        'p1_pos': list(game.p1_pos),
        'p2_pos': list(game.p2_pos),
        'h_walls': [list(w) for w in game.h_walls],
        'v_walls': [list(w) for w in game.v_walls],
        'h_wall_owners': game.h_wall_owners,
        'v_wall_owners': game.v_wall_owners,
        'p1_walls': game.p1_walls_left,
        'p2_walls': game.p2_walls_left,
        'move_count': move_count,
        'current_player': active_player,
        'last_move': last_move,
        'timestamp': time.time(),
        'metrics': _METRICS,
    }
    os.makedirs(os.path.dirname(_STATE_FILE), exist_ok=True)
    with open(_STATE_FILE, 'w') as f:
        json.dump(payload, f)
# --- LIGHTWEIGHT PYTHON QUORIDOR SIMULATOR ---

class QuoridorGame:
    def __init__(self):
        # P1 starts at (4, 0), goal is y = 8. P2 starts at (4, 8), goal is y = 0.
        self.p1_pos = (4, 0)
        self.p2_pos = (4, 8)
        self.h_walls = set() # set of (wx, wy) in 0..7
        self.v_walls = set() # set of (wx, wy) in 0..7
        self.h_wall_owners = {} # dict of "wx,wy" -> owner (1 or 2)
        self.v_wall_owners = {} # dict of "wx,wy" -> owner (1 or 2)
        self.p1_walls_left = 10
        self.p2_walls_left = 10
        self.is_p1_turn = True

    def clone(self):
        game = QuoridorGame()
        game.p1_pos = self.p1_pos
        game.p2_pos = self.p2_pos
        game.h_walls = set(self.h_walls)
        game.v_walls = set(self.v_walls)
        game.h_wall_owners = dict(self.h_wall_owners)
        game.v_wall_owners = dict(self.v_wall_owners)
        game.p1_walls_left = self.p1_walls_left
        game.p2_walls_left = self.p2_walls_left
        game.is_p1_turn = self.is_p1_turn
        return game

    def clone_and_step(self, action):
        g = self.clone()
        g.step(action)
        return g

    def print_board(self):
        grid = []
        for y in range(8, -1, -1):
            row_str = ""
            for x in range(9):
                if (x, y) == self.p1_pos:
                    row_str += " P1 "
                elif (x, y) == self.p2_pos:
                    row_str += " P2 "
                else:
                    row_str += "  . "
                if x < 8:
                    row_str += "|" if (x, y) in self.v_walls or (x, y - 1) in self.v_walls else " "
            grid.append(row_str)
            if y > 0:
                row_gap = ""
                for x in range(9):
                    row_gap += "====" if (x, y - 1) in self.h_walls or (x - 1, y - 1) in self.h_walls else "    "
                    if x < 8:
                        row_gap += " "
                grid.append(row_gap)
        print("\n".join(grid))
        print(f"P1 Walls Left: {self.p1_walls_left} | P2 Walls Left: {self.p2_walls_left}")
        print("-" * 45)

    def get_shortest_path(self, start, target_y, opp_pos=None):
        """BFS shortest path. Pass opp_pos to account for jump moves over opponent."""
        queue = deque([[start]])
        visited = {start}
        while queue:
            path = queue.popleft()
            x, y = path[-1]
            if y == target_y:
                return path
            for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < 9 and 0 <= ny < 9 and not self.is_move_blocked(x, y, nx, ny):
                    if opp_pos and (nx, ny) == opp_pos:
                        # Cell occupied by opponent — resolve jump destinations
                        jx, jy = nx + dx, ny + dy
                        straight_ok = 0 <= jx < 9 and 0 <= jy < 9 and not self.is_move_blocked(nx, ny, jx, jy)
                        if straight_ok:
                            if (jx, jy) not in visited:
                                visited.add((jx, jy))
                                queue.append(path + [(jx, jy)])
                        else:
                            # Diagonal jumps when straight is blocked
                            sides = [(-1, 0), (1, 0)] if dx == 0 else [(0, -1), (0, 1)]
                            for sdx, sdy in sides:
                                dix, diy = nx + sdx, ny + sdy
                                if 0 <= dix < 9 and 0 <= diy < 9 and not self.is_move_blocked(nx, ny, dix, diy):
                                    if (dix, diy) not in visited:
                                        visited.add((dix, diy))
                                        queue.append(path + [(dix, diy)])
                    elif (nx, ny) not in visited:
                        visited.add((nx, ny))
                        queue.append(path + [(nx, ny)])
        return None

    def is_move_blocked(self, x1, y1, x2, y2):
        if x1 == x2:
            # Vertical move
            ymin = min(y1, y2)
            if abs(y1 - y2) == 1:
                return (x1, ymin) in self.h_walls or (x1 - 1, ymin) in self.h_walls
        elif y1 == y2:
            # Horizontal move
            xmin = min(x1, x2)
            if abs(x1 - x2) == 1:
                return (xmin, y1) in self.v_walls or (xmin, y1 - 1) in self.v_walls
        return True

    def get_valid_pawn_moves(self, is_p1):
        my_pos = self.p1_pos if is_p1 else self.p2_pos
        opp_pos = self.p2_pos if is_p1 else self.p1_pos
        px, py = my_pos
        ox, oy = opp_pos
        
        valid = []
        dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        for dx, dy in dirs:
            nx, ny = px + dx, py + dy
            if 0 <= nx < 9 and 0 <= ny < 9:
                if not self.is_move_blocked(px, py, nx, ny):
                    if (nx, ny) == (ox, oy):
                        # Jump over opponent
                        jx, jy = nx + dx, ny + dy
                        jump_blocked = jx < 0 or jx > 8 or jy < 0 or jy > 8 or self.is_move_blocked(nx, ny, jx, jy)
                        if not jump_blocked:
                            valid.append(('move', (jx, jy)))
                        else:
                            # Diagonal jump if straight jump is blocked
                            if dx == 0:
                                # Moving vertically, diagonals are horizontal
                                if nx - 1 >= 0 and not self.is_move_blocked(nx, ny, nx - 1, ny):
                                    valid.append(('move', (nx - 1, ny)))
                                if nx + 1 < 9 and not self.is_move_blocked(nx, ny, nx + 1, ny):
                                    valid.append(('move', (nx + 1, ny)))
                            else:
                                # Moving horizontally, diagonals are vertical
                                if ny - 1 >= 0 and not self.is_move_blocked(nx, ny, nx, ny - 1):
                                    valid.append(('move', (nx, ny - 1)))
                                if ny + 1 < 9 and not self.is_move_blocked(nx, ny, nx, ny + 1):
                                    valid.append(('move', (nx, ny + 1)))
                    else:
                        valid.append(('move', (nx, ny)))
        return valid

    def validate_wall_placement(self, wx, wy, wall_type):
        if wx < 0 or wx > 7 or wy < 0 or wy > 7:
            return False
        # Overlap check
        if wall_type == 'h':
            if (wx, wy) in self.h_walls or (wx - 1, wy) in self.h_walls or (wx + 1, wy) in self.h_walls:
                return False
            if (wx, wy) in self.v_walls:
                return False
        else:
            if (wx, wy) in self.v_walls or (wx, wy - 1) in self.v_walls or (wx, wy + 1) in self.v_walls:
                return False
            if (wx, wy) in self.h_walls:
                return False

        # Connectivity check
        if wall_type == 'h':
            self.h_walls.add((wx, wy))
        else:
            self.v_walls.add((wx, wy))
            
        p1_path = self.get_shortest_path(self.p1_pos, 8)
        p2_path = self.get_shortest_path(self.p2_pos, 0)
        
        if wall_type == 'h':
            self.h_walls.remove((wx, wy))
        else:
            self.v_walls.remove((wx, wy))
            
        return p1_path is not None and p2_path is not None

    def get_candidate_walls(self):
        candidates = set()
        
        # 1. Add walls around both players (radius of 5 for broader strategic coverage)
        for pos in [self.p1_pos, self.p2_pos]:
            px, py = pos
            for wx in range(max(0, px - 5), min(8, px + 6)):
                for wy in range(max(0, py - 5), min(8, py + 6)):
                    candidates.add((wx, wy, 'h'))
                    candidates.add((wx, wy, 'v'))
                    
        # 2. Add walls that intersect the shortest paths of both players
        p1_path = self.get_shortest_path(self.p1_pos, 8, opp_pos=self.p2_pos)
        p2_path = self.get_shortest_path(self.p2_pos, 0, opp_pos=self.p1_pos)
        
        for path in [p1_path, p2_path]:
            if not path:
                continue
            for i in range(len(path) - 1):
                (x1, y1), (x2, y2) = path[i], path[i+1]
                if x1 == x2:  # vertical step
                    ymin = min(y1, y2)
                    for wx in [x1, x1 - 1]:
                        if 0 <= wx < 8 and 0 <= ymin < 8:
                            candidates.add((wx, ymin, 'h'))
                else:  # horizontal step
                    xmin = min(x1, x2)
                    for wy in [y1, y1 - 1]:
                        if 0 <= xmin < 8 and 0 <= wy < 8:
                            candidates.add((xmin, wy, 'v'))
        return candidates

    def get_valid_actions(self):
        actions = []
        is_p1 = self.is_p1_turn
        
        # 1. Pawn moves
        for _, dest in self.get_valid_pawn_moves(is_p1):
            px, py = self.p1_pos if is_p1 else self.p2_pos
            dx, dy = dest[0] - px, dest[1] - py
            if dx == 0 and dy == 1:   move_dir = 'N'
            elif dx == 0 and dy == -1: move_dir = 'S'
            elif dx == 1 and dy == 0:  move_dir = 'E'
            elif dx == -1 and dy == 0: move_dir = 'W'
            elif dx == 0 and dy == 2:  move_dir = 'jump_N'
            elif dx == 0 and dy == -2: move_dir = 'jump_S'
            elif dx == 2 and dy == 0:  move_dir = 'jump_E'
            elif dx == -2 and dy == 0: move_dir = 'jump_W'
            elif dx == 1 and dy == 1:  move_dir = 'jump_NE'
            elif dx == -1 and dy == 1: move_dir = 'jump_NW'
            elif dx == 1 and dy == -1: move_dir = 'jump_SE'
            else:                      move_dir = 'jump_SW'
            actions.append({'type': 'move', 'dir': move_dir, 'to': dest})
            
        # 2. Wall placements
        walls_left = self.p1_walls_left if is_p1 else self.p2_walls_left
        if walls_left > 0:
            candidates = self.get_candidate_walls()
            for wx, wy, wtype in candidates:
                if self.validate_wall_placement(wx, wy, wtype):
                    actions.append({'type': 'wall', 'wallType': wtype, 'x': wx, 'y': wy})
                        
        return actions

    def step(self, action):
        is_p1 = self.is_p1_turn
        if action['type'] == 'move':
            if is_p1:
                self.p1_pos = action['to']
            else:
                self.p2_pos = action['to']
        elif action['type'] == 'wall':
            wx, wy = action['x'], action['y']
            owner = 1 if is_p1 else 2
            if action['wallType'] == 'h':
                self.h_walls.add((wx, wy))
                self.h_wall_owners[f"{wx},{wy}"] = owner
            else:
                self.v_walls.add((wx, wy))
                self.v_wall_owners[f"{wx},{wy}"] = owner
            if is_p1:
                self.p1_walls_left -= 1
            else:
                self.p2_walls_left -= 1
        
        self.is_p1_turn = not self.is_p1_turn

    def is_game_over(self):
        if self.p1_pos[1] == 8:
            return 1 # P1 wins
        if self.p2_pos[1] == 0:
            return -1 # P2 wins
        return 0 # Still playing

    def evaluate_heuristic(self):
        """Evaluate state from P1 perspective: positive means P1 advantage, negative P2."""
        p1_path = self.get_shortest_path(self.p1_pos, 8, opp_pos=self.p2_pos)
        p2_path = self.get_shortest_path(self.p2_pos, 0, opp_pos=self.p1_pos)
        p1_len = len(p1_path) - 1 if p1_path else 20
        p2_len = len(p2_path) - 1 if p2_path else 20
        
        # Path length difference (positive is good for P1)
        diff = p2_len - p1_len
        # Wall count advantage (positive is good for P1)
        wall_diff = self.p1_walls_left - self.p2_walls_left
        
        # Blend and normalize to [-1.0, 1.0]
        score = diff + 0.1 * wall_diff
        return max(-1.0, min(1.0, score / 10.0))

# --- MCTS ENGINE FOR TRAINING ---

class MCTSNode:
    def __init__(self, game_state, parent=None, action_idx=None, prior=0.0):
        self.game_state = game_state
        self.parent = parent
        self.action_idx = action_idx
        self.prior = prior
        self.children = {}
        self.N = 0 # Visit count
        self.W = 0.0 # Total value
        self.Q = 0.0 # Action value

    def is_leaf(self):
        return len(self.children) == 0

class MCTS:
    def __init__(self, model, c_puct=1.4, dirichlet_alpha=0.3, dirichlet_eps=0.25):
        self.model = model
        self.c_puct = c_puct
        self.dirichlet_alpha = dirichlet_alpha
        self.dirichlet_eps = dirichlet_eps

    def run_search(self, game_state, num_simulations=40, epoch=None):
        root = MCTSNode(game_state.clone())
        
        for _ in range(num_simulations):
            node = root
            # 1. Selection
            while not node.is_leaf():
                best_action = None
                best_score = -float('inf')
                
                # Calculate PUCT score for all children
                for act_idx, child in node.children.items():
                    # child's Q is from the child's perspective (opponent).
                    # So to the parent, the value is -child.Q.
                    q_val = -child.Q
                    u = q_val + self.c_puct * child.prior * (math.sqrt(node.N) / (1 + child.N))
                    if u > best_score:
                        best_score = u
                        best_action = child
                node = best_action

            # Check game over at leaf
            game_over_result = node.game_state.is_game_over()
            if game_over_result != 0:
                # Terminal node, propagate reward directly
                # If game_over_result is 1 (P1 won) and the current perspective is P2's turn, leaf gets -1.
                leaf_value = game_over_result if node.game_state.is_p1_turn else -game_over_result
                self.backpropagate(node, float(leaf_value))
                continue

            # 2. Expansion & Neural Net Evaluation
            # Tensorize board state
            p1_path = node.game_state.get_shortest_path(node.game_state.p1_pos, 8, opp_pos=node.game_state.p2_pos)
            p2_path = node.game_state.get_shortest_path(node.game_state.p2_pos, 0, opp_pos=node.game_state.p1_pos)
            state_tensor = encode_state(
                node.game_state.p1_pos, node.game_state.p2_pos,
                node.game_state.h_walls, node.game_state.v_walls,
                p1_path, p2_path,
                node.game_state.p1_walls_left, node.game_state.p2_walls_left,
                node.game_state.is_p1_turn
            ).unsqueeze(0)

            with torch.no_grad():
                logits, value_tensor = self.model(state_tensor)
                policy = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()
                net_value = value_tensor.item()

            if epoch is not None:
                # alpha ranges from 0.5 (heavy heuristic guidance) to 1.0 (pure network) over 20 epochs
                alpha = min(1.0, 0.5 + 0.5 * (epoch / 20.0))
                h_val = node.game_state.evaluate_heuristic()
                if not node.game_state.is_p1_turn:
                    h_val = -h_val
                value = alpha * net_value + (1.0 - alpha) * h_val
            else:
                value = net_value

            valid_actions = node.game_state.get_valid_actions()
            valid_action_indices = [map_action_to_index_perspective(act, node.game_state.is_p1_turn) for act in valid_actions]

            # Mask invalid actions
            masked_policy = np.zeros_like(policy)
            for idx in valid_action_indices:
                masked_policy[idx] = policy[idx]
            policy_sum = np.sum(masked_policy)
            if policy_sum > 0:
                masked_policy /= policy_sum
            else:
                # Fallback to uniform policy
                for idx in valid_action_indices:
                    masked_policy[idx] = 1.0 / len(valid_action_indices)

            # Expand children nodes
            for action, idx in zip(valid_actions, valid_action_indices):
                next_game = node.game_state.clone()
                next_game.step(action)
                node.children[idx] = MCTSNode(
                    next_game, parent=node, action_idx=idx, prior=masked_policy[idx]
                )

            # Add Dirichlet noise at root for exploration
            if node is root and len(root.children) > 0:
                child_list = list(root.children.values())
                noise = np.random.dirichlet([self.dirichlet_alpha] * len(child_list))
                for child, n in zip(child_list, noise):
                    child.prior = (1 - self.dirichlet_eps) * child.prior + self.dirichlet_eps * n

            # 3. Backpropagation
            self.backpropagate(node, value)

        return root

    def backpropagate(self, node, value):
        while node is not None:
            node.N += 1
            node.W += value
            node.Q = node.W / node.N
            value = -value  # Parent has the opposite perspective
            node = node.parent

# --- TRAINING LOOP PIPELINE ---

TEMP_THRESHOLD = 30

def self_play_game(model, epoch, num_simulations=40, visualize=False):
    game = QuoridorGame()
    mcts = MCTS(model)
    trajectory = [] # items of (tensor, policy_probs, current_player_turn)
    move_count = 0
    state_history = {}
    is_draw = False

    if visualize:
        import os
        os.system('cls' if os.name == 'nt' else 'clear')
        print("Starting Game...")
        game.print_board()

    while game.is_game_over() == 0 and len(trajectory) < 300: # Avoid infinite loop
        # Check for draw by threefold repetition
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

        root = mcts.run_search(game, num_simulations=num_simulations, epoch=epoch)
        
        # Policy probability distribution over NUM_ACTIONS actions
        visit_counts = np.zeros(NUM_ACTIONS, dtype=np.float32)
        for act_idx, child in root.children.items():
            visit_counts[act_idx] = child.N

        # Temperature schedule: proportional sampling early, greedy later
        if move_count < TEMP_THRESHOLD:
            policy_probs = visit_counts / (visit_counts.sum() or 1.0)
        else:
            # τ→0: concentrate all mass on best action
            policy_probs = np.zeros(NUM_ACTIONS, dtype=np.float32)
            best_idx = int(np.argmax(visit_counts))
            policy_probs[best_idx] = 1.0

        if policy_probs.sum() == 0:
            valid_actions = game.get_valid_actions()
            valid_indices = [map_action_to_index_perspective(act, game.is_p1_turn) for act in valid_actions]
            policy_probs[valid_indices] = 1.0 / len(valid_indices)

        # Get board state tensor
        p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
        p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)
        state_tensor = encode_state(
            game.p1_pos, game.p2_pos,
            game.h_walls, game.v_walls,
            p1_path, p2_path,
            game.p1_walls_left, game.p2_walls_left,
            game.is_p1_turn
        )

        # Store visit counts (not temperature-adjusted) as training target per AlphaZero
        train_probs = visit_counts / (visit_counts.sum() or 1.0)
        trajectory.append((state_tensor, train_probs, game.is_p1_turn))

        action_idx = np.random.choice(NUM_ACTIONS, p=policy_probs)

        # Apply move in the game simulator
        valid_actions = game.get_valid_actions()
        action_obj = None
        for act in valid_actions:
            if map_action_to_index_perspective(act, game.is_p1_turn) == action_idx:
                action_obj = act
                break
                
        if action_obj is None:
            action_obj = random.choice(valid_actions)

        # Record active player name before turn transitions
        active_player = "P1" if game.is_p1_turn else "P2"

        game.step(action_obj)
        move_count += 1

        if visualize:
            if action_obj['type'] == 'move':
                last_move_str = f"{active_player} → {action_obj['dir']}"
            else:
                last_move_str = f"{active_player} → wall {action_obj['wallType'].upper()} @ {chr(65 + action_obj['x'])}{action_obj['y'] + 1}"
            write_training_state(game, move_count, 'P1' if game.is_p1_turn else 'P2', 'playing', last_move_str)
            print(f"Move {move_count} | Played: {active_player} -> {action_obj}")

    winner = 0 if is_draw else game.is_game_over()
    
    if visualize:
        if winner == 0:
            result_msg = 'Draw (Repetition or step limit)'
        else:
            result_msg = f"Player {'1' if winner == 1 else '2'} Wins!"
        write_training_state(game, move_count, '-', 'game_over', f'Game Over: {result_msg}')
        print(f"Game Over! Result: {result_msg}")

    # Generate training examples (state, target_policy, target_value)
    training_examples = []
    for state_tensor, policy_probs, is_p1 in trajectory:
        # Value targets: 1 if active player wins, -1 if they lose, 0 for draws
        if winner == 0:
            target_value = 0.0
        else:
            target_value = 1.0 if (winner == 1 and is_p1) or (winner == -1 and not is_p1) else -1.0
        training_examples.append((state_tensor, policy_probs, target_value))

    # Augment with horizontal flip — free data via left-right board symmetry
    training_examples += [
        (flip_horizontal_state(s), flip_horizontal_policy(p), v)
        for s, p, v in training_examples
    ]

    return training_examples, winner

def load_dataset_from_disk(data_dir="data", max_positions=20000):
    if not os.path.exists(data_dir):
        return []
    
    # Find all .pt files recursively
    pt_files = []
    for root_dir, _, files in os.walk(data_dir):
        for f in files:
            if f.endswith('.pt'):
                pt_files.append(os.path.join(root_dir, f))
                
    # Sort files by filename to ensure they are processed chronologically
    pt_files.sort()
    
    dataset = []
    # Load from newest to oldest to satisfy max_positions efficiently
    for filepath in reversed(pt_files):
        try:
            game_data = torch.load(filepath, map_location=torch.device('cpu'), weights_only=False)
            dataset.extend(game_data)
            if len(dataset) >= max_positions:
                dataset = dataset[:max_positions]
                break
        except Exception as e:
            print(f"Warning: Failed to load training data file {filepath}: {e}")
            
    # Reverse dataset to maintain chronological order
    dataset.reverse()
    return dataset

def train_alphazero(epochs=200, games_per_epoch=50, batch_size=64, lr=0.001, num_simulations=400, dataset_size=50000, data_dir="data", checkpoint_path="quoridor_checkpoint.pth", visualize=False, reset_lr=False):
    import os
    model = QuoridorNet(num_residual_blocks=10, channels=128)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    # LR halved every 15 epochs
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=15, gamma=0.5)
    loss_val_fn = nn.MSELoss()

    start_epoch = 0
    
    if os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            model.load_state_dict(checkpoint['model_state_dict'])
            if not reset_lr:
                optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                if 'scheduler_state_dict' in checkpoint:
                    scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
            start_epoch = checkpoint.get('epoch', 0)
            lr_note = ' (LR reset to initial)' if reset_lr else ''
            print(f"Loaded checkpoint from {checkpoint_path}. Resuming from epoch {start_epoch+1}{lr_note}")
        except Exception as e:
            print(f"Failed to load checkpoint ({e}). Starting from scratch.")
            
    # Load dataset from data directory, falling back to checkpoint if folder is empty/missing
    dataset = load_dataset_from_disk(data_dir, dataset_size)
    if not dataset and os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            dataset = checkpoint.get('dataset', [])
            if dataset:
                print(f"Loaded dataset fallback of {len(dataset)} positions from checkpoint.")
        except Exception:
            pass

    print("Starting AlphaZero-style self-play training loop...")
    _METRICS['total_epochs'] = epochs
    _METRICS['total_games'] = games_per_epoch
    for epoch in range(start_epoch, epochs):
        print(f"\n--- Epoch {epoch+1}/{epochs} ---")
        _METRICS['epoch'] = epoch + 1
        model.eval()
        
        # Self-play step
        epoch_examples = []
        for g in range(games_per_epoch):
            _METRICS['game_idx'] = g + 1
            game_data, winner = self_play_game(model, epoch, num_simulations=num_simulations, visualize=visualize)
            epoch_examples.extend(game_data)
            
            # Increment outcome metrics
            if winner == 1:
                _METRICS['p1_wins'] += 1
            elif winner == -1:
                _METRICS['p2_wins'] += 1
            else:
                _METRICS['draws'] += 1
                
            print(f"  Self-play Game {g+1}/{games_per_epoch} finished ({len(game_data)} steps)")
            
            # Save game data to disk for organization
            game_epoch_dir = os.path.join(data_dir, f"epoch_{epoch+1:03d}")
            os.makedirs(game_epoch_dir, exist_ok=True)
            game_file = os.path.join(game_epoch_dir, f"game_{g+1:03d}.pt")
            try:
                torch.save(game_data, game_file)
            except Exception as e:
                print(f"  Warning: Failed to save game data to {game_file}: {e}")
            
        dataset.extend(epoch_examples)
        # Keep dataset capped to recent experiences
        if len(dataset) > dataset_size:
            dataset = dataset[-dataset_size:]
            
        # Training step
        model.train()
        random.shuffle(dataset)
        num_batches = max(1, len(dataset) // batch_size)
        epoch_p_loss = 0.0
        epoch_v_loss = 0.0
        epoch_entropy = 0.0
        
        for b in range(num_batches):
            batch = dataset[b*batch_size : (b+1)*batch_size]
            if not batch:
                continue
            states = torch.stack([x[0] for x in batch])
            target_policies = torch.tensor(np.array([x[1] for x in batch]), dtype=torch.float32)
            target_values = torch.tensor(np.array([x[2] for x in batch]), dtype=torch.float32).unsqueeze(1)
            
            optimizer.zero_grad()
            logits, values = model(states)
            
            # Manual cross-entropy: works correctly with soft MCTS targets on all PyTorch versions
            log_probs = torch.log_softmax(logits, dim=1)
            loss_p = -torch.sum(target_policies * log_probs) / logits.size(0)
            loss_v = loss_val_fn(values, target_values)
            loss = loss_p + loss_v
            
            loss.backward()
            optimizer.step()
            
            epoch_p_loss += loss_p.item()
            epoch_v_loss += loss_v.item()
            
            # Track policy entropy
            with torch.no_grad():
                probs = torch.softmax(logits, dim=-1)
                entropy = -torch.sum(probs * torch.log(probs + 1e-8), dim=-1).mean()
                epoch_entropy += entropy.item()
            
        scheduler.step()
        current_lr = scheduler.get_last_lr()[0]
        
        # Update metrics for browser live panel
        _METRICS['policy_loss'] = epoch_p_loss / max(1, num_batches)
        _METRICS['value_loss'] = epoch_v_loss / max(1, num_batches)
        _METRICS['entropy'] = epoch_entropy / max(1, num_batches)
        _METRICS['lr'] = current_lr
        
        print(f"  Training Summary: Policy Loss = {_METRICS['policy_loss']:.4f}, Value Loss = {_METRICS['value_loss']:.4f}, Policy Entropy = {_METRICS['entropy']:.4f}, LR = {_METRICS['lr']:.6f}")
        
        # Save checkpoint after each epoch to allow pausing and resuming
        try:
            torch.save({
                'epoch': epoch + 1,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'scheduler_state_dict': scheduler.state_dict(),
            }, checkpoint_path)
            print(f"  Checkpoint saved to {checkpoint_path}")
        except Exception as e:
            print(f"  Failed to save checkpoint: {e}")
        
    print("\nTraining completed. Exporting model to ONNX...")
    export_to_onnx(model, "quoridor_model.onnx")
    print("Model successfully saved as quoridor_model.onnx!")
    
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AlphaZero-style training loop for Quoridor.")
    parser.add_argument("--epochs", type=int, default=200, help="Total epochs to train (continues from checkpoint)")
    parser.add_argument("--games_per_epoch", type=int, default=50, help="Number of self-play games per epoch")
    parser.add_argument("--batch_size", type=int, default=64, help="Mini-batch size for model training")
    parser.add_argument("--lr", type=float, default=0.001, help="Initial learning rate")
    parser.add_argument("--simulations", type=int, default=400, help="Number of MCTS simulations per turn")
    parser.add_argument("--dataset_size", type=int, default=50000, help="Max replay buffer size (recent positions kept)")
    parser.add_argument("--data_dir", type=str, default="data", help="Directory to save/load training games")
    parser.add_argument("--checkpoint_path", type=str, default="quoridor_checkpoint.pth", help="Path to checkpoint file")
    parser.add_argument("--visualize", "-v", action="store_true", help="Visualize self-play games in terminal")
    parser.add_argument("--reset_lr", action="store_true", help="Reset LR and scheduler instead of loading from checkpoint")
    args = parser.parse_args()

    train_alphazero(
        epochs=args.epochs,
        games_per_epoch=args.games_per_epoch,
        batch_size=args.batch_size,
        lr=args.lr,
        num_simulations=args.simulations,
        dataset_size=args.dataset_size,
        data_dir=args.data_dir,
        checkpoint_path=args.checkpoint_path,
        visualize=args.visualize,
        reset_lr=args.reset_lr,
    )
