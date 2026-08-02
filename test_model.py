import os
import torch
from quoridor_model import QuoridorNet, encode_state, map_action_to_index, map_index_to_action, rotate_action_180, map_action_to_index_perspective, map_index_to_action_perspective, export_to_onnx, NUM_ACTIONS

def run_tests():
    print("Running Quoridor Bot Verification Tests...")
    
    # 1. Test state encoding
    p1_pos = (4, 0)
    p2_pos = (4, 8)
    h_walls = [(1, 2), (3, 4)]
    v_walls = [(5, 6)]
    p1_path = [(4, 0), (4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (4, 7), (4, 8)]
    p2_path = [(4, 8), (4, 7), (4, 6), (4, 5), (4, 4), (4, 3), (4, 2), (4, 1), (4, 0)]
    p1_walls_left = 8
    p2_walls_left = 9
    is_p1_turn = True
    
    tensor = encode_state(
        p1_pos, p2_pos, h_walls, v_walls, p1_path, p2_path,
        p1_walls_left, p2_walls_left, is_p1_turn
    )
    
    # Expected shape: (11, 9, 9)
    assert tensor.shape == (11, 9, 9), f"Incorrect tensor shape: {tensor.shape}"
    print(f"PASS: State encoding tensor shape validated: {tensor.shape}")
    
    # Verify values
    assert tensor[0, 4, 0] == 1.0, "P1 position incorrect in channel 0"
    assert tensor[1, 4, 8] == 1.0, "P2 position incorrect in channel 1"
    assert tensor[2, 1, 2] == 1.0, "H-wall incorrect in channel 2"
    assert tensor[3, 5, 6] == 1.0, "V-wall incorrect in channel 3"
    assert abs(tensor[4, 0, 0] - 9.0/20.0) < 1e-5, "P1 shortest path length normalization incorrect"
    assert abs(tensor[5, 0, 0] - 9.0/20.0) < 1e-5, "P2 shortest path length normalization incorrect"
    assert tensor[6, 4, 4] == 1.0, "P1 path cell incorrect in channel 6"
    assert tensor[7, 4, 4] == 1.0, "P2 path cell incorrect in channel 7"
    assert abs(tensor[8, 0, 0] - 8.0/10.0) < 1e-5, "P1 walls left incorrect in channel 8"
    assert abs(tensor[9, 0, 0] - 9.0/10.0) < 1e-5, "P2 walls left incorrect in channel 9"
    assert tensor[10, 0, 0] == 0.0, "Channel 10 padding incorrect"

    # Test P2 turn (rotated state encoding)
    tensor_p2 = encode_state(
        p1_pos, p2_pos, h_walls, v_walls, p1_path, p2_path,
        p1_walls_left, p2_walls_left, False
    )
    
    assert tensor_p2.shape == (11, 9, 9), f"Incorrect P2 tensor shape: {tensor_p2.shape}"
    # In P2 perspective, P2 is at the rotated position of (4,8) which is (4,0).
    assert tensor_p2[0, 4, 0] == 1.0, "Active player (P2) rotated position incorrect in channel 0"
    # In P2 perspective, opponent (P1) is at the rotated position of (4,0) which is (4,8).
    assert tensor_p2[1, 4, 8] == 1.0, "Inactive player (P1) rotated position incorrect in channel 1"
    # Walls check: h_walls = [(1, 2), (3, 4)] -> [(7-1, 7-2), (7-3, 7-4)] = [(6, 5), (4, 3)]
    assert tensor_p2[2, 6, 5] == 1.0, "Rotated H-wall incorrect in channel 2"
    assert tensor_p2[2, 4, 3] == 1.0, "Rotated H-wall incorrect in channel 2"
    # v_walls = [(5, 6)] -> [(7-5, 7-6)] = [(2, 1)]
    assert tensor_p2[3, 2, 1] == 1.0, "Rotated V-wall incorrect in channel 3"
    # Path cell: (4, 4) in P1/P2 path -> (8-4, 8-4) = (4, 4)
    assert tensor_p2[6, 4, 4] == 1.0, "Rotated P2 path cell incorrect in channel 6"
    assert tensor_p2[7, 4, 4] == 1.0, "Rotated P1 path cell incorrect in channel 7"
    # Walls count check
    assert abs(tensor_p2[8, 0, 0] - 9.0/10.0) < 1e-5, "Active walls (P2) left incorrect in channel 8"
    assert abs(tensor_p2[9, 0, 0] - 8.0/10.0) < 1e-5, "Opponent walls (P1) left incorrect in channel 9"
    assert tensor_p2[10, 0, 0] == 0.0, "Turn indicator incorrect in channel 10"
    print("PASS: P2 rotated state encoding verified")
    
    print("PASS: Input feature mapping values verified")

    # 2. Test model shape verification
    model = QuoridorNet()
    batch_input = tensor.unsqueeze(0) # add batch dimension -> (1, 11, 9, 9)
    
    policy, value = model(batch_input)
    
    assert policy.shape == (1, NUM_ACTIONS), f"Incorrect policy output shape: {policy.shape}"
    assert value.shape == (1, 1), f"Incorrect value output shape: {value.shape}"
    print("PASS: Model forward pass outputs validated:")
    print(f"  Policy Head: {policy.shape}")
    print(f"  Value Head: {value.shape}")

    # 3. Test action mapping index boundaries
    action_move_N = {'type': 'move', 'dir': 'N', 'to': (4, 1)}
    action_move_jump = {'type': 'move', 'dir': 'jump_N', 'to': (4, 2)}
    action_wall_h = {'type': 'wall', 'wallType': 'h', 'x': 0, 'y': 0}
    action_wall_v = {'type': 'wall', 'wallType': 'v', 'x': 7, 'y': 7}
    
    idx_N = map_action_to_index(action_move_N)
    idx_jump = map_action_to_index(action_move_jump)
    idx_wall_h = map_action_to_index(action_wall_h)
    idx_wall_v = map_action_to_index(action_wall_v)
    
    assert idx_N == 0, f"N move should map to 0, got {idx_N}"
    assert idx_jump == 4, f"jump_N move should map to 4, got {idx_jump}"
    assert idx_wall_h == 12, f"first h-wall should map to 12, got {idx_wall_h}"
    assert idx_wall_v == 139, f"last v-wall should map to 139, got {idx_wall_v}"
    
    # Round-trip check
    action_v_reconstructed = map_index_to_action(139, 4, 0)
    assert action_v_reconstructed['wallType'] == 'v' and action_v_reconstructed['x'] == 7 and action_v_reconstructed['y'] == 7, "Reconstructed wall action mismatch"
    print("PASS: Action-to-index mapping round trips verified")

    # 4. Test Action Rotation and Perspective Mapping
    action_p2_absolute = {'type': 'move', 'dir': 'S', 'to': (4, 7)} # absolute South
    # Rotated action from P2 perspective should be North
    action_p2_rotated = rotate_action_180(action_p2_absolute)
    assert action_p2_rotated['dir'] == 'N', f"Rotated action dir should be N, got {action_p2_rotated['dir']}"
    assert action_p2_rotated['to'] == (4, 1), f"Rotated action destination should be (4, 1), got {action_p2_rotated['to']}"
    
    # Perspective index mapping
    idx_p1 = map_action_to_index_perspective(action_move_N, is_p1_turn=True)
    idx_p2 = map_action_to_index_perspective(action_p2_absolute, is_p1_turn=False)
    assert idx_p1 == 0, f"P1 index should be 0, got {idx_p1}"
    assert idx_p2 == 0, f"P2 index should be 0, got {idx_p2}" # moving South absolutely is moving North in P2 perspective
    
    # Index to perspective action reconstruction
    act_p1_recon = map_index_to_action_perspective(0, is_p1_turn=True, p1_pos=p1_pos, p2_pos=p2_pos)
    act_p2_recon = map_index_to_action_perspective(0, is_p1_turn=False, p1_pos=p1_pos, p2_pos=p2_pos)
    assert act_p1_recon['type'] == 'move' and act_p1_recon['to'] == (4, 1), "P1 action reconstruction incorrect"
    assert act_p2_recon['type'] == 'move' and act_p2_recon['to'] == (4, 7), "P2 action reconstruction incorrect"
    print("PASS: Perspective-aware action mapping verified")

    # 5. Test ONNX Export
    onnx_path = "quoridor_model_test.onnx"
    export_to_onnx(model, onnx_path)
    assert os.path.exists(onnx_path), f"ONNX file not generated: {onnx_path}"
    print(f"PASS: ONNX export successful: {onnx_path} ({os.path.getsize(onnx_path)} bytes)")
    
    # Cleanup
    if os.path.exists(onnx_path):
        os.remove(onnx_path)
        
    print("\nAll model tests passed successfully!")

if __name__ == "__main__":
    run_tests()
