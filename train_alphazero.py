import math
import random
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from collections import deque
from quoridor_model import QuoridorNet, encode_state, map_action_to_index, export_to_onnx, NUM_ACTIONS

# --- LIGHTWEIGHT PYTHON QUORIDOR SIMULATOR ---

class QuoridorGame:
    def __init__(self):
        # P1 starts at (4, 0), goal is y = 8. P2 starts at (4, 8), goal is y = 0.
        self.p1_pos = (4, 0)
        self.p2_pos = (4, 8)
        self.h_walls = set() # set of (wx, wy) in 0..7
        self.v_walls = set() # set of (wx, wy) in 0..7
        self.p1_walls_left = 10
        self.p2_walls_left = 10
        self.is_p1_turn = True

    def clone(self):
        game = QuoridorGame()
        game.p1_pos = self.p1_pos
        game.p2_pos = self.p2_pos
        game.h_walls = set(self.h_walls)
        game.v_walls = set(self.v_walls)
        game.p1_walls_left = self.p1_walls_left
        game.p2_walls_left = self.p2_walls_left
        game.is_p1_turn = self.is_p1_turn
        return game

    def get_shortest_path(self, start, target_y):
        # Simple BFS pathfinding
        queue = deque([[start]])
        visited = {start}
        while queue:
            path = queue.popleft()
            x, y = path[-1]
            if y == target_y:
                return path
            # Orthogonal directions
            for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < 9 and 0 <= ny < 9:
                    if (nx, ny) not in visited:
                        if not self.is_move_blocked(x, y, nx, ny):
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
        
        # 1. Add walls around both players (radius of 2)
        for pos in [self.p1_pos, self.p2_pos]:
            px, py = pos
            for wx in range(max(0, px - 2), min(8, px + 3)):
                for wy in range(max(0, py - 2), min(8, py + 3)):
                    candidates.add((wx, wy, 'h'))
                    candidates.add((wx, wy, 'v'))
                    
        # 2. Add walls that intersect the shortest paths of both players
        p1_path = self.get_shortest_path(self.p1_pos, 8)
        p2_path = self.get_shortest_path(self.p2_pos, 0)
        
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
            if action['wallType'] == 'h':
                self.h_walls.add((wx, wy))
            else:
                self.v_walls.add((wx, wy))
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

    def run_search(self, game_state, num_simulations=40):
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
            p1_path = node.game_state.get_shortest_path(node.game_state.p1_pos, 8)
            p2_path = node.game_state.get_shortest_path(node.game_state.p2_pos, 0)
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
                value = value_tensor.item()

            valid_actions = node.game_state.get_valid_actions()
            valid_action_indices = [map_action_to_index(act) for act in valid_actions]

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

# Temperature schedule: τ=1 for first TEMP_THRESHOLD moves (exploration), then τ→0 (exploitation)
TEMP_THRESHOLD = 30

def self_play_game(model, num_simulations=40):
    game = QuoridorGame()
    mcts = MCTS(model)
    trajectory = [] # items of (tensor, policy_probs, current_player_turn)
    move_count = 0
    state_history = {}
    is_draw = False

    while game.is_game_over() == 0 and len(trajectory) < 150: # Avoid infinite loop
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

        root = mcts.run_search(game, num_simulations=num_simulations)
        
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
            valid_indices = [map_action_to_index(act) for act in valid_actions]
            policy_probs[valid_indices] = 1.0 / len(valid_indices)

        # Get board state tensor
        p1_path = game.get_shortest_path(game.p1_pos, 8)
        p2_path = game.get_shortest_path(game.p2_pos, 0)
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
            if map_action_to_index(act) == action_idx:
                action_obj = act
                break
                
        if action_obj is None:
            action_obj = random.choice(valid_actions)

        game.step(action_obj)
        move_count += 1

    winner = 0 if is_draw else game.is_game_over()
    
    # Generate training examples (state, target_policy, target_value)
    training_examples = []
    for state_tensor, policy_probs, is_p1 in trajectory:
        # Value targets: 1 if active player wins, -1 if they lose, 0 for draws
        if winner == 0:
            target_value = 0.0
        else:
            target_value = 1.0 if (winner == 1 and is_p1) or (winner == -1 and not is_p1) else -1.0
        training_examples.append((state_tensor, policy_probs, target_value))
        
    return training_examples

def train_alphazero(epochs=5, games_per_epoch=4, batch_size=8, lr=0.001):
    import os
    model = QuoridorNet(num_residual_blocks=6, channels=128)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    # LR halved every 15 epochs
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=15, gamma=0.5)
    loss_val_fn = nn.MSELoss()

    checkpoint_path = "quoridor_checkpoint.pth"
    start_epoch = 0
    dataset = []
    
    if os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            model.load_state_dict(checkpoint['model_state_dict'])
            optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
            if 'scheduler_state_dict' in checkpoint:
                scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
            start_epoch = checkpoint.get('epoch', 0)
            dataset = checkpoint.get('dataset', [])
            print(f"Loaded checkpoint from {checkpoint_path}. Resuming from epoch {start_epoch+1}")
        except Exception as e:
            print(f"Failed to load checkpoint ({e}). Starting from scratch.")
            
    print("Starting AlphaZero-style self-play training loop...")
    for epoch in range(start_epoch, epochs):
        print(f"\n--- Epoch {epoch+1}/{epochs} ---")
        model.eval()
        
        # Self-play step
        epoch_examples = []
        for g in range(games_per_epoch):
            game_data = self_play_game(model, num_simulations=20)
            epoch_examples.extend(game_data)
            print(f"  Self-play Game {g+1}/{games_per_epoch} finished ({len(game_data)} steps)")
            
        dataset.extend(epoch_examples)
        # Keep dataset limited to recent experiences
        if len(dataset) > 5000:
            dataset = dataset[-5000:]
            
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
        print(f"  Training Summary: Policy Loss = {epoch_p_loss/num_batches:.4f}, Value Loss = {epoch_v_loss/num_batches:.4f}, Policy Entropy = {epoch_entropy/num_batches:.4f}, LR = {current_lr:.6f}")
        
        # Save checkpoint after each epoch to allow pausing and resuming
        try:
            torch.save({
                'epoch': epoch + 1,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'scheduler_state_dict': scheduler.state_dict(),
                'dataset': dataset
            }, checkpoint_path)
            print(f"  Checkpoint saved to {checkpoint_path}")
        except Exception as e:
            print(f"  Failed to save checkpoint: {e}")
        
    print("\nTraining completed. Exporting model to ONNX...")
    export_to_onnx(model, "quoridor_model.onnx")
    print("Model successfully saved as quoridor_model.onnx!")
    
if __name__ == "__main__":
    # Run a full training session
    train_alphazero(epochs=50, games_per_epoch=20, batch_size=32)
