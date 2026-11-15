# Quoridor AlphaZero Epoch 200 Audit and Remediation Report

## 1. Executive Summary

At Epoch 200 of the QuoridorNet v2 training run, a comprehensive evaluation audit was performed using the 4-tier benchmark suite (`eval_suite.py tactics`, checkpoint arena matches, and representation diagnostics).

The structural upgrades introduced in QuoridorNet v2 (20-block, 192-channel SE residual trunk, spatial convolutional policy heads, and auxiliary distance prediction) functioned as designed for latent representation quality:
- **Representation Diversity**: Pairwise cosine similarity measured $0.462 \pm 0.122$ across 50 random states (within the optimal target range of $0.20 - 0.75$).
- **Perspective Symmetry Error**: $0.0988$ (below the $0.15$ error threshold).
- **Midgame Policy Distribution**: $86.68\%$ pawn move mass during midgame play.

However, the evaluation revealed two critical systemic failures, one tactical search failure, and one engine bug:
1. **87% Opening Wall Prior Mass**: On Move 1 from the initial board state, the network placed $87.0\%$ of its prior policy mass on baseline walls (`v_wall` at `(5, 0)` with $22.5\%$ and `v_wall` at `(2, 0)` with $20.8\%$), while moving North received only $10.3\%$.
2. **0% Player 1 Win Rate**: In checkpoint arena matches, Player 1 won $0\%$ of games (Player 2 won $100\%$). Because Player 1 consistently spent Move 1 dropping an unnecessary defensive wall behind or adjacent to their own pawn, they permanently conceded tempo and lost every game.
3. **Tactical Puzzle 2 Miss**: The model failed Puzzle 2 (a 1-ply diagonal jump win around the opponent into the goal row), choosing instead to place a horizontal wall (`h_wall` at `(4, 5)`).
4. **Simulator Wall Trapping Bug**: In specific edge and corner wall configurations, players could become completely enclosed with zero legal paths to their goal row due to a flaw in Slatton's Tier 2 contact rule bypass.

---

## 2. Root Cause Analysis: What Went Wrong

### A. Root Dirichlet Noise Asymmetry on Move 1
In Quoridor, the action space consists of up to 12 pawn movements and 128 wall placements (140 total actions). On Move 1, there are 131 legal moves: 3 legal pawn moves (North, East, West) and 128 legal wall placements.
- Under standard symmetric Dirichlet noise $\text{Dir}(\alpha, \dots, \alpha)$, the expected noise fraction allocated to any individual action is strictly $1/K$, regardless of $\alpha$.
- Across the 131 actions, $128 / 131 = 97.71\%$ of the $\epsilon = 0.25$ exploration noise budget landed on wall actions, while only $3 / 131 = 2.29\%$ landed on pawn moves.
- Even when reducing $\alpha$ from $0.20$ to $0.07$ to sharpen noise spikes, the noise concentration still fell overwhelmingly onto walls.

### B. Unmasked Temperature Sampling in Early Plies
In `run_actor.py`, early moves used a continuous temperature decay schedule ($\tau = \max(0.1, 1.0 - \text{move} / 20.0)$) without visit count pruning.
- When Dirichlet noise randomly spiked an irrational opening wall, MCTS allocated 1 or 2 visits to that wall.
- Sampling proportionally from visit counts with $\tau \approx 1.0$ frequently picked these low-visit noise actions.
- As Player 1 repeatedly executed Move 1 wall drops and lost, those trajectories were written to the replay buffer. Over 200 epochs, early-ply buffer entries became saturated with Move 1 wall states, reinforcing the bias during supervised policy training.

### C. Learning Rate Floor Stagnation
The training pipeline used cosine annealing from $\text{lr} = 1.5 \times 10^{-4}$ down to $\eta_{\min} = 1.0 \times 10^{-5}$ across 200 epochs. By Epoch 200, the learning rate had reached the floor of $1.0 \times 10^{-5}$. At this magnitude, gradient updates were insufficient to overcome the entrenched policy prior weights without an explicit schedule reset.

### D. MCTS Root Selection Without PROVEN_WIN Pre-Check
In `cpp/mcts.cpp`, the search engine correctly backed up terminal states and race-solver resolutions via `proven_status` flags (`PROVEN_WIN` / `PROVEN_LOSS`). However:
- During root child selection, PUCT and KataGo forced playout logic did not check whether a child was already flagged as `PROVEN_WIN`. Search simulations continued to be distributed across other unproven actions.
- In result extraction, visit distributions were constructed strictly from raw or pruned visit counts. If a winning jump had received only a fraction of visits due to low initial prior or forced playouts on other moves, it was not assigned the maximum visit count, causing Puzzle 2 to fail.

### E. Flawed Contact Count in Slatton's Tier 2 Wall Legality Check
In `cpp/quoridor_simulator.cpp` and `js/engine.js`, wall placement validation implemented Slatton's 2-contact rule: a wall cannot trap a player unless it touches at least two boundaries or existing walls.
- In `count_wall_contacts`, corner checks collapsed multiple incident contacts into single boolean flags. When a wall touched both an outer board boundary and an existing perpendicular wall at a shared endpoint, the routine undercounted contacts as 1 instead of 2.
- `validate_wall_placement` bypassed full BFS validation whenever `contacts < 2`. Because the contact count was underreported, illegal enclosing walls bypassed BFS verification and were accepted as legal.

---

## 3. Implemented Remediations: What We Changed

### A. Simulator Wall Trapping Elimination
- **Files Modified**: [cpp/quoridor_simulator.cpp](cpp/quoridor_simulator.cpp), [js/engine.js](js/engine.js), [verify_simulator.py](verify_simulator.py)
- **Changes**:
  - Removed the `count_wall_contacts < 2` BFS bypass completely from `validate_wall_placement`, `validate_wall_placement_cached`, `validateWallPlacement`, and `validateWallPlacementFast`.
  - When Tier 2a (boundary check) does not pass, the simulator now unconditionally executes full BFS shortest-path connectivity checks for both players.
  - Added a dedicated regression test (`verify_wall_trapping_prevention`) in `verify_simulator.py` reproducing the exact board state and verifying that trapping wall placements are strictly rejected.

### B. Class-Stratified Root Dirichlet Noise
- **File Modified**: [cpp/mcts.cpp](cpp/mcts.cpp)
- **Changes**:
  - Replaced uniform Dirichlet noise at the root node (sim 0, non-Gumbel) with class-stratified noise:
    - Pawn moves (indices 0–11) are assigned noise from $\text{Dir}(\alpha_{\text{pawn}} = 0.5)$.
    - Wall moves (indices 12–139) are assigned noise from $\text{Dir}(\alpha_{\text{wall}} = 0.07)$.
  - The $\epsilon = 0.15$ noise budget is split equally: $50\%$ to legal pawn moves and $50\%$ to legal wall moves.
  - Priors are renormalized across all legal children after noise injection:
    $$P'(s, a) = (1 - \epsilon) P(s, a) + (\epsilon \cdot 0.5) \eta_{\text{class}}(a)$$
  - This guarantees that opening pawn moves receive equal exploratory pressure on Move 1, counteracting the 128-to-3 action space imbalance.

### C. MCTS Root PROVEN_WIN Short-Circuit & Target Assignment
- **File Modified**: [cpp/mcts.cpp](cpp/mcts.cpp)
- **Changes**:
  - **Root Selection Pre-Check**: Before PUCT or forced playouts execute, MCTS scans all root children. If any child has `proven_status == ProvenStatus::PROVEN_WIN`, it is unconditionally selected.
  - **Result Extraction Override**: After the simulation loop, if any root child is marked `PROVEN_WIN`, all visits (`num_simulations`) are assigned to that action, non-winning actions are zeroed, and `root_q_values` is set to $1.0$.

### D. Masked Graduated Temperature Schedule
- **File Modified**: [run_actor.py](run_actor.py)
- **Changes**:
  - Replaced the continuous decay schedule with a 3-tier graduated schedule:
    - Plies 0–5: $\tau = 0.8$
    - Plies 6–16: $\tau = 0.4$
    - Plies 17+: $\tau = 0.0$ (deterministic $\arg\max$)
  - **Visit Threshold Masking**: Prior to sampling with temperature $\tau > 0$, any action with visit count below $25\%$ of the maximum child visit count ($N(a) < 0.25 \times \max_b N(b)$) is masked to zero. This completely prevents 1-visit noise walls from being selected during self-play.

### E. Replay Buffer Opening Purge
- **File Created**: [purge_opening_plies.py](purge_opening_plies.py)
- **Execution**:
  - Deleted `C:\quoridor_data\epoch_001` through `epoch_170` entirely (170 epoch directories removed).
  - For `epoch_171` through `epoch_190`, processed each `.pt` batch file and stripped out positions from plies 0–3, eliminating the entrenched Move 1 wall records.
  - Retained `epoch_191` through `epoch_200` to preserve recent midgame and endgame representations while clearing the opening bias.

### F. Pipeline Restart with Learning Rate Reset
- **Files Modified**: [start_training.py](start_training.py), [train_alphazero.py](train_alphazero.py)
- **Changes**:
  - Added the `--reset_lr` command-line argument to `start_training.py`, forwarding the flag to `train_alphazero.py`.
  - Configured total epochs to 400.
  - Reset optimizer learning rate to $\text{lr} = 1.5 \times 10^{-4}$ with a 200-epoch cosine annealing cycle scheduled across Epochs 201–400.

---

## 4. Verification and Recompilation Summary

| Component | Status | Details |
|---|---|---|
| C++ Extension (`quoridor_cpp`) | Recompiled | Built via MSVC 14.51 (`setup_cpp.py build_ext --inplace`) |
| Simulator Integrity | Passed | `verify_simulator.py` passed all 1,000 random steps and wall trapping tests |
| Solver & Channel 10 | Passed | `verify_solver.py` passed all race and parity checks |
| Replay Buffer Purge | Completed | 170 epochs purged, 20 epochs filtered |
| Training Status | Active | Launched for Epochs 201–400 with `--reset_lr --windows` |

---

## 5. Acceptance Benchmarks for Epoch 210

At Epoch 210 (10 epochs after remediation launch), the model should be evaluated against the following criteria:

1. **Opening Pawn Prior Mass**: Initial state pawn move probability should exceed $40\%$ (up from $13\%$).
2. **Player 1 Win Rate**: In checkpoint arena matches, Player 1 win rate should recover to at least $35\%$ (up from $0\%$).
3. **Tactical Benchmark Suite**: Tactical puzzle score should achieve at least $5/6$ ($83.3\%$), with Puzzle 2 passing.
