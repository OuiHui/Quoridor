# Quoridor AlphaZero AI

An implementation of an AlphaZero-style reinforcement learning agent for the board game Quoridor. The system pairs a C++ game simulator and Monte Carlo Tree Search (MCTS) engine (exposed to Python through `pybind11`) with PyTorch for training deep residual networks. Trained models export to the Open Neural Network Exchange (ONNX) format for client-side inference inside web browsers using ONNX Runtime Web.

Detailed technical design notes are maintained in [docs/architecture.md](docs/architecture.md). Historical audit reports and post-mortems can be found in the [docs](docs) directory.

---

## Architecture Evolution: Old (v1) vs New (v2)

The engine was overhauled from the baseline architecture (QuoridorNet v1) to the current architecture (QuoridorNet v2) to resolve structural blind spots in board representation, spatial equivariance, tactical feature pooling, and search consistency.

### Architectural Comparison Summary

| Subsystem | Baseline Architecture (v1) | Overhauled Architecture (v2) | Rationale for Design Choice |
| :--- | :--- | :--- | :--- |
| **Distance Encoding** (Channels 4 & 5) | Constant scalar planes: $\min(d / 20.0, 1.0)$ broadcast to all 81 cells | Full 2D Reverse-BFS distance maps from goal line ($y=8$ / $y=0$) | Scalar planes produce zero spatial gradients ($\nabla R = \mathbf{0}$) across local $3 \times 3$ receptive fields. 2D distance maps give local kernels direct spatial slope toward the winning baseline. |
| **Shortest-Path Representation** (Channels 6 & 7) | Binary mask along a single arbitrary BFS path via fixed tie-breaking | All-Shortest-Paths DAG Criticality maps ($d_{\text{pawn}} + d_{\text{goal}} = d_{\min}$) | Arbitrary tie-breaking breaks left-right reflection symmetry during data augmentation and hides alternative routes. DAG masks identify topological choke points and are strictly symmetry-invariant. |
| **Tempo & Parity Channel** (Channel 10) | Scalar distance advantage only: $(d_{\text{opp}} - d_{\text{active}}) / 16.0$ | Distance advantage at `(0, 0)` plus Jump Parity boolean at `(0, 1)` | In corridor races with zero walls remaining, whether $(d_{\text{active}} - d_{\text{opp}}) \pmod 2 = 0$ determines head-to-head jump priority. Supplying parity directly prevents value prediction oscillation. |
| **Convolutional Trunk** | 10 Residual Blocks, 128 channels | 20 Residual Blocks, 192 channels | Quoridor requires deep graph connectivity evaluation over long labyrinthine corridors spanning up to 40 plies. 20 blocks expand the effective receptive field across the entire board. |
| **Channel Attention** | Standard Squeeze-and-Excitation (SE) with spatial mean pooling | KataGo Global Pooling: concatenated spatial mean and spatial max | Spatial mean pooling over 81 cells dilutes single-cell tactical markers (such as pawn spikes or choke points). Concatenating spatial max preserves peak local activations across channels. |
| **Policy Head Architecture** | Flattened dense layer: `Linear(channels * 81 -> 140)` (~2.18M parameters) | Spatially decoupled head: 12-pawn FC branch + unpadded $2 \times 2$ spatial convolution for 128 wall actions | Flattening destroys 2D translation equivariance for wall coordinates. Slicing the $9 \times 9$ grid into an $8 \times 8$ intersection subgrid via $2 \times 2$ conv cuts wall parameters by $>85\%$ and preserves spatial geometry. |
| **Auxiliary Supervision** | Current-turn path prediction (redundant with inputs) | End-of-game path lengths (2), final wall ownership grid ($2 \times 8 \times 8$), opponent policy (140) | Current-turn paths are already known to the network via inputs. Supervising terminal outcomes and opponent counter-responses shapes intermediate features without deployment overhead. |
| **Inference Footprint** | Monolithic ONNX file with training heads included | Stripped ONNX graph containing only primary Policy and Value heads | Auxiliary heads are used solely for backpropagation gradients during self-play optimization. Stripping them during ONNX export minimizes client memory and WebAssembly execution latency. |
| **MCTS Tree Search** | Subtree reuse across turns in browser JavaScript engine | Fresh root allocation per turn with persistent Transposition Table caching | Subtree reuse under Gumbel AlphaZero sequential halving penalized unvisited winning moves with default negative values ($Q = -1.0$). Allocating a fresh root per turn resolves search blindness. |

---

## Detailed Design Justifications

### 1. State Representation (11 Channels on $9 \times 9$)

Defined in [quoridor_model.py](quoridor_model.py#L163-L230) and [cpp/quoridor_simulator.cpp](cpp/quoridor_simulator.cpp#L300-L400):

* **Channels 0 & 1 (Pawn Locations)**: One-hot binary indicator matrices for the active player pawn and opponent pawn respectively.
* **Channels 2 & 3 (Wall Placements)**: Horizontal and vertical wall placement indicators on the $8 \times 8$ intersection subgrid, mapped into indices `0..7` of the $9 \times 9$ tensor with row and column 8 padded with `0.0`.
* **Channels 4 & 5 (2D Reverse-BFS Distance Maps)**: Multi-source BFS distance computed from the respective target goal row ($y=8$ for active player, $y=0$ for opponent). Every cell $(x, y)$ stores $\min(d(x, y) / 20.0, 1.0)$. In v1, a constant scalar was broadcast across the channel, depriving $3 \times 3$ convolutional filters of directional information. In v2, spatial differences between neighboring cells immediately reveal the descent direction toward the goal.
* **Channels 6 & 7 (All-Shortest-Paths DAG Criticality Maps)**: Every cell $(x, y)$ lying on any shortest path satisfies:
  $$d_{\text{pawn}}(x, y) + d_{\text{goal}}(x, y) = d_{\min}$$
  All such cells are marked in the channel. Cells where all shortest paths must traverse have maximal flow, identifying critical bottlenecks. This formulation is invariant under horizontal reflection, whereas v1 used arbitrary direction tie-breaking that broke data augmentation symmetry.
* **Channels 8 & 9 (Wall Inventories)**: Normalized remaining wall counts ($\text{walls} / 10.0$) broadcast across all cells.
* **Channel 10 (Path Advantage and Jump Parity)**:
  - Coordinate `(0, 0)`: Clamped distance advantage $(d_{\text{opp}} - d_{\text{active}}) / 16.0 \in [-1.0, 1.0]$.
  - Coordinate `(0, 1)`: Jump parity flag: $1.0$ if $(d_{\text{active}} - d_{\text{opp}}) \equiv 0 \pmod 2$, and $0.0$ otherwise.

### 2. Trunk & KataGo Global Pooling Attention

Defined in [quoridor_model.py](quoridor_model.py#L5-L42):

* Standard Squeeze-and-Excitation (SE) computes channel recalibration weights using only the spatial average:
  $$y_{\text{mean}} = \frac{1}{81} \sum_{i=1}^{9} \sum_{j=1}^{9} x_{c, i, j}$$
  In Quoridor, crucial tactical indicators (such as the presence of an opponent pawn adjacent to a jump threshold or a single critical bottleneck cell) occupy only 1 out of 81 cells, diluting their signal when averaged.
* KataGo Global Pooling concatenates the spatial mean and spatial maximum across each channel:
  $$y = \left[ \text{mean\_pool}(x), \text{max\_pool}(x) \right] \in \mathbb{R}^{2C}$$
  This composite vector passes through a two-layer multi-layer perceptron with ReLU and Sigmoid activations to produce channel attention gates, preserving sharp local tactical markers.

### 3. Spatially Decoupled Policy Head

Defined in [quoridor_model.py](quoridor_model.py#L70-L80):

* The Quoridor action space consists of 140 discrete choices: 12 pawn movements (orthogonal steps, straight jumps, diagonal jumps) and 128 wall placements (64 horizontal, 64 vertical).
* In v1, the feature map was flattened into a single vector and passed through a monolithic linear layer. This destroyed spatial translation equivariance for wall coordinates and required $192 \times 81 \times 140 \approx 2.18\text{M}$ parameters.
* In v2, the head is split into two specialized components:
  1. **Pawn Sub-Head**: Trunk features are reduced to 4 channels via $1 \times 1$ convolution, concatenated with scalar game state features, and projected via a small linear layer to 12 pawn action logits.
  2. **Wall Sub-Head**: Trunk features are reduced to 32 channels via $1 \times 1$ convolution. An unpadded $2 \times 2$ spatial convolution maps the $9 \times 9$ input features directly to an $8 \times 8$ grid of intersection coordinates with 2 output channels (Channel 0: Horizontal, Channel 1: Vertical). This maintains spatial translation equivariance and reduces wall sub-head parameters to under 15,000.

### 4. Auxiliary Multi-Task Targets

Defined in [quoridor_model.py](quoridor_model.py#L81-L96):

* During self-play training, the network optimizes a composite loss function:
  $$\mathcal{L} = \mathcal{L}_{\text{policy}} + \mathcal{L}_{\text{value}} + 0.1 \cdot \mathcal{L}_{\text{aux\_path}} + 0.1 \cdot \mathcal{L}_{\text{aux\_wall}} + 0.1 \cdot \mathcal{L}_{\text{aux\_opp}}$$
* **End-of-Game Path Prediction**: Predicts final path lengths to encourage evaluation of long-term corridor connectivity.
* **Final Wall Ownership Map**: Predicts which intersections will have walls by game end, guiding intermediate corridor formation.
* **Opponent Next Move**: Predicts the opponent's counter-policy to force the representation to anticipate defensive responses.
* All auxiliary heads are stripped when exporting to `public/quoridor_model.onnx`, incurring zero latency or memory overhead during deployment.

---

## Action Space Encoding (140 Actions)

The policy vector represents actions indexed from `0` to `139`:

* **`0 - 3`**: Orthogonal pawn steps (0: North, 1: South, 2: East, 3: West).
* **`4 - 7`**: Straight pawn jumps over an adjacent opponent (4: North, 5: South, 6: East, 7: West).
* **`8 - 11`**: Diagonal pawn jumps when straight jumps are blocked (8: North-East, 9: North-West, 10: South-East, 11: South-West).
* **`12 - 75`**: Horizontal wall placements at intersection $(wx, wy)$, indexed as $12 + (wy \times 8 + wx)$ for $wx, wy \in [0, 7]$.
* **`76 - 139`**: Vertical wall placements at intersection $(wx, wy)$, indexed as $76 + (wy \times 8 + wx)$ for $wx, wy \in [0, 7]$.

---

## Starting Training from Scratch

To initialize training from scratch with the overhauled v2 architecture and fresh weights:

### 1. Compile the C++ Engine Extension
Ensure you have a C++ compiler and `pybind11` installed:
```powershell
pip install pybind11
python setup_cpp.py build_ext --inplace
```
This produces `quoridor_cpp.pyd` on Windows or `quoridor_cpp.so` on Linux/macOS.

### 2. Initialize a Fresh Training Run
Run [start_training.py](start_training.py) with the `--fresh` flag:
```powershell
python start_training.py --fresh --actors 4 --epochs 200
```
The `--fresh` flag automatically executes the following cleanup steps:
* Archives any pre-existing `quoridor_checkpoint.pth` into `checkpoint_backup/`.
* Clears or archives previous replay buffer batches in `C:\quoridor_data`.
* Resets `public/training_state.json` to Epoch 0 initial state for the browser live overlay.
* Initializes QuoridorNet v2 with random weights and begins generating self-play games.

To launch the GPU server, parallel self-play actors, and learner in dedicated terminal windows on Windows:
```powershell
python start_training.py --fresh --windows --actors 4 --epochs 200
```

### 3. Training CLI Options
* `--fresh`: Archive existing checkpoint and start from Epoch 0 with fresh v2 weights.
* `--actors`: Number of parallel C++ self-play actor processes (default: `4`).
* `--simulations`: Deep MCTS searches for 25% of moves under Playout Cap Randomization (default: `800`).
* `--fast_simulations`: Fast MCTS searches for 75% of moves under Playout Cap Randomization (default: `120`).
* `--batch_size`: Self-play batch size per actor (default: `32`).
* `--epochs`: Target training epochs (default: `200`).
* `--lr`: Initial learning rate (default: `5e-5`).
* `--reset_lr`: Reset the learning rate scheduler when resuming.
* `--windows`: Open dedicated console windows for each worker process.

---

## Repository Structure

The codebase is organized into modular directories:

```
Quoridor/
├── cpp/                  # C++ simulator, bitboard operations, MCTS engine, pybind11 bindings
├── js/                   # Browser game engine, MCTS client search, Web Worker, UI state
├── css/                  # Board, panel, and modal stylesheets
├── components/           # Modular HTML partials for client interface
├── eval/                 # Evaluation suite (tactics benchmark, minimax battle, checkpoint arena)
│   ├── eval_suite.py     # Unified 4-tier evaluation CLI entry point
│   ├── eval_tactics.py   # Tactical puzzle suite and representation diversity auditor
│   ├── eval_arena.py     # Head-to-head checkpoint tournament arena
│   ├── eval_json.py      # JSON state dissection and diagnostic tool
│   └── play_vs_minimax.py# Minimax heuristic bot sparring benchmark
├── tests/                # Automated verification and unit test suites
│   ├── test_model.py     # Neural network forward pass, state encoding, ONNX export tests
│   ├── test_mcts_optimizations.js # JS MCTS equality, policy mirroring, and search tests
│   ├── test_guaranteed_win_eval_bar.js # Terminal race and eval bar UI tests
│   ├── verify_simulator.py # C++ vs Python simulator equivalence check (1,000 steps)
│   ├── verify_solver.py  # Guaranteed winner zero-wall race solver verification
│   └── verify_eval_bar.py# Accuracy verification across pathfinding and NN values
├── scripts/              # Operational utilities and maintenance tools
│   ├── deploy_model.py   # Model deployment script (exports checkpoint to public/quoridor_model.onnx)
│   ├── purge_opening_plies.py # Replay buffer data cleaning utility
│   ├── analyze_training.py # Replay buffer dataset distribution analysis
│   └── detailed_eval.py  # Checkpoint metadata inspection script
├── docs/                 # System architecture specifications and training audit reports
├── public/               # Static assets served by Vite (quoridor_model.onnx, training_state.json)
├── checkpoint_backup/    # Archived checkpoints from previous training runs
├── quoridor_model.py     # QuoridorNet v2 PyTorch neural network definition
├── train_alphazero.py    # AlphaZero learner process (GPU optimization, AMP, loss calculation)
├── start_training.py     # Master orchestrator for launching server, actors, and learner
├── gpu_inference_server.py # Centralized GPU batch inference server for self-play workers
├── run_actor.py          # Parallel C++ self-play actor worker process
├── onnx_inference.py     # TCP socket inference client and local ONNX Runtime wrapper
├── setup_cpp.py          # C++ pybind11 build configuration
├── index.html            # Vite client application entry point
├── app.js                # Frontend controller and DOM bootstrap script
├── style.css             # Root stylesheet imports
└── vite.config.js        # Vite bundler configuration
```

---

## Model Verification and Testing

Verify the simulator, neural network forward pass, ONNX export, and tactical suites:

1. **Automated Test Suite (`npm test`)**:
   ```powershell
   npm test
   ```
   Executes JS MCTS optimization tests, terminal race evaluation bar tests, and PyTorch neural network verification.

2. **Neural Network & ONNX Verification**:
   ```powershell
   python tests/test_model.py
   ```
   Validates tensor dimensions `(11, 9, 9)`, forward passes, action mappings, and ONNX export.

3. **C++ vs Python Simulator Equivalence**:
   ```powershell
   python tests/verify_simulator.py
   ```
   Runs 1,000 randomized steps comparing C++ and Python state representations, legal moves, and pathfinding.

4. **Zero-Wall Race Solver & Parity**:
   ```powershell
   python tests/verify_solver.py
   ```
   Verifies guaranteed winner detection in zero-wall races, jump parity, and transposition table caching.

5. **Tactical Health Benchmark**:
   ```powershell
   python eval/eval_suite.py tactics --model public/quoridor_model.onnx --sims 400
   ```
   Evaluates opening pawn mass, cosine similarity against canonical moves, and tactical puzzle solving.

6. **Model Deployment to Web App**:
   ```powershell
   python scripts/deploy_model.py
   ```
   Loads the latest `quoridor_checkpoint.pth` and exports stripped inference weights to `public/quoridor_model.onnx`.

---

## Web Application & Live Dashboard

Launch the local web client to play against the AI or watch live training progress:

```powershell
npm install
npm run dev
```

To create a production bundle:
```powershell
npm.cmd run build
```
Build output is generated into the `dist/` directory.
