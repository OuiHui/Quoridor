import torch
import torch.nn as nn
import torch.nn.functional as F

class SEBlock(nn.Module):
    """KataGo Global Pooling (mean + max) channel attention block."""
    def __init__(self, channels=192, reduction=16):
        super(SEBlock, self).__init__()
        reduced = max(8, channels // reduction)
        # KataGo Global Pooling combines spatial mean and spatial max
        self.fc1 = nn.Linear(channels * 2, reduced, bias=False)
        self.fc2 = nn.Linear(reduced, channels, bias=False)

    def forward(self, x):
        b, c, _, _ = x.size()
        mean_pool = x.mean(dim=(2, 3))
        max_pool = torch.amax(x, dim=(2, 3))
        y = torch.cat([mean_pool, max_pool], dim=1)
        y = F.relu(self.fc1(y))
        y = torch.sigmoid(self.fc2(y)).view(b, c, 1, 1)
        return x * y

class ResidualBlock(nn.Module):
    """
    Residual block with two 3x3 Conv2d layers, BatchNorm,
    KataGo Global Pooling SE attention, and a skip connection.
    """
    def __init__(self, channels=192):
        super(ResidualBlock, self).__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.se = SEBlock(channels)

    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out = self.se(out)
        out += residual
        return F.relu(out)

class QuoridorNet(nn.Module):
    """
    AlphaZero-style network for Quoridor with KataGo Global Pooling
    and decoupled 12-Pawn + 2x8x8 Spatial Wall Convolutional Head.
    Input shape: (Batch, 11, 9, 9)
    Trunk: ResidualBlocks with KataGo Global Pooling SE-Attention.
    Value Head: outputs scalar in [-1, 1].
    Policy Head: decoupled 12 pawn + 2x8x8 spatial wall conv head (140 action logits).
    Auxiliary Heads: 2-Output End-of-Game Path Length Head (2), Final Wall-Structure Ownership Map (2x8x8), and Opponent's Next Move (140).
    """
    def __init__(self, num_residual_blocks=20, channels=192):
        super(QuoridorNet, self).__init__()
        # Channels 0..7 are full 2D spatial feature maps
        self.conv_init = nn.Conv2d(8, channels, kernel_size=3, padding=1, bias=False)
        self.bn_init = nn.BatchNorm2d(channels)
        
        self.res_blocks = nn.ModuleList([
            ResidualBlock(channels) for _ in range(num_residual_blocks)
        ])
        
        # Value Head: (channels, 9, 9) -> Conv1x1 -> BN -> ReLU -> Flatten -> Cat scalars -> Linear -> ReLU -> Linear -> Tanh
        self.value_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(4)
        self.value_fc1 = nn.Linear(4 * 9 * 9 + 6, 64)
        self.value_fc2 = nn.Linear(64, 1)
        
        # Decoupled Policy Head:
        # 1. 12-Pawn Move Sub-Head
        self.pawn_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.pawn_bn = nn.BatchNorm2d(4)
        self.pawn_fc = nn.Linear(4 * 9 * 9 + 6, 12)

        # 2. 2x8x8 Spatial Wall Convolutional Sub-Head
        self.wall_conv = nn.Conv2d(channels, 32, kernel_size=1, bias=False)
        self.wall_bn = nn.BatchNorm2d(32)
        self.wall_out = nn.Conv2d(32, 2, kernel_size=2, padding=0, bias=True)

        # Auxiliary Heads:
        # A. End-of-Game Path Length Head: predicts [active_end_path_norm, opp_end_path_norm] in [0, 1]
        self.aux_conv = nn.Conv2d(channels, 2, kernel_size=1, bias=False)
        self.aux_bn = nn.BatchNorm2d(2)
        self.aux_fc = nn.Linear(2 * 9 * 9 + 6, 2)

        # B. Final Wall-Structure Ownership Map: (B, 2, 8, 8) in [-1, 1]
        self.aux_wall_conv = nn.Conv2d(channels, 32, kernel_size=1, bias=False)
        self.aux_wall_bn = nn.BatchNorm2d(32)
        self.aux_wall_out = nn.Conv2d(32, 2, kernel_size=2, padding=0, bias=True)

        # C. Opponent's Next Move Policy Head: (B, 140) logits
        self.aux_opp_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.aux_opp_bn = nn.BatchNorm2d(4)
        self.aux_opp_fc = nn.Linear(4 * 9 * 9 + 6, 140)

    def forward(self, x, return_aux=False):
        b = x.size(0)
        # Channels 0-7 are spatial; extract distance/wall counts and tempo features as scalars
        x_spatial = x[:, :8, :, :]
        # Scalar features: [active_dist_norm, opp_dist_norm, active_walls_norm, opp_walls_norm, path_adv, jump_parity]
        active_pos_x = x[:, 0, :, :].view(b, -1).argmax(dim=-1) // 9
        active_pos_y = x[:, 0, :, :].view(b, -1).argmax(dim=-1) % 9
        opp_pos_x = x[:, 1, :, :].view(b, -1).argmax(dim=-1) // 9
        opp_pos_y = x[:, 1, :, :].view(b, -1).argmax(dim=-1) % 9

        batch_idx = torch.arange(b, device=x.device)
        act_dist = x[batch_idx, 4, active_pos_x, active_pos_y].unsqueeze(1)
        opp_dist = x[batch_idx, 5, opp_pos_x, opp_pos_y].unsqueeze(1)
        path_adv = x[:, 10, 0, 0].unsqueeze(1)
        jump_parity = x[:, 10, 0, 1].unsqueeze(1)
        scalars = torch.cat([act_dist, opp_dist, x[:, 8:10, 0, 0], path_adv, jump_parity], dim=1)

        # Trunk
        out = F.relu(self.bn_init(self.conv_init(x_spatial)))
        for block in self.res_blocks:
            out = block(out)
            
        # Value Head
        v = F.relu(self.value_bn(self.value_conv(out)))
        v = v.view(b, -1)
        v_in = torch.cat([v, scalars], dim=1)
        v = F.relu(self.value_fc1(v_in))
        v = torch.tanh(self.value_fc2(v))
        
        # Policy Head: Decoupled 12-Pawn + 2x8x8 Spatial Wall Convolution
        # 1. Pawn moves (12 logits)
        pawn_feat = F.relu(self.pawn_bn(self.pawn_conv(out))).view(b, -1)
        pawn_in = torch.cat([pawn_feat, scalars], dim=1)
        logits_pawn = self.pawn_fc(pawn_in)

        # 2. Spatial wall placements (2 x 8 x 8 = 128 logits)
        # 2x2 conv on 9x9 without padding yields exactly 8x8 spatial intersection grid
        wall_feat = F.relu(self.wall_bn(self.wall_conv(out)))
        wall_grid = self.wall_out(wall_feat) # (b, 2, wx, wy)
        wall_perm = wall_grid.permute(0, 1, 3, 2) # (b, 2, wy, wx)
        h_wall_logits = wall_perm[:, 0, :, :].reshape(b, 64) # 12..75: wy * 8 + wx
        v_wall_logits = wall_perm[:, 1, :, :].reshape(b, 64) # 76..139: wy * 8 + wx

        logits = torch.cat([logits_pawn, h_wall_logits, v_wall_logits], dim=1)
        
        if return_aux:
            aux_feat = F.relu(self.aux_bn(self.aux_conv(out))).view(b, -1)
            aux_in = torch.cat([aux_feat, scalars], dim=1)
            aux_path_pred = torch.sigmoid(self.aux_fc(aux_in)) # (b, 2) in [0, 1]

            aux_w_feat = F.relu(self.aux_wall_bn(self.aux_wall_conv(out)))
            aux_wall_grid = torch.tanh(self.aux_wall_out(aux_w_feat)) # (b, 2, 8, 8) in [-1, 1]
            
            aux_opp_feat = F.relu(self.aux_opp_bn(self.aux_opp_conv(out))).view(b, -1)
            aux_opp_in = torch.cat([aux_opp_feat, scalars], dim=1)
            aux_opp_logits = self.aux_opp_fc(aux_opp_in) # (b, 140)
            return logits, v, aux_path_pred, aux_wall_grid, aux_opp_logits

        return logits, v

def encode_state(p1_pos, p2_pos, h_walls, v_walls, p1_path, p2_path, p1_walls_left, p2_walls_left, is_p1_turn):
    """
    Encodes the Quoridor board state into a (11, 9, 9) tensor representation,
    rotated by 180 degrees if it is Player 2's turn to make the representation
    perspective-symmetric.
    
    Inputs:
        p1_pos: tuple (x, y) for Player 1
        p2_pos: tuple (x, y) for Player 2
        h_walls: set/list of (wx, wy) coordinates for horizontal walls
        v_walls: set/list of (wx, wy) coordinates for vertical walls
        p1_path: list of (x, y) on P1's current BFS shortest path
        p2_path: list of (x, y) on P2's current BFS shortest path
        p1_walls_left: int (0 to 10)
        p2_walls_left: int (0 to 10)
        is_p1_turn: bool (True if P1's turn)
        
    Returns:
        torch.Tensor of shape (11, 9, 9)
    """
    tensor = torch.zeros(11, 9, 9, dtype=torch.float32)
    
    if is_p1_turn:
        active_pos = p1_pos
        opp_pos = p2_pos
        h_walls_to_encode = h_walls
        v_walls_to_encode = v_walls
        active_path = p1_path
        opp_path = p2_path
        active_walls = p1_walls_left
        opp_walls = p2_walls_left
    else:
        # Rotate state by 180 degrees for Player 2 perspective
        active_pos = (8 - p2_pos[0], 8 - p2_pos[1])
        opp_pos = (8 - p1_pos[0], 8 - p1_pos[1])
        h_walls_to_encode = [(7 - wx, 7 - wy) for wx, wy in h_walls]
        v_walls_to_encode = [(7 - wx, 7 - wy) for wx, wy in v_walls]
        active_path = [(8 - x, 8 - y) for x, y in p2_path] if p2_path else []
        opp_path = [(8 - x, 8 - y) for x, y in p1_path] if p1_path else []
        active_walls = p2_walls_left
        opp_walls = p1_walls_left

    # 0. Your pawn position (active player)
    tensor[0, active_pos[0], active_pos[1]] = 1.0
    
    # 1. Opponent pawn position
    tensor[1, opp_pos[0], opp_pos[1]] = 1.0
    
    # 2. Horizontal walls (8x8 padded to 9x9 by leaving row/col 8 as 0)
    for wx, wy in h_walls_to_encode:
        if 0 <= wx < 8 and 0 <= wy < 8:
            tensor[2, wx, wy] = 1.0
            
    # 3. Vertical walls (8x8 padded to 9x9)
    for wx, wy in v_walls_to_encode:
        if 0 <= wx < 8 and 0 <= wy < 8:
            tensor[3, wx, wy] = 1.0
            
    # 4. Your shortest path length / 20.0
    active_dist = len(active_path) if active_path else 20
    tensor[4, :, :] = min(active_dist / 20.0, 1.0)
    
    # 5. Opponent shortest path length / 20.0
    opp_dist = len(opp_path) if opp_path else 20
    tensor[5, :, :] = min(opp_dist / 20.0, 1.0)
    
    # 6. Your path cells (binary 9x9)
    if active_path:
        for px, py in active_path:
            tensor[6, px, py] = 1.0
            
    # 7. Opponent path cells (binary 9x9)
    if opp_path:
        for px, py in opp_path:
            tensor[7, px, py] = 1.0
            
    # 8. Your walls remaining / 10.0
    tensor[8, :, :] = min(active_walls / 10.0, 1.0)
    
    # 9. Opponent walls remaining / 10.0
    tensor[9, :, :] = min(opp_walls / 10.0, 1.0)
    
    # 10. Path advantage & Jump Parity:
    # Even cells ((x+y)%2 == 0): path advantage (opp_dist - active_dist) / 16.0 clamped to [-1, 1].
    # Odd cells ((x+y)%2 == 1): jump parity tempo (even Manhattan dist -> +1.0 active jump initiative, odd -> -1.0).
    path_advantage = max(-1.0, min(1.0, (opp_dist - active_dist) / 16.0))
    m_dist = abs(active_pos[0] - opp_pos[0]) + abs(active_pos[1] - opp_pos[1])
    jump_parity = 1.0 if (m_dist % 2 == 0) else -1.0
    for x in range(9):
        for y in range(9):
            tensor[10, x, y] = path_advantage if ((x + y) % 2 == 0) else jump_parity

    return tensor

def flip_horizontal_state(tensor):
    """
    Horizontally mirror a (11, 9, 9) state tensor.
    Pawn, distance, and criticality channels: x -> 8-x.
    Wall channels: wx -> 7-wx with coordinate padding (index 8) preserved as 0.0.
    Scalar channels (8, 9, 10) are invariant under left-right mirroring.
    """
    flipped = tensor.clone()
    # Pawn positions (0, 1), 2D distance maps (4, 5), and DAG criticality masks (6, 7)
    for ch in [0, 1, 4, 5, 6, 7]:
        flipped[ch] = torch.flip(tensor[ch], dims=[0])
    # Wall placements: only the active 8 x-positions (0..7) are flipped
    for ch in [2, 3]:
        flipped[ch, :8, :] = torch.flip(tensor[ch, :8, :], dims=[0])
        flipped[ch, 8, :] = 0.0
        flipped[ch, :, 8] = 0.0
    return flipped

def flip_horizontal_policy(policy):
    """
    Horizontally mirror a 140-element policy vector.
    E <-> W, jump_E <-> jump_W, NE <-> NW, SE <-> SW.
    Wall columns are reversed within each row: wx -> 7-wx.
    """
    p = policy.copy()
    # Directional moves
    p[2],  p[3]  = policy[3],  policy[2]   # E <-> W
    p[6],  p[7]  = policy[7],  policy[6]   # jump_E <-> jump_W
    p[8],  p[9]  = policy[9],  policy[8]   # jump_NE <-> jump_NW
    p[10], p[11] = policy[11], policy[10]  # jump_SE <-> jump_SW
    # Wall placements: reshape to (wy, wx), reverse wx, flatten
    p[12:76]  = policy[12:76].reshape(8, 8)[:, ::-1].ravel()
    p[76:140] = policy[76:140].reshape(8, 8)[:, ::-1].ravel()
    return p

# Action space: 140 total
#   0-3:    Regular moves  (N, S, E, W)
#   4-7:    Straight jumps (N, S, E, W)
#   8-11:   Diagonal jumps (NE, NW, SE, SW)
#   12-75:  Horizontal walls (wx=0..7, wy=0..7)  -> 12 + wy*8 + wx  (64 placements)
#   76-139: Vertical walls  (wx=0..7, wy=0..7)   -> 76 + wy*8 + wx  (64 placements)
# Total: 12 move/jump + 64 h-wall + 64 v-wall = 140
NUM_ACTIONS = 140

_MOVE_DIR_TO_IDX = {'N': 0, 'S': 1, 'E': 2, 'W': 3,
                    'jump_N': 4, 'jump_S': 5, 'jump_E': 6, 'jump_W': 7,
                    'jump_NE': 8, 'jump_NW': 9, 'jump_SE': 10, 'jump_SW': 11}
_IDX_TO_MOVE_DIR = {v: k for k, v in _MOVE_DIR_TO_IDX.items()}

def map_action_to_index(action):
    action_type = action.get('type')
    if action_type == 'move':
        return _MOVE_DIR_TO_IDX[action['dir']]
    elif action_type == 'wall':
        wx, wy = action['x'], action['y']
        if action['wallType'] == 'h':
            return 12 + wy * 8 + wx
        else:
            return 76 + wy * 8 + wx
    raise ValueError(f"Unknown action format: {action}")

def map_index_to_action(index, px, py, ox=None, oy=None):
    """
    Maps an index in [0, 139] to an action dictionary.
    px, py: active player position. ox, oy: opponent position (unused, kept for compatibility).
    """
    if index < 12:
        move_dir = _IDX_TO_MOVE_DIR[index]
        delta = {
            'N': (0, 1), 'S': (0, -1), 'E': (1, 0), 'W': (-1, 0),
            'jump_N': (0, 2), 'jump_S': (0, -2), 'jump_E': (2, 0), 'jump_W': (-2, 0),
            'jump_NE': (1, 1), 'jump_NW': (-1, 1), 'jump_SE': (1, -1), 'jump_SW': (-1, -1),
        }[move_dir]
        return {'type': 'move', 'dir': move_dir, 'to': (px + delta[0], py + delta[1])}
    elif index < 76:
        wall_idx = index - 12
        return {'type': 'wall', 'wallType': 'h', 'x': wall_idx % 8, 'y': wall_idx // 8}
    else:
        wall_idx = index - 76
        return {'type': 'wall', 'wallType': 'v', 'x': wall_idx % 8, 'y': wall_idx // 8}

def rotate_action_180(action):
    """
    Rotates a Quoridor action by 180 degrees.
    """
    action_type = action.get('type')
    if action_type == 'move':
        rotated_dir = {
            'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
            'jump_N': 'jump_S', 'jump_S': 'jump_N', 'jump_E': 'jump_W', 'jump_W': 'jump_E',
            'jump_NE': 'jump_SW', 'jump_NW': 'jump_SE', 'jump_SE': 'jump_NW', 'jump_SW': 'jump_NE',
        }[action['dir']]
        rx, ry = action['to']
        return {
            'type': 'move',
            'dir': rotated_dir,
            'to': (8 - rx, 8 - ry)
        }
    elif action_type == 'wall':
        return {
            'type': 'wall',
            'wallType': action['wallType'],
            'x': 7 - action['x'],
            'y': 7 - action['y']
        }
    raise ValueError(f"Unknown action format: {action}")

def map_action_to_index_perspective(action, is_p1_turn):
    if is_p1_turn:
        return map_action_to_index(action)
    else:
        return map_action_to_index(rotate_action_180(action))

def map_index_to_action_perspective(index, is_p1_turn, p1_pos, p2_pos):
    if is_p1_turn:
        return map_index_to_action(index, p1_pos[0], p1_pos[1])
    else:
        rx, ry = 8 - p2_pos[0], 8 - p2_pos[1]
        act_rot = map_index_to_action(index, rx, ry)
        return rotate_action_180(act_rot)

class ONNXDeployWrapper(nn.Module):
    """Wraps QuoridorNet to strictly emit only policy and value heads for ONNX deployment."""
    def __init__(self, model):
        super(ONNXDeployWrapper, self).__init__()
        self.model = model

    def forward(self, x):
        logits, value = self.model(x, return_aux=False)
        return logits, value

def export_to_onnx(model, filepath="quoridor_model.onnx"):
    model.eval()
    orig_device = next(model.parameters()).device
    model.cpu()
    deploy_wrapper = ONNXDeployWrapper(model).eval()
    dummy_input = torch.randn(32, 11, 9, 9, dtype=torch.float32)
    try:
        # Set environment variable and reconfigure streams to force UTF-8 on Windows
        import sys
        if sys.platform.startswith('win'):
            import os
            os.environ["PYTHONIOENCODING"] = "utf-8"
            if hasattr(sys.stdout, 'reconfigure'):
                try:
                    sys.stdout.reconfigure(encoding='utf-8')
                except Exception:
                    pass
            if hasattr(sys.stderr, 'reconfigure'):
                try:
                    sys.stderr.reconfigure(encoding='utf-8')
                except Exception:
                    pass
        torch.onnx.export(
            deploy_wrapper,
            dummy_input,
            filepath,
            export_params=True,
            opset_version=18,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['policy', 'value'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'policy': {0: 'batch_size'},
                'value': {0: 'batch_size'}
            }
        )
    except Exception as e:
        print(f"Warning: ONNX export failed with exception: {e}")
        print("This is likely a non-fatal console encoding error; the training checkpoint is still saved.")
    finally:
        model.to(orig_device)
