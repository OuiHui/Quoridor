import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time

DATA_DIR = os.environ.get("QUORIDOR_DATA_DIR", r"C:\quoridor_data")
CHECKPOINT_PATH = "quoridor_checkpoint.pth"
BACKUP_DIR = "checkpoint_backup"


def check_prerequisites():
    try:
        import quoridor_cpp  # noqa: F401
    except ImportError as e:
        print(f"Error: quoridor_cpp C++ extension not found or failed to import ({e}).")
        print("Run 'python setup_cpp.py build_ext --inplace' before starting training.")
        sys.exit(1)

    try:
        import torch
        if torch.cuda.is_available():
            dev_name = torch.cuda.get_device_name(0)
            print(f"CUDA Hardware Detected: {dev_name}")
        else:
            print("Warning: CUDA not detected. Training will run on CPU.")
    except ImportError:
        print("Error: PyTorch is not installed in the active environment.")
        sys.exit(1)

    os.makedirs(DATA_DIR, exist_ok=True)


def handle_fresh_start():
    if os.path.exists(CHECKPOINT_PATH):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(BACKUP_DIR, f"quoridor_checkpoint_v1_{timestamp}.pth")
        print(f"Archiving existing checkpoint to {backup_path}...")
        shutil.copy2(CHECKPOINT_PATH, backup_path)
        os.remove(CHECKPOINT_PATH)
        print("Existing checkpoint safely archived.")

    if os.path.exists(DATA_DIR):
        backup_data_dir = r"C:\quoridor_data_v1_backup"
        if not os.path.exists(backup_data_dir):
            print(f"Archiving existing replay buffer to {backup_data_dir}...")
            try:
                os.rename(DATA_DIR, backup_data_dir)
            except Exception as e:
                print(f"Note: Could not rename {DATA_DIR} directly ({e}), clearing epoch folders...")
                for item in os.listdir(DATA_DIR):
                    p = os.path.join(DATA_DIR, item)
                    if os.path.isdir(p) and item.startswith("epoch_"):
                        shutil.rmtree(p, ignore_errors=True)
        else:
            for item in os.listdir(DATA_DIR):
                p = os.path.join(DATA_DIR, item)
                if os.path.isdir(p) and item.startswith("epoch_"):
                    shutil.rmtree(p, ignore_errors=True)
        os.makedirs(DATA_DIR, exist_ok=True)
        print(f"Cleaned replay buffer directory: {DATA_DIR}")

    state_json = os.path.join("public", "training_state.json")
    if os.path.exists(state_json):
        try:
            with open(state_json, "w") as f:
                json.dump({
                    "status": "ready",
                    "p1_pos": [4, 0],
                    "p2_pos": [4, 8],
                    "h_walls": [],
                    "v_walls": [],
                    "p1_walls": 10,
                    "p2_walls": 10,
                    "move_count": 0,
                    "current_player": "-",
                    "last_move": "Starting fresh QuoridorNet v2 training",
                    "timestamp": time.time(),
                    "metrics": {
                        "epoch": 0,
                        "total_epochs": 200,
                        "policy_loss": 0.0,
                        "value_loss": 0.0,
                        "entropy": 0.0,
                        "lr": 0.00015
                    }
                }, f)
        except Exception:
            pass


def launch_windows_mode(num_actors, simulations, fast_simulations, batch_size, epochs):
    print("Launching training pipeline in separate terminal windows...")

    server_cmd = f'start "Quoridor GPU Inference Server" cmd /k "{sys.executable} gpu_inference_server.py"'
    subprocess.Popen(server_cmd, shell=True)
    time.sleep(3)

    for i in range(num_actors):
        actor_id = i + 1
        actor_cmd = (
            f'start "Quoridor Actor #{actor_id}" cmd /k '
            f'"{sys.executable} run_actor.py --actor_id {actor_id} '
            f'--simulations {simulations} --fast_simulations {fast_simulations} --batch_size {batch_size}"'
        )
        subprocess.Popen(actor_cmd, shell=True)
        time.sleep(0.5)

    time.sleep(1)
    trainer_cmd = (
        f'start "Quoridor AlphaZero Learner" cmd /k '
        f'"{sys.executable} train_alphazero.py --no_spawn --epochs {epochs} '
        f'--simulations {simulations} --fast_simulations {fast_simulations}"'
    )
    subprocess.Popen(trainer_cmd, shell=True)

    print("All processes launched in dedicated windows. Monitor each window for live logs.")


def launch_managed_mode(num_actors, simulations, fast_simulations, batch_size, epochs):
    print(f"Starting AlphaZero orchestrator ({num_actors} parallel actors, deep sims: {simulations}, fast sims: {fast_simulations})...")

    cmd = [
        sys.executable, "train_alphazero.py",
        "--num_actors", str(num_actors),
        "--simulations", str(simulations),
        "--fast_simulations", str(fast_simulations),
        "--epochs", str(epochs)
    ]

    proc = subprocess.Popen(cmd)

    def signal_handler(sig, frame):
        print("\nShutdown signal received. Terminating training pipeline...")
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, signal_handler)

    proc.wait()


def main():
    parser = argparse.ArgumentParser(description="Launcher for Quoridor AlphaZero training pipeline.")
    parser.add_argument("--actors", type=int, default=4, help="Number of self-play actor processes (default: 4)")
    parser.add_argument("--simulations", type=int, default=800, help="Deep search simulations for PCR 25 pct (default: 800)")
    parser.add_argument("--fast_simulations", type=int, default=120, help="Fast search simulations for PCR 75 pct (default: 120)")
    parser.add_argument("--batch_size", type=int, default=32, help="Self-play batch size per actor (default: 32)")
    parser.add_argument("--epochs", type=int, default=200, help="Total training epochs (default: 200)")
    parser.add_argument("--fresh", action="store_true", help="Start training from scratch with fresh v2 weights (archives old checkpoint)")
    parser.add_argument("--windows", action="store_true", help="Launch server, actors, and learner in separate terminal windows")
    args = parser.parse_args()

    check_prerequisites()

    if args.fresh:
        handle_fresh_start()

    if args.windows and sys.platform == "win32":
        launch_windows_mode(args.actors, args.simulations, args.fast_simulations, args.batch_size, args.epochs)
    else:
        launch_managed_mode(args.actors, args.simulations, args.fast_simulations, args.batch_size, args.epochs)


if __name__ == "__main__":
    main()
