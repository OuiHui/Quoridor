import os
import sys

# Force PyTorch & BLAS math libraries to single-thread per worker to eliminate 100+ thread CPU contention
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import torch
torch.set_num_threads(1)
try:
    torch.set_num_interop_threads(1)
except Exception:
    pass

# Set Windows process priority to IDLE (0x00000040) so background self-play NEVER lags mouse/UI
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00000040)
        ctypes.windll.winmm.timeBeginPeriod(1)
    except Exception:
        pass

import time
import random
import uuid
import numpy as np
import quoridor_cpp
from onnx_inference import ONNXModelEvaluator, RemoteModelEvaluator, create_evaluator
from quoridor_model import flip_horizontal_state, flip_horizontal_policy, map_index_to_action_perspective, map_action_to_index_perspective

# Constants matching train_alphazero.py
TEMP_THRESHOLD = 20
NUM_SIMULATIONS = 800  # Default deep simulations per move
FAST_SIMULATIONS = 200 # Default fast simulations per move (PCR)
GAMES_PER_EPOCH = 50   # Expected games per epoch
DATA_DIR = os.environ.get("QUORIDOR_DATA_DIR", r"C:\quoridor_data")
ONNX_PATH = "quoridor_model.onnx"
CHECKPOINT_PATH = "quoridor_checkpoint.pth"

def python_action_to_cpp(py_action):
    if py_action['type'] == 'move':
        return quoridor_cpp.Action.Move(py_action['dir'], py_action['to'][0], py_action['to'][1])
    else:
        return quoridor_cpp.Action.Wall(py_action['wallType'], py_action['x'], py_action['y'])

def cpp_action_to_python(cpp_action):
    if cpp_action.type == 'move':
        return {'type': 'move', 'dir': cpp_action.move_dir, 'to': (cpp_action.to_x, cpp_action.to_y)}
    else:
        return {'type': 'wall', 'wallType': cpp_action.wall_type, 'x': cpp_action.wall_x, 'y': cpp_action.wall_y}

def count_games_in_dir(epoch_dir):
    """Accurately count completed games in directory regardless of batching format."""
    if not os.path.exists(epoch_dir):
        return 0
    total = 0
    for f in os.listdir(epoch_dir):
        if not f.endswith('.pt'):
            continue
        if f.startswith("games_"):
            try:
                parts = f.split("_")
                total += int(parts[1])
            except (IndexError, ValueError):
                total += 1
        else:
            total += 1
    return total

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
                    if count_games_in_dir(epoch_dir) >= GAMES_PER_EPOCH:
                        epochs.append(epoch_num)
                except ValueError:
                    pass
        if epochs:
            return max(epochs)
    return 0

def run_self_play_batch(evaluator, epoch, batch_size=32, num_simulations=800, fast_simulations=200, use_pcr=True, actor_id=1):
    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.07, dirichlet_eps=0.15)
    
    # Initialize batch vectors
    games = [quoridor_cpp.QuoridorGame() for _ in range(batch_size)]
    trajectories = [[] for _ in range(batch_size)]
    move_counts = [0] * batch_size
    state_histories = [{} for _ in range(batch_size)]
    active_indices = list(range(batch_size))
    
    batch_start_time = time.time()
    games_completed_in_batch = 0
    total_positions_generated = 0
    all_batch_examples = []
    p1_wins = 0
    p2_wins = 0
    draws = 0

    while len(active_indices) > 0:
        active_games = [games[i] for i in active_indices]
        
        # Playout Cap Randomization (PCR) at the batch level
        if use_pcr:
            is_deep_search = random.random() < 0.25
            current_sims = num_simulations if is_deep_search else fast_simulations
        else:
            current_sims = num_simulations

        visit_counts_list, _ = mcts.run_search_batched(
            active_games,
            evaluator.evaluate_batch,
            current_sims
        )
        
        next_active_indices = []
        for local_idx, global_idx in enumerate(active_indices):
            game = games[global_idx]
            
            state_key = (
                game.p1_pos, game.p2_pos,
                frozenset(game.h_walls), frozenset(game.v_walls),
                game.p1_walls_left, game.p2_walls_left,
                game.is_p1_turn
            )
            state_histories[global_idx][state_key] = state_histories[global_idx].get(state_key, 0) + 1
            
            is_draw = (state_histories[global_idx][state_key] >= 3) or (move_counts[global_idx] >= 300)
            winner = game.is_game_over()
            
            if winner != 0 or is_draw:
                final_winner = 0 if is_draw else winner
                if final_winner == 1:
                    p1_wins += 1
                elif final_winner == -1:
                    p2_wins += 1
                else:
                    draws += 1

                training_examples = []
                total_moves = len(trajectories[global_idx])
                for idx, (state_flat, policy_probs, is_p1, valid_mask) in enumerate(trajectories[global_idx]):
                    if final_winner == 0:
                        target_value = 0.0
                    else:
                        is_win = (final_winner == 1 and is_p1) or (final_winner == -1 and not is_p1)
                        base_val = 1.0 if is_win else -1.0
                        moves_from_end = total_moves - 1 - idx
                        target_value = base_val * (0.995 ** moves_from_end)
                    
                    state_tensor = torch.tensor(state_flat, dtype=torch.float32).reshape(11, 9, 9)
                    training_examples.append((state_tensor, policy_probs, target_value, valid_mask))
                
                augmented_examples = training_examples + [
                    (flip_horizontal_state(s), flip_horizontal_policy(p), v, flip_horizontal_policy(m))
                    for (s, p, v, m) in training_examples
                ]
                
                all_batch_examples.extend(augmented_examples)
                games_completed_in_batch += 1
                total_positions_generated += len(augmented_examples)
                continue
                
            visits = np.array(visit_counts_list[local_idx], dtype=np.float32)
            visits_sum = visits.sum()
            policy_probs = visits / (visits_sum if visits_sum > 0 else 1.0)
            
            valid_actions = game.get_valid_actions()
            valid_mask = np.zeros(140, dtype=np.bool_)
            for act in valid_actions:
                py_act = cpp_action_to_python(act)
                idx = map_action_to_index_perspective(py_act, game.is_p1_turn)
                valid_mask[idx] = True
            
            state_flat = quoridor_cpp.MCTS.encode_state_cpp(game)
            trajectories[global_idx].append((state_flat, policy_probs, game.is_p1_turn, valid_mask))
            
            # Dynamic Temperature Decay
            current_move = move_counts[global_idx]
            if current_move < 15:
                tau = 1.0
            elif current_move < 30:
                tau = 0.5
            elif current_move < 45:
                tau = 0.25
            else:
                tau = 0.0
                
            if tau > 0.0:
                # Apply temperature scaling to visit counts
                if tau != 1.0:
                    probs = np.power(policy_probs, 1.0 / tau)
                    prob_sum = probs.sum()
                    if prob_sum > 1e-8:
                        policy_probs = probs / prob_sum
                
                prob_sum = policy_probs.sum()
                if prob_sum > 1e-8:
                    norm_probs = policy_probs / prob_sum
                    action_idx = np.random.choice(140, p=norm_probs)
                else:
                    action_idx = np.argmax(policy_probs)
            else:
                # Exploitation phase: choose action with highest visit count
                action_idx = np.argmax(policy_probs)
                
            py_action = map_index_to_action_perspective(action_idx, game.is_p1_turn, game.p1_pos, game.p2_pos)
            cpp_action = python_action_to_cpp(py_action)
            
            game.step(cpp_action)
            move_counts[global_idx] += 1
            next_active_indices.append(global_idx)
            
        active_indices = next_active_indices

    # Save consolidated batch file to disk
    if all_batch_examples:
        epoch_dir = os.path.join(DATA_DIR, f"epoch_{epoch+1:03d}")
        os.makedirs(epoch_dir, exist_ok=True)
        file_id = f"{uuid.uuid4().hex[:8]}"
        filepath = os.path.join(epoch_dir, f"games_{games_completed_in_batch}_{time.time():.3f}_{file_id}.pt")
        torch.save(all_batch_examples, filepath)

    elapsed = time.time() - batch_start_time
    pos_per_sec = total_positions_generated / max(0.001, elapsed)
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [Actor #{actor_id}] Batch saved ({games_completed_in_batch} games, {total_positions_generated} pos | P1: {p1_wins}, P2: {p2_wins}, Draw: {draws}) in {elapsed:.1f}s ({pos_per_sec:.1f} pos/s)", flush=True)

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Self-play actor process for Quoridor AlphaZero.")
    parser.add_argument("--actor_id", type=int, default=1, help="Unique ID for this actor worker")
    parser.add_argument("--batch_size", type=int, default=32, help="Number of games in self-play batch")
    parser.add_argument("--simulations", type=int, default=NUM_SIMULATIONS, help="MCTS deep simulations per move")
    parser.add_argument("--fast_simulations", type=int, default=FAST_SIMULATIONS, help="MCTS fast simulations per move (PCR)")
    parser.add_argument("--no_pcr", action="store_true", help="Disable Playout Cap Randomization")
    parser.add_argument("--port", type=int, default=5555, help="Port of central GPU inference server")
    parser.add_argument("--standalone", action="store_true", help="Force local ONNX evaluator instead of central server")
    parser.add_argument("--evaluator", type=str, default="auto", choices=["auto", "central", "npu"], help="Evaluator target (central=RTX GPU, npu=Intel Core Ultra NPU)")
    args = parser.parse_args()

    actor_id = args.actor_id
    batch_size = args.batch_size
    num_simulations = args.simulations
    fast_simulations = args.fast_simulations
    use_pcr = not args.no_pcr
    use_central = not args.standalone and args.evaluator != "npu"

    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [Actor #{actor_id}] Started worker process (batch={batch_size}, deep_sim={num_simulations}, fast_sim={fast_simulations}, pcr={use_pcr}, evaluator={args.evaluator})", flush=True)
    
    loaded_model_path = None
    evaluator = None
    
    while True:
        epoch = get_current_epoch()
        expected_model_path = f"quoridor_model_epoch_{epoch+1:03d}.onnx"
        
        if not os.path.exists(expected_model_path):
            expected_model_path = "quoridor_model.onnx"
            
        if not os.path.exists(expected_model_path) and not use_central and args.evaluator != "npu":
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [Actor #{actor_id}] Waiting for initial ONNX model file...", flush=True)
            time.sleep(5)
            continue
            
        if evaluator is None or (not use_central and expected_model_path != loaded_model_path):
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [Actor #{actor_id}] Initializing evaluator (type={args.evaluator}, central={use_central})...", flush=True)
            try:
                evaluator = create_evaluator(expected_model_path, use_central_server=use_central, port=args.port, evaluator_type=args.evaluator)
                loaded_model_path = expected_model_path
            except Exception as e:
                print(f"[{ts}] [Actor #{actor_id}] Evaluator setup failed, retrying... ({e})", flush=True)
                time.sleep(2)
                continue
            
        epoch_dir = os.path.join(DATA_DIR, f"epoch_{epoch+1:03d}")
        num_completed = count_games_in_dir(epoch_dir)
            
        if num_completed >= GAMES_PER_EPOCH:
            time.sleep(5)
            continue
            
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [Actor #{actor_id}] Running self-play batch for Epoch {epoch+1} ({num_completed}/{GAMES_PER_EPOCH} ready)...", flush=True)
        try:
            run_self_play_batch(
                evaluator, 
                epoch, 
                batch_size=batch_size, 
                num_simulations=num_simulations, 
                fast_simulations=fast_simulations, 
                use_pcr=use_pcr, 
                actor_id=actor_id
            )
        except Exception as e:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [Actor #{actor_id}] Self-play batch interrupted ({e}). Re-initializing evaluator and retrying...", flush=True)
            if hasattr(evaluator, 'close'):
                try:
                    evaluator.close()
                except Exception:
                    pass
            evaluator = None
            time.sleep(3)

if __name__ == "__main__":
    main()
