import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())
import numpy as np
import torch
import quoridor_cpp
from quoridor_model import QuoridorNet, map_action_to_index_perspective, map_index_to_action_perspective
from onnx_inference import ONNXModelEvaluator

def run_diagnostics():
    print("==================================================")
    print("1. CHECKPOINT METADATA & MODEL INTEGRITY")
    print("==================================================")
    ckpt_path = "quoridor_checkpoint.pth"
    if not os.path.exists(ckpt_path):
        print(f"Checkpoint not found at {ckpt_path}")
        return

    ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=False)
    epoch = ckpt.get('epoch', 'Unknown')
    print(f"Loaded Checkpoint Epoch: {epoch}")
    print(f"Keys in checkpoint: {list(ckpt.keys())}")
    
    state_dict = ckpt['model_state_dict']
    conv_init_weight = state_dict.get('conv_init.weight')
    channels = conv_init_weight.shape[0] if conv_init_weight is not None else 192
    resblock_indices = set()
    for k in state_dict.keys():
        if k.startswith('res_blocks.'):
            idx = int(k.split('.')[1])
            resblock_indices.add(idx)
    num_res_blocks = len(resblock_indices) if resblock_indices else 20
    print(f"Detected Architecture: {num_res_blocks} ResBlocks, {channels} Channels")
    
    model = QuoridorNet(num_residual_blocks=num_res_blocks, channels=channels)
    model.load_state_dict(state_dict)
    model.eval()

    total_params = sum(p.numel() for p in model.parameters())
    nan_params = sum(torch.isnan(p).sum().item() for p in model.parameters())
    inf_params = sum(torch.isinf(p).sum().item() for p in model.parameters())
    zero_params = sum((p == 0).sum().item() for p in model.parameters())
    print(f"Total Parameters: {total_params:,}")
    print(f"NaNs: {nan_params} | Infs: {inf_params} | Exact Zeros: {zero_params}")

    print("\n==================================================")
    print("2. OPENING STATE POLICY & VALUE EVALUATION")
    print("==================================================")
    # Opening position
    game_p1 = quoridor_cpp.QuoridorGame()
    enc_p1 = quoridor_cpp.MCTS.encode_state_cpp(game_p1)
    tensor_p1 = torch.tensor(enc_p1, dtype=torch.float32).reshape(1, 11, 9, 9)
    
    with torch.no_grad():
        logits_p1, val_p1 = model(tensor_p1)
        probs_p1 = torch.softmax(logits_p1, dim=-1).squeeze(0).numpy()
        val_p1_item = val_p1.item()

    pawn_mass_p1 = float(np.sum(probs_p1[:12]))
    wall_mass_p1 = float(np.sum(probs_p1[12:]))
    top5_idx_p1 = np.argsort(probs_p1)[::-1][:5]
    
    print(f"P1 Turn Opening Value: {val_p1_item:+.4f}")
    print(f"P1 Turn Opening Policy Mass: Pawn = {pawn_mass_p1*100:.2f}%, Wall = {wall_mass_p1*100:.2f}%")
    print("Top 5 Opening Policy Actions (P1 Turn):")
    for idx in top5_idx_p1:
        act = map_index_to_action_perspective(int(idx), True, game_p1.p1_pos, game_p1.p2_pos)
        print(f"  - Action {idx:3d} ({str(act):<35}): {probs_p1[idx]*100:5.2f}%")

    # P2 opening (simulate after P1 moves north)
    game_p2 = quoridor_cpp.QuoridorGame()
    game_p2.step(quoridor_cpp.Action.Move('N', 4, 1))
    enc_p2 = quoridor_cpp.MCTS.encode_state_cpp(game_p2)
    tensor_p2 = torch.tensor(enc_p2, dtype=torch.float32).reshape(1, 11, 9, 9)
    
    with torch.no_grad():
        logits_p2, val_p2 = model(tensor_p2)
        probs_p2 = torch.softmax(logits_p2, dim=-1).squeeze(0).numpy()
        val_p2_item = val_p2.item()

    pawn_mass_p2 = float(np.sum(probs_p2[:12]))
    wall_mass_p2 = float(np.sum(probs_p2[12:]))
    top5_idx_p2 = np.argsort(probs_p2)[::-1][:5]
    
    print(f"\nP2 Turn Opening Value (after P1 N): {val_p2_item:+.4f}")
    print(f"P2 Turn Opening Policy Mass: Pawn = {pawn_mass_p2*100:.2f}%, Wall = {wall_mass_p2*100:.2f}%")
    print("Top 5 Opening Policy Actions (P2 Turn):")
    for idx in top5_idx_p2:
        act = map_index_to_action_perspective(int(idx), False, game_p2.p1_pos, game_p2.p2_pos)
        print(f"  - Action {idx:3d} ({str(act):<35}): {probs_p2[idx]*100:5.2f}%")

    print("\n==================================================")
    print("3. POLICY REPRESENTATION DIVERSITY (Cosine Sim)")
    print("==================================================")
    np.random.seed(42)
    logits_list = []
    pawn_masses = []
    wall_masses = []

    for trial in range(50):
        g = quoridor_cpp.QuoridorGame()
        steps = np.random.randint(2, 35)
        for _ in range(steps):
            if g.is_game_over() != 0:
                break
            valid = g.get_valid_actions()
            if not valid:
                break
            chosen = valid[np.random.choice(len(valid))]
            g.step(chosen)
        
        enc = quoridor_cpp.MCTS.encode_state_cpp(g)
        t = torch.tensor(enc, dtype=torch.float32).reshape(1, 11, 9, 9)
        with torch.no_grad():
            l, v = model(t)
            logits_list.append(l.squeeze(0).numpy())
            p = torch.softmax(l, dim=-1).squeeze(0).numpy()
            pawn_masses.append(np.sum(p[:12]))
            wall_masses.append(np.sum(p[12:]))

    logits_mat = np.array(logits_list) # (50, 140)
    norms = np.linalg.norm(logits_mat, axis=1, keepdims=True)
    normed = logits_mat / np.maximum(norms, 1e-8)
    sim_matrix = np.dot(normed, normed.T)
    triu_indices = np.triu_indices(50, k=1)
    cos_sims = sim_matrix[triu_indices]

    print(f"Pairwise Logit Cosine Similarity across 50 random states:")
    print(f"  Mean: {np.mean(cos_sims):.4f} +/- {np.std(cos_sims):.4f}")
    print(f"  Min:  {np.min(cos_sims):.4f} | Max: {np.max(cos_sims):.4f}")
    print(f"Across 50 random states: Avg Pawn Policy Mass = {np.mean(pawn_masses)*100:.2f}%, Avg Wall Policy Mass = {np.mean(wall_masses)*100:.2f}%")

    print("\n==================================================")
    print("4. TACTICAL COMPETENCY BENCHMARKS")
    print("==================================================")
    def eval_cb(inputs_flat, num_items=1):
        with torch.no_grad():
            x = torch.from_numpy(inputs_flat).float().reshape(-1, 11, 9, 9)
            logits, vals = model(x)
            l_np = logits.numpy()
            e_x = np.exp(l_np - np.max(l_np, axis=1, keepdims=True))
            p_np = e_x / np.sum(e_x, axis=1, keepdims=True)
            return p_np.astype(np.float32), vals.numpy().ravel().astype(np.float32)

    mcts = quoridor_cpp.MCTS(c_puct=1.4, dirichlet_alpha=0.0, dirichlet_eps=0.0)

    # Test A: Winning Move in 1 step
    tA = quoridor_cpp.QuoridorGame()
    tA.p1_pos = (4, 7)
    tA.p2_pos = (4, 2)
    tA.is_p1_turn = True
    vA, qA = mcts.run_search_batched([tA], eval_cb, 800)
    best_act_idx_A = np.argmax(vA[0])
    act_A = map_index_to_action_perspective(int(best_act_idx_A), True, tA.p1_pos, tA.p2_pos)
    print(f"Test A (Immediate Winning Step):")
    print(f"  P1 at (4,7), Goal at y=8. MCTS Best Action: {act_A} (Visits: {vA[0][best_act_idx_A]}/800), Root Q: {qA[0]:+.4f}")
    print(f"  Result: {'PASS' if act_A.get('type') == 'move' and act_A.get('to') == (4,8) else 'FAIL'}")

    # Test B: Opponent about to win (P2 at (4,1), P1 at (4,5)). P1 MUST block with a wall or lose next turn!
    tB = quoridor_cpp.QuoridorGame()
    tB.p1_pos = (4, 5)
    tB.p2_pos = (4, 1)
    tB.is_p1_turn = True
    vB, qB = mcts.run_search_batched([tB], eval_cb, 800)
    best_act_idx_B = np.argmax(vB[0])
    act_B = map_index_to_action_perspective(int(best_act_idx_B), True, tB.p1_pos, tB.p2_pos)
    print(f"\nTest B (Urgent Blunder / Block Defense):")
    print(f"  P2 at (4,1) (1 step from goal). P1 at (4,5). MCTS Best Action: {act_B} (Visits: {vB[0][best_act_idx_B]}/800), Root Q: {qB[0]:+.4f}")
    print(f"  Result: {'PASS (Placed blocking wall)' if act_B.get('type') == 'wall' else 'FAIL (Did not place wall)'}")

    # Test C: Jump Action Recognition (Face to Face)
    tC = quoridor_cpp.QuoridorGame()
    tC.p1_pos = (4, 4)
    tC.p2_pos = (4, 5)
    tC.is_p1_turn = True
    vC, qC = mcts.run_search_batched([tC], eval_cb, 800)
    best_act_idx_C = np.argmax(vC[0])
    act_C = map_index_to_action_perspective(int(best_act_idx_C), True, tC.p1_pos, tC.p2_pos)
    print(f"\nTest C (Face-to-Face Forward Jump):")
    print(f"  P1 at (4,4), P2 at (4,5). MCTS Best Action: {act_C} (Visits: {vC[0][best_act_idx_C]}/800), Root Q: {qC[0]:+.4f}")
    print(f"  Result: {'PASS (Jumped North to (4,6))' if act_C.get('type') == 'move' and act_C.get('to') == (4,6) else 'FAIL'}")

    # Test D: Symmetry and Value Calibration
    tD = quoridor_cpp.QuoridorGame()
    encD = quoridor_cpp.MCTS.encode_state_cpp(tD)
    with torch.no_grad():
        _, valD = model(torch.tensor(encD, dtype=torch.float32).reshape(1, 11, 9, 9))
    print(f"\nTest D (Value Symmetry Calibration):")
    print(f"  Symmetric Board Initial Value: {valD.item():+.4f} (Ideal: ~0.00)")

if __name__ == "__main__":
    run_diagnostics()
