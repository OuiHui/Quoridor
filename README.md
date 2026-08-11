# Quoridor AlphaZero AI

An implementation of an AlphaZero-style reinforcement learning agent for the board game Quoridor. The system uses a high-performance C++ simulator and Monte Carlo Tree Search (MCTS) engine (bound to Python via `pybind11`) for self-play data generation, and PyTorch to train a deep residual neural network. The trained model is then exported to ONNX to run in the web browser.

> [!TIP]
> For a detailed technical overview of system modules, data flows, and performance optimizations, see the [Architecture Documentation](docs/architecture.md).
> For the latest training audit, red flag remediations, and metric fixes, see the [Epoch 365 Analysis and Remediation Report](docs/training_epoch365_analysis_and_remediation.md) and [Training Pipeline Remediation](docs/training_pipeline_remediation.md).

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
* **`data/epoch_XXX/games_YYY.pt`**: Organized self-play game records written in consolidated batch files per actor pass. Each file contains states, MCTS policy distributions, and game outcomes.

---

## Neural Network Architecture

The agent is driven by a deep residual neural network ([QuoridorNet](quoridor_model.py#L24-L75)):

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
* **Channel 10**: Path advantage scalar (`(opp_dist - active_dist) / 16.0`, clamped to $[-1.0, 1.0]$). Positive values indicate the active player has a shorter path (ahead in racing distance).

> [!NOTE]
> **Perspective Symmetry**: To simplify learning, the input state tensor is rotated by 180 degrees whenever it is Player 2's turn. Consequently, the network always evaluates the board from the perspective of the "active player", whose objective is always to move forward towards the goal row ($y = 8$).
>
> **Pathfinding**: Traditional Convolutional Neural Networks lack global coordination to calculate path connectivity. By pre-calculating the BFS shortest paths (Channels 4-7) and feeding them directly as inputs, the model trains significantly faster and avoids having to learn shortest path algorithms from scratch.

### 2. The Convolutional Trunk
* **Initial Block**: A $3 \times 3$ 2D Convolution layer with 128 channels, followed by 2D Batch Normalization and a ReLU activation function.
* **Residual Trunk with SE-Attention**: Consists of **10 Residual Blocks** with 128 channels each and **Squeeze-and-Excitation (SE)** channel attention. Each block performs two consecutive $3 \times 3$ convolutions (with Batch Normalization and ReLU), passes through an adaptive SE channel attention module to recalibrate feature channels based on global grid context, and adds a skip connection.

### 3. Multi-Head Output Architecture
The network splits into three output branches:
* **Policy Head**:
  - Compresses the trunk's 128 channels down to 4 channels using a $1 \times 1$ convolution.
  - Applies Batch Normalization and a ReLU activation.
  - Flattens the output and passes it through a fully connected linear layer to yield **140 action logits**.
* **Value Head**:
  - Compresses features down to 4 channels using a $1 \times 1$ convolution.
  - Applies Batch Normalization and a ReLU activation.
  - Flattens the output and passes it through a fully connected linear layer of size 64 with a ReLU activation.
  - Passes the result through a final fully connected linear layer with a `tanh` activation to output a scalar in `[-1.0, 1.0]`, representing the expected game outcome.
* **Auxiliary Path Head**:
  - Compresses features down to 2 channels using a $1 \times 1$ convolution.
  - Applies Batch Normalization and a ReLU activation.
  - Passes through a linear layer and a `sigmoid` activation to predict normalized remaining shortest path lengths $[0.0, 1.0]$ for active player and opponent.

### 4. Action Space Mapping (140 Actions)
The output policy vector of size 140 represents all possible moves and wall placements:
* **Indices `0 - 3`**: Regular orthogonal pawn moves (North, South, East, West).
* **Indices `4 - 7`**: Straight jumps over an adjacent opponent (North, South, East, West).
* **Indices `8 - 11`**: Diagonal jumps (NE, NW, SE, SW) used when a straight jump is blocked.
* **Indices `12 - 75`**: Horizontal wall placements. Corresponds to $wy \times 8 + wx$, spanning the 64 intersections of the board.
* **Indices `76 - 139`**: Vertical wall placements. Corresponds to $wy \times 8 + wx$, spanning the 64 intersections of the board.

---


## How to Train the Model

The training pipeline uses a high-performance C++ simulator and MCTS engine for self-play game generation. Before running the training pipeline, you must compile the C++ extension module.

### 1. Compile the C++ Extension
Ensure you have a C++ compiler (such as MSVC on Windows, or GCC/Clang on Linux/macOS) and `pybind11` installed, then build the extension in-place:
```powershell
pip install pybind11
python setup_cpp.py build_ext --inplace
```
This generates a compiled binary (`quoridor_cpp.pyd` on Windows or `quoridor_cpp.so` on Linux/macOS) in the root directory.

### 2. Run the Training Pipeline
Once compiled, launch and configure the AlphaZero training pipeline using `train_alphazero.py`. This script automatically spawns parallel C++ self-play actor processes ([run_actor.py](run_actor.py)) in the background:

```powershell
# Start training with default settings (200 epochs, 50 games/epoch, 6 parallel actors)
python train_alphazero.py

# Continue training up to epoch 300
python train_alphazero.py --epochs 300

# High-throughput training with custom mini-batch size and 8 parallel actors
python train_alphazero.py --batch_size 256 --num_actors 8 --device cuda
```

### CLI Arguments
* `--epochs`: Total target epochs (default: `200`).
* `--games_per_epoch`: Self-play games per epoch (default: `50`).
* `--simulations`: MCTS searches per move (default: `400`).
* `--batch_size`: Mini-batch size for model training (default: `64`).
* `--dataset_size`: Maximum training positions stored in the replay buffer (default: `50000`).
* `--num_actors`: Number of parallel self-play actor processes (default: `6`).
* `--device`: Execution device (`"auto"`, `"cuda"`, `"xpu"`, `"directml"`, `"cpu"`).
* `--data_dir`: Directory to save/load structured game files (default: `"data"`).
* `--checkpoint_path`: Path to check-in/load weights (default: `"quoridor_checkpoint.pth"`).


---

## The AlphaZero Training Process

The training pipeline runs in a loop across a user-specified number of epochs. Each epoch consists of two main phases: **Self-Play (Data Generation)** and **Optimization (Neural Network Training)**.

### 1. Self-Play (Data Generation)
* **Match Simulation**: The current neural network plays against itself for a set number of games per epoch (`games_per_epoch`, default: 50).
* **MCTS Guidance**: During each turn, Monte Carlo Tree Search (MCTS) executes a deep lookahead (`simulations`, default: 400). It uses the model's **Policy Head** as prior probabilities to narrow down candidate branches and the **Value Head** to immediately evaluate leaf nodes.
* **C++ Acceleration**: Self-play games are simulated in parallel batches by [run_actor.py](run_actor.py) using the compiled C++ simulator and MCTS engine, leveraging ONNX Runtime for fast batched neural network inference.
* **Exploration vs. Exploitation**: 
  - For the first 6 moves of each game, pawn moves are sampled proportionally to MCTS visit counts to guarantee diverse openings.
  - After 6 moves, the agent acts greedily by picking the most-visited action.
  - Dirichlet noise ($\alpha=0.3, \epsilon=0.15$) is added to the root node to ensure exploration.
* **Consolidated Data Batching**: Trajectories are saved in consolidated files (`games_32_<timestamp>_<uuid>.pt`) to maximize disk I/O performance.
* **Symmetry Augmentation**: Each position is augmented using horizontal mirroring (left-right board symmetry), doubling the dataset size for free.

### 2. Optimization (Neural Network Training)
* **Replay Buffer Caching**: Positions are maintained in an in-memory buffer via `ReplayDatasetCache`, loading only newly generated batch files each epoch.
* **AMP & Vectorized Tensors**: Mini-batches are trained with Automatic Mixed Precision (`torch.amp.autocast('cuda')`) and pre-stacked contiguous memory tensors for 2x-3x faster backpropagation.
* **Loss Function**:
  - **Policy Loss**: Cross-entropy between predicted policy logits and target MCTS visit distributions.
  - **Value Loss**: Mean Squared Error (MSE) between predicted value ($V \in [-1, 1]$) and outcome ($Z \in \{-1, 1\}$ or $0$ for draws).
* **Learning Rate Decay**: `StepLR` decays LR by 0.8 every 50 epochs.
* **ONNX Export**: Updated weights are exported to `quoridor_model.onnx` so self-play workers hot-reload the latest model automatically.

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

---

## Verifying the C++ Simulator

To ensure the C++ simulator behaves identically to the Python reference implementation (including pathfinding, wall placement validation, and game rules), you can run the verification test suite:

```powershell
python verify_simulator.py
```
This runs 1,000 random game steps across both simulators and asserts that all positions, valid moves, heuristics, and shortest paths match perfectly.
