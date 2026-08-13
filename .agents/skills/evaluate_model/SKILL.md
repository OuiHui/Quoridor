---
name: evaluate_model
description: Evaluate a trained Quoridor AlphaZero model by battling it against the minimax bot and reporting win rates, checkpoint metadata, and performance analysis.
---

# Evaluate Model Skill

Use this skill whenever the user asks to evaluate, benchmark, or measure the strength of a trained Quoridor model. It runs a head-to-head battle between the AlphaZero MCTS agent and the heuristic minimax bot and interprets the results.

## Workflow

### 1. Inspect Checkpoint Metadata

Run the following to check which epoch the checkpoint is from and confirm it loaded correctly:

```bash
python -c "
import torch
ckpt = torch.load('quoridor_checkpoint.pth', map_location='cpu', weights_only=False)
print('Epoch:', ckpt.get('epoch', 'unknown'))
print('Keys:', list(ckpt.keys()))
"
```

Identify:
- The epoch number (indicator of how long training ran)
- Whether scheduler/optimizer states are present (confirms it is a mid-training or final checkpoint)

### 2. Run the Battle

Execute a head-to-head match between AlphaZero MCTS and the minimax bot. Use the ONNX model (significantly faster than PyTorch on CPU):

```bash
python play_vs_minimax.py \
  --onnx quoridor_model.onnx \
  --checkpoint quoridor_checkpoint.pth \
  --simulations 800 \
  --depth 2 \
  --games 20
```

**Key Parameters:**
| Flag | Default | Notes |
|---|---|---|
| `--onnx` | `quoridor_model.onnx` | ONNX model path. 3-5x faster than PyTorch on CPU. |
| `--simulations` | 800 | MCTS simulations per move. Use at least 400 for meaningful play. |
| `--depth` | 2 | Minimax alpha-beta search depth. Depth 2 is a reasonable baseline. |
| `--games` | 10 | Number of games. Use 20+ for statistically meaningful results. |
| `--checkpoint` | `quoridor_checkpoint.pth` | Only used to read epoch number when ONNX is provided. |
| `--visualize` | off | Add `-v` to print boards step-by-step for debugging. |

Games automatically alternate sides (even games: AZ=P1, odd: AZ=P2), ensuring the result is not biased by which side moves first.

> [!IMPORTANT]
> Minimax vs. AlphaZero is a **sanity check**, not a primary evaluation. See the section below on checkpoint-vs-checkpoint for meaningful strength measurement.

### 3. Interpret the Minimax Sanity Check

Minimax is a **baseline sanity check** — not the primary strength metric. Use it to confirm the model has learned basic Quoridor strategy:

| AlphaZero Win Rate | Assessment |
|---|---|
| < 30% | Model is weak; likely needs more training or more simulations |
| 30-55% | Competitive but not dominant |
| 55-75% | Strong performance; likely well-trained |
| > 75% | Very strong; clearly surpasses depth-2 minimax |

Note that even a fully deterministic model will show 50% if it wins all P1 games and loses all P2 games — always check the P1/P2 split, not just the headline number.

**Draws** typically occur from the 3-fold repetition rule. A high draw rate may indicate the model is cycling moves.

### 4. Primary Evaluation: Checkpoint vs. Checkpoint

The canonical AlphaZero evaluation is **new checkpoint vs. previous checkpoint**. This measures relative improvement rather than performance against a fixed heuristic opponent.

To run checkpoint-vs-checkpoint, call `run_battle` from Python with two separate evaluators:

```python
import quoridor_cpp, numpy as np
from onnx_inference import ONNXModelEvaluator
from play_vs_minimax import run_battle

# Compare epoch 366 vs epoch 346
# Load each ONNX export (produced by train_alphazero.py each epoch)
new_eval = ONNXModelEvaluator("quoridor_model_epoch_366.onnx")
old_eval = ONNXModelEvaluator("quoridor_model_epoch_346.onnx")
```

Interpretation:
- **>55% new wins**: genuine improvement — new checkpoint is stronger.
- **45-55%**: no clear progress; likely overfitting or training stagnation.
- **<45%**: regression — new checkpoint is weaker.

This is more informative than minimax because the bar rises as the model improves.

### 5. Quick Positional Sanity Check

To verify the model is producing reasonable evaluations (not returning near-zero values for every position), run `eval_json.py` with the default test state:

```bash
python eval_json.py --simulations 100
```

Check:
- `nn_value_p1` is not near 0.0 for all positions (indicates collapsed value head)
- Top MCTS actions are plausible moves, not random
- `mcts_q_p1` and `nn_value_p1` are broadly consistent in sign

### 6. Report to User

Summarize:
1. Checkpoint epoch and status
2. Final win/loss/draw record
3. Performance tier (from the guide above)
4. Any notable observations (e.g., high draw rate, P1/P2 asymmetry, quality of MCTS top moves)

---

## Improvement Recommendations

After evaluating, use the following decision tree to recommend targeted improvements. Each section maps a specific symptom to a concrete fix in this codebase.

### Continue Training

The most direct improvement is simply resuming training. The learner picks up exactly where it left off via the checkpoint:

```bash
python train_alphazero.py --epochs 500 --games_per_epoch 50 --simulations 800 --num_actors 16
```

Key notes:
- `--epochs` is the **total target epoch**, not additional epochs. To run 50 more from epoch 346, pass `--epochs 396`.
- The LR scheduler (`StepLR`, step_size=50, gamma=0.8) decays automatically based on epoch count. Do not pass `--reset_lr` unless deliberately restarting the schedule.
- The replay buffer (`--dataset_size 50000`) keeps the most recent 50k positions. Increasing it (`100000`) improves training stability at later epochs when the model is stronger.

### Improve Self-Play Quality

Self-play data quality is the single biggest lever. The actors run at `--simulations 800` by default. Higher simulations produce better-quality MCTS targets:

```bash
python train_alphazero.py --simulations 1200 --num_actors 12
```

Trade-off: more simulations per move → slower game generation → fewer games per hour. Tune to keep actors busy without bottlenecking the learner.

Check if actors are keeping up with the learner by watching the self-play progress log:
- If `cur_count/games_per_epoch` reaches the target quickly, actors are fast and you can increase `--simulations` or `--games_per_epoch`.
- If the learner waits a long time for games, actors are the bottleneck — reduce `--simulations` or add more `--num_actors`.

### Fix High Draw Rate

If the evaluation shows >20% draws, the 3-fold repetition rule in `play_vs_minimax.py` is triggering frequently. This can indicate the model is cycling moves instead of committing to a plan. In `run_actor.py`, the repetition penalty is applied during self-play (`adjusted_visits[idx] *= 0.1` for states seen once). If draws persist:

- Verify actors are loading and applying the repetition penalty (lines ~200–220 of `play_vs_minimax.py`).
- Consider increasing the downweight factor for repeated states from `0.1` to `0.01` during evaluation games.

### Tune Hyperparameters

The current configuration (from `train_alphazero.py`):
| Parameter | Current Value | Effect |
|---|---|---|
| `lr` | 0.0003 | Base learning rate; scheduler decays this by 0.8 every 50 epochs |
| `batch_size` | 512 | Larger batches are more stable but need more GPU memory |
| `weight_decay` | 1e-4 | L2 regularization on model weights |
| `c_puct` | 1.4 | MCTS exploration constant; higher = more exploration |
| `dirichlet_alpha` | 0.07 | Noise added to root node during self-play; higher = more varied openings |

To try with a fresh LR schedule (e.g., after adding architecture changes):
```bash
python train_alphazero.py --epochs 500 --reset_lr --lr 0.0001
```

### Scale Up the Model Architecture

Current architecture (`quoridor_model.py`): **15 residual blocks, 128 channels**, with SE-attention and a 3-head output (policy, value, auxiliary path prediction).

To test a larger model, change these defaults in `train_alphazero.py` line 207:
```python
# Current
model_gpu = QuoridorNet(num_residual_blocks=15, channels=128)

# Larger variant
model_gpu = QuoridorNet(num_residual_blocks=20, channels=192)
```

Note: changing architecture requires starting from scratch (existing checkpoint weights will not match). Use `strict=False` loading already in place, but expect the first ~50 epochs to be noisy.

### Diagnose with Positional Evaluation

If win rate is low but it is unclear why, run `eval_json.py` on opening, midgame, and endgame positions to check:
- **Collapsed value head**: `nn_value_p1` near 0.0 for all positions → value loss did not converge; try lower LR.
- **Random policy**: MCTS top action has < 20% of visits → policy head not learning; check Dirichlet noise and entropy loss.
- **Consistent sign mismatch** between `nn_value_p1` and `mcts_q_p1` → value head lagging behind MCTS; more self-play epochs needed.
- **Auxiliary head divergence**: if `avg_abs_mcts_eval` from training logs stays near 0.5, the path prediction head is not learning path lengths correctly, which degrades the value head's inputs.
