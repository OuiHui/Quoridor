---
name: evaluate_model
description: Evaluate a trained Quoridor AlphaZero model using a 4-tier benchmark framework (Pre-Flight Sync, Tactical & Opening Health Suite, Checkpoint Arena, Minimax Bot, and Self-Play Trajectory Auditing).
---

# Evaluate Model Skill

Use this skill whenever evaluating, benchmarking, or diagnosing the playing strength, policy health, or training stability of a Quoridor AlphaZero model.

The framework is organized into a Pre-Flight Sync check followed by 4 evaluation tiers:

0. **Pre-Flight: Checkpoint, ONNX & Replay Buffer Synchronization**
1. **Tier 1: Tactical, Representation & Opening Ply 0/1 Health Suite** (Fast 10s diagnostic)
2. **Tier 2: Checkpoint-vs-Checkpoint Tournament Arena** (Monotonic Elo & P1/P2 color balance)
3. **Tier 3: Heuristic Minimax Bot Match** (Baseline tactical sanity check across depths)
4. **Tier 4: Training State & Self-Play Trajectory Auditing** (Loss curves, entropy, LR floor, buffer drift)

---

## 0. Pre-Flight Synchronization Check

Before running any benchmark, verify that the evaluated `.onnx` file matches the latest PyTorch checkpoint and check whether background self-play actors are running or out of sync:

1. **Verify Checkpoint vs. ONNX Sync**:
   - Inspect the epoch number and modification timestamps of `quoridor_checkpoint.pth`, `quoridor_model.onnx`, and `public/quoridor_model.onnx`.
   - If `quoridor_checkpoint.pth` is newer than `public/quoridor_model.onnx`, export the latest weights first (`python scripts/deploy_model.py`).
2. **Check Pipeline & Buffer Alignment**:
   - Compare the checkpoint epoch in `quoridor_checkpoint.pth` (or `public/training_state.json`) against the latest `epoch_XXX` folder in `C:\quoridor_data`.
   - **Red Flag (Off-Policy Buffer Drift)**: If `C:\quoridor_data` is more than 5 epochs ahead of the learner checkpoint, orphaned `run_actor.py` processes have been generating duplicate off-policy data with a frozen model. Flag this immediately.

---

## 1. Quick Diagnostic Check (Tier 1)

Run the automated tactical puzzle and representation health suite first:

```bash
python eval/eval_suite.py tactics --model public/quoridor_model.onnx --sims 400
```

### Health Metrics & Thresholds

| Metric | Target Range | Red Flag Threshold | Diagnosis |
| :--- | :--- | :--- | :--- |
| **Tactical Puzzles Score** | `>= 80%` | `< 60%` | Tactical blindness or weak MCTS depth |
| **Opening Pawn Policy Mass** | `> 40.0%` | `< 25.0%` | Wall policy bias / Dirichlet noise distortion |
| **Representation Cosine Sim** | `0.20 - 0.70` | `> 0.85` | Policy over-generalization or network collapse |
| **Initial Value Symmetry Error** | `< 0.15` | `> 0.30` | Asymmetric value head bias |

---

## 2. Checkpoint-vs-Checkpoint Arena (Tier 2)

The primary method for measuring genuine reinforcement learning progress is pitting the current checkpoint directly against an earlier historical checkpoint:

```bash
python eval/eval_suite.py arena \
  --model_a public/quoridor_model.onnx \
  --model_b checkpoint_backup/quoridor_model_epoch_XXX.onnx \
  --games 20 \
  --sims 800
```

### Interpreting Elo & Win Rates

- **> 55% Win Rate ($\Delta\text{Elo} > +35$)**: Clear, genuine progress. Model A is stronger.
- **45% – 55% Win Rate ($\Delta\text{Elo} \approx 0$)**: Plateau or training stagnation. Consider adjusting learning rate or exploring deeper simulations.
- **< 45% Win Rate ($\Delta\text{Elo} < -35$)**: Regression. Check for replay buffer contamination or over-fitting.

---

## 3. Bot Arena Match (Tier 3)

Use Minimax matches to confirm the model beats basic human heuristics:

```bash
python eval/eval_suite.py bot \
  --model public/quoridor_model.onnx \
  --depth 2 \
  --games 10 \
  --sims 400
```

To stress-test against deeper lookahead, increase `--depth 3` or `--depth 4`.

### Assessment Bands (Minimax Depth 2)

- **> 75% Win Rate**: Dominant against basic heuristics.
- **55% – 75% Win Rate**: Strong tactical competency.
- **30% – 55% Win Rate**: Competitive but inconsistent.
- **< 30% Win Rate**: Weak; model is missing basic defensive or pathing moves.

---

## 4. Full Comprehensive Audit (Tier 1 + 2 + 3)

To generate an end-to-end evaluation report in a single command:

```bash
python eval/eval_suite.py full \
  --model public/quoridor_model.onnx \
  --baseline checkpoint_backup/quoridor_model_epoch_XXX.onnx \
  --sims 400
```

---

## 5. Diagnostic Decision Tree & Remediation Guide

When evaluation reveals substandard metrics, consult the mapping below for codebase remedies:

### Symptom A: Policy Prior Dominated by Wall Placements (>60% Wall Mass in Opening)
- **Cause**: Dirichlet exploration noise spreading uniformly across 128 wall actions during self-play.
- **Fix**: Reduce `dirichlet_alpha` from `0.30` to `0.07` in [cpp/mcts.h](../../../cpp/mcts.h) and ensure `TEMP_THRESHOLD` in [run_actor.py](../../../run_actor.py) is `<= 6`.

### Symptom B: High Draw Rate (>15% 3-Fold Repetition Draws)
- **Cause**: MCTS cycling between two equivalent states without committing to forward pawn advances.
- **Fix**: Increase the repetition penalty factor in MCTS search (`adjusted_visits[idx] *= 0.01` for visited states).

### Symptom C: High Cosine Similarity (>0.85 Across Distinct States)
- **Cause**: Policy head over-generalizing from an outdated or wall-heavy replay buffer.
- **Fix**: Purge dataset files (`C:\quoridor_data`), reset checkpoint weights, and restart training with higher MCTS simulations per move (`--simulations 800`).

### Symptom D: Blundering Immediate Opponent Win
- **Cause**: Insufficient simulation count to resolve urgent defensive moves in branch trees.
- **Fix**: Increase search simulations in self-play (`--simulations 800` or `1200`) in [train_alphazero.py](../../../train_alphazero.py).
