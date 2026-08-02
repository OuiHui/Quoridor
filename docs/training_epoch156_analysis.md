# Quoridor AlphaZero Training Analysis & Model Evaluation (Epochs 1–156)

**Date**: August 2026  
**Status**: Completed Pre-Restart Investigation & Diagnosis  
**Artifact Directory**: `c:\Users\Huy Nguyen\OneDrive - Georgia Institute of Technology\Quoridor`

---

## 1. Executive Summary

This document summarizes our quantitative analysis of the Epoch 1–156 AlphaZero training dataset and neural network checkpoint (`quoridor_checkpoint.pth`). 

While earlier structural fixes (such as the $Q=0.0$ unvisited node fix in C++ MCTS) successfully eliminated win-rate asymmetries and model collapse, empirical evaluation reveals that the agent **relapsed into the "Wall-Spam" local minimum**. Self-play games across Epochs 11–156 exhibit wall placements on Turn 1/2 in almost 100% of games, and the policy head has converged to a static distribution with **0.9701 pairwise cosine similarity** across distinct board states.

Before starting the next training run from scratch, we have identified the root causes and specified required architectural, sampling, and pipeline modifications.

---

## 2. Empirical Findings & Data Quality Metrics

We sampled and evaluated game trajectories from `data/` across epochs 1 through 156.

### Quantitative Summary Across Epochs

| Epoch | N Games | P1 Win % | P2 Win % | Draw % | Avg Moves | 1st Wall Turn | Wall Action Ratio | P1 Walls Used | P2 Walls Used | Policy Entropy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Epoch 001** | 10 | 0.0% | 0.0% | 100.0% | 46.9 | **46.9** | **0.00%** | 0.0 | 0.0 | 3.374 |
| **Epoch 011** | 10 | 40.0% | 60.0% | 0.0% | 45.2 | **0.0** | **45.09%** | 10.4 | 9.9 | 1.324 |
| **Epoch 041** | 10 | 60.0% | 40.0% | 0.0% | 48.4 | **0.0** | **41.51%** | 10.3 | 9.7 | 1.180 |
| **Epoch 081** | 10 | 30.0% | 70.0% | 0.0% | 48.5 | **1.4** | **38.09%** | 8.8 | 9.6 | 1.406 |
| **Epoch 121** | 10 | 40.0% | 60.0% | 0.0% | 54.2 | **2.5** | **35.21%** | 9.1 | 9.8 | 1.308 |
| **Epoch 156** | 10 | 80.0% | 20.0% | 0.0% | 44.4 | **1.9** | **42.89%** | 9.5 | 9.5 | 1.542 |
| **Healthy Target** | — | ~50% | ~50% | < 5% | < 60 | **> 10.0** | **< 15.0%** | < 6.0 | < 6.0 | > 1.500 |

### Key Data Insights:
1. **P1 vs. P2 Balance (FIXED)**: Win distribution between Player 1 and Player 2 is balanced around ~50/50. The previous 100% P1 win asymmetry (caused by the unvisited node $Q=0.0$ bug) is completely resolved.
2. **0% Draw Rate (FIXED)**: Games reach decisive wins with zero draws (unlike the Epoch 95 collapse where draw rate reached 93.75%).
3. **Wall-Spam Recurrence (RED FLAG)**: `1stWallMove` collapsed to Turn 0–2 starting at Epoch 11 and remained there through Epoch 156. Both players consume ~9.5 to 10.4 walls per game, and wall actions comprise over 40% of all moves played.

---

## 3. Model Quality & Checkpoint Evaluation

We evaluated the Epoch 156 checkpoint (`quoridor_checkpoint.pth`, 3,029,833 parameters) across value and policy heads:

### Parameter Health
* **Total Parameters**: 3,029,833
* **Zero Parameters**: 1 (0.00%)
* **NaN / Inf Parameters**: 0 (0.00%)

### Value Head Performance (PASS)
* **Starting Board (P1 Turn)**: `-0.0652` (Balanced)
* **Starting Board (P2 Turn)**: `+0.0253` (Balanced)
* **Path Advantage (Active player 1 step to goal, opponent 7 steps away)**: `+0.5346` (Correctly positive)
* **Path Disadvantage (Active player 7 steps away, opponent 1 step away)**: `-0.1745` (Correctly negative)

### Policy Head Performance (FAIL — Over-Generalization)
* **Pairwise Logit Cosine Similarity**: **`0.9701`** across 50 distinct random positions (std `0.0100`).
* **Top-1 Action Distribution**: 98% of top-1 predictions across distinct states were restricted to actions `0`, `4`, and `8` (Pawn North / Jump North).
* **Mass Distribution**: Pawn actions receive `62.9%` average mass; wall actions receive `37.1%` average mass.

> [!WARNING]
> **Cosine Similarity of 0.9701 indicates policy network over-generalization.** The network learned a generic prior vector that predicts the dataset average policy regardless of pawn or wall positions on the board.

---

## 4. Root Cause Analysis

```
       Shallow MCTS / Dirichlet Noise across 128 Wall Actions
                               ↓
Cumulative Wall Mass in Target Policy = ~40% (even when Argmax = Action 0)
                               ↓
 Stochastic Sampling during TEMP_THRESHOLD (first 6 moves) selects Wall
                               ↓
    Self-Play Trajectories pollute Replay Buffer with Turn 1/2 Walls
                               ↓
   Neural Network Policy Head learns Generic Bias (Cos Sim = 0.9701)
```

1. **`TEMP_THRESHOLD` Stochastic Sampling Leak**:
   In `run_actor.py`, `TEMP_THRESHOLD = 6` uses `np.random.choice(140, p=policy_probs)` for the first 6 moves. Even though MCTS evaluates Action 0 (Pawn North) as the highest individual action, the cumulative probability mass of the 128 wall actions is ~40%. Stochastic sampling picks a wall move in ~40% of turns during the opening, forcing wall placements on Turn 1/2 in nearly every game.
2. **Channel 10 Non-Perspective Scalar**:
   Channel 10 (`is_p1_turn`) inputs absolute turn identity into scalar features. Since state tensors are already rotated 180° into the active player's perspective, passing absolute player identity breaks strict perspective symmetry.
3. **Replay Buffer Contamination**:
   The 50,000-position replay buffer retained historical wall-spam self-play data, reinforcing the generic policy bias.

---

## 5. Required Changes Before Next Training Run

| Component | File | Proposed Fix | Rationale |
| :--- | :--- | :--- | :--- |
| **Actor Sampling** | [run_actor.py](file:///c:/Users/Huy%20Nguyen/OneDrive%20-%20Georgia%20Institute%20of%20Technology/Quoridor/run_actor.py#L161-L167) | Set `TEMP_THRESHOLD = 0` (or sample stochastically *only within pawn actions*) | Prevents cumulative wall mass (~40%) from triggering wall placements during opening turns. |
| **Model Encoding** | [quoridor_model.py](file:///c:/Users/Huy%20Nguyen/OneDrive%20-%20Georgia%20Institute%20of%20Technology/Quoridor/quoridor_model.py#L54) | Remove Channel 10 (`is_p1_turn`) from `scalars` (5 → 4 features) | Enforces strict perspective symmetry across active players. |
| **MCTS Noise** | [cpp/mcts.cpp](file:///c:/Users/Huy%20Nguyen/OneDrive%20-%20Georgia%20Institute%20of%20Technology/Quoridor/cpp/mcts.cpp#L70) | Reduce Dirichlet noise weight `dirichlet_eps` from `0.25` to `0.15` | Preserves neural network pawn priors at root nodes. |
| **Data & Checkpoint** | Workspace Root | Clear `data/` directory & reset `quoridor_checkpoint.pth` | Purges 156 epochs of wall-spam targets and resets network weights for clean training. |

---
