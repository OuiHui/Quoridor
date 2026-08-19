---
name: evaluate_model
description: Evaluate a trained Quoridor AlphaZero model using a 4-tier benchmark framework (Tactical Puzzle Suite, Checkpoint-vs-Checkpoint Arena, Minimax Bot, and Trajectory Auditing).
---

# Evaluate Model Skill

Use this skill whenever evaluating, benchmarking, or diagnosing the playing strength, policy health, or tactical competency of a trained Quoridor AlphaZero model.

The framework is organized into 4 evaluation tiers:

1. **Tier 1: Tactical & Representation Health Suite** (Fast 10s diagnostic)
2. **Tier 2: Checkpoint-vs-Checkpoint Tournament Arena** (AlphaZero standard for monotonic progress)
3. **Tier 3: Heuristic Minimax Bot Match** (Baseline sanity check across depths)
4. **Tier 4: Training & Self-Play Trajectory Auditing** (Game length, wall timing, entropy)

---

## 1. Quick Diagnostic Check (Tier 1)

Before launching full match play, run the automated tactical puzzle and representation health suite. This verifies that the policy and value heads have not collapsed or developed wall bias:

```bash
python eval_suite.py tactics --model quoridor_model.onnx --sims 400
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
python eval_suite.py arena \
  --model_a quoridor_model_epoch_400.onnx \
  --model_b quoridor_model_epoch_399.onnx \
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
python eval_suite.py bot \
  --model quoridor_model.onnx \
  --depth 2 \
  --games 20 \
  --sims 800
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
python eval_suite.py full \
  --model quoridor_model.onnx \
  --baseline quoridor_model_epoch_399.onnx \
  --sims 400
```

---

## 5. Diagnostic Decision Tree & Remediation Guide

When evaluation reveals substandard metrics, consult the mapping below for codebase remedies:

### Symptom A: Policy Prior Dominated by Wall Placements (>60% Wall Mass in Opening)
- **Cause**: Dirichlet exploration noise spreading uniformly across 128 wall actions during self-play.
- **Fix**: Reduce `dirichlet_alpha` from `0.30` to `0.07` in [cpp/mcts.h](file:///c:/Users/Huy%20Nguyen/OneDrive%20-%20Georgia%20Institute%20of%20Technology/Quoridor/cpp/mcts.h) and ensure `TEMP_THRESHOLD` in [run_actor.py](file:///c:/Users/Huy%20Nguyen/OneDrive%20-%20Georgia%20Institute%20of%20Technology/Quoridor/run_actor.py) is `<= 6`.

### Symptom B: High Draw Rate (>15% 3-Fold Repetition Draws)
- **Cause**: MCTS cycling between two equivalent states without committing to forward pawn advances.
- **Fix**: Increase the repetition penalty factor in MCTS search (`adjusted_visits[idx] *= 0.01` for visited states).

### Symptom C: High Cosine Similarity (>0.85 Across Distinct States)
- **Cause**: Policy head over-generalizing from an outdated or wall-heavy replay buffer.
- **Fix**: Purge dataset files (`C:\quoridor_data`), reset checkpoint weights, and restart training with higher MCTS simulations per move (`--simulations 800`).

### Symptom D: Blundering Immediate Opponent Win
- **Cause**: Insufficient simulation count to resolve urgent defensive moves in branch trees.
- **Fix**: Increase search simulations in self-play (`--simulations 800` or `1200`) in [train_alphazero.py](file:///c:/Users/Huy%20Nguyen/OneDrive%20-%20Georgia%20Institute%20of%20Technology/Quoridor/train_alphazero.py).
