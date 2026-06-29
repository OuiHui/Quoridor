import torch
import torch.nn as nn
import torch.nn.functional as F

class ResidualBlock(nn.Module):
    """
    Standard residual block with two 3x3 Conv2d layers,
    BatchNorm, and a skip connection.
    """
    def __init__(self, channels=128):
        super(ResidualBlock, self).__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += residual
        return F.relu(out)

class QuoridorNet(nn.Module):
    """
    AlphaZero-style network for Quoridor.
    Input shape: (Batch, 11, 9, 9)
    Trunk: 6 ResidualBlocks with 128 channels.
    Value Head: outputs scalar in [-1, 1].
    Policy Head: outputs 133 action logits.
    """
    def __init__(self, num_residual_blocks=6, channels=128):
        super(QuoridorNet, self).__init__()
        self.conv_init = nn.Conv2d(11, channels, kernel_size=3, padding=1, bias=False)
        self.bn_init = nn.BatchNorm2d(channels)
        
        self.res_blocks = nn.ModuleList([
            ResidualBlock(channels) for _ in range(num_residual_blocks)
        ])
        
        # Value Head: (128, 9, 9) -> Conv(128, 4, 1) -> BN -> ReLU -> Flatten -> Linear(4*9*9, 64) -> ReLU -> Linear(64, 1) -> Tanh
        self.value_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.value_bn = nn.BatchNorm2d(4)
        self.value_fc1 = nn.Linear(4 * 9 * 9, 64)
        self.value_fc2 = nn.Linear(64, 1)
        
        # Policy Head: (128, 9, 9) -> Conv(128, 4, 1) -> BN -> ReLU -> Flatten -> Linear(4*9*9, 140)
        self.policy_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(4)
        self.policy_fc = nn.Linear(4 * 9 * 9, 140)

    def forward(self, x):
        # Trunk
        out = F.relu(self.bn_init(self.conv_init(x)))
        for block in self.res_blocks:
            out = block(out)
            
        # Value Head
        v = F.relu(self.value_bn(self.value_conv(out)))
        v = v.view(v.size(0), -1)
        v = F.relu(self.value_fc1(v))
        v = torch.tanh(self.value_fc2(v))
        
        # Policy Head
        p = F.relu(self.policy_bn(self.policy_conv(out)))
        p = p.view(p.size(0), -1)
        logits = self.policy_fc(p)
        
        return logits, v

def encode_state(p1_pos, p2_pos, h_walls, v_walls, p1_path, p2_path, p1_walls_left, p2_walls_left, is_p1_turn):
    """
    Encodes the Quoridor board state into a (11, 9, 9) tensor representation.
    
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
    
    # Active vs Inactive player perspective
    active_pos = p1_pos if is_p1_turn else p2_pos
    opp_pos = p2_pos if is_p1_turn else p1_pos
    active_path = p1_path if is_p1_turn else p2_path
    opp_path = p2_path if is_p1_turn else p1_path
    active_walls = p1_walls_left if is_p1_turn else p2_walls_left
    opp_walls = p2_walls_left if is_p1_turn else p1_walls_left
    
    # 0. Your pawn position (active player)
    tensor[0, active_pos[0], active_pos[1]] = 1.0
    
    # 1. Opponent pawn position
    tensor[1, opp_pos[0], opp_pos[1]] = 1.0
    
    # 2. Horizontal walls (8x8 padded to 9x9 by leaving row/col 8 as 0)
    for wx, wy in h_walls:
        if 0 <= wx < 8 and 0 <= wy < 8:
            tensor[2, wx, wy] = 1.0
            
    # 3. Vertical walls (8x8 padded to 9x9)
    for wx, wy in v_walls:
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
    
    # 10. Absolute player identity: 1.0 if the active player is P1, 0.0 if P2.
    # Useful because P1 and P2 have asymmetric goals (opposite sides of the board).
    tensor[10, :, :] = 1.0 if is_p1_turn else 0.0

    return tensor

# Action space: 140 total
#   0-3:   Regular moves (N, S, E, W)
#   4-7:   Straight jumps (N, S, E, W)
#   8-11:  Diagonal jumps (NE, NW, SE, SW)
#   12-75: Horizontal walls (wx=0..7, wy=0..7)  -> 12 + wy*8 + wx
#   76-139: Vertical walls (wx=0..7, wy=0..7)   -> 76 + wy*8 + wx
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

def export_to_onnx(model, filepath="quoridor_model.onnx"):
    model.eval()
    dummy_input = torch.randn(1, 11, 9, 9, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy_input,
        filepath,
        export_params=True,
        opset_version=18,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['policy', 'value'],
        dynamic_axes={'input': {0: 'batch_size'}, 'policy': {0: 'batch_size'}, 'value': {0: 'batch_size'}}
    )
