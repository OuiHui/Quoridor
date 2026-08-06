import os
import torch
import time

base = r"C:\quoridor_data"

print("=" * 60)
print("TRAINING DATA ANALYSIS")
print("=" * 60)

# Quick scan of last 10 epochs (metadata only, no loading)
print("\n--- Last 10 Epochs (file counts) ---")
dirs = sorted(os.listdir(base))
for d in dirs[-10:]:
    dp = os.path.join(base, d)
    if not os.path.isdir(dp):
        continue
    files = [f for f in os.listdir(dp) if f.endswith('.pt')]
    gc = 0
    for f in files:
        if f.startswith('games_'):
            try:
                gc += int(f.split('_')[1])
            except (IndexError, ValueError):
                gc += 1
        else:
            gc += 1
    sz = sum(os.path.getsize(os.path.join(dp, f)) for f in files)
    print(f"  {d}: {gc:3d} games, {sz/1024/1024:6.1f} MB, {len(files)} batch files")

# Sample 1 file from epoch_200 for value distribution
print("\n--- Sample Data (epoch_200, first batch file) ---")
latest_dir = os.path.join(base, "epoch_200")
pt_files = sorted([f for f in os.listdir(latest_dir) if f.endswith('.pt')])
if pt_files:
    sample_file = os.path.join(latest_dir, pt_files[0])
    data = torch.load(sample_file, map_location='cpu', weights_only=False)
    print(f"  File: {pt_files[0]}")
    print(f"  Positions in file: {len(data)}")
    
    values = []
    for item in data:
        if isinstance(item, (list, tuple)) and len(item) >= 3:
            v = item[2]
            values.append(v if isinstance(v, (int, float)) else v.item())
    
    if values:
        t_vals = torch.tensor(values)
        print(f"  Value mean: {t_vals.mean():.4f}")
        print(f"  Value std:  {t_vals.std():.4f}")
        print(f"  P1-winning positions (>0.5): {(t_vals > 0.5).sum().item()}")
        print(f"  P2-winning positions (<-0.5): {(t_vals < -0.5).sum().item()}")
        print(f"  Close positions (|v|<0.5): {((t_vals.abs() < 0.5)).sum().item()}")

# Sample 1 file from epoch_001 for comparison
print("\n--- Sample Data (epoch_001, first batch file) ---")
early_dir = os.path.join(base, "epoch_001")
pt_files_early = sorted([f for f in os.listdir(early_dir) if f.endswith('.pt')])
if pt_files_early:
    sample_early = os.path.join(early_dir, pt_files_early[0])
    data_early = torch.load(sample_early, map_location='cpu', weights_only=False)
    print(f"  File: {pt_files_early[0]}")
    print(f"  Positions in file: {len(data_early)}")
    
    values_early = []
    for item in data_early:
        if isinstance(item, (list, tuple)) and len(item) >= 3:
            v = item[2]
            values_early.append(v if isinstance(v, (int, float)) else v.item())
    
    if values_early:
        t_early = torch.tensor(values_early)
        print(f"  Value mean: {t_early.mean():.4f}")
        print(f"  Value std:  {t_early.std():.4f}")

# Compute avg positions per game for a few epochs  
print("\n--- Game Length Trends ---")
for ep_num in [1, 50, 100, 150, 200]:
    ep_dir = os.path.join(base, f"epoch_{ep_num:03d}")
    if not os.path.exists(ep_dir):
        continue
    files = [f for f in os.listdir(ep_dir) if f.endswith('.pt')]
    total_games = 0
    total_positions = 0
    for f in files:
        try:
            d = torch.load(os.path.join(ep_dir, f), map_location='cpu', weights_only=False)
            total_positions += len(d)
        except:
            pass
        if f.startswith('games_'):
            try:
                total_games += int(f.split('_')[1])
            except:
                total_games += 1
        else:
            total_games += 1
    avg = total_positions / max(1, total_games)
    print(f"  epoch_{ep_num:03d}: {total_games} games, {total_positions} positions, avg {avg:.1f} moves/game")

print("\nDone.")
