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

The agent is driven by a deep residual neural network ([QuoridorNet](quoridor_model.py#L24-L69)):

### 1. Input State Representation `(11, 9, 9)`
The game board is represented as an $11 \times 9 \times 9$ tensor. The 11 channels are defined as:
* **Channel 0**: Active player's pawn position (1.0 at the pawn's current cell, 0.0 elsewhere).
* **Channel 1**: Opponent's pawn position (1.0 at the pawn's current cell, 0.0 elsewhere).
* **Channel 2**: Horizontal wall placements. Wall positions are defined on an $8 \times 8$ grid of intersections; this channel maps them to the $9 \times 9$ grid (padding the 8th row/col with 0.0).
* **Channel 3**: Vertical wall placements. (Similarly padded from $8 \times 8$ to $9 \times 9$).
* **Channel 4**: Active player's normalized shortest-path distance (filled with `min(distance / 20.0, 1.0)`).
* **Channel 5**: Opponent's normalized shortest-path distance (filled with `min(distance / 20.0, 1.0)`).
* **Channel 6**: Binary mask of the cells on the active player's shortest path (1.0 on path cells, 0.0 elsewhere).
* **Channel 7**: Binary mask of the cells on the opponent's shortest path (1.0 on path cells, 0.0 elsewhere).
* **Channel 8**: Active player's remaining walls (normalized: `walls_left / 10.0`).
* **Channel 9**: Opponent's remaining walls (normalized: `walls_left / 10.0`).
* **Channel 10**: Absolute player identity indicator (1.0 if P1, 0.0 if P2).

> [!NOTE]
> **Perspective Symmetry**: To simplify learning, the input state tensor is rotated by 180 degrees whenever it is Player 2's turn. Consequently, the network always evaluates the board from the perspective of the "active player", whose objective is always to move forward towards the goal row ($y = 8$).
>
> **Pathfinding**: Traditional Convolutional Neural Networks lack global coordination to calculate path connectivity. By pre-calculating the BFS shortest paths (Channels 4-7) and feeding them directly as inputs, the model trains significantly faster and avoids having to learn shortest path algorithms from scratch.

### 2. The Convolutional Trunk
* **Initial Block**: A $3 \times 3$ 2D Convolution layer with 128 channels, followed by 2D Batch Normalization and a ReLU activation function.
* **Residual Trunk**: Consists of **10 Residual Blocks** with 128 channels each. Each block performs two consecutive $3 \times 3$ convolutions, each accompanied by Batch Normalization and ReLU, alongside a skip connection adding the block's input back to its final output. This block layout helps prevent vanishing gradients and extracts deep spatial-tactical features from the board layout.

### 3. The Dual Heads
The network splits into two output branches:
* **Policy Head**:
  - Compresses the trunk's 128 channels down to 4 channels using a $1 \times 1$ convolution.
  - Applies Batch Normalization and a ReLU activation.
  - Flattens the output and passes it through a fully connected linear layer to yield **140 action logits**.
* **Value Head**:
  - Compresses features down to 4 channels using a $1 \times 1$ convolution.
  - Applies Batch Normalization and a ReLU activation.
  - Flattens the output and passes it through a fully connected linear layer of size 64 with a ReLU activation.
  - Passes the result through a final fully connected linear layer with a `tanh` activation to output a scalar in `[-1.0, 1.0]`, representing the expected game outcome (1.0 indicates a guaranteed win for the active player, -1.0 indicates a loss).

### 4. Action Space Mapping (140 Actions)
The output policy vector of size 140 represents all possible moves and wall placements:
* **Indices `0 - 3`**: Regular orthogonal pawn moves (North, South, East, West).
* **Indices `4 - 7`**: Straight jumps over an adjacent opponent (North, South, East, West).
* **Indices `8 - 11`**: Diagonal jumps (NE, NW, SE, SW) used when a straight jump is blocked.
* **Indices `12 - 75`**: Horizontal wall placements. Corresponds to $wy \times 8 + wx$, spanning the 64 intersections of the board.
* **Indices `76 - 139`**: Vertical wall placements. Corresponds to $wy \times 8 + wx$, spanning the 64 intersections of the board.

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

## The AlphaZero Training Process

The training pipeline runs in a loop across a user-specified number of epochs. Each epoch consists of two main phases: **Self-Play (Data Generation)** and **Optimization (Neural Network Training)**.

### 1. Self-Play (Data Generation)
* **Match Simulation**: The current neural network plays against itself for a set number of games per epoch (`games_per_epoch`, default: 50).
* **MCTS Guidance**: During each turn, Monte Carlo Tree Search (MCTS) executes a deep lookahead (`simulations`, default: 400). It uses the model's **Policy Head** as prior probabilities to narrow down candidate branches and the **Value Head** to immediately evaluate leaf nodes.
* **Exploration vs. Exploitation**: 
  - For the first 30 moves of each game, moves are sampled proportionally to the MCTS visit counts to guarantee diverse trajectories.
  - After 30 moves, the agent acts greedily by picking the most-visited move.
  - Dirichlet noise is added to the root nodes to ensure the agent explores new tactical options.
* **Data Logging**: The game history (state tensors, search probability targets, and active player perspectives) is recorded.
* **Symmetry Augmentation**: Each position is augmented using a horizontal flip (left-right board symmetry), doubling the training dataset size for free.

### 2. Optimization (Neural Network Training)
* **Replay Buffer**: All positions from current and recent epochs are stored in a rolling dataset (capped by `dataset_size`).
* **Mini-Batch Training**: The positions are shuffled and trained on in mini-batches (default batch size: 64) using the Adam optimizer with weight decay.
* **Loss Function**: The total loss is a sum of two components:
  - **Policy Loss**: Cross-entropy between the network's raw policy predictions and the target MCTS visit count distributions.
  - **Value Loss**: Mean Squared Error (MSE) between the network's predicted game value ($V \in [-1, 1]$) and the final game outcome ($Z \in \{-1, 1\}$ or $0$ for draws).
* **Learning Rate Decay**: The learning rate scheduler halves the learning rate every 15 epochs.
* **ONNX Export**: A checkpoint (`quoridor_checkpoint.pth`) is saved after each epoch. At the end of the entire run, the model is exported as `quoridor_model.onnx` to run on the frontend.

---

## Target Metrics for Competency

As the model trains, you can monitor its progress via the real-time CLI output or the browser overlay dashboard. When the model reaches a competent, competitive level of play, you should expect the training summary statistics to stabilize around these target values:

* **Policy Loss (`1.0` to `1.5`)**: A policy loss in this range means the neural network is predicting high-quality moves with high confidence, matching the MCTS search results closely. Because of Dirichlet exploration noise, it will never reach 0.
* **Value Loss (`0.05` to `0.15`)**: A low value loss indicates the network has learned to accurately evaluate board states and predict the eventual winner. Spikes above `0.25` indicate the model is making critical blunders that lead to unexpected game outcomes.
* **Policy Entropy (`0.8` to `1.3`)**: Entropy represents the spread of the model's move predictions. A target of `0.8 - 1.3` means the model is sharp and decisive (evaluating 2 to 3 strong choices per turn) without collapsing to a single move or exploring randomly.
* **Mean Absolute MCTS Eval (`Mean(|Q|)`: `0.4` to `0.7`)**: In early training, this metric is high (~0.8+) because players blunder early, leading to highly lopsided evaluations. As play becomes highly competent, players defend optimally, resulting in closer, competitive mid-games with more balanced evaluations.

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
