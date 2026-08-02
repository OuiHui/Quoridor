import os
# Disable PyTorch Dynamo and Python JIT to prevent interpreter crash on experimental Python 3.14
os.environ["TORCHDYNAMO_DISABLE"] = "1"
os.environ["PYTHON_JIT"] = "0"

import json
import math
import random
import time
import numpy as np
import torch
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


def load_dataset_from_disk(data_dir="data", max_positions=50000, exclude_epoch_or_later=None):
    if not os.path.exists(data_dir):
        return []
    
    # Find all .pt files recursively
    pt_files = []
    for root_dir, _, files in os.walk(data_dir):
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


def train_alphazero(epochs=200, games_per_epoch=50, batch_size=64, lr=0.0003, num_simulations=400, dataset_size=50000, data_dir="data", checkpoint_path="quoridor_checkpoint.pth", visualize=False, reset_lr=False, device="auto"):
    global DEVICE
    DEVICE = select_device(device)
    print(f"Training device: {DEVICE}")
    
    model_gpu = QuoridorNet(num_residual_blocks=10, channels=128).to(DEVICE)
    optimizer = optim.Adam(model_gpu.parameters(), lr=lr, weight_decay=1e-4)
    # LR decayed every 50 epochs with a gentler decay rate of 0.8
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=50, gamma=0.8)
    loss_val_fn = nn.MSELoss()

    start_epoch = 0
    
    if os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            model_gpu.load_state_dict(checkpoint['model_state_dict'])
            if not reset_lr:
                optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                if 'scheduler_state_dict' in checkpoint:
                    scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
                
                # Override scheduler configuration with current settings
                scheduler.step_size = 50
                scheduler.gamma = 0.8
                scheduler.base_lrs = [lr]
                decay_count = checkpoint.get('epoch', 0) // 50
                current_scheduled_lr = lr * (0.8 ** decay_count)
                for param_group in optimizer.param_groups:
                    param_group['lr'] = current_scheduled_lr
                print(f"Adjusted learning rate to {current_scheduled_lr:.6f} based on new schedule (decayed {decay_count} times).")
            start_epoch = checkpoint.get('epoch', 0)
            lr_note = ' (LR reset to initial)' if reset_lr else ''
            print(f"Loaded checkpoint from {checkpoint_path}. Resuming from epoch {start_epoch+1}{lr_note}")
        except Exception as e:
            print(f"Failed to load checkpoint ({e}). Starting from scratch.")
            
    # Load dataset from data directory
    dataset = load_dataset_from_disk(data_dir, dataset_size, exclude_epoch_or_later=start_epoch + 1)
    if not dataset and os.path.exists(checkpoint_path):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'), weights_only=False)
            dataset = checkpoint.get('dataset', [])
            if dataset:
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
            files = [f for f in os.listdir(game_epoch_dir) if f.endswith('.pt')]
            cur_count = len(files)
            if cur_count >= games_per_epoch:
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] [Learner] Self-play games ready ({cur_count}/{games_per_epoch}). Starting GPU neural net training...", flush=True)
                break
            if cur_count != last_log_count:
                ts = time.strftime("%H:%M:%S")
                pct = int(cur_count * 100 / max(1, games_per_epoch))
                print(f"[{ts}] [Learner] Self-play game generation progress: {cur_count}/{games_per_epoch} games ({pct}%)", flush=True)
                last_log_count = cur_count
            time.sleep(4)
            
        # Load the newly completed dataset
        dataset = load_dataset_from_disk(data_dir, dataset_size, exclude_epoch_or_later=epoch + 2)

        # 2. Training step (using model_gpu for high throughput backpropagation)
        model_gpu.train()
        random.shuffle(dataset)
        num_batches = max(1, len(dataset) // batch_size)
        epoch_p_loss = 0.0
        epoch_v_loss = 0.0
        epoch_entropy = 0.0
        epoch_mcts_eval = 0.0
        epoch_abs_mcts_eval = 0.0
        
        log_interval = max(1, num_batches // 5)
        for b in range(num_batches):
            batch = dataset[b*batch_size : (b+1)*batch_size]
            if not batch:
                continue
            states = torch.stack([x[0] for x in batch]).to(DEVICE)
            target_policies = torch.tensor(np.array([x[1] for x in batch]), dtype=torch.float32).to(DEVICE)
            target_values = torch.tensor(np.array([x[2] for x in batch]), dtype=torch.float32).unsqueeze(1).to(DEVICE)
            valid_masks = torch.tensor(np.array([x[3] for x in batch]), dtype=torch.bool).to(DEVICE)
            
            optimizer.zero_grad()
            logits, values = model_gpu(states)
            
            # Mask invalid moves with a large negative value before softmax
            logits = logits.masked_fill(~valid_masks, -1e9)
            
            # Manual cross-entropy: works correctly with soft MCTS targets on all PyTorch versions
            log_probs = torch.log_softmax(logits, dim=1)
            loss_p = -torch.sum(target_policies * log_probs) / logits.size(0)
            loss_v = loss_val_fn(values, target_values)
            loss = loss_p + loss_v
            
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model_gpu.parameters(), max_norm=1.0)
            optimizer.step()
            
            epoch_p_loss += loss_p.item()
            epoch_v_loss += loss_v.item()
            epoch_mcts_eval += target_values.mean().item()
            epoch_abs_mcts_eval += torch.abs(target_values).mean().item()
            
            # Track policy entropy
            with torch.no_grad():
                probs = torch.softmax(logits, dim=-1)
                entropy = -torch.sum(probs * torch.log(probs + 1e-8), dim=-1).mean()
                epoch_entropy += entropy.item()

            if (b + 1) % log_interval == 0 or b == num_batches - 1:
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] [Learner] Epoch {epoch+1} Batch [{b+1}/{num_batches}] - Policy Loss: {loss_p.item():.4f}, Value Loss: {loss_v.item():.4f}", flush=True)
            
        scheduler.step()
        current_lr = scheduler.get_last_lr()[0]
        
        # Update metrics for browser live panel
        _METRICS['policy_loss'] = epoch_p_loss / max(1, num_batches)
        _METRICS['value_loss'] = epoch_v_loss / max(1, num_batches)
        _METRICS['entropy'] = epoch_entropy / max(1, num_batches)
        _METRICS['lr'] = current_lr
        _METRICS['avg_mcts_eval'] = epoch_mcts_eval / max(1, num_batches)
        _METRICS['avg_abs_mcts_eval'] = epoch_abs_mcts_eval / max(1, num_batches)
        
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [Learner] Epoch {epoch+1} Complete | Policy Loss = {_METRICS['policy_loss']:.4f}, Value Loss = {_METRICS['value_loss']:.4f}, Policy Entropy = {_METRICS['entropy']:.4f}, LR = {_METRICS['lr']:.6f}", flush=True)
        
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
    parser.add_argument("--batch_size", type=int, default=64, help="Mini-batch size for model training")
    parser.add_argument("--lr", type=float, default=0.0003, help="Initial learning rate")
    parser.add_argument("--simulations", type=int, default=400, help="Number of MCTS simulations per turn")
    parser.add_argument("--dataset_size", type=int, default=50000, help="Max replay buffer size (recent positions kept)")
    parser.add_argument("--data_dir", type=str, default="data", help="Directory to save/load training games")
    parser.add_argument("--checkpoint_path", type=str, default="quoridor_checkpoint.pth", help="Path to checkpoint file")
    parser.add_argument("--visualize", "-v", action="store_true", help="Visualize self-play games in terminal")
    parser.add_argument("--reset_lr", action="store_true", help="Reset LR and scheduler instead of loading from checkpoint")
    parser.add_argument("--num_actors", type=int, default=6, help="Number of parallel self-play actor processes (default: 6)")
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "gpu", "cuda", "xpu", "directml"], help="Execution device (default: auto)")
    args = parser.parse_args()

    # 1. Export starting model weights if quoridor_model.onnx is missing
    if not os.path.exists("quoridor_model.onnx"):
        print("Initializing model weights for self-play...")
        starting_model = QuoridorNet(num_residual_blocks=10, channels=128)
        if os.path.exists(args.checkpoint_path):
            try:
                ckpt = torch.load(args.checkpoint_path, map_location='cpu', weights_only=False)
                starting_model.load_state_dict(ckpt['model_state_dict'])
                print("Loaded existing checkpoint weights.")
            except Exception:
                pass
        export_to_onnx(starting_model, "quoridor_model.onnx")

    # 2. Spawn the self-play game generator Actors in the background
    num_actors = max(1, args.num_actors)
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [Learner] Spawning {num_actors} parallel self-play Actor processes...", flush=True)
    actor_processes = [
        subprocess.Popen([sys.executable, 'run_actor.py', '--actor_id', str(i + 1), '--simulations', str(args.simulations)])
        for i in range(num_actors)
    ]

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
        )
    finally:
        print(f"Stopping {len(actor_processes)} background self-play Actor processes...")
        for p in actor_processes:
            p.terminate()
        for p in actor_processes:
            p.wait()
