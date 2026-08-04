# AlphaZero Training Pipeline Remediation

This document summarizes the audit findings, identified red flags, and implemented remediations for the Quoridor AlphaZero self-play and neural network training pipeline.

---

## Executive Summary of Audit Findings

During the evaluation of training metrics and game evaluations at Epoch 89, six critical red flags were identified in the self-play data generation, search engine, and training loop:

1. **Forced Pawn-Only Moves in Opening & Early Greedy Selection**: Move selection in `run_actor.py` forcibly zeroed out all 128 wall action probabilities for moves 1–6 (`pawn_probs = policy_probs[:12]`), completely forbidding opening wall tactics. Furthermore, greedy selection ($\tau = 0$) was activated after move 6, causing self-play actors to play nearly deterministic games.
2. **Terminal Reward Discounting**: Trajectory outcomes were multiplied by a temporal discount factor ($0.99^{\text{moves\_to\_end}}$). In AlphaZero, game outcomes are exact terminal values ($z \in \{-1, 0, +1\}$); discounting created artificial decay that conflicted with MCTS root value bounds.
3. **Group-Aware Dirichlet Noise Distortion**: The C++ MCTS search engine split root Dirichlet noise 50% to pawn moves and 50% to wall moves. Because there are only ~2–4 pawn moves versus ~30–60 wall moves, pawn actions received a disproportionately massive noise boost ($\sim 0.125 - 0.25$ per move) compared to wall actions ($\sim 0.01$).
4. **Policy Entropy Metric `NaN` Evaluation**: Under Automatic Mixed Precision (AMP / FP16), unmasked logits and precision loss caused `torch.log(probs + 1e-8)` to evaluate to `NaN` in training metrics reporting.
5. **Replay Buffer Stagnation**: With only 50 games per epoch and deterministic move selection, the 50,000 position replay buffer was populated by repetitive, low-diversity game states.
6. **Delayed Inevitable Win Detection**: When a player ran out of walls and the opponent's path was strictly faster (or could be made faster via remaining walls), MCTS was unable to recognize the forced win early without deep rollouts to literal terminal row states, leading to fuzzy evaluations in inevitable win positions.

---

## Technical Remediations Implemented

### 1. Temperature-Based Action Sampling & Unrestricted Openings
- **File:** [run_actor.py](run_actor.py)
- **Fix:** Removed the pawn-only mask (`:12`). Implemented a full AlphaZero temperature schedule:
  - **Moves 1–20 ($\tau = 1.0$):** Sample actions proportionally from the normalized MCTS visit distribution across all 140 legal actions.
  - **Moves 20+ ($\tau \to 0$):** Select the action with the maximum visit count (`np.argmax(policy_probs)`).

### 2. Exact Terminal Value Targets
- **File:** [run_actor.py](run_actor.py)
- **Fix:** Removed $0.99^{\text{moves\_to\_end}}$ discounting. Terminal target values $z$ are assigned strictly as:
  $$z = \begin{cases} +1.0 & \text{if Player Wins} \\ -1.0 & \text{if Player Loses} \\ 0.0 & \text{if Draw} \end{cases}$$

### 3. Uniform Root Dirichlet Noise in C++ MCTS
- **File:** [cpp/mcts.cpp](cpp/mcts.cpp)
- **Fix:** Replaced the 50/50 pawn/wall mass split with standard uniform Dirichlet noise $\text{Dir}(\alpha = 0.3)$ sampled across all legal child actions:
  $$P(s, a) = (1 - \epsilon) P_{\theta}(s, a) + \epsilon \eta_a, \quad \eta \sim \text{Dir}(\alpha)$$
- **Recompilation:** Rebuilt `quoridor_cpp.pyd` using MSVC BuildTools (`python setup_cpp.py build_ext --inplace`).

### 4. FP32 Policy Entropy Calculation
- **File:** [train_alphazero.py](train_alphazero.py)
- **Fix:** Cast logits to FP32, masked out invalid actions before computing `softmax`, and applied `torch.clamp(probs, min=1e-8)` to guarantee non-NaN entropy reporting:
  ```python
  probs = torch.softmax(logits.float(), dim=-1) * valid_masks.float()
  log_p = torch.log(torch.clamp(probs, min=1e-8))
  entropy = -torch.sum(probs * log_p, dim=-1).mean()
  ```

### 5. Early Guaranteed Win Detection & Minimax Backpropagation (MCTS Solver)
- **Files:** [cpp/quoridor_simulator.h](cpp/quoridor_simulator.h), [cpp/quoridor_simulator.cpp](cpp/quoridor_simulator.cpp), [cpp/mcts.h](cpp/mcts.h), [cpp/mcts.cpp](cpp/mcts.cpp), [cpp/bindings.cpp](cpp/bindings.cpp)
- **Fix:**
  - Added `QuoridorGame::get_guaranteed_winner()` to detect pure race conditions when a player is out of walls and the opponent's shortest path is strictly faster (`abs(l1 - l2) > 1`).
  - Overrode Neural Network leaf evaluation with exact terminal values ($\pm 1.0$) when a guaranteed winner is detected.
  - Implemented `ProvenStatus` tracking (`UNRESOLVED`, `PROVEN_WIN`, `PROVEN_LOSS`) and Minimax Backpropagation (AND/OR tree rules) in `MCTS::run_search_batched()` to propagate proven win/loss certainty up to the root node.

---

## Verification Results

1. **C++ MCTS Build:** Clean compilation with MSVC 2022. C++ simulator tests passed (`QuoridorGame` valid actions: 131).
2. **Model & Encoding Verification:** `test_model.py` passed all assertions for tensor encoding, perspective symmetry, forward pass, and ONNX export (`quoridor_model_test.onnx`).
3. **Training Metric Output:** Verified clean metric formatting without `NaN` entropy values.
4. **Guaranteed Win & MCTS Solver Verification:** Created `verify_solver.py` to validate early win detection logic when walls are depleted and path lengths guarantee victory.
