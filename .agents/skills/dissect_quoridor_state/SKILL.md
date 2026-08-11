---
name: dissect_quoridor_state
description: Dissect and analyze any Quoridor JSON board state, showing ASCII board, path distances, wall inventories, NN value, MCTS action rankings, and tactical insights.
---

# Dissect Quoridor State Skill

Use this workflow whenever the user provides a Quoridor JSON board state or requests a dissection / evaluation of a game position.

## Workflow Instructions

1. **Run Structured Evaluator**:
   - Execute:
     ```bash
     python -c "import json, eval_json; print(json.dumps(eval_json.evaluate_json_state('''<JSON_STRING>'''), indent=2))"
     ```
   - Or pass a JSON file path to `eval_json.py`.

2. **Structure the Agent Response**:
   Present the analysis using 4 clean sections:

   - **1. Positional Overview & Graph State**:
     - Pawn coordinates in algebraic notation (`P1 at b3`, `P2 at g3`)
     - Walls remaining & wall placement breakdown
     - Shortest path node sequences for both players (`b3 -> c3 -> d3 -> ...`)
     - Path step count differential (`P2_dist - P1_dist`) and shared choke points

   - **2. Engine Evaluation**:
     - Neural Net Value (`nn_value_p1`): floats from `-1.0` (P2 win) to `+1.0` (P1 win)
     - MCTS Root Q-Value (`mcts_q_p1`)

   - **3. Top Recommended Actions (MCTS 800 Simulations)**:
     - Ranked actions with algebraic move notation (e.g., `Move N -> f6`, `Wall h2h`)
     - MCTS Visit % and NN Prior probability

   - **4. Tactical Insights**:
     - Strategic tempo assessment
     - Impending wall trap risks or bottleneck opportunities for the active player

