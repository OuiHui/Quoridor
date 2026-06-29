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
        
        # Policy Head: (128, 9, 9) -> Conv(128, 4, 1) -> BN -> ReLU -> Flatten -> Linear(4*9*9, 133)
        self.policy_conv = nn.Conv2d(channels, 4, kernel_size=1, bias=False)
        self.policy_bn = nn.BatchNorm2d(4)
        self.policy_fc = nn.Linear(4 * 9 * 9, 133)

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
    
    # 0. Your pawn position
    tensor[0, p1_pos[0], p1_pos[1]] = 1.0
    
    # 1. Opponent pawn position
    tensor[1, p2_pos[0], p2_pos[1]] = 1.0
    
    # 2. Horizontal walls (8x8 padded to 9x9 by leaving row/col 8 as 0)
    for wx, wy in h_walls:
        if 0 <= wx < 8 and 0 <= wy < 8:
            tensor[2, wx, wy] = 1.0
            
    # 3. Vertical walls (8x8 padded to 9x9)
    for wx, wy in v_walls:
        if 0 <= wx < 8 and 0 <= wy < 8:
            tensor[3, wx, wy] = 1.0
            
    # 4. Your shortest path length / 20.0
    p1_dist = len(p1_path) if p1_path else 20
    tensor[4, :, :] = min(p1_dist / 20.0, 1.0)
    
    # 5. Opponent shortest path length / 20.0
    p2_dist = len(p2_path) if p2_path else 20
    tensor[5, :, :] = min(p2_dist / 20.0, 1.0)
    
    # 6. Your path cells (binary 9x9)
    if p1_path:
        for px, py in p1_path:
            tensor[6, px, py] = 1.0
            
    # 7. Opponent path cells (binary 9x9)
    if p2_path:
        for px, py in p2_path:
            tensor[7, px, py] = 1.0
            
    # 8. Your walls remaining / 10.0
    tensor[8, :, :] = min(p1_walls_left / 10.0, 1.0)
    
    # 9. Opponent walls remaining / 10.0
    tensor[9, :, :] = min(p2_walls_left / 10.0, 1.0)
    
    # 10. Turn indicator (all 0s if your turn, all 1s if opponent's turn)
    # Turn indicator from the active player's perspective:
    if not is_p1_turn:
        tensor[10, :, :] = 1.0
        
    return tensor

def map_action_to_index(action):
    """
    Maps an action dictionary to an index in [0, 132].
    
    Pawn moves (5 total):
        N: 0, S: 1, E: 2, W: 3, jump-over: 4
        
    Horizontal walls (64 total):
        (wx, wy) -> 5 + wy * 8 + wx
        
    Vertical walls (64 total):
        (wx, wy) -> 69 + wy * 8 + wx
    """
    action_type = action.get('type')
    if action_type == 'move':
        move_dir = action.get('dir')
        if move_dir == 'N': return 0
        if move_dir == 'S': return 1
        if move_dir == 'E': return 2
        if move_dir == 'W': return 3
        if move_dir == 'jump': return 4
    elif action_type == 'wall':
        wall_type = action.get('wallType')
        wx = action.get('x')
        wy = action.get('y')
        if wall_type == 'h':
            return 5 + wy * 8 + wx
        elif wall_type == 'v':
            return 69 + wy * 8 + wx
    raise ValueError(f"Unknown action format: {action}")

def map_index_to_action(index, px, py, ox, oy):
    """
    Maps an index in [0, 132] to an action dictionary.
    Inputs px, py, ox, oy are needed to compute the target coordinates for pawn moves.
    """
    if index < 5:
        if index == 0: return {'type': 'move', 'dir': 'N', 'to': (px, py + 1)}
        if index == 1: return {'type': 'move', 'dir': 'S', 'to': (px, py - 1)}
        if index == 2: return {'type': 'move', 'dir': 'E', 'to': (px + 1, py)}
        if index == 3: return {'type': 'move', 'dir': 'W', 'to': (px - 1, py)}
        if index == 4:
            # Resolving jump target based on opponent relative position
            dx, dy = ox - px, oy - py
            if abs(dx) == 1 and dy == 0:
                return {'type': 'move', 'dir': 'jump', 'to': (ox + dx, oy)}
            elif dx == 0 and abs(dy) == 1:
                return {'type': 'move', 'dir': 'jump', 'to': (ox, oy + dy)}
            # If diagonal jump is needed, it must be validated from the game rules.
            return {'type': 'move', 'dir': 'jump', 'to': (ox, oy)}
    elif index < 69:
        wall_idx = index - 5
        wy = wall_idx // 8
        wx = wall_idx % 8
        return {'type': 'wall', 'wallType': 'h', 'x': wx, 'y': wy}
    else:
        wall_idx = index - 69
        wy = wall_idx // 8
        wx = wall_idx % 8
        return {'type': 'wall', 'wallType': 'v', 'x': wx, 'y': wy}

def export_to_onnx(model, filepath="quoridor_model.onnx"):
    """
    Exports the PyTorch model to ONNX format.
    """
    model.eval()
    dummy_input = torch.randn(1, 11, 9, 9, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy_input,
        filepath,
        export_params=True,
        opset_version=12,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['policy', 'value'],
        dynamic_axes={'input': {0: 'batch_size'}, 'policy': {0: 'batch_size'}, 'value': {0: 'batch_size'}}
    )
