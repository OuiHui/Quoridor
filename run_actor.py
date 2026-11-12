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
NUM_SIMULATIONS = 800   # Deep search simulations (25% PCR)
FAST_SIMULATIONS = 120  # Fast search simulations (75% PCR)
VALUE_LAMBDA = 0.70     # MCTS eval & terminal outcome mixing
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

# --- Minimax Sparring Bot Helpers ---

def evaluate_board(game, is_p1_turn):
    p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
    p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)

    if not p1_path: return -float('inf')
    if not p2_path: return float('inf')

    p1_dist = len(p1_path) - 1
    p2_dist = len(p2_path) - 1

    if p1_dist == 0: return float('inf')
    if p2_dist == 0: return -float('inf')

    p1_walls = game.p1_walls_left
    p2_walls = game.p2_walls_left

    if p1_walls == 0 and (p1_dist - p2_dist) >= 2: return -500.0
    if p2_walls == 0 and (p2_dist - p1_dist) >= 2: return  500.0

    score = (p2_dist - p1_dist) * 15.0
    if p1_dist <= 3: score += (4 - p1_dist) * 8.0
    if p2_dist <= 3: score -= (4 - p2_dist) * 8.0
    score += (p1_walls - p2_walls) * 3.0
    score += game.p1_pos[1] * 1.0
    score -= (8 - game.p2_pos[1]) * 1.0
    score += 7.5 if is_p1_turn else -7.5
    return score

def get_ordered_actions(game, player_num):
    is_p1 = (player_num == 1)
    my_pos  = game.p1_pos if is_p1 else game.p2_pos
    opp_pos = game.p2_pos if is_p1 else game.p1_pos
    my_goal_y  = 8 if is_p1 else 0
    opp_goal_y = 0 if is_p1 else 8

    my_path  = game.get_shortest_path(my_pos,  my_goal_y,  opp_pos=opp_pos)
    opp_path = game.get_shortest_path(opp_pos, opp_goal_y, opp_pos=my_pos)
    my_path_set  = set(my_path)  if my_path  else set()
    opp_path_set = set(opp_path) if opp_path else set()

    def score_action(act):
        if act.type == 'move':
            dest = (act.to_x, act.to_y)
            y_gain = (dest[1] - my_pos[1]) if is_p1 else (my_pos[1] - dest[1])
            return 100 + (6 if dest in my_path_set else 0) + y_gain * 3
        wx, wy = act.wall_x, act.wall_y
        dist = abs(wx - opp_pos[0]) + abs(wy - opp_pos[1])
        near_path = any(abs(wx - px) <= 1 and abs(wy - py) <= 1 for px, py in opp_path_set)
        return 10 + max(0, 10 - dist) + (20 if near_path else 0)

    actions = game.get_valid_actions()
    actions.sort(key=score_action, reverse=True)
    return actions

def minimax_search(game, depth, alpha, beta, maximizing_player):
    p1_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
    p2_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)

    if not p1_path or len(p1_path) == 1: return float('inf'),  None
    if not p2_path or len(p2_path) == 1: return -float('inf'), None

    if depth == 0:
        return evaluate_board(game, game.is_p1_turn), None

    best_move = None
    if maximizing_player:
        max_score = -float('inf')
        for act in get_ordered_actions(game, 1):
            score, _ = minimax_search(game.clone_and_step(act), depth - 1, alpha, beta, False)
            if score > max_score:
                max_score, best_move = score, act
            alpha = max(alpha, score)
            if beta <= alpha: break
        return max_score, best_move
    else:
        min_score = float('inf')
        for act in get_ordered_actions(game, 2):
            score, _ = minimax_search(game.clone_and_step(act), depth - 1, alpha, beta, True)
            if score < min_score:
                min_score, best_move = score, act
            beta = min(beta, score)
            if beta <= alpha: break
        return min_score, best_move

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

def run_self_play_batch(evaluator, epoch, batch_size=32, num_simulations=1200, fast_simulations=1200, use_pcr=False, actor_id=1):
    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.20, dirichlet_eps=0.25)
    
    # Initialize batch vectors
    games = [quoridor_cpp.QuoridorGame() for _ in range(batch_size)]
    trajectories = [[] for _ in range(batch_size)]
    move_counts = [0] * batch_size
    state_histories = [{} for _ in range(batch_size)]
    active_indices = list(range(batch_size))

    # Mixed-Opponent Self-Play Curriculum:
    # 20% of games played against Minimax bot (depth 2) to test defense against naive rushing and wall traps
    sparring_modes = []
    for _ in range(batch_size):
        if random.random() < 0.20:
            sparring_modes.append(1 if random.random() < 0.50 else 2) # 1: AlphaZero is P1, 2: AlphaZero is P2
        else:
            sparring_modes.append(0) # Pure AlphaZero self-play
    
    batch_start_time = time.time()
    games_completed_in_batch = 0
    total_positions_generated = 0
    all_batch_examples = []
    p1_wins = 0
    p2_wins = 0
    draws = 0

    while len(active_indices) > 0:
        # 1. Process Minimax turns first (no MCTS needed)
        mcts_indices = []
        for global_idx in active_indices:
            game = games[global_idx]
            spar_mode = sparring_modes[global_idx]
            is_minimax_turn = (spar_mode == 1 and not game.is_p1_turn) or (spar_mode == 2 and game.is_p1_turn)
            if is_minimax_turn:
                _, mm_action = minimax_search(game, depth=2, alpha=-float('inf'), beta=float('inf'), maximizing_player=game.is_p1_turn)
                if mm_action is None:
                    valid_acts = game.get_valid_actions()
                    mm_action = valid_acts[0] if valid_acts else None
                if mm_action is not None:
                    game.step(mm_action)
                    move_counts[global_idx] += 1
            else:
                mcts_indices.append(global_idx)

        # 2. Run batched MCTS search for AlphaZero turns
        if mcts_indices:
            active_games = [games[i] for i in mcts_indices]
            
            # Playout Cap Randomization (PCR): 25% at 800 simulations, 75% at 120 simulations
            current_sims = NUM_SIMULATIONS if (random.random() < 0.25) else FAST_SIMULATIONS

            visit_counts_list, root_q_values = mcts.run_search_batched(
                active_games,
                evaluator.evaluate_batch,
                current_sims
            )

            for local_idx, global_idx in enumerate(mcts_indices):
                game = games[global_idx]
                visits = np.array(visit_counts_list[local_idx], dtype=np.float32)
                valid_actions = game.get_valid_actions()
                valid_mask = np.zeros(140, dtype=np.bool_)
                
                # Repetition Penalty: Downweight visits for moves that step into previously seen board states
                adjusted_visits = visits.copy()
                for act in valid_actions:
                    py_act = cpp_action_to_python(act)
                    idx = map_action_to_index_perspective(py_act, game.is_p1_turn)
                    valid_mask[idx] = True
                    
                    next_game = game.clone_and_step(act)
                    next_key = (
                        next_game.p1_pos, next_game.p2_pos,
                        frozenset(next_game.h_walls), frozenset(next_game.v_walls),
                        next_game.p1_walls_left, next_game.p2_walls_left,
                        next_game.is_p1_turn
                    )
                    seen_count = state_histories[global_idx].get(next_key, 0)
                    if seen_count >= 2:
                        adjusted_visits[idx] = 0.0
                    elif seen_count == 1:
                        adjusted_visits[idx] *= 0.1

                visits_sum = adjusted_visits.sum()
                policy_probs = adjusted_visits / (visits_sum if visits_sum > 0 else 1.0)
                
                state_flat = quoridor_cpp.MCTS.encode_state_cpp(game)
                mcts_eval = float(root_q_values[local_idx])
                trajectories[global_idx].append((state_flat, policy_probs, game.is_p1_turn, valid_mask, mcts_eval))
                
                # Temperature schedule: decay across first 20 plies
                current_move = move_counts[global_idx]
                if current_move < 20:
                    tau = max(0.1, 1.0 - (current_move / 20.0))
                else:
                    tau = 0.0
                    
                if tau > 0.0:
                    probs = np.power(policy_probs, 1.0 / tau)
                    prob_sum = probs.sum()
                    if prob_sum > 1e-8:
                        norm_probs = probs / prob_sum
                        action_idx = np.random.choice(140, p=norm_probs)
                    else:
                        action_idx = np.argmax(policy_probs)
                else:
                    action_idx = np.argmax(policy_probs)
                    
                py_action = map_index_to_action_perspective(action_idx, game.is_p1_turn, game.p1_pos, game.p2_pos)
                cpp_action = python_action_to_cpp(py_action)
                
                game.step(cpp_action)
                move_counts[global_idx] += 1
        
        # 3. Check termination and history for all active games
        next_active_indices = []
        for global_idx in active_indices:
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

                # Calculate final end-of-game shortest-path distances
                p1_end_path = game.get_shortest_path(game.p1_pos, 8, opp_pos=game.p2_pos)
                p2_end_path = game.get_shortest_path(game.p2_pos, 0, opp_pos=game.p1_pos)
                final_p1_dist = len(p1_end_path) - 1 if p1_end_path else 20
                final_p2_dist = len(p2_end_path) - 1 if p2_end_path else 20

                training_examples = []
                total_moves = len(trajectories[global_idx])
                for idx, (state_flat, policy_probs, is_p1, valid_mask, mcts_eval) in enumerate(trajectories[global_idx]):
                    if final_winner == 0:
                        z_terminal = -0.2
                    else:
                        is_win = (final_winner == 1 and is_p1) or (final_winner == -1 and not is_p1)
                        base_val = 1.0 if is_win else -1.0
                        moves_from_end = total_moves - 1 - idx
                        z_terminal = base_val * (0.995 ** moves_from_end)
                    
                    # Bootstrapped value target mixing (lambda = 0.70)
                    target_value = VALUE_LAMBDA * z_terminal + (1.0 - VALUE_LAMBDA) * mcts_eval
                    target_value = max(-1.0, min(1.0, float(target_value)))
                    
                    # End-of-game path length prediction targets
                    end_act_dist = min(1.0, (final_p1_dist if is_p1 else final_p2_dist) / 20.0)
                    end_opp_dist = min(1.0, (final_p2_dist if is_p1 else final_p1_dist) / 20.0)
                    target_aux = torch.tensor([end_act_dist, end_opp_dist], dtype=torch.float32)

                    state_tensor = torch.tensor(state_flat, dtype=torch.float32).reshape(11, 9, 9)
                    training_examples.append((state_tensor, policy_probs, target_value, valid_mask, target_aux))
                
                augmented_examples = training_examples + [
                    (flip_horizontal_state(s), flip_horizontal_policy(p), v, flip_horizontal_policy(m), aux)
                    for (s, p, v, m, aux) in training_examples
                ]
                
                all_batch_examples.extend(augmented_examples)
                games_completed_in_batch += 1
                total_positions_generated += len(augmented_examples)
                continue
                
            next_active_indices.append(global_idx)
            
        active_indices = next_active_indices

    # Save consolidated batch file to disk atomically
    if all_batch_examples:
        epoch_dir = os.path.join(DATA_DIR, f"epoch_{epoch+1:03d}")
        os.makedirs(epoch_dir, exist_ok=True)
        file_id = f"{uuid.uuid4().hex[:8]}"
        filepath = os.path.join(epoch_dir, f"games_{games_completed_in_batch}_{time.time():.3f}_{file_id}.pt")
        tmp_filepath = f"{filepath}.tmp"
        torch.save(all_batch_examples, tmp_filepath)
        os.replace(tmp_filepath, filepath)

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
