import os
# Disable PyTorch Dynamo and Python JIT to prevent interpreter crash on experimental Python 3.14
os.environ["TORCHDYNAMO_DISABLE"] = "1"
os.environ["PYTHON_JIT"] = "0"

# Limit intra-op math threads per process to prevent mouse lag & CPU thread contention
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

import sys
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.winmm.timeBeginPeriod(1)
    except Exception:
        pass

import json
import math
import random
import time
import numpy as np
import torch.nn as nn
import torch.optim as optim

from quoridor_model import QuoridorNet, export_to_onnx, NUM_ACTIONS


def select_device(device_name="auto"):
    device_name = device_name.lower()
    if device_name == "cpu":
        return torch.device("cpu")
    
    # Try CUDA
    if device_name in ("auto", "gpu", "cuda") and torch.cuda.is_available():
        return torch.device("cuda")
    
    # Try XPU (Intel GPU)
    if device_name in ("auto", "gpu", "xpu") and hasattr(torch, "xpu") and torch.xpu.is_available():
        return torch.device("xpu")
        
    # Try DirectML (AMD/Intel on Windows)
    if device_name in ("auto", "gpu", "directml"):
        try:
            import torch_directml
            if torch_directml.is_available():
                return torch_directml.device()
        except ImportError:
            pass
            
    # Fallback to CPU if GPU requested but none found, or if auto
    if device_name in ("gpu", "cuda", "xpu", "directml"):
        print(f"Warning: Requested device '{device_name}' is not available. Falling back to CPU.")
    return torch.device("cpu")


DEVICE = select_device("auto")

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
    'lr': 0.001,
    'avg_mcts_eval': 0.0,
    'avg_abs_mcts_eval': 0.0
}


def write_training_state(game=None, move_count=0, active_player='-', status='epoch_complete', last_move=''):
    """Serialize current game state for the browser overlay to poll."""
    payload = {
        'status': status,
        'p1_pos': list(game.p1_pos) if game and hasattr(game, 'p1_pos') else [4, 0],
        'p2_pos': list(game.p2_pos) if game and hasattr(game, 'p2_pos') else [4, 8],
        'h_walls': [list(w) for w in game.h_walls] if game and hasattr(game, 'h_walls') else [],
        'v_walls': [list(w) for w in game.v_walls] if game and hasattr(game, 'v_walls') else [],
        'h_wall_owners': getattr(game, 'h_wall_owners', {}) if game else {},
        'v_wall_owners': getattr(game, 'v_wall_owners', {}) if game else {},
        'p1_walls': getattr(game, 'p1_walls_left', 10) if game else 10,
        'p2_walls': getattr(game, 'p2_walls_left', 10) if game else 10,
        'move_count': move_count,
        'current_player': active_player,
        'last_move': last_move,
        'timestamp': time.time(),
        'metrics': _METRICS,
    }
    os.makedirs(os.path.dirname(_STATE_FILE), exist_ok=True)
    with open(_STATE_FILE, 'w') as f:
        json.dump(payload, f)


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

class ReplayDatasetCache:
    """Incremental dataset loader maintaining an in-memory buffer across epochs."""
    def __init__(self, data_dir="data", max_positions=50000):
        self.data_dir = data_dir
        self.max_positions = max_positions
        self.loaded_files = set()
        self.dataset = []

    def update(self, exclude_epoch_or_later=None):
        if not os.path.exists(self.data_dir):
            return self.dataset

        pt_files = []
        for root_dir, _, files in os.walk(self.data_dir):
            folder_name = os.path.basename(root_dir)
            if folder_name.startswith("epoch_"):
                try:
                    epoch_num = int(folder_name.split("_")[1])
                    if exclude_epoch_or_later is not None and epoch_num >= exclude_epoch_or_later:
                        continue
                except (ValueError, IndexError):
                    pass
            for f in files:
                if f.endswith('.pt'):
                    full_path = os.path.join(root_dir, f)
                    if full_path not in self.loaded_files:
                        pt_files.append(full_path)

        pt_files.sort()
        new_count = len(pt_files)
        for filepath in pt_files:
            try:
                game_data = torch.load(filepath, map_location=torch.device('cpu'), weights_only=False)
                self.dataset.extend(game_data)
                self.loaded_files.add(filepath)
            except Exception as e:
                print(f"Warning: Failed to load dataset file {filepath}: {e}")

        if len(self.dataset) > self.max_positions:
            self.dataset = self.dataset[-self.max_positions:]

        if new_count > 0:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [Learner] Dataset cache loaded {new_count} new file(s). Buffer total: {len(self.dataset)} positions", flush=True)

        return self.dataset

class QuoridorDataset(torch.utils.data.Dataset):
    """Custom Dataset for fast memory-pinned batching in PyTorch DataLoader."""
    def __init__(self, raw_data):
        self.raw_data = raw_data

    def __len__(self):
        return len(self.raw_data)

    def __getitem__(self, idx):
        item = self.raw_data[idx]
        state = item[0] if isinstance(item[0], torch.Tensor) else torch.from_numpy(np.ascontiguousarray(item[0])).float()
        policy = item[1] if isinstance(item[1], torch.Tensor) else torch.from_numpy(np.ascontiguousarray(item[1])).float()
        value = torch.tensor([item[2]], dtype=torch.float32)
        mask = item[3] if isinstance(item[3], torch.Tensor) else torch.from_numpy(np.ascontiguousarray(item[3]))
        return state, policy, value, mask

def load_dataset_from_disk(data_dir="data", max_positions=50000, exclude_epoch_or_later=None):
    cache = ReplayDatasetCache(data_dir, max_positions)
    return cache.update(exclude_epoch_or_later)


def train_alphazero(epochs=200, games_per_epoch=50, batch_size=256, lr=0.00015, num_simulations=800, dataset_size=100000, data_dir="data", checkpoint_path="quoridor_checkpoint.pth", visualize=False, reset_lr=False, device="auto", num_workers=0):
    global DEVICE
    DEVICE = select_device(device)
    print(f"Training device: {DEVICE}")
    if DEVICE.type == 'cuda':
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    
    model_gpu = QuoridorNet(num_residual_blocks=20, channels=192).to(DEVICE)
    optimizer = optim.Adam(model_gpu.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=50, gamma=0.8)
    loss_val_fn = nn.MSELoss()

    start_epoch = 0
    
    if os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            ckpt_state = checkpoint['model_state_dict']
            
            # Check for shape mismatches before loading
            model_state = model_gpu.state_dict()
            shape_mismatch = False
            for k, v in ckpt_state.items():
                if k in model_state and model_state[k].shape != v.shape:
                    shape_mismatch = True
                    break

            if shape_mismatch:
                print(f"[Info] Detected model capacity upgrade (e.g. 128->192 channels / 15->20 blocks). Initializing fresh 20-block model weights while retaining all replay buffer positions.")
                start_epoch = 0
            else:
                missing, unexpected = model_gpu.load_state_dict(ckpt_state, strict=False)
                arch_changed = len(missing) > 0 or len(unexpected) > 0

                if arch_changed:
                    print(f"Detected architecture change ({len(missing)} missing keys). Resetting optimizer/LR to {lr}.")
                    reset_lr = True

                if not reset_lr and 'optimizer_state_dict' in checkpoint:
                    try:
                        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                        if 'scheduler_state_dict' in checkpoint:
                            scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
                        scheduler.step_size = 50
                        scheduler.gamma = 0.8
                        scheduler.base_lrs = [lr]
                        decay_count = checkpoint.get('epoch', 0) // 50
                        current_scheduled_lr = lr * (0.8 ** decay_count)
                        for param_group in optimizer.param_groups:
                            param_group['lr'] = current_scheduled_lr
                        print(f"Adjusted learning rate to {current_scheduled_lr:.6f} based on schedule.")
                    except Exception as opt_err:
                        print(f"Re-initializing optimizer for updated architecture ({opt_err}). LR = {lr}.")
                        for param_group in optimizer.param_groups:
                            param_group['lr'] = lr
                else:
                    for param_group in optimizer.param_groups:
                        param_group['lr'] = lr
                    print(f"Learning rate set to fresh baseline: {lr}")

                start_epoch = checkpoint.get('epoch', 0)
                lr_note = ' (LR reset to initial)' if reset_lr else ''
                print(f"Loaded existing network weights from {checkpoint_path}. Resuming from epoch {start_epoch+1}{lr_note}")
        except Exception as e:
            print(f"Initializing new model architecture weights from scratch ({e}).")
            
    # Initialize incremental replay buffer cache
    replay_cache = ReplayDatasetCache(data_dir, dataset_size)
    dataset = replay_cache.update(exclude_epoch_or_later=start_epoch + 1)
    if not dataset and os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            fallback = checkpoint.get('dataset', [])
            if fallback:
                replay_cache.dataset = fallback[-dataset_size:]
                dataset = replay_cache.dataset
                print(f"Loaded dataset fallback of {len(dataset)} positions from checkpoint.")
        except Exception:
            pass

    print("Starting AlphaZero-style learner training loop...")
    _METRICS['total_epochs'] = epochs
    _METRICS['total_games'] = games_per_epoch

    for epoch in range(start_epoch, epochs):
        print(f"\n--- Epoch {epoch+1}/{epochs} ---")
        _METRICS['epoch'] = epoch + 1
        
        # 1. Poll for self-play games generated by background actors
        game_epoch_dir = os.path.join(data_dir, f"epoch_{epoch+1:03d}")
        last_log_count = -1
        while True:
            os.makedirs(game_epoch_dir, exist_ok=True)
            cur_count = count_games_in_dir(game_epoch_dir)
            if cur_count >= games_per_epoch:
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] [Learner] Self-play games ready ({cur_count}/{games_per_epoch}). Starting GPU training...", flush=True)
                break
            if cur_count != last_log_count:
                ts = time.strftime("%H:%M:%S")
                pct = int(cur_count * 100 / max(1, games_per_epoch))
                print(f"[{ts}] [Learner] Self-play progress: {cur_count}/{games_per_epoch} games ({pct}%)", flush=True)
                last_log_count = cur_count
            time.sleep(4)
            
        # 2. Update replay cache with newly completed dataset
        dataset = replay_cache.update(exclude_epoch_or_later=epoch + 2)
        if not dataset:
            continue

        epoch_start_time = time.time()

        # 3. Fast Vectorized Training Pass with DataLoader & AMP
        model_gpu.train()

        replay_dataset = QuoridorDataset(dataset)
        num_samples = len(replay_dataset)
        use_pin_memory = (DEVICE.type == 'cuda')
        
        num_loader_workers = num_workers
        dataloader = torch.utils.data.DataLoader(
            replay_dataset,
            batch_size=batch_size,
            shuffle=True,
            num_workers=num_loader_workers,
            pin_memory=use_pin_memory,
            persistent_workers=(num_loader_workers > 0),
            drop_last=False
        )
        
        num_batches = len(dataloader)
        use_amp = (DEVICE.type in ('cuda', 'xpu'))
        scaler = torch.amp.GradScaler(DEVICE.type, enabled=use_amp)

        epoch_p_loss = 0.0
        epoch_v_loss = 0.0
        epoch_entropy = 0.0
        epoch_mcts_eval = 0.0
        epoch_abs_mcts_eval = 0.0

        for states, target_policies, target_values, valid_masks in dataloader:
            states = states.to(DEVICE, non_blocking=True)
            target_policies = target_policies.to(DEVICE, non_blocking=True)
            target_values = target_values.to(DEVICE, non_blocking=True)
            valid_masks = valid_masks.to(DEVICE, non_blocking=True)
            
            target_aux = states[:, [4, 5], 0, 0]
            
            optimizer.zero_grad()
            with torch.amp.autocast(DEVICE.type, enabled=use_amp):
                logits, values, aux_preds = model_gpu(states, return_aux=True)
                logits = logits.masked_fill(~valid_masks, -1e4)
                log_probs = torch.log_softmax(logits, dim=1)
                loss_p = -torch.sum(target_policies * log_probs) / logits.size(0)
                loss_v = loss_val_fn(values, target_values)
                loss_aux = loss_val_fn(aux_preds, target_aux)
                loss = loss_p + loss_v + 0.5 * loss_aux
            
            if use_amp:
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model_gpu.parameters(), max_norm=1.0)
                scaler.step(optimizer)
                scaler.update()
            else:
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model_gpu.parameters(), max_norm=1.0)
                optimizer.step()
            
            epoch_p_loss += loss_p.item()
            epoch_v_loss += loss_v.item()
            epoch_mcts_eval += target_values.mean().item()
            epoch_abs_mcts_eval += torch.abs(target_values).mean().item()
            
            with torch.no_grad():
                probs = torch.softmax(logits.float(), dim=-1) * valid_masks.float()
                log_p = torch.log(torch.clamp(probs, min=1e-8))
                entropy = -torch.sum(probs * log_p, dim=-1).mean()
                if not torch.isnan(entropy):
                    epoch_entropy += entropy.item()

        scheduler.step()
        current_lr = scheduler.get_last_lr()[0]
        
        elapsed = time.time() - epoch_start_time
        pos_per_sec = num_samples / max(0.001, elapsed)

        _METRICS['policy_loss'] = epoch_p_loss / max(1, num_batches)
        _METRICS['value_loss'] = epoch_v_loss / max(1, num_batches)
        _METRICS['entropy'] = epoch_entropy / max(1, num_batches)
        _METRICS['lr'] = current_lr
        _METRICS['avg_mcts_eval'] = epoch_mcts_eval / max(1, num_batches)
        _METRICS['avg_abs_mcts_eval'] = epoch_abs_mcts_eval / max(1, num_batches)
        
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [Learner] Epoch {epoch+1} Complete ({elapsed:.1f}s, {pos_per_sec:.0f} pos/s) | Policy Loss: {_METRICS['policy_loss']:.4f} | Value Loss: {_METRICS['value_loss']:.4f} | Policy Entropy: {_METRICS['entropy']:.4f} | LR: {current_lr:.6f}", flush=True)
        
        try:
            write_training_state(None, 0, '-', 'epoch_complete', f'Epoch {epoch+1} finished')
        except Exception:
            pass
        
        # Save checkpoint after each epoch
        try:
            torch.save({
                'epoch': epoch + 1,
                'model_state_dict': model_gpu.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'scheduler_state_dict': scheduler.state_dict(),
            }, checkpoint_path)
            print(f"  Checkpoint saved to {checkpoint_path}")
        except Exception as e:
            print(f"  Failed to save checkpoint: {e}")
            
        # Re-export model to ONNX so the background actor processes hot-reload updated weights
        onnx_filename = f"quoridor_model_epoch_{epoch+1:03d}.onnx"
        try:
            export_to_onnx(model_gpu, onnx_filename)
            print(f"  Successfully exported weights to {onnx_filename}.")
            
            import shutil
            try:
                shutil.copy(onnx_filename, "quoridor_model.onnx")
                if os.path.exists(f"{onnx_filename}.data"):
                    shutil.copy(f"{onnx_filename}.data", "quoridor_model.onnx.data")
                print("  Successfully synchronized quoridor_model.onnx.")
            except Exception:
                pass
                
            # Clean up older epoch files to keep disk clean (keep last 2 epochs)
            if epoch >= 2:
                old_onnx = f"quoridor_model_epoch_{epoch-1:03d}.onnx"
                old_data = f"quoridor_model_epoch_{epoch-1:03d}.onnx.data"
                try:
                    if os.path.exists(old_onnx): os.remove(old_onnx)
                    if os.path.exists(old_data): os.remove(old_data)
                except Exception:
                    pass
        except Exception as e:
            print(f"  Failed to update ONNX model: {e}")
        
    print("\nTraining completed!")


if __name__ == "__main__":
    import argparse
    import subprocess
    import sys

    parser = argparse.ArgumentParser(description="AlphaZero-style training loop for Quoridor.")
    parser.add_argument("--epochs", type=int, default=200, help="Total epochs to train (continues from checkpoint)")
    parser.add_argument("--games_per_epoch", type=int, default=50, help="Number of self-play games per epoch")
    parser.add_argument("--batch_size", type=int, default=512, help="Mini-batch size for model training (default: 512)")
    parser.add_argument("--lr", type=float, default=0.00015, help="Initial learning rate (default: 0.00015)")
    parser.add_argument("--simulations", type=int, default=800, help="Number of MCTS simulations per turn (default: 800)")
    parser.add_argument("--dataset_size", type=int, default=100000, help="Max replay buffer size (recent positions kept, default: 100000)")
    parser.add_argument("--data_dir", type=str, default=r"C:\quoridor_data", help="Directory to save/load training games")
    parser.add_argument("--checkpoint_path", type=str, default="quoridor_checkpoint.pth", help="Path to checkpoint file")
    parser.add_argument("--visualize", "-v", action="store_true", help="Visualize self-play games in terminal")
    parser.add_argument("--reset_lr", action="store_true", help="Reset LR and scheduler instead of loading from checkpoint")
    parser.add_argument("--num_actors", type=int, default=16, help="Number of parallel self-play actor processes (default: 16)")
    parser.add_argument("--npu_actors", type=int, default=0, help="Number of self-play actors offloaded to Intel NPU via OpenVINO (default: 0)")
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "gpu", "cuda", "xpu", "directml"], help="Execution device (default: auto)")
    parser.add_argument("--num_workers", type=int, default=0, help="Number of PyTorch DataLoader worker subprocesses (default: 0 to prevent Windows process crashes)")
    args = parser.parse_args()

    # 1. Export starting model weights to ONNX for self-play workers
    print("Exporting 20-block / 192-channel model weights to ONNX for self-play actors...")
    starting_model = QuoridorNet(num_residual_blocks=20, channels=192)
    if os.path.exists(args.checkpoint_path):
        try:
            ckpt = torch.load(args.checkpoint_path, map_location='cpu', weights_only=False)
            starting_model.load_state_dict(ckpt['model_state_dict'])
            print("Loaded existing checkpoint weights for ONNX export.")
        except Exception:
            pass
    export_to_onnx(starting_model, "quoridor_model.onnx")

    # 2. Spawn Centralized GPU Server & hybrid GPU/NPU self-play Actors
    num_actors = max(1, args.num_actors)
    npu_count = min(args.npu_actors, num_actors)
    gpu_count = num_actors - npu_count

    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [Learner] Spawning Centralized GPU Inference Server...", flush=True)
    server_process = subprocess.Popen([sys.executable, 'gpu_inference_server.py'])
    time.sleep(2)  # Allow GPU server to initialize CUDA context

    print(f"[{ts}] [Learner] Spawning {num_actors} hybrid Actors ({gpu_count} on RTX GPU, {npu_count} on Intel NPU)...", flush=True)
    actor_processes = []
    
    # Spawn GPU actors
    for i in range(gpu_count):
        p = subprocess.Popen([
            sys.executable, 'run_actor.py',
            '--actor_id', str(i + 1),
            '--simulations', str(args.simulations),
            '--fast_simulations', str(args.simulations),
            '--batch_size', '32',
            '--evaluator', 'central'
        ])
        actor_processes.append(p)
        
    # Spawn Intel NPU actors
    for i in range(npu_count):
        actor_num = gpu_count + i + 1
        p = subprocess.Popen([
            sys.executable, 'run_actor.py',
            '--actor_id', str(actor_num),
            '--simulations', str(args.simulations),
            '--fast_simulations', str(args.simulations),
            '--batch_size', '32',
            '--evaluator', 'npu'
        ])
        actor_processes.append(p)

    # 3. Execute the learner loop
    try:
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
            device=args.device,
            num_workers=args.num_workers,
        )
    finally:
        print(f"Stopping {len(actor_processes)} background self-play Actor processes and GPU server...")
        for p in actor_processes:
            p.terminate()
        server_process.terminate()
        for p in actor_processes:
            p.wait()
        server_process.wait()
