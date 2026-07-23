# Training Post-Mortem: Epoch 1–200 (Pre-RL Pipeline)

This document analyzes why the initial 200-epoch AlphaZero training run failed to produce a strategically capable Quoridor agent, consolidating all red flags identified during the investigation.

---

## 1. Observed Failure Mode: "Wall-Spam" Local Minimum

The agent converged to a degenerate strategy rather than learning genuine Quoridor play. Instead of using walls tactically, **both players placed walls immediately from Turn 1** until exhausting their supply, then resumed pawn movement.

### Empirical Evidence (Epoch 200)

| Metric | Value | Healthy Target |
| :--- | :--- | :--- |
| First Wall Move Index | `0.0` (Turn 1 every game) | `> 10` (pawn opening first) |
| Wall Action Ratio | `45%` of all moves | `< 20%` |
| P1 Average Walls Used | `8.7 / 10` | `< 7` |
| P2 Average Walls Used | `6.6 / 10` | `< 7` |
| Average Game Length | `91–96 moves` | `< 70` (efficient pawn racing) |

---

## 2. Root Cause: Shallow MCTS with a Wide Action Space

### The Core Problem
Quoridor has up to **140 valid actions** per turn (4–12 pawn moves + up to 128 wall placements). With `NUM_SIMULATIONS = 100`, the search tree had fewer than 1 visit per action on average.

With this budget, MCTS **could not search deep enough** to distinguish between:
- Placing a wall on Turn 1 (a marginal positional gain)
- Advancing a pawn on Turn 1 (which compounds over many turns into a path advantage)

Since wall placements produce a tiny, immediate reward (they lengthen the opponent's BFS path by 1–2 steps), shallow MCTS consistently rated them as better than pawn advances. The network learned from these shallow, wall-biased targets and reinforced the behavior in the next generation of self-play games.

This created a feedback loop:
```
Shallow MCTS (100 sims) prefers walls
      ↓
Neural network trains on wall-heavy targets
      ↓
Network prior further boosts wall move selection
      ↓
Shallow MCTS is even more wall-biased
```

---

## 3. Root Cause: Flat Dirichlet Noise Over 140 Actions

AlphaZero injects Dirichlet noise at the MCTS root node to ensure exploration. However, with standard flat noise over all 140 actions:

- **~91%** of noise mass was allocated to wall placement actions (actions 12–139)
- **~9%** of noise mass was allocated to pawn moves (actions 0–11)

This meant that on virtually every game Turn 1, MCTS was forced by exploration noise to investigate wall placements rather than pawn moves. Pawn openings were almost never meaningfully explored, preventing the agent from ever discovering that opening with a pawn advance is strategically viable.

---

## 4. Root Cause: High Temperature Threshold Polluted Opening Data

`TEMP_THRESHOLD = 30` meant that for the first **30 moves** of every self-play game, moves were sampled stochastically proportional to MCTS visit counts rather than selecting the argmax (best move). Because MCTS visit counts were wall-dominated, stochastic sampling guaranteed wall actions in the opening **even if a pawn move had the highest expected value**, compounding the data quality problem.

---

## 5. Root Cause: No Efficiency Incentive

Standard AlphaZero assigns a terminal reward of `+1.0` for winning, regardless of whether the game ended in 15 moves or 90 moves. This means:

- Wasting 10 turns placing all your walls before advancing your pawn is **penalized exactly $0$** in the reward signal.
- Fast, direct pawn wins are **not preferentially rewarded** over slow wall-maze wins.

Because the agent received identical reward for any winning strategy, it had no incentive to learn shorter, cleaner pawn-focused paths.

---

## 6. Compounding Evidence: Policy Loss / Entropy Lock

By Epoch 100–200, `Policy Loss ≈ Policy Entropy` ($D_{KL} \approx 0.02$), meaning the network had **perfectly memorized** the MCTS target distributions. The tragedy is that it was perfectly memorizing bad targets.

The MCTS search was generating broad, near-uniform distributions over 128 wall actions, and the policy network was accurately learning to output the same broad distribution. This represented a failure to differentiate strategically rather than a failure to learn.

---

## 7. Summary of Failure Causes

| Cause | Category | Impact |
| :--- | :--- | :--- |
| `NUM_SIMULATIONS = 100` across 140 actions | Search Depth | MCTS cannot evaluate long-term consequences of wall-spamming |
| Flat Dirichlet noise (91% wall, 9% pawn) | Exploration Bias | Pawn openings were never meaningfully explored |
| `TEMP_THRESHOLD = 30` | Data Quality | First 30 moves in every game were randomly wall-biased |
| No step discount (γ = 1.0) | Reward Signal | No incentive to win faster by avoiding wasted wall moves |

---

## 8. Implemented Fixes for Next Training Run

| Fix | Change Made | Expected Effect |
| :--- | :--- | :--- |
| **Increase MCTS depth** | `NUM_SIMULATIONS: 100 → 400` | MCTS can evaluate long-term pawn positioning |
| **Balanced Dirichlet noise** | Flat → Group-aware 50% pawn / 50% wall | Pawn openings explored with equal probability |
| **Lower temperature threshold** | `TEMP_THRESHOLD: 30 → 6` | Deterministic move selection kicks in early in the opening |
| **Step discount factor** | `γ = 1.0 → 0.99` per move | Fast wins yield higher training target values |

The efficacy of these fixes was validated in **Epoch 1 of the new pipeline**, where `1stWallMove` shifted from `0.0` to `53.8` and wall action ratio dropped from `45%` to `0.7%`.
