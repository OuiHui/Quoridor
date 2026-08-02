# Analysis Report: MCTS Unvisited Node Q-Value Initialization Bug

During the AlphaZero training run for the Quoridor bot, policy loss and policy entropy became stuck at **`2.01`**, and Player 1 (P1) achieved a **100% win rate** (64/64 games won by P1, 0 by P2) in Epoch 145. This report details the root cause of this behavior, its mathematical mechanism, the code changes applied to fix it, and the resolution.

---

## 1. Symptoms & Observation
- **Policy Loss ($\approx 2.0104$) and Policy Entropy ($\approx 2.0121$)** were almost exactly identical and refused to drop.
- **Value Loss ($\approx 0.0161$)** was extremely low.
- **Win Distribution**: P1 won 100% of the generated games, while P2 won 0% and no draws occurred.
- **Game Analysis**:
  - On P1's turns, the MCTS target policy was highly concentrated on a single action (entropy $\approx 0.0$, max probability = 1.0).
  - On P2's turns, the MCTS target policy was completely uniform across all valid actions (entropy $\approx 4.7$ over $\sim 99$ valid actions, max probability = 0.0101).
  - Average target policy entropy: $(0.0 + 4.7) / 2 \approx 2.35$ (accounting for the ratio of valid actions, this matches the $2.01$ loss baseline).

---

## 2. Core Cause: The Unvisited Node $Q = 0.0$ Bug
In the selection phase of Monte Carlo Tree Search (MCTS), the PUCT score for selecting the best child is:
$$u = q_{val} + c_{puct} \cdot P(s, a) \cdot \frac{\sqrt{N_{parent}}}{1 + N_{child}}$$

By default, the action-value term $q_{val}$ is computed by negating the child's estimated value (since perspectives alternate between turns):
$$q_{val} = -child.Q$$

When a child node is unvisited ($N_{child} = 0$), its value was initialized to $0.0$. However, in highly lopsided game states, evaluating an unvisited node as $0.0$ (perfectly balanced game) creates a severe structural bias:

### Scenario A: Active Player is Losing (P2's turns, State Value $\approx -0.99$)
- P2's children are P1's turns, which are evaluated as winning (Value $\approx +0.99$ to P1).
- A visited child $C_{visited}$ evaluated as winning for P1 translates to a value of $-Q_{child} = -0.99$ for P2.
- An unvisited child $C_{unvisited}$ has a value of $0.0$.
- Since $0.0 > -0.99$, **the search prefers any unvisited child over a visited one**, regardless of the policy prior.
- Consequently, P2's MCTS visits all valid children exactly once and never performs deep rollouts on any single child. This creates a uniform target policy, making **P2 play completely randomly**.

### Scenario B: Active Player is Winning (P1's turns, State Value $\approx +0.99$)
- P1's children are P2's turns, which are evaluated as losing (Value $\approx -0.99$ to P2).
- A visited child $C_{visited}$ evaluated as losing for P2 translates to a value of $-Q_{child} = +0.99$ for P1.
- An unvisited child $C_{unvisited}$ has a value of $0.0$.
- Since $+0.99 > 0.0$, **the search strongly prefers the visited child over all unvisited children**.
- Consequently, P1's MCTS immediately focuses all remaining search visits on the very first child it visits. This creates a policy target concentrated 100% on a single action.

### The Feedback Loop
P1 plays strategically while P2 plays randomly $\rightarrow$ P1 wins 100% of the games $\rightarrow$ the model learns to evaluate states solely based on the turn indicator (channel 10) $\rightarrow$ evaluations become more extreme $\rightarrow$ MCTS becomes more broken.

---

## 3. Applied Solution & Diffs
To fix this, unvisited children must inherit the parent's current Q-value ($node.Q$) instead of $0.0$. This ensures they start on equal footing.

### C++ MCTS Selection Fix
In [cpp/mcts.cpp](file:///c:/Users/Huy%20Nguyen%20-%20Georgia%20Institute%20of%20Technology/Quoridor/cpp/mcts.cpp):
```diff
                 for (const auto& pair : node->children) {
                     MCTSNode* child = pair.second;
-                    double q_val = -child->Q; // Negate because child is from opponent perspective
+                    double q_val = (child->N > 0) ? -child->Q : node->Q;
                     double u = q_val + c_puct * child->prior * (std::sqrt(node->N) / (1.0 + child->N));
                     if (u > best_score) {
```

### Python MCTS Selection Fix
In [train_alphazero.py](file:///c:/Users/Huy%20Nguyen%20-%20Georgia%20Institute%20of%20Technology/Quoridor/train_alphazero.py):
```diff
                 # Calculate PUCT score for all children
                 for act_idx, child in node.children.items():
-                    q_val = -child.Q
+                    q_val = -child.Q if child.N > 0 else node.Q
                     u = q_val + self.c_puct * child.prior * (math.sqrt(node.N) / (1 + child.N))
```

---

## 4. Resolution
- **C++ Module Compilation**: The extension was recompiled in-place using MSVC Build Tools 2022.
- **Simulator Verification**: `verify_simulator.py` passed successfully over 1,000 random steps.
- **Model Test Suite**: `test_model.py` passed all assertions successfully.
- **Workspace Cleanup**: Deleted the old degenerate training folder `data/` and the checkpoints (`quoridor_checkpoint.pth`, `quoridor_model.onnx`, etc.) to allow training to start fresh from Epoch 0.
