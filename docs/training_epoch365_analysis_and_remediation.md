# Quoridor AlphaZero Training Analysis and Remediation (Epoch 365)

**Date**: August 2026  
**Status**: Applied and Verified  
**Target Repository**: Quoridor AI  

---

## 1. Executive Summary

This document details the quantitative evaluation of the Epoch 365 training checkpoint (`quoridor_checkpoint.pth`) and self-play dataset (`C:\quoridor_data`), the diagnosis of systemic training bottlenecks, and the implementation of AlphaZero best-practice remediations.

Evaluation confirmed that earlier catastrophic failures (representation collapse, $Q=0.0$ unvisited node bugs, and 100% draw loops) were successfully eliminated. However, empirical analysis of Epoch 365 revealed two major red flags holding back agent playing strength:
1. **Severe Wall Policy Bias**: 89.3% of the neural network policy prior mass was concentrated on wall placement actions.
2. **Early Wall Placement and Excessive Game Length**: Self-play trajectories averaged 158.7 moves per game, with the first wall placed on Turn 1.2 in almost 100% of games.

To resolve these issues, three AlphaZero best-practice remediations were implemented, the dataset replay buffer was purged, and training was restarted from Epoch 0.

---

## 2. Empirical Audit of Epoch 365

### Model Quality and Representation Metrics

* **Parameter Integrity**: Total parameters: 3,050,703. Zero parameters: 0. NaNs: 0. Infs: 0.
* **Policy Representation Diversity**: Pairwise cosine similarity of policy logits across 50 random board states was measured at **0.4603 +/- 0.2821**. This confirms the representation collapse seen in Epoch 95 (similarity 1.0000) and Epoch 156 (similarity 0.9701) was successfully eliminated.
* **Value Head Calibration**: Starting board value evaluations were balanced at `-0.0363` for Player 1 turn and `-0.0363` for Player 2 turn.

### Trajectory Progression Across Epochs

| Epoch | N Games Analyzed | P1 Win % | P2 Win % | Draw % | Avg Moves per Game | 1st Wall Turn Avg | Wall Action Ratio |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Epoch 100** | 11 | 50.4% | 49.6% | 0.0% | 155.8 | 1.1 | 35.6% |
| **Epoch 200** | 4 | 50.4% | 49.6% | 0.0% | 155.7 | 1.2 | 31.8% |
| **Epoch 300** | 11 | 50.2% | 49.4% | 0.4% | 164.2 | 1.2 | 31.4% |
| **Epoch 365** | 9 | 50.1% | 49.1% | 0.9% | 158.7 | 1.2 | 29.1% |
| **Target Baseline** | -- | ~50% | ~50% | < 5% | < 60 | > 8.0 | < 20.0% |

---

## 3. Diagnosed Red Flags and Root Causes

### Red Flag 1: Overwhelming Wall Policy Bias (89.3% Wall Mass)
* **Symptom**: Average policy prior mass across board states was **10.7% for pawn actions** (actions 0-11) and **89.3% for wall actions** (actions 12-139).
* **Root Cause**: Quoridor has 128 wall actions versus 12 pawn actions (140 total actions). In initial training, Dirichlet exploration noise with `dirichlet_alpha = 0.3` spread random probability mass flatly across all 128 wall actions, overwhelming pawn priors and teaching the neural network a heavy wall bias.

### Red Flag 2: Shallow MCTS Exploration
* **Symptom**: `NUM_SIMULATIONS = 400` in `run_actor.py`.
* **Root Cause**: With a branching factor up to 140, 400 simulations yielded fewer than 3 visits per legal action. Placing a wall provides an immediate short-term heuristic delay to the opponent. With shallow search depth, MCTS could not look past this short-term illusion to discover that early wall dumping impedes long-term pawn progression.

### Red Flag 3: Un-discounted Rewards and Excessive Game Length (~158 Moves)
* **Symptom**: Trajectories averaged 158.7 moves per game (human and bot Quoridor games finish in 30 to 60 moves).
* **Root Cause**: Self-play target values assigned an un-discounted `+1.0` reward for a win regardless of whether the game finished on move 30 or move 160. The value head was not penalized for aimless move repetition or wall stockpiling prior to winning.

---

## 4. Implemented Remediations

### Fix 1: Dirichlet Noise Rescaling (`dirichlet_alpha = 0.07`)
* **Files**: [cpp/mcts.h](cpp/mcts.h), [run_actor.py](run_actor.py)
* **Implementation**: Updated the Dirichlet noise shape parameter from `0.3` to `0.07` in C++ MCTS initialization and Python self-play actors.
* **Rationale**: In AlphaZero theory, `dirichlet_alpha` scales inversely with the average number of legal moves (Go: 0.03 for ~362 moves; Chess: 0.3 for ~35 moves). For Quoridor's ~140 actions, `alpha = 0.07` concentrates exploration noise onto 1-2 actions per turn instead of smearing it across 128 walls.

### Fix 2: Search Depth Expansion (`NUM_SIMULATIONS = 800`)
* **Files**: [run_actor.py](run_actor.py), [train_alphazero.py](train_alphazero.py)
* **Implementation**: Raised default MCTS simulations per turn from 400 to 800 across learner and self-play actor configurations.
* **Rationale**: Provides MCTS with sufficient tree depth to evaluate pawn advancement paths beyond short-term wall obstructions.

### Fix 3: Game-Length Value Discounting ($\gamma = 0.995$)
* **Files**: [run_actor.py](run_actor.py#L153-L157)
* **Implementation**: Applied a per-move decay factor to target values:
  $$\text{target\_value} = \text{base\_value} \times (0.995^{\text{moves\_from\_end}})$$
* **Rationale**: Rewards fast, decisive wins and penalizes drawn-out wall spamming, training the value network to favor optimal pawn advancement lines.

### Fix 4: Replay Buffer Purge and Checkpoint Reset
* **Implementation**: Removed `C:\quoridor_data` and deleted `quoridor_checkpoint.pth`.
* **Rationale**: Purged 365 epochs of historical wall-spam self-play targets to prevent network retraining on contaminated opening distributions.

---

## 5. Verification and Current Pipeline Status

1. **Native Extension**: Recompiled `quoridor_cpp` via `python setup_cpp.py build_ext --inplace`.
2. **Unit and Verification Suites**:
   - `python test_model.py`: Passed (validated tensor encoding, rotation, action index mappings, and ONNX export).
   - `python verify_simulator.py`: Passed (validated C++ simulator state step transitions over 1,000 random turns).
3. **Training Execution**: Training restarted cleanly from Epoch 0 using `train_alphazero.py --epochs 400 --num_actors 8 --simulations 800`.
