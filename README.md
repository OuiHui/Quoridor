# Quoridor AlphaZero AI

An implementation of an AlphaZero-style reinforcement learning agent for the board game Quoridor. The system uses Self-Play and Monte Carlo Tree Search (MCTS) to train a deep residual neural network, which is then exported to ONNX to run in the web browser.

---

## Generated Files Guide

When running the training pipeline, the following files and folders are generated:

### Model & Checkpoint Files
* **`quoridor_checkpoint.pth`**: The PyTorch training checkpoint saved at the end of each epoch. Contains model weights, optimizer state, scheduler state, and the current epoch index. Used for pausing and resuming training.
* **`quoridor_model.onnx`**: The trained model exported to the Open Neural Network Exchange (ONNX) format. This topology is loaded directly by the frontend using ONNX Runtime for web browser play.
* **`quoridor_model.onnx.data`**: The binary weights file generated alongside the ONNX model structure. Must be kept in the same directory as the `.onnx` file.

### Training Progress & Metrics
* **`public/training_state.json`**: A temporary JSON file updated in real-time during self-play. The Vite dev server and web application poll this file to render a visual live overlay of the training board state and metrics.

### Structured Training Data
* **`data/epoch_XXX/game_YYY.pt`**: Organized self-play game records. Each file contains a list of states, MCTS policy distributions, and game outcomes generated during that game. Keeping this data game-by-game prevents checkpoint file bloating.

---

## Neural Network Architecture

The agent is driven by a deep residual neural network (`QuoridorNet`):

1. **Input State `(11, 9, 9)`**:
   - Channel 0: Active player pawn position.
   - Channel 1: Opponent pawn position.
   - Channel 2: Horizontal wall placements.
   - Channel 3: Vertical wall placements.
   - Channel 4: Active player's normalized shortest-path distance.
   - Channel 5: Opponent's normalized shortest-path distance.
   - Channel 6: Active player's shortest-path cell mask.
   - Channel 7: Opponent's shortest-path cell mask.
   - Channel 8: Active player's remaining wall count.
   - Channel 9: Opponent's remaining wall count.
   - Channel 10: Absolute player identity indicator (1.0 if P1, 0.0 if P2).
2. **Trunk**: 6 Residual Blocks with 128 channels each.
3. **Policy Head**: Fully connected layer outputting `140` action logits (4 move directions, 8 jump/diagonal directions, 64 horizontal walls, and 64 vertical walls).
4. **Value Head**: Outputs a scalar in `[-1.0, 1.0]` representing the expected game outcome (positive is winning, negative is losing).

---

## How to Train the Model

You can launch and configure the AlphaZero training pipeline using `train_alphazero.py`:

```powershell
# Resume or start training with default settings (50 epochs, 20 games/epoch)
python train_alphazero.py

# Continue training up to epoch 100
python train_alphazero.py --epochs 100

# Train with real-time ASCII board visualization in the console
python train_alphazero.py --visualize

# Custom training configuration
python train_alphazero.py --epochs 80 --games_per_epoch 30 --simulations 120 --dataset_size 30000
```

### CLI Arguments
* `--epochs`: Total target epochs (default: `50`).
* `--games_per_epoch`: Self-play games per epoch (default: `20`).
* `--simulations`: MCTS searches per move (default: `100`).
* `--dataset_size`: Maximum training positions stored in the replay buffer (default: `20000`).
* `--data_dir`: Directory to save/load structured game files (default: `"data"`).
* `--checkpoint_path`: Path to check-in/load weights (default: `"quoridor_checkpoint.pth"`).

---

## AlphaZero vs. Minimax

To test your trained model's performance against a traditional alpha-beta search Minimax bot, run the battle script:

```powershell
# Run a 10-game tournament
python play_vs_minimax.py

# Run a visualized tournament with depth-3 Minimax and 150 MCTS simulations
python play_vs_minimax.py --depth 3 --simulations 150 --games 5 --visualize
```

### CLI Arguments
* `--checkpoint`: Path to your AlphaZero weights (default: `"quoridor_checkpoint.pth"`).
* `--depth`: Search depth for the Minimax bot (default: `2`).
* `--simulations`: MCTS simulations per turn for the AlphaZero bot (default: `100`).
* `--games`: Total games to play in the series (default: `10`).
