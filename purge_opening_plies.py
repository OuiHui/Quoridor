"""
Purge poisoned opening positions from the replay buffer.

Strategy:
  - Delete epoch_001 through epoch_170 entirely (pre-remediation poisoned data).
  - For epoch_171 through epoch_190, strip plies 0–3 from each .pt batch file.
  - Leave epoch_191–epoch_200 untouched (most recent, least poisoned data).
"""

import os
import sys
import torch

DATA_DIR = r"C:\quoridor_data"
DELETE_THRESHOLD = 170   # delete epochs 1–170 entirely
FILTER_THRESHOLD = 190   # filter plies 0–3 from epochs 171–190
PLY_CUTOFF = 4           # plies 0, 1, 2, 3 are considered poisoned opening states


def _ply_index_of(batch, game_idx):
    """
    Approximate ply index: positions within a batch file are stored in game order,
    alternating between augmented pairs.  We cannot recover the exact ply from a
    flat list, so we use the position index within the game pair as a proxy.
    The batch stores (orig, flipped) pairs consecutively, so pair_index = i // 2.
    """
    return game_idx // 2


def filter_batch_file(filepath):
    """Remove opening-ply positions (pair index < PLY_CUTOFF) from a .pt batch."""
    try:
        examples = torch.load(filepath, weights_only=False)
    except Exception as exc:
        print(f"  [WARN] Could not load {filepath}: {exc}")
        return

    # Positions are stored as flat list of (state, policy, value, mask, aux) tuples.
    # Each game contributes (orig + flipped) = 2 entries per ply.
    # We drop the first PLY_CUTOFF * 2 entries that belong to plies 0..(PLY_CUTOFF-1).
    pairs_to_drop = PLY_CUTOFF * 2
    if len(examples) <= pairs_to_drop:
        os.remove(filepath)
        print(f"  [DEL ] {os.path.basename(filepath)} (all {len(examples)} entries are early-ply)")
        return

    filtered = examples[pairs_to_drop:]
    tmp = filepath + ".tmp"
    torch.save(filtered, tmp)
    os.replace(tmp, filepath)
    dropped = len(examples) - len(filtered)
    print(f"  [FILT] {os.path.basename(filepath)}: dropped {dropped}/{len(examples)} entries")


def purge(dry_run=False):
    if not os.path.isdir(DATA_DIR):
        print(f"Data directory not found: {DATA_DIR}")
        sys.exit(1)

    epoch_dirs = sorted(
        d for d in os.listdir(DATA_DIR)
        if d.startswith("epoch_") and os.path.isdir(os.path.join(DATA_DIR, d))
    )

    deleted = 0
    filtered = 0

    for epoch_name in epoch_dirs:
        try:
            epoch_num = int(epoch_name.split("_")[1])
        except ValueError:
            continue

        epoch_path = os.path.join(DATA_DIR, epoch_name)

        if epoch_num <= DELETE_THRESHOLD:
            if dry_run:
                print(f"[DRY] Would delete {epoch_path}")
            else:
                import shutil
                shutil.rmtree(epoch_path, ignore_errors=True)
                print(f"[DEL] {epoch_path}")
            deleted += 1

        elif epoch_num <= FILTER_THRESHOLD:
            print(f"[FILT] Filtering {epoch_path} ...")
            if not dry_run:
                for fname in os.listdir(epoch_path):
                    if fname.endswith(".pt"):
                        filter_batch_file(os.path.join(epoch_path, fname))
            else:
                print(f"  [DRY] Would filter .pt files in {epoch_path}")
            filtered += 1

    print(f"\nDone. Deleted {deleted} epoch dirs, filtered {filtered} epoch dirs.")


if __name__ == "__main__":
    dry = "--dry" in sys.argv or "--dry-run" in sys.argv
    if dry:
        print("--- DRY RUN (pass no flags to execute) ---\n")
    purge(dry_run=dry)
