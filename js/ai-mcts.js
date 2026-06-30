import { findShortestPath, getValidPawnMoves, validateWallPlacement } from './engine.js';
import { evaluateBoard, generateSmartMoves } from './ai-eval.js';

// ACTION SPACE CONSTANTS
const PAWN_ACTIONS_COUNT = 12;     // 4 orthogonal moves + 4 straight jumps + 4 diagonal jumps
const WALL_GRID_SIZE = 8;
const HORIZONTAL_WALLS_START = 12;
const VERTICAL_WALLS_START = 76;
const TOTAL_ACTIONS = 140;

const MOVE_DIR_TO_IDX = {
    'N': 0, 'S': 1, 'E': 2, 'W': 3,
    'jump_N': 4, 'jump_S': 5, 'jump_E': 6, 'jump_W': 7,
    'jump_NE': 8, 'jump_NW': 9, 'jump_SE': 10, 'jump_SW': 11
};

const IDX_TO_MOVE_DIR = {
    0: 'N', 1: 'S', 2: 'E', 3: 'W',
    4: 'jump_N', 5: 'jump_S', 6: 'jump_E', 7: 'jump_W',
    8: 'jump_NE', 9: 'jump_NW', 10: 'jump_SE', 11: 'jump_SW'
};

/**
 * Maps an action object to an index in [0..139]
 */
export function mapActionToIndex(action, px, py) {
    if (action.type === 'move') {
        const tx = action.to.x;
        const ty = action.to.y;
        const dx = tx - px;
        const dy = ty - py;
        
        let moveDir;
        if (dx === 0 && dy === 1) moveDir = 'N';
        else if (dx === 0 && dy === -1) moveDir = 'S';
        else if (dx === 1 && dy === 0) moveDir = 'E';
        else if (dx === -1 && dy === 0) moveDir = 'W';
        else if (dx === 0 && dy === 2) moveDir = 'jump_N';
        else if (dx === 0 && dy === -2) moveDir = 'jump_S';
        else if (dx === 2 && dy === 0) moveDir = 'jump_E';
        else if (dx === -2 && dy === 0) moveDir = 'jump_W';
        else if (dx === 1 && dy === 1) moveDir = 'jump_NE';
        else if (dx === -1 && dy === 1) moveDir = 'jump_NW';
        else if (dx === 1 && dy === -1) moveDir = 'jump_SE';
        else moveDir = 'jump_SW';
        
        return MOVE_DIR_TO_IDX[moveDir];
    } else if (action.type === 'wall') {
        const wx = action.x;
        const wy = action.y;
        if (action.wallType === 'h') {
            return HORIZONTAL_WALLS_START + wy * WALL_GRID_SIZE + wx;
        } else {
            return VERTICAL_WALLS_START + wy * WALL_GRID_SIZE + wx;
        }
    }
    return 0;
}

/**
 * Maps an index in [0..139] to an action object
 */
export function mapIndexToAction(index, px, py, ox, oy) {
    if (index < 12) {
        const moveDir = IDX_TO_MOVE_DIR[index];
        const delta = {
            'N': [0, 1], 'S': [0, -1], 'E': [1, 0], 'W': [-1, 0],
            'jump_N': [0, 2], 'jump_S': [0, -2], 'jump_E': [2, 0], 'jump_W': [-2, 0],
            'jump_NE': [1, 1], 'jump_NW': [-1, 1], 'jump_SE': [1, -1], 'jump_SW': [-1, -1]
        }[moveDir];
        return { type: 'move', to: { x: px + delta[0], y: py + delta[1] } };
    } else if (index < 76) {
        const wIdx = index - HORIZONTAL_WALLS_START;
        const wy = Math.floor(wIdx / WALL_GRID_SIZE);
        const wx = wIdx % WALL_GRID_SIZE;
        return { type: 'wall', wallType: 'h', x: wx, y: wy };
    } else {
        const wIdx = index - VERTICAL_WALLS_START;
        const wy = Math.floor(wIdx / WALL_GRID_SIZE);
        const wx = wIdx % WALL_GRID_SIZE;
        return { type: 'wall', wallType: 'v', x: wx, y: wy };
    }
}

/**
 * Rotates an action by 180 degrees.
 */
export function rotateAction180(action) {
    if (action.type === 'move') {
        return {
            type: 'move',
            to: { x: 8 - action.to.x, y: 8 - action.to.y }
        };
    } else if (action.type === 'wall') {
        return {
            type: 'wall',
            wallType: action.wallType,
            x: 7 - action.x,
            y: 7 - action.y
        };
    }
    return action;
}

/**
 * Perspective-aware mapping of an action to an index [0..139]
 */
export function mapActionToIndexPerspective(action, turn, p1Pos, p2Pos) {
    if (turn === 1) {
        return mapActionToIndex(action, p1Pos.x, p1Pos.y);
    } else {
        const rotatedAction = rotateAction180(action);
        const rx = 8 - p2Pos.x;
        const ry = 8 - p2Pos.y;
        return mapActionToIndex(rotatedAction, rx, ry);
    }
}

/**
 * Perspective-aware mapping of an index [0..139] to an action
 */
export function mapIndexToActionPerspective(index, turn, p1Pos, p2Pos) {
    if (turn === 1) {
        return mapIndexToAction(index, p1Pos.x, p1Pos.y, p2Pos.x, p2Pos.y);
    } else {
        const rx = 8 - p2Pos.x;
        const ry = 8 - p2Pos.y;
        const ox = 8 - p1Pos.x;
        const oy = 8 - p1Pos.y;
        const actRot = mapIndexToAction(index, rx, ry, ox, oy);
        return rotateAction180(actRot);
    }
}

/**
 * Converts the JavaScript board state into the (11, 9, 9) input tensor.
 * Returns a Float32Array of length 891 (11 * 9 * 9).
 */
export function tensorizeBoardState(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn) {
    const data = new Float32Array(11 * 9 * 9);
    
    // Helper to write to 3D tensor index (c, x, y)
    function write(c, x, y, val) {
        data[c * 81 + x * 9 + y] = val;
    }
    
    // Find shortest paths for path cells & length channels
    const p1Path = findShortestPath(p1Pos.x, p1Pos.y, 8, hWalls, vWalls) || [];
    const p2Path = findShortestPath(p2Pos.x, p2Pos.y, 0, hWalls, vWalls) || [];
    
    const p1Dist = p1Path.length > 0 ? p1Path.length : 20;
    const p2Dist = p2Path.length > 0 ? p2Path.length : 20;
    
    // Turn is 1 (P1) or 2 (P2)
    const isP1Turn = turn === 1;
    
    // Determine active vs inactive player positions and paths with perspective rotation
    let activeX, activeY, oppX, oppY;
    let activePathCells = [], oppPathCells = [];
    let activeDist, oppDist;
    let activeWallsLeft, oppWallsLeft;
    
    if (isP1Turn) {
        activeX = p1Pos.x; activeY = p1Pos.y;
        oppX = p2Pos.x; oppY = p2Pos.y;
        activePathCells = p1Path;
        oppPathCells = p2Path;
        activeDist = p1Dist;
        oppDist = p2Dist;
        activeWallsLeft = p1Walls;
        oppWallsLeft = p2Walls;
    } else {
        // Rotate 180 degrees
        activeX = 8 - p2Pos.x; activeY = 8 - p2Pos.y;
        oppX = 8 - p1Pos.x; oppY = 8 - p1Pos.y;
        activePathCells = p2Path.map(cell => ({ x: 8 - cell.x, y: 8 - cell.y }));
        oppPathCells = p1Path.map(cell => ({ x: 8 - cell.x, y: 8 - cell.y }));
        activeDist = p2Dist;
        oppDist = p1Dist;
        activeWallsLeft = p2Walls;
        oppWallsLeft = p1Walls;
    }
    
    // Fill channels 0-10
    // Channel 0: Your pawn position (active player)
    write(0, activeX, activeY, 1.0);
    
    // Channel 1: Opponent pawn position
    write(1, oppX, oppY, 1.0);
    
    // Channel 2: Horizontal walls (8x8 grid mapped to 9x9 by padding last row/col)
    // Supports hWalls as either Map or Array representation
    if (hWalls instanceof Map) {
        for (const key of hWalls.keys()) {
            const [wx, wy] = key.split(',').map(Number);
            if (isP1Turn) {
                if (wx >= 0 && wx < 8 && wy >= 0 && wy < 8) {
                    write(2, wx, wy, 1.0);
                }
            } else {
                const rx = 7 - wx;
                const ry = 7 - wy;
                if (rx >= 0 && rx < 8 && ry >= 0 && ry < 8) {
                    write(2, rx, ry, 1.0);
                }
            }
        }
    } else {
        for (let wy = 0; wy < 8; wy++) {
            for (let wx = 0; wx < 8; wx++) {
                if (hWalls[wy * 8 + wx]) {
                    if (isP1Turn) {
                        write(2, wx, wy, 1.0);
                    } else {
                        write(2, 7 - wx, 7 - wy, 1.0);
                    }
                }
            }
        }
    }
    
    // Channel 3: Vertical walls (8x8 mapped to 9x9)
    if (vWalls instanceof Map) {
        for (const key of vWalls.keys()) {
            const [wx, wy] = key.split(',').map(Number);
            if (isP1Turn) {
                if (wx >= 0 && wx < 8 && wy >= 0 && wy < 8) {
                    write(3, wx, wy, 1.0);
                }
            } else {
                const rx = 7 - wx;
                const ry = 7 - wy;
                if (rx >= 0 && rx < 8 && ry >= 0 && ry < 8) {
                    write(3, rx, ry, 1.0);
                }
            }
        }
    } else {
        for (let wy = 0; wy < 8; wy++) {
            for (let wx = 0; wx < 8; wx++) {
                if (vWalls[wy * 8 + wx]) {
                    if (isP1Turn) {
                        write(3, wx, wy, 1.0);
                    } else {
                        write(3, 7 - wx, 7 - wy, 1.0);
                    }
                }
            }
        }
    }
    
    // Channel 4: Your shortest path length (normalized by 20.0)
    const normActivePathLen = Math.min(activeDist / 20.0, 1.0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(4, x, y, normActivePathLen);
        }
    }
    
    // Channel 5: Opponent shortest path length (normalized by 20.0)
    const normOppPathLen = Math.min(oppDist / 20.0, 1.0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(5, x, y, normOppPathLen);
        }
    }
    
    // Channel 6: Your path cells
    for (const cell of activePathCells) {
        write(6, cell.x, cell.y, 1.0);
    }
    
    // Channel 7: Opponent path cells
    for (const cell of oppPathCells) {
        write(7, cell.x, cell.y, 1.0);
    }
    
    // Channel 8: Your walls remaining (normalized by 10.0)
    const normActiveWalls = Math.min(activeWallsLeft / 10.0, 1.0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(8, x, y, normActiveWalls);
        }
    }
    
    // Channel 9: Opponent walls remaining (normalized by 10.0)
    const normOppWalls = Math.min(oppWallsLeft / 10.0, 1.0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(9, x, y, normOppWalls);
        }
    }
    
    // Channel 10: Absolute player identity: 1.0 if active player is P1, 0.0 if P2.
    const identityVal = isP1Turn ? 1.0 : 0.0;
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(10, x, y, identityVal);
        }
    }
    
    return data;
}

// MCTS NODE REPRESENTATION
class MCTSNode {
    constructor(state, parent = null, actionIdx = null, prior = 0.0) {
        this.state = state; // { p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn }
        this.parent = parent;
        this.actionIdx = actionIdx;
        this.prior = prior;
        this.children = new Map(); // actionIdx -> MCTSNode
        this.N = 0;   // Visit count
        this.W = 0.0; // Total value
        self.Q = 0.0; // Mean action value
    }
    
    get Q() {
        return this.N > 0 ? this.W / this.N : 0.0;
    }
    
    isLeaf() {
        return this.children.size === 0;
    }
}

// Generate valid actions for MCTS expansion
function getValidMCTSActions(state) {
    const actions = [];
    const isP1 = state.turn === 1;
    const myPos = isP1 ? state.p1Pos : state.p2Pos;
    const oppPos = isP1 ? state.p2Pos : state.p1Pos;
    
    // 1. Pawn moves
    const pawnMoves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, state.hWalls, state.vWalls);
    for (const m of pawnMoves) {
        actions.push({ type: 'move', to: m });
    }
    
    // 2. Wall moves
    const wallsLeft = isP1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft > 0) {
        for (let wx = 0; wx < 8; wx++) {
            for (let wy = 0; wy < 8; wy++) {
                if (validateWallPlacement(wx, wy, 'h', state.p1Pos, state.p2Pos, state.hWalls, state.vWalls)) {
                    actions.push({ type: 'wall', wallType: 'h', x: wx, y: wy });
                }
                if (validateWallPlacement(wx, wy, 'v', state.p1Pos, state.p2Pos, state.hWalls, state.vWalls)) {
                    actions.push({ type: 'wall', wallType: 'v', x: wx, y: wy });
                }
            }
        }
    }
    
    return actions;
}

// Helper to transition state based on action
function transitionState(state, action) {
    const nextState = {
        p1Pos: { ...state.p1Pos },
        p2Pos: { ...state.p2Pos },
        hWalls: new Map(state.hWalls),
        vWalls: new Map(state.vWalls),
        p1Walls: state.p1Walls,
        p2Walls: state.p2Walls,
        turn: state.turn === 1 ? 2 : 1
    };
    
    const isP1 = state.turn === 1;
    if (action.type === 'move') {
        if (isP1) nextState.p1Pos = action.to; else nextState.p2Pos = action.to;
    } else {
        const key = `${action.x},${action.y}`;
        if (action.wallType === 'h') nextState.hWalls.set(key, true);
        else nextState.vWalls.set(key, true);
        if (isP1) nextState.p1Walls--; else nextState.p2Walls--;
    }
    
    return nextState;
}

// Check for game over
function checkGameOver(state) {
    if (state.p1Pos.y === 8) return 1; // P1 wins
    if (state.p2Pos.y === 0) return -1; // P2 wins
    return 0; // playing
}

// MONTE CARLO TREE SEARCH GUIDED BY NEURAL NETWORK OR HEURISTIC FALLBACK
export async function runMCTS(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn, numSimulations = 60, modelSession = null) {
    const rootState = {
        p1Pos: { ...p1Pos },
        p2Pos: { ...p2Pos },
        hWalls: new Map(hWalls),
        vWalls: new Map(vWalls),
        p1Walls,
        p2Walls,
        turn
    };
    
    const root = new MCTSNode(rootState);
    const cPuct = 1.4;
    
    for (let sim = 0; sim < numSimulations; sim++) {
        let node = root;
        
        // 1. SELECTION
        while (!node.isLeaf()) {
            let bestChild = null;
            let bestScore = -Infinity;
            
            for (const child of node.children.values()) {
                // Node stores Q value from the perspective of active player at child node.
                // Parent's active player values child value as opponent outcome (-Q).
                const qScore = -child.Q;
                const uScore = qScore + cPuct * child.prior * (Math.sqrt(node.N) / (1 + child.N));
                if (uScore > bestScore) {
                    bestScore = uScore;
                    bestChild = child;
                }
            }
            if (!bestChild) break;
            node = bestChild;
        }
        
        // Check terminal state
        const outcome = checkGameOver(node.state);
        if (outcome !== 0) {
            // Backpropagate terminal result
            // Winner gets 1.0, loser gets -1.0.
            const winnerVal = (outcome === 1 && node.state.turn === 1) || (outcome === -1 && node.state.turn === 2) ? 1.0 : -1.0;
            backpropagate(node, winnerVal);
            continue;
        }
        
        // 2. EXPANSION & EVALUATION
        let policy, value;
        const validActions = getValidMCTSActions(node.state);
        
        if (validActions.length === 0) {
            // Draw / terminal block check
            backpropagate(node, 0);
            continue;
        }
        
        if (modelSession) {
            // --- ONNX MODEL INFERENCE ---
            try {
                const tensorData = tensorizeBoardState(
                    node.state.p1Pos, node.state.p2Pos,
                    node.state.hWalls, node.state.vWalls,
                    node.state.p1Walls, node.state.p2Walls,
                    node.state.turn
                );
                const inputTensor = new ort.Tensor('float32', tensorData, [1, 11, 9, 9]);
                const results = await modelSession.run({ input: inputTensor });
                
                const policyData = results.policy.data;
                const rawValue = results.value.data[0];
                
                // Softmax on policy output
                const expPolicy = policyData.map(Math.exp);
                const sumExp = expPolicy.reduce((a, b) => a + b, 0);
                policy = expPolicy.map(v => v / sumExp);
                value = rawValue;
            } catch (e) {
                console.error("ONNX evaluation error, fallback to heuristics:", e);
                const heuristicEval = fallbackEvaluate(node.state, validActions);
                policy = heuristicEval.policy;
                value = heuristicEval.value;
            }
        } else {
            // --- HEURISTIC SEARCH FALLBACK ---
            const heuristicEval = fallbackEvaluate(node.state, validActions);
            policy = heuristicEval.policy;
            value = heuristicEval.value;
        }
        
        // Expand node children
        for (const action of validActions) {
            const idx = mapActionToIndexPerspective(action, node.state.turn, node.state.p1Pos, node.state.p2Pos);
            const nextState = transitionState(node.state, action);
            const priorProb = policy[idx] || 0.0;
            node.children.set(idx, new MCTSNode(nextState, node, idx, priorProb));
        }
        
        // 3. BACKPROPAGATION
        backpropagate(node, value);
    }
    
    // Choose best move based on maximum visit counts (robust policy)
    let bestActionIdx = -1;
    let maxVisits = -1;
    for (const [idx, child] of root.children.entries()) {
        if (child.N > maxVisits) {
            maxVisits = child.N;
            bestActionIdx = idx;
        }
    }
    
    if (bestActionIdx === -1) {
        // Fallback to random legal move
        const actions = getValidMCTSActions(rootState);
        return actions[0] || null;
    }
    
    return mapIndexToActionPerspective(bestActionIdx, turn, p1Pos, p2Pos);
}

function isP1Turn(state) {
    return state.turn === 1;
}

// Backpropagation up the tree with alternating signs
function backpropagate(node, value) {
    let curr = node;
    let tempValue = value;
    while (curr !== null) {
        curr.N += 1;
        curr.W += tempValue;
        
        // Negate the value for the parent (since parent wants to minimize active child's score)
        tempValue = -tempValue;
        curr = curr.parent;
    }
}

// Fallback logic mapping state & options to policy probability distribution
function fallbackEvaluate(state, validActions) {
    const isP1 = state.turn === 1;
    const playerNum = isP1 ? 1 : 2;
    
    // Estimate board value (mapped to [-1, 1] using tanh)
    // evaluateBoard yields positive score for P1, negative for P2.
    // We adjust the score so it is positive for current player.
    const score = evaluateBoard(state.p1Pos, state.p2Pos, state.hWalls, state.vWalls, state.p1Walls, state.p2Walls, isP1);
    const multiplier = isP1 ? 1.0 : -1.0;
    const value = Math.tanh((score * multiplier) / 50.0);
    
    // Build simulated policy probabilities
    const policy = new Float32Array(TOTAL_ACTIONS);
    
    // Fetch smart candidate moves from our heuristic generator
    const smartCandidates = generateSmartMoves(
        playerNum,
        state.p1Pos,
        state.p2Pos,
        state.hWalls,
        state.vWalls,
        state.p1Walls,
        state.p2Walls
    );
    
    // Convert smartCandidates list to a set of keys for fast lookup
    const smartSet = new Set();
    for (const sc of smartCandidates) {
        if (sc.type === 'move') {
            smartSet.add(`move:${sc.to.x},${sc.to.y}`);
        } else if (sc.type === 'wall') {
            smartSet.add(`wall:${sc.x},${sc.y},${sc.wallType}`);
        }
    }
    
    const myPos = isP1 ? state.p1Pos : state.p2Pos;
    let scores = [];
    let sumExp = 0.0;
    
    for (const action of validActions) {
        const idx = mapActionToIndexPerspective(action, state.turn, state.p1Pos, state.p2Pos);
        
        // Baseline action score
        let actionScore = 1.0;
        
        // Identify if this is a smart candidate
        let key = '';
        if (action.type === 'move') {
            key = `move:${action.to.x},${action.to.y}`;
        } else if (action.type === 'wall') {
            key = `wall:${action.x},${action.y},${action.wallType}`;
        }
        
        const isSmart = smartSet.has(key);
        
        if (action.type === 'move') {
            const forwardGain = isP1 ? (action.to.y - myPos.y) : (myPos.y - action.to.y);
            // Boost smart moves and moves that go forward
            actionScore = (isSmart ? 4.0 : 2.0) + forwardGain * 2.0;
        } else {
            // Boost smart wall placements (barricades) significantly so MCTS evaluates them
            actionScore = isSmart ? 3.5 : 0.5;
        }
        
        scores.push({ idx, expVal: Math.exp(actionScore) });
        sumExp += Math.exp(actionScore);
    }
    
    for (const item of scores) {
        policy[item.idx] = item.expVal / sumExp;
    }
    
    return { policy, value };
}
