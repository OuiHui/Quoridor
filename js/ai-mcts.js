import * as ort from 'onnxruntime-web';
import { findShortestPath, getValidPawnMoves, validateWallPlacement, validateWallPlacementFast, getGuaranteedWinner, isMoveBlockedFast, getCanonicalStateHash } from './engine.js';
import { evaluateBoard, generateSmartMoves } from './ai-eval.js';

// ACTION SPACE CONSTANTS
const PAWN_ACTIONS_COUNT = 12;     // 4 orthogonal moves + 4 straight jumps + 4 diagonal jumps
const WALL_GRID_SIZE = 8;
const HORIZONTAL_WALLS_START = 12;
const VERTICAL_WALLS_START = 76;
const TOTAL_ACTIONS = 140;

export function mirrorPolicy(policy) {
    const mirrored = new Float32Array(140);
    if (!policy) return mirrored;
    mirrored[0] = policy[0];
    mirrored[1] = policy[1];
    mirrored[2] = policy[3];
    mirrored[3] = policy[2];
    mirrored[4] = policy[4];
    mirrored[5] = policy[5];
    mirrored[6] = policy[7];
    mirrored[7] = policy[6];
    mirrored[8] = policy[9];
    mirrored[9] = policy[8];
    mirrored[10] = policy[11];
    mirrored[11] = policy[10];

    for (let wy = 0; wy < 8; wy++) {
        for (let wx = 0; wx < 8; wx++) {
            mirrored[12 + wy * 8 + (7 - wx)] = policy[12 + wy * 8 + wx];
            mirrored[76 + wy * 8 + (7 - wx)] = policy[76 + wy * 8 + wx];
        }
    }
    return mirrored;
}

export function computeReverseBFSDistancesJS(hWallsArray, vWallsArray, targetY) {
    const dist = new Int32Array(81);
    dist.fill(20);
    const queue = new Int32Array(81);
    let head = 0, tail = 0;
    for (let x = 0; x < 9; x++) {
        const idx = x * 9 + targetY;
        dist[idx] = 0;
        queue[tail++] = idx;
    }
    const dirs = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
    while (head < tail) {
        const curr = queue[head++];
        const cx = Math.floor(curr / 9);
        const cy = curr % 9;
        const nextD = dist[curr] + 1;
        for (let i = 0; i < 4; i++) {
            const nx = cx + dirs[i].dx;
            const ny = cy + dirs[i].dy;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !isMoveBlockedFast(cx, cy, nx, ny, hWallsArray, vWallsArray)) {
                const nidx = nx * 9 + ny;
                if (dist[nidx] > nextD) {
                    dist[nidx] = nextD;
                    queue[tail++] = nidx;
                }
            }
        }
    }
    return dist;
}

export function computeDAGCriticalityJS(hWallsArray, vWallsArray, sx, sy, targetY, R) {
    const crit = new Float32Array(81);
    const startIdx = sx * 9 + sy;
    const L = R[startIdx];
    if (L >= 20) return crit;
    if (L === 0) {
        crit[startIdx] = 1.0;
        return crit;
    }

    const D = new Int32Array(81);
    D.fill(-1);
    const numFwd = new Float64Array(81);
    D[startIdx] = 0;
    numFwd[startIdx] = 1.0;

    const queue = new Int32Array(81);
    let head = 0, tail = 0;
    queue[tail++] = startIdx;

    const dirs = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
    while (head < tail) {
        const curr = queue[head++];
        const cx = Math.floor(curr / 9);
        const cy = curr % 9;
        for (let i = 0; i < 4; i++) {
            const nx = cx + dirs[i].dx;
            const ny = cy + dirs[i].dy;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !isMoveBlockedFast(cx, cy, nx, ny, hWallsArray, vWallsArray)) {
                const nidx = nx * 9 + ny;
                if (D[nidx] === -1) {
                    D[nidx] = D[curr] + 1;
                    numFwd[nidx] = numFwd[curr];
                    queue[tail++] = nidx;
                } else if (D[nidx] === D[curr] + 1) {
                    numFwd[nidx] += numFwd[curr];
                }
            }
        }
    }

    const numRev = new Float64Array(81);
    for (let x = 0; x < 9; x++) {
        const idx = x * 9 + targetY;
        if (R[idx] === 0) numRev[idx] = 1.0;
    }

    for (let d = 1; d <= L; d++) {
        for (let x = 0; x < 9; x++) {
            for (let y = 0; y < 9; y++) {
                const uidx = x * 9 + y;
                if (R[uidx] === d) {
                    for (let i = 0; i < 4; i++) {
                        const nx = x + dirs[i].dx;
                        const ny = y + dirs[i].dy;
                        if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !isMoveBlockedFast(x, y, nx, ny, hWallsArray, vWallsArray)) {
                            const vidx = nx * 9 + ny;
                            if (R[vidx] === d - 1) {
                                numRev[uidx] += numRev[vidx];
                            }
                        }
                    }
                }
            }
        }
    }

    const totalPaths = numRev[startIdx];
    if (totalPaths <= 0) return crit;

    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            const idx = x * 9 + y;
            if (D[idx] >= 0 && (D[idx] + R[idx] === L)) {
                crit[idx] = (numFwd[idx] * numRev[idx]) / totalPaths;
            }
        }
    }
    return crit;
}

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

    // Find shortest paths for path cells & length channels (opponent-aware, matching C++ tensorize)
    const p1Path = findShortestPath(p1Pos.x, p1Pos.y, 8, hWalls, vWalls, p2Pos) || [];
    const p2Path = findShortestPath(p2Pos.x, p2Pos.y, 0, hWalls, vWalls, p1Pos) || [];

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

    // Build perspective-rotated flat 8x8 wall arrays
    const viewHWalls = new Uint8Array(64);
    const viewVWalls = new Uint8Array(64);
    if (hWalls instanceof Map) {
        for (const key of hWalls.keys()) {
            const [wx, wy] = key.split(',').map(Number);
            if (isP1Turn) {
                if (wx >= 0 && wx < 8 && wy >= 0 && wy < 8) viewHWalls[wy * 8 + wx] = 1;
            } else {
                const rx = 7 - wx;
                const ry = 7 - wy;
                if (rx >= 0 && rx < 8 && ry >= 0 && ry < 8) viewHWalls[ry * 8 + rx] = 1;
            }
        }
    } else {
        for (let wy = 0; wy < 8; wy++) {
            for (let wx = 0; wx < 8; wx++) {
                if (hWalls[wy * 8 + wx]) {
                    if (isP1Turn) viewHWalls[wy * 8 + wx] = 1;
                    else viewHWalls[(7 - wy) * 8 + (7 - wx)] = 1;
                }
            }
        }
    }

    if (vWalls instanceof Map) {
        for (const key of vWalls.keys()) {
            const [wx, wy] = key.split(',').map(Number);
            if (isP1Turn) {
                if (wx >= 0 && wx < 8 && wy >= 0 && wy < 8) viewVWalls[wy * 8 + wx] = 1;
            } else {
                const rx = 7 - wx;
                const ry = 7 - wy;
                if (rx >= 0 && rx < 8 && ry >= 0 && ry < 8) viewVWalls[ry * 8 + rx] = 1;
            }
        }
    } else {
        for (let wy = 0; wy < 8; wy++) {
            for (let wx = 0; wx < 8; wx++) {
                if (vWalls[wy * 8 + wx]) {
                    if (isP1Turn) viewVWalls[wy * 8 + wx] = 1;
                    else viewVWalls[(7 - wy) * 8 + (7 - wx)] = 1;
                }
            }
        }
    }

    // Channel 0: Active pawn position
    write(0, activeX, activeY, 1.0);

    // Channel 1: Opponent pawn position
    write(1, oppX, oppY, 1.0);

    // Channel 2: Horizontal walls (8x8 in 9x9)
    for (let wy = 0; wy < 8; wy++) {
        for (let wx = 0; wx < 8; wx++) {
            if (viewHWalls[wy * 8 + wx]) write(2, wx, wy, 1.0);
        }
    }

    // Channel 3: Vertical walls (8x8 in 9x9)
    for (let wy = 0; wy < 8; wy++) {
        for (let wx = 0; wx < 8; wx++) {
            if (viewVWalls[wy * 8 + wx]) write(3, wx, wy, 1.0);
        }
    }

    // Channel 4: Active player 2D Reverse-BFS Distance Map (to target row 8)
    const rActive = computeReverseBFSDistancesJS(viewHWalls, viewVWalls, 8);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(4, x, y, Math.min(rActive[x * 9 + y] / 20.0, 1.0));
        }
    }

    // Channel 5: Opponent player 2D Reverse-BFS Distance Map (to target row 0)
    const rOpp = computeReverseBFSDistancesJS(viewHWalls, viewVWalls, 0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(5, x, y, Math.min(rOpp[x * 9 + y] / 20.0, 1.0));
        }
    }

    // Channel 6: Active player All-Shortest-Paths DAG Criticality Mask
    const critActive = computeDAGCriticalityJS(viewHWalls, viewVWalls, activeX, activeY, 8, rActive);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(6, x, y, critActive[x * 9 + y]);
        }
    }

    // Channel 7: Opponent player All-Shortest-Paths DAG Criticality Mask
    const critOpp = computeDAGCriticalityJS(viewHWalls, viewVWalls, oppX, oppY, 0, rOpp);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(7, x, y, critOpp[x * 9 + y]);
        }
    }

    // Channel 8: Active walls remaining / 10.0
    const normActiveWalls = Math.min(activeWallsLeft / 10.0, 1.0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(8, x, y, normActiveWalls);
        }
    }

    // Channel 9: Opponent walls remaining / 10.0
    const normOppWalls = Math.min(oppWallsLeft / 10.0, 1.0);
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(9, x, y, normOppWalls);
        }
    }

    // Channel 10: Path advantage: (oppDist - activeDist) / 16.0, clamped to [-1, 1]
    // alongside jump-parity tempo: even Manhattan distance gives active player straight jump initiative (+1.0),
    // odd gives opponent jump initiative (-1.0). Arranged in checkerboard ((x+y)%2 == 0: pathAdvantage, odd: jumpParity)
    // preserving horizontal symmetry and 180-degree perspective invariance.
    const actDistRaw = rActive[activeX * 9 + activeY];
    const oppDistRaw = rOpp[oppX * 9 + oppY];
    const pathAdvantage = Math.max(-1.0, Math.min(1.0, (oppDistRaw - actDistRaw) / 16.0));
    const mDist = Math.abs(activeX - oppX) + Math.abs(activeY - oppY);
    const jumpParity = (mDist % 2 === 0) ? 1.0 : -1.0;
    for (let x = 0; x < 9; x++) {
        for (let y = 0; y < 9; y++) {
            write(10, x, y, ((x + y) % 2 === 0) ? pathAdvantage : jumpParity);
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
    }

    get Q() {
        return this.N > 0 ? this.W / this.N : 0.0;
    }

    isLeaf() {
        return this.children.size === 0;
    }
}

// Convert Map or Array wall representations to flat Uint8Array(64)
export function toUint8Array(walls) {
    if (walls instanceof Uint8Array) return walls.slice();
    const arr = new Uint8Array(64);
    if (walls instanceof Map) {
        for (const k of walls.keys()) {
            const [x, y] = k.split(',').map(Number);
            arr[y * 8 + x] = 1;
        }
    } else if (Array.isArray(walls)) {
        for (const item of walls) {
            const k = Array.isArray(item) ? item[0] : item;
            if (typeof k === 'string') {
                const [x, y] = k.split(',').map(Number);
                arr[y * 8 + x] = 1;
            }
        }
    }
    return arr;
}

// Generate valid actions for MCTS expansion (used as fallback)
function getValidMCTSActions(state) {
    const actions = [];
    const isP1 = state.turn === 1;
    const myPos = isP1 ? state.p1Pos : state.p2Pos;
    const oppPos = isP1 ? state.p2Pos : state.p1Pos;
    const hArr = state.hWalls instanceof Uint8Array ? state.hWalls : toUint8Array(state.hWalls);
    const vArr = state.vWalls instanceof Uint8Array ? state.vWalls : toUint8Array(state.vWalls);

    // 1. Pawn moves
    const pawnMoves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, hArr, vArr);
    for (const m of pawnMoves) {
        actions.push({ type: 'move', to: m });
    }

    // 2. Wall moves
    const wallsLeft = isP1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft > 0) {
        const p1Path = findShortestPath(state.p1Pos.x, state.p1Pos.y, 8, hArr, vArr, state.p2Pos) || [];
        const p2Path = findShortestPath(state.p2Pos.x, state.p2Pos.y, 0, hArr, vArr, state.p1Pos) || [];
        for (let wx = 0; wx < 8; wx++) {
            for (let wy = 0; wy < 8; wy++) {
                if (validateWallPlacementFast(wx, wy, 'h', state.p1Pos, state.p2Pos, hArr, vArr, p1Path, p2Path)) {
                    actions.push({ type: 'wall', wallType: 'h', x: wx, y: wy });
                }
                if (validateWallPlacementFast(wx, wy, 'v', state.p1Pos, state.p2Pos, hArr, vArr, p1Path, p2Path)) {
                    actions.push({ type: 'wall', wallType: 'v', x: wx, y: wy });
                }
            }
        }
    }

    return actions;
}

// Helper to transition state based on action using fast Uint8Array copies
function transitionState(state, action) {
    const nextState = {
        p1Pos: { ...state.p1Pos },
        p2Pos: { ...state.p2Pos },
        hWalls: state.hWalls.slice(),
        vWalls: state.vWalls.slice(),
        p1Walls: state.p1Walls,
        p2Walls: state.p2Walls,
        turn: state.turn === 1 ? 2 : 1
    };

    const isP1 = state.turn === 1;
    if (action.type === 'move') {
        if (isP1) nextState.p1Pos = action.to; else nextState.p2Pos = action.to;
    } else {
        const idx = action.y * 8 + action.x;
        if (action.wallType === 'h') nextState.hWalls[idx] = 1;
        else nextState.vWalls[idx] = 1;
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

// Module-level tree cache for subtree preservation across turns
let activeMCTSRoot = null;

// Transposition Table cache (canonical hash -> { policy, value, provenStatus })
const transpositionTable = new Map();
const MAX_TT_ENTRIES = 20000;

export function getTTSize() {
    return transpositionTable.size;
}

export function clearTT() {
    transpositionTable.clear();
}

function storeTT(hash, policy, value, provenStatus = 0) {
    if (transpositionTable.size >= MAX_TT_ENTRIES) {
        transpositionTable.clear();
    }
    transpositionTable.set(hash, { policy, value, provenStatus });
}

/**
 * Resets the active MCTS tree cache and Transposition Table.
 */
export function resetMCTSTree() {
    activeMCTSRoot = null;
    transpositionTable.clear();
}

export function getActiveMCTSRoot() {
    return activeMCTSRoot;
}

/**
 * Checks deep equality of two Quoridor game states.
 */
export function areStatesEqual(s1, s2) {
    if (!s1 || !s2) return false;
    if (s1.p1Pos.x !== s2.p1Pos.x || s1.p1Pos.y !== s2.p1Pos.y) return false;
    if (s1.p2Pos.x !== s2.p2Pos.x || s1.p2Pos.y !== s2.p2Pos.y) return false;
    if (s1.turn !== s2.turn) return false;
    if (s1.p1Walls !== s2.p1Walls || s1.p2Walls !== s2.p2Walls) return false;

    if (s1.hWalls instanceof Uint8Array && s2.hWalls instanceof Uint8Array) {
        for (let i = 0; i < 64; i++) {
            if (s1.hWalls[i] !== s2.hWalls[i] || s1.vWalls[i] !== s2.vWalls[i]) return false;
        }
        return true;
    }

    const h1Arr = s1.hWalls instanceof Uint8Array ? s1.hWalls : toUint8Array(s1.hWalls);
    const h2Arr = s2.hWalls instanceof Uint8Array ? s2.hWalls : toUint8Array(s2.hWalls);
    const v1Arr = s1.vWalls instanceof Uint8Array ? s1.vWalls : toUint8Array(s1.vWalls);
    const v2Arr = s2.vWalls instanceof Uint8Array ? s2.vWalls : toUint8Array(s2.vWalls);
    for (let i = 0; i < 64; i++) {
        if (h1Arr[i] !== h2Arr[i] || v1Arr[i] !== v2Arr[i]) return false;
    }

    return true;
}

/**
 * Traverses old search tree up to 2 levels deep to locate a pre-existing state node.
 */
function findMatchingNodeInTree(oldRoot, targetState) {
    if (!oldRoot) return null;
    if (areStatesEqual(oldRoot.state, targetState)) {
        return oldRoot;
    }
    for (const child of oldRoot.children.values()) {
        if (areStatesEqual(child.state, targetState)) {
            child.parent = null;
            return child;
        }
    }
    for (const child of oldRoot.children.values()) {
        for (const grandChild of child.children.values()) {
            if (areStatesEqual(grandChild.state, targetState)) {
                grandChild.parent = null;
                return grandChild;
            }
        }
    }
    return null;
}

// Expand an MCTS node using neural network policy with prior-first wall candidate filtering
function expandNodeWithPolicy(node, policy, isOpeningCheck = false) {
    if (node.children.size > 0) return;

    const actionPairs = [];
    const isP1 = node.state.turn === 1;
    const myPos = isP1 ? node.state.p1Pos : node.state.p2Pos;
    const oppPos = isP1 ? node.state.p2Pos : node.state.p1Pos;

    // 1. Pawn moves (fast orthogonal + jump checks, no reachability BFS needed)
    const pawnMoves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, node.state.hWalls, node.state.vWalls);
    for (const m of pawnMoves) {
        const action = { type: 'move', to: m };
        const idx = mapActionToIndexPerspective(action, node.state.turn, node.state.p1Pos, node.state.p2Pos);
        let p = policy[idx] || 0.0;
        if (idx >= 4 && idx <= 11) p = Math.max(p, 0.10);
        actionPairs.push({ action, idx, priorProb: p });
    }

    // 2. Wall moves (validated lazily in order of descending policy prior)
    const wallsLeft = isP1 ? node.state.p1Walls : node.state.p2Walls;
    if (wallsLeft > 0) {
        const candidateWalls = [];
        for (let idx = 12; idx < 140; idx++) {
            const p = policy[idx] || 0.0;
            if (p >= 0.005) {
                candidateWalls.push({ idx, p });
            }
        }
        candidateWalls.sort((a, b) => b.p - a.p);
        const topWalls = candidateWalls.slice(0, 32);

        const p1Path = findShortestPath(node.state.p1Pos.x, node.state.p1Pos.y, 8, node.state.hWalls, node.state.vWalls, node.state.p2Pos) || [];
        const p2Path = findShortestPath(node.state.p2Pos.x, node.state.p2Pos.y, 0, node.state.hWalls, node.state.vWalls, node.state.p1Pos) || [];

        for (const { idx, p } of topWalls) {
            const action = mapIndexToActionPerspective(idx, node.state.turn, node.state.p1Pos, node.state.p2Pos);
            if (action && action.type === 'wall') {
                if (validateWallPlacementFast(action.x, action.y, action.wallType, node.state.p1Pos, node.state.p2Pos, node.state.hWalls, node.state.vWalls, p1Path, p2Path)) {
                    actionPairs.push({ action, idx, priorProb: p });
                }
            }
        }
    }

    // Opening pawn prior floor check (plies 0-3 and 0 walls placed)
    if (isOpeningCheck) {
        let wallCount = 0;
        for (let i = 0; i < 64; i++) {
            if (node.state.hWalls[i]) wallCount++;
            if (node.state.vWalls[i]) wallCount++;
        }
        const estimatedPlies = (20 - node.state.p1Walls - node.state.p2Walls) + node.state.p1Pos.y + (8 - node.state.p2Pos.y);
        const moveCount = (node.state.moveCount !== undefined) ? node.state.moveCount : (wallCount > 0 ? 10 : estimatedPlies);
        if (moveCount < 4 && wallCount === 0) {
            let pawnMass = 0;
            const legalPawns = [];
            const legalWalls = [];
            for (const item of actionPairs) {
                if (item.idx < 12) {
                    pawnMass += item.priorProb;
                    legalPawns.push(item);
                } else {
                    legalWalls.push(item);
                }
            }
            const targetFloor = 0.50;
            if (pawnMass < targetFloor && legalPawns.length > 0) {
                const remainingWall = 1.0 - targetFloor;
                const wallMass = Math.max(1e-6, 1.0 - pawnMass);
                if (pawnMass > 1e-6) {
                    for (const item of legalPawns) item.priorProb *= (targetFloor / pawnMass);
                } else {
                    const perPawn = targetFloor / legalPawns.length;
                    for (const item of legalPawns) item.priorProb = perPawn;
                }
                const act0 = legalPawns.find(item => item.idx === 0);
                if (act0 && act0.priorProb < 0.35) {
                    const deficit = 0.35 - act0.priorProb;
                    act0.priorProb = 0.35;
                    let otherPawnSum = 0;
                    for (const item of legalPawns) if (item.idx !== 0) otherPawnSum += item.priorProb;
                    if (otherPawnSum > deficit) {
                        for (const item of legalPawns) if (item.idx !== 0) item.priorProb -= deficit * (item.priorProb / otherPawnSum);
                    }
                }
                if (wallMass > 1e-6 && legalWalls.length > 0) {
                    for (const item of legalWalls) item.priorProb *= (remainingWall / wallMass);
                }
            }
        }
    }

    if (actionPairs.length === 0) return;

    let policySum = 0.0;
    for (const pair of actionPairs) policySum += pair.priorProb;

    for (const { action, idx, priorProb } of actionPairs) {
        const nextState = transitionState(node.state, action);
        const normP = policySum > 1e-8 ? priorProb / policySum : 1.0 / actionPairs.length;
        node.children.set(idx, new MCTSNode(nextState, node, idx, normP));
    }
}

// Revert virtual loss and backpropagate actual leaf value
function revertVirtualLossAndBackprop(path, leafValue) {
    let tempValue = leafValue;
    for (let i = path.length - 1; i >= 0; i--) {
        const curr = path[i];
        curr.W += (1.0 + tempValue);
        tempValue = -tempValue;
    }
}

// MONTE CARLO TREE SEARCH GUIDED BY NEURAL NETWORK OR HEURISTIC FALLBACK
export async function runMCTS(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn, numSimulations = 128, modelSession = null, historyHashes = null) {
    const rootState = {
        p1Pos: { ...p1Pos },
        p2Pos: { ...p2Pos },
        hWalls: toUint8Array(hWalls),
        vWalls: toUint8Array(vWalls),
        p1Walls,
        p2Walls,
        turn
    };

    // Subtree reuse: search existing tree for a node matching the target rootState
    let root = findMatchingNodeInTree(activeMCTSRoot, rootState);
    if (!root) {
        root = new MCTSNode(rootState);
    } else {
        root.parent = null;
    }

    const cPuct = 1.4;
    const cFpu = 0.20;
    const PRUNING_THRESHOLD = 0.005;
    const isGumbel = numSimulations <= 128;
    const gumbelCandidates = [];

    // Ensure root is expanded
    if (root.isLeaf()) {
        const rootGameOver = checkGameOver(root.state);
        if (rootGameOver !== 0) return null;

        // Immediate 1-step goal win short-circuit
        const isP1 = root.state.turn === 1;
        const myPos = isP1 ? root.state.p1Pos : root.state.p2Pos;
        const oppPos = isP1 ? root.state.p2Pos : root.state.p1Pos;
        const pawnMoves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, root.state.hWalls, root.state.vWalls);
        for (const m of pawnMoves) {
            if ((isP1 && m.y === 8) || (!isP1 && m.y === 0)) {
                return { type: 'move', to: m };
            }
        }

        const { hash: rootHash, isMirrored: rootMirr } = getCanonicalStateHash(
            root.state.p1Pos, root.state.p2Pos,
            root.state.hWalls, root.state.vWalls,
            root.state.p1Walls, root.state.p2Walls,
            root.state.turn === 1
        );
        let rootPolicy, rootValue;
        const ttEntry = transpositionTable.get(rootHash);
        if (ttEntry && ttEntry.policy) {
            rootValue = ttEntry.value;
            rootPolicy = rootMirr ? mirrorPolicy(ttEntry.policy) : ttEntry.policy;
        } else {
            if (!modelSession) {
                throw new Error("AlphaZero ONNX model is not loaded. Cannot run AlphaZero MCTS without the model session.");
            }
            const tensorData = tensorizeBoardState(
                root.state.p1Pos, root.state.p2Pos,
                root.state.hWalls, root.state.vWalls,
                root.state.p1Walls, root.state.p2Walls,
                root.state.turn
            );

            let results = null;
            try {
                const inputTensor = new ort.Tensor('float32', tensorData, [1, 11, 9, 9]);
                results = await modelSession.run({ input: inputTensor });
            } catch (err) {
                console.warn('MCTS root inference error:', err);
            }

            if (results && results.policy && results.value) {
                const rawPolicy = results.policy.data;
                let maxL = -Infinity;
                for (let k = 0; k < 140; k++) if (rawPolicy[k] > maxL) maxL = rawPolicy[k];
                const expPolicy = new Float32Array(140);
                let sumExp = 0.0;
                for (let k = 0; k < 140; k++) {
                    const e = Math.exp(rawPolicy[k] - maxL);
                    expPolicy[k] = e;
                    sumExp += e;
                }
                rootPolicy = new Float32Array(140);
                for (let k = 0; k < 140; k++) rootPolicy[k] = expPolicy[k] / sumExp;
                rootValue = results.value.data[0];
            } else {
                rootPolicy = new Float32Array(140).fill(1.0 / 140);
                rootValue = 0.0;
            }

            const canonPolicy = rootMirr ? mirrorPolicy(rootPolicy) : rootPolicy;
            storeTT(rootHash, canonPolicy, rootValue, 0);
        }

        expandNodeWithPolicy(root, rootPolicy, true);
        backpropagate(root, rootValue);
    }

    const historySet = (historyHashes && historyHashes.length > 0) ? new Set(historyHashes) : null;

    // Initialize Gumbel AlphaZero candidates (Top-16 sampling)
    if (isGumbel && root.children.size > 0) {
        const scores = [];
        for (const [idx, child] of root.children.entries()) {
            const u = Math.max(1e-7, Math.min(1 - 1e-7, Math.random()));
            const g = -Math.log(-Math.log(u));
            let score = Math.log(Math.max(1e-8, child.prior)) + g;
            if (historySet && child.state) {
                const { hash: childHash } = getCanonicalStateHash(
                    child.state.p1Pos, child.state.p2Pos, child.state.hWalls, child.state.vWalls,
                    child.state.p1Walls, child.state.p2Walls, child.state.turn === 1
                );
                if (historySet.has(childHash)) {
                    score -= 20.0;
                }
            }
            scores.push({ idx, gumbel: g, prior: child.prior, score });
        }
        scores.sort((a, b) => b.score - a.score);
        const mTop = Math.min(16, scores.length);
        for (let i = 0; i < scores.length; i++) {
            gumbelCandidates.push({
                idx: scores[i].idx,
                gumbel: scores[i].gumbel,
                prior: scores[i].prior,
                active: i < mTop
            });
        }
    }

    const BATCH_SIZE = 8;
    const q1 = Math.floor(numSimulations / 4);
    const q2 = Math.floor(numSimulations / 2);
    const q3 = Math.floor((3 * numSimulations) / 4);
    let halvedQ1 = false, halvedQ2 = false, halvedQ3 = false;

    let sim = 0;
    while (sim < numSimulations) {
        // Sequential Halving Checkpoints at 25%, 50%, 75% of simulation budget
        if (isGumbel && gumbelCandidates.length > 0 && sim > 0) {
            let shouldHalve = false;
            if (sim >= q1 && !halvedQ1) { shouldHalve = true; halvedQ1 = true; }
            else if (sim >= q2 && !halvedQ2) { shouldHalve = true; halvedQ2 = true; }
            else if (sim >= q3 && !halvedQ3) { shouldHalve = true; halvedQ3 = true; }

            if (shouldHalve) {
                const active = gumbelCandidates.filter(c => c.active);
                if (active.length > 1) {
                    let maxChildN = 0;
                    for (const child of root.children.values()) {
                        if (child.N > maxChildN) maxChildN = child.N;
                    }
                    const sigmaScale = (50.0 + maxChildN) * 1.0;

                    active.sort((a, b) => {
                        const childA = root.children.get(a.idx);
                        const childB = root.children.get(b.idx);
                        const qA = (childA && childA.N > 0) ? -childA.Q : -1.0;
                        const qB = (childB && childB.N > 0) ? -childB.Q : -1.0;
                        let scoreA = Math.log(Math.max(1e-8, a.prior)) + a.gumbel + sigmaScale * qA;
                        let scoreB = Math.log(Math.max(1e-8, b.prior)) + b.gumbel + sigmaScale * qB;
                        if (historySet) {
                            if (childA && childA.state) {
                                const { hash: hashA } = getCanonicalStateHash(
                                    childA.state.p1Pos, childA.state.p2Pos, childA.state.hWalls, childA.state.vWalls,
                                    childA.state.p1Walls, childA.state.p2Walls, childA.state.turn === 1
                                );
                                if (historySet.has(hashA)) scoreA -= 20.0;
                            }
                            if (childB && childB.state) {
                                const { hash: hashB } = getCanonicalStateHash(
                                    childB.state.p1Pos, childB.state.p2Pos, childB.state.hWalls, childB.state.vWalls,
                                    childB.state.p1Walls, childB.state.p2Walls, childB.state.turn === 1
                                );
                                if (historySet.has(hashB)) scoreB -= 20.0;
                            }
                        }
                        return scoreB - scoreA;
                    });
                    const keepCount = Math.max(1, Math.floor(active.length / 2));
                    for (let i = keepCount; i < active.length; i++) {
                        active[i].active = false;
                    }
                }
            }
        }

        // Clamp batch size to next halving checkpoint or end of simulations
        let nextTarget = numSimulations;
        if (isGumbel) {
            if (sim < q1) nextTarget = q1;
            else if (sim < q2) nextTarget = q2;
            else if (sim < q3) nextTarget = q3;
        }
        const currentBatchSize = Math.max(1, Math.min(BATCH_SIZE, nextTarget - sim));
        const batchLeaves = [];

        for (let b = 0; b < currentBatchSize; b++) {
            let node = root;
            const path = [root];
            root.N += 1;
            root.W -= 1.0;

            // 1. SELECTION
            while (!node.isLeaf()) {
                let bestChild = null;
                let bestScore = -Infinity;

                if (node === root) {
                    if (isGumbel && gumbelCandidates.length > 0) {
                        let minVisits = Infinity;
                        let bestPerturbed = -Infinity;
                        for (const cand of gumbelCandidates) {
                            if (!cand.active) continue;
                            const child = root.children.get(cand.idx);
                            if (child) {
                                const perturbed = Math.log(Math.max(1e-8, cand.prior)) + cand.gumbel;
                                if (child.N < minVisits || (child.N === minVisits && perturbed > bestPerturbed)) {
                                    minVisits = child.N;
                                    bestPerturbed = perturbed;
                                    bestChild = child;
                                }
                            }
                        }
                    } else {
                        // KataGo Forced Playouts at root node
                        const kForced = 2.0;
                        const sqrtRootN = Math.sqrt(Math.max(1, root.N));
                        let maxDeficit = 0;
                        for (const child of root.children.values()) {
                            let nForced = Math.floor(kForced * child.prior * sqrtRootN);
                            if (child.actionIdx >= 4 && child.actionIdx <= 11) {
                                nForced = Math.max(nForced, 2);
                            }
                            if (child.N < nForced) {
                                const deficit = nForced - child.N;
                                if (deficit > maxDeficit) {
                                    maxDeficit = deficit;
                                    bestChild = child;
                                }
                            }
                        }
                    }
                }

                if (!bestChild) {
                    if (isGumbel) {
                        const totalN = node.N;
                        for (const child of node.children.values()) {
                            const score = child.prior - (child.N / (1 + totalN));
                            if (score > bestScore) {
                                bestScore = score;
                                bestChild = child;
                            }
                        }
                    } else {
                        for (const child of node.children.values()) {
                            const qScore = child.N > 0 ? -child.Q : (node.Q - cFpu);
                            const uScore = qScore + cPuct * child.prior * (Math.sqrt(node.N) / (1 + child.N));
                            if (uScore > bestScore) {
                                bestScore = uScore;
                                bestChild = child;
                            }
                        }
                    }
                }

                if (!bestChild) break;
                node = bestChild;
                path.push(node);
                node.N += 1;
                node.W -= 1.0;
            }

            // Check terminal state
            const outcome = checkGameOver(node.state);
            if (outcome !== 0) {
                const winnerVal = (outcome === 1 && node.state.turn === 1) || (outcome === -1 && node.state.turn === 2) ? 1.0 : -1.0;
                revertVirtualLossAndBackprop(path, winnerVal);
                continue;
            }

            // Zero-Wall Race Solver check
            const raceWinner = getGuaranteedWinner(
                node.state.p1Pos, node.state.p2Pos,
                node.state.p1Walls, node.state.p2Walls,
                node.state.turn === 1, node.state.hWalls, node.state.vWalls
            );
            if (raceWinner !== 0) {
                const raceVal = (raceWinner === 1 && node.state.turn === 1) || (raceWinner === -1 && node.state.turn === 2) ? 1.0 : -1.0;
                revertVirtualLossAndBackprop(path, raceVal);
                continue;
            }

            const { hash: stateHash, isMirrored } = getCanonicalStateHash(
                node.state.p1Pos, node.state.p2Pos,
                node.state.hWalls, node.state.vWalls,
                node.state.p1Walls, node.state.p2Walls,
                node.state.turn === 1
            );

            const ttEntry = transpositionTable.get(stateHash);
            if (ttEntry && ttEntry.policy) {
                const policy = isMirrored ? mirrorPolicy(ttEntry.policy) : ttEntry.policy;
                expandNodeWithPolicy(node, policy, false);
                revertVirtualLossAndBackprop(path, ttEntry.value);
                continue;
            }

            batchLeaves.push({ node, path, stateHash, isMirrored });
        }

        // Run batched NN inference across all pending leaves in this batch
        if (batchLeaves.length > 0) {
            const B = batchLeaves.length;
            const batchedData = new Float32Array(B * 891);
            for (let i = 0; i < B; i++) {
                const s = batchLeaves[i].node.state;
                const d = tensorizeBoardState(s.p1Pos, s.p2Pos, s.hWalls, s.vWalls, s.p1Walls, s.p2Walls, s.turn);
                batchedData.set(d, i * 891);
            }

            let results = null;
            try {
                const inputTensor = new ort.Tensor('float32', batchedData, [B, 11, 9, 9]);
                results = await modelSession.run({ input: inputTensor });
            } catch (inferErr) {
                console.warn('MCTS batched inference error:', inferErr);
            }

            if (!results || !results.policy || !results.value) {
                for (let i = 0; i < B; i++) {
                    const { node, path } = batchLeaves[i];
                    const dummyPolicy = new Float32Array(140).fill(1.0 / 140);
                    expandNodeWithPolicy(node, dummyPolicy, false);
                    revertVirtualLossAndBackprop(path, 0.0);
                }
            } else {
                const policyData = results.policy.data;
                const valueData = results.value.data;

                for (let i = 0; i < B; i++) {
                    const { node, path, stateHash, isMirrored } = batchLeaves[i];
                    const rawPolicy = policyData.subarray ? policyData.subarray(i * 140, (i + 1) * 140) : policyData.slice(i * 140, (i + 1) * 140);
                    const rawValue = valueData[i];

                    let maxLogit = -Infinity;
                    for (let k = 0; k < 140; k++) if (rawPolicy[k] > maxLogit) maxLogit = rawPolicy[k];
                    const expP = new Float32Array(140);
                    let sumExp = 0.0;
                    for (let k = 0; k < 140; k++) {
                        const e = Math.exp(rawPolicy[k] - maxLogit);
                        expP[k] = e;
                        sumExp += e;
                    }
                    const policy = new Float32Array(140);
                    for (let k = 0; k < 140; k++) policy[k] = expP[k] / sumExp;

                    const canonPolicy = isMirrored ? mirrorPolicy(policy) : policy;
                    storeTT(stateHash, canonPolicy, rawValue, 0);

                    expandNodeWithPolicy(node, policy, false);
                    revertVirtualLossAndBackprop(path, rawValue);
                }
            }
        }

        sim += currentBatchSize;

        // Dynamic early stopping for non-Gumbel
        if (!isGumbel && sim >= 15 && root.children.size > 1) {
            let maxVisits = -1;
            let secondMaxVisits = -1;
            for (const child of root.children.values()) {
                if (child.N > maxVisits) {
                    secondMaxVisits = maxVisits;
                    maxVisits = child.N;
                } else if (child.N > secondMaxVisits) {
                    secondMaxVisits = child.N;
                }
            }
            const remainingSims = numSimulations - sim;
            if (maxVisits - secondMaxVisits > remainingSims) {
                break;
            }
        }
    }

    // Choose best move based on maximum visit counts / Gumbel scores
    let bestActionIdx = -1;
    if (isGumbel && gumbelCandidates.length > 0) {
        const active = gumbelCandidates.filter(c => c.active);
        let maxVisits = -1;
        let bestScore = -Infinity;
        let maxChildN = 0;
        for (const child of root.children.values()) {
            if (child.N > maxChildN) maxChildN = child.N;
        }
        const sigmaScale = (50.0 + maxChildN) * 1.0;

        for (const cand of active) {
            const child = root.children.get(cand.idx);
            if (child) {
                let qVal = child.N > 0 ? -child.Q : -1.0;
                let score = Math.log(Math.max(1e-8, cand.prior)) + cand.gumbel + sigmaScale * qVal;
                let effVisits = child.N;
                if (historySet && child.state) {
                    const { hash: childHash } = getCanonicalStateHash(
                        child.state.p1Pos, child.state.p2Pos, child.state.hWalls, child.state.vWalls,
                        child.state.p1Walls, child.state.p2Walls, child.state.turn === 1
                    );
                    if (historySet.has(childHash)) {
                        score -= 20.0;
                        qVal -= 0.35;
                        effVisits *= 0.65;
                    }
                }
                if (effVisits > maxVisits || (effVisits === maxVisits && score > bestScore)) {
                    maxVisits = effVisits;
                    bestScore = score;
                    bestActionIdx = cand.idx;
                }
            }
        }
    }
    if (bestActionIdx === -1) {
        let maxEffectiveVisits = -1;
        for (const [idx, child] of root.children.entries()) {
            let effVisits = child.N;
            if (historySet && child.state) {
                const { hash: childHash } = getCanonicalStateHash(
                    child.state.p1Pos, child.state.p2Pos, child.state.hWalls, child.state.vWalls,
                    child.state.p1Walls, child.state.p2Walls, child.state.turn === 1
                );
                if (historySet.has(childHash)) {
                    effVisits *= 0.65; // Repetition discount for states already visited in recent history
                }
            }
            if (effVisits > maxEffectiveVisits) {
                maxEffectiveVisits = effVisits;
                bestActionIdx = idx;
            }
        }
    }

    if (bestActionIdx === -1) {
        activeMCTSRoot = null;
        const actions = getValidMCTSActions(rootState);
        return actions[0] || null;
    }

    const chosenChild = root.children.get(bestActionIdx);
    activeMCTSRoot = chosenChild || null;

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
