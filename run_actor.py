import os
import time
import random
import uuid
import torch
import numpy as np
import quoridor_cpp
from onnx_inference import ONNXModelEvaluator
from quoridor_model import flip_horizontal_state, flip_horizontal_policy, map_index_to_action_perspective

# Constants matching train_alphazero.py
TEMP_THRESHOLD = 30
NUM_SIMULATIONS = 100  # Default simulations per move
GAMES_PER_EPOCH = 50   # Expected games per epoch
DATA_DIR = "data"
ONNX_PATH = "quoridor_model.onnx"
CHECKPOINT_PATH = "quoridor_checkpoint.pth"

def python_action_to_cpp(py_action):
    if py_action['type'] == 'move':
        return quoridor_cpp.Action.Move(py_action['dir'], py_action['to'][0], py_action['to'][1])
    else:
        return quoridor_cpp.Action.Wall(py_action['wallType'], py_action['x'], py_action['y'])

def get_current_epoch():
    """
    Finds the active training epoch. We read the checkpoint file first;
    if unavailable, we scan the data directory.
    """
    if os.path.exists(CHECKPOINT_PATH):
        try:
            checkpoint = torch.load(CHECKPOINT_PATH, map_location='cpu', weights_only=False)
            return checkpoint.get('epoch', 0)
        except Exception:
            pass
            
    # Fallback to scanning data/epoch_XXX directories
    if os.path.exists(DATA_DIR):
        epochs = []
        for d in os.listdir(DATA_DIR):
            if d.startswith("epoch_"):
                try:
                    epoch_num = int(d.split("_")[1])
                    epoch_dir = os.path.join(DATA_DIR, d)
                    num_completed = len([f for f in os.listdir(epoch_dir) if f.endswith(".pt")])
                    if num_completed >= GAMES_PER_EPOCH:
                        epochs.append(epoch_num)
                except ValueError:
                    pass
        if epochs:
            return max(epochs)
    return 0

def run_self_play_batch(evaluator, epoch, batch_size=16, num_simulations=100):
    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.3, dirichlet_eps=0.25)
    
    # Initialize batch vectors
    games = [quoridor_cpp.QuoridorGame() for _ in range(batch_size)]
    trajectories = [[] for _ in range(batch_size)] # each holds: (state_flat_list, policy_probs, is_p1_turn)
    move_counts = [0] * batch_size
    state_histories = [{} for _ in range(batch_size)]
    active_indices = list(range(batch_size))
    
    while len(active_indices) > 0:
        # 1. Gather active games
        active_games = [games[i] for i in active_indices]
        
        # 2. Run MCTS search in lock-step using the ONNX model evaluator as callback
        # C++ will invoke this callback with a flat float array of shape [M, 11, 9, 9]
        visit_counts_list, _ = mcts.run_search_batched(
            active_games,
            evaluator.evaluate_batch,
            num_simulations
        )
        
        next_active_indices = []
        for local_idx, global_idx in enumerate(active_indices):
            game = games[global_idx]
            
            # Repetition tracking
            state_key = (
                game.p1_pos, game.p2_pos,
                frozenset(game.h_walls), frozenset(game.v_walls),
                game.p1_walls_left, game.p2_walls_left,
                game.is_p1_turn
            )
            state_histories[global_idx][state_key] = state_histories[global_idx].get(state_key, 0) + 1
            
            # Check draw by repetition or max moves (300)
            is_draw = (state_histories[global_idx][state_key] >= 3) or (move_counts[global_idx] >= 300)
            winner = game.is_game_over()
            
            if winner != 0 or is_draw:
                # Resolve trajectory to training examples
                final_winner = 0 if is_draw else winner
                
                training_examples = []
                for state_flat, policy_probs, is_p1 in trajectories[global_idx]:
                    if final_winner == 0:
                        target_value = 0.0
                    else:
                        target_value = 1.0 if (final_winner == 1 and is_p1) or (final_winner == -1 and not is_p1) else -1.0
                    
                    state_tensor = torch.tensor(state_flat, dtype=torch.float32).reshape(11, 9, 9)
                    training_examples.append((state_tensor, policy_probs, target_value))
                
                # Augment with left-right board symmetry
                augmented_examples = training_examples + [
                    (flip_horizontal_state(s), flip_horizontal_policy(p), v)
                    for s, p, v in training_examples
                ]
                
                # Save results to disk
                epoch_dir = os.path.join(DATA_DIR, f"epoch_{epoch+1:03d}")
                os.makedirs(epoch_dir, exist_ok=True)
                
                file_id = f"{uuid.uuid4().hex[:8]}"
                filepath = os.path.join(epoch_dir, f"game_{time.time():.3f}_{file_id}.pt")
                torch.save(augmented_examples, filepath)
                print(f"Saved game to {filepath} ({len(augmented_examples)} positions including flips)")
                
                continue  # Game complete, remove from active pool
                
            # Process search policy
            visits = np.array(visit_counts_list[local_idx], dtype=np.float32)
            visits_sum = visits.sum()
            policy_probs = visits / (visits_sum if visits_sum > 0 else 1.0)
            
            # Store position encoding
            state_flat = quoridor_cpp.MCTS.encode_state_cpp(game)
            trajectories[global_idx].append((state_flat, policy_probs, game.is_p1_turn))
            
            # Select action
            if move_counts[global_idx] < TEMP_THRESHOLD:
                # Proportional sampling for exploration
                action_idx = np.random.choice(140, p=policy_probs)
            else:
                # Greedy choice
                action_idx = np.argmax(policy_probs)
                
            # Step the game
            py_action = map_index_to_action_perspective(action_idx, game.is_p1_turn, game.p1_pos, game.p2_pos)
            cpp_action = python_action_to_cpp(py_action)
            
            game.step(cpp_action)
            move_counts[global_idx] += 1
            next_active_indices.append(global_idx)
            
        active_indices = next_active_indices

def main():
    print("=" * 60)
    print("           HIGH-PERFORMANCE QUORIDOR SELF-PLAY ACTOR")
    print("=" * 60)
    
    loaded_model_path = None
    evaluator = None
    
    # Infinite generation loop
    while True:
        epoch = get_current_epoch()
        expected_model_path = f"quoridor_model_epoch_{epoch+1:03d}.onnx"
        
        # If the expected model for the current epoch doesn't exist yet, try the previous epoch's model
        if not os.path.exists(expected_model_path):
            expected_model_path = f"quoridor_model_epoch_{epoch:03d}.onnx"
            
        # Fallback to default name if still not found
        if not os.path.exists(expected_model_path):
            expected_model_path = "quoridor_model.onnx"
            
        # Wait until a model file is available
        if not os.path.exists(expected_model_path):
            print(f"Waiting for a starting ONNX model file to be exported by the learner...")
            time.sleep(5)
            continue
            
        # Load or reload model weights dynamically
        if expected_model_path != loaded_model_path:
            print(f"Loading ONNX model evaluator from {expected_model_path}...")
            try:
                evaluator = ONNXModelEvaluator(expected_model_path)
                loaded_model_path = expected_model_path
            except Exception as e:
                # Handle cases where the learner is in the middle of writing the file
                print(f"ONNX model file is currently locked/writing, retrying in 2s... ({e})")
                time.sleep(2)
                continue
            
        epoch_dir = os.path.join(DATA_DIR, f"epoch_{epoch+1:03d}")
        
        # Count files in the current epoch folder
        num_completed = 0
        if os.path.exists(epoch_dir):
            num_completed = len([f for f in os.listdir(epoch_dir) if f.endswith(".pt")])
            
        if num_completed >= GAMES_PER_EPOCH:
            print(f"Epoch {epoch+1} is fully generated ({num_completed}/{GAMES_PER_EPOCH} games). Waiting for learner...")
            time.sleep(5)
            continue
            
        print(f"\nGenerating batch of games for Epoch {epoch+1} ({num_completed}/{GAMES_PER_EPOCH} completed)...")
        # Run a batch of games in parallel
        run_self_play_batch(evaluator, epoch, batch_size=16, num_simulations=NUM_SIMULATIONS)

if __name__ == "__main__":
    main()
