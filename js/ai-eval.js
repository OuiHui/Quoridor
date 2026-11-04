import { state } from './state.js';
import { findShortestPath, getValidPawnMoves, validateWallPlacement, findShortestPathLengthFast } from './engine.js';
import { minimax } from './ai-search.js';

// Evaluate board position for Minimax AI
// Positive = P1 advantage, Negative = P2 advantage
export function evaluateBoard(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, isP1Turn) {
    let p1Dist, p2Dist;
    if (hWalls instanceof Map) {
        const p1Path = findShortestPath(p1Pos.x, p1Pos.y, 8, hWalls, vWalls, p2Pos);
        const p2Path = findShortestPath(p2Pos.x, p2Pos.y, 0, hWalls, vWalls, p1Pos);

        if (!p1Path) return -Infinity; // P1 is blocked – invalid
        if (!p2Path) return Infinity;  // P2 is blocked – invalid

        p1Dist = p1Path.length - 1;
        p2Dist = p2Path.length - 1;
    } else {
        const p1Len = findShortestPathLengthFast(p1Pos.x, p1Pos.y, 8, hWalls, vWalls, p2Pos.x, p2Pos.y);
        const p2Len = findShortestPathLengthFast(p2Pos.x, p2Pos.y, 0, hWalls, vWalls, p1Pos.x, p1Pos.y);

        if (p1Len < 0) return -Infinity;
        if (p2Len < 0) return Infinity;

        p1Dist = p1Len - 1;
        p2Dist = p2Len - 1;
    }

    if (p1Dist === 0) return Infinity;
    if (p2Dist === 0) return -Infinity;

    // --- GUARANTEED WIN / COMPLETE DOMINANCE CHECK ---
    // Pure race dominance when a player has 0 walls remaining:
    if (p2Walls === 0) {
        if (isP1Turn && p1Dist <= p2Dist) return 500;
        if (!isP1Turn && p1Dist <= p2Dist - 2) return 500;
    }
    if (p1Walls === 0) {
        if (!isP1Turn && p2Dist <= p1Dist) return -500;
        if (isP1Turn && p2Dist <= p1Dist - 2) return -500;
    }

    // Primary: path distance advantage (each step = 12 pts)
    let score = (p2Dist - p1Dist) * 12;

    // Urgency bonus: when a player is within 3 steps of winning, amplify the threat.
    if (p1Dist <= 3) score += (4 - p1Dist) * 6;
    if (p2Dist <= 3) score -= (4 - p2Dist) * 6;

    // Wall reserve advantage (walls are powerful strategic resources – worth ~8 pts each)
    score += (p1Walls - p2Walls) * 8;

    // Wall deficit penalty: low wall reserve against high wall reserve
    if (p1Walls <= 2 && p2Walls >= 4) score -= (4 - p1Walls) * 6;
    if (p2Walls <= 2 && p1Walls >= 4) score += (4 - p2Walls) * 6;

    // Pawn advancement bonus (encourages forward progress)
    score += p1Pos.y * 0.8;
    score -= (8 - p2Pos.y) * 0.8;

    // Subtle tempo bonus (2.0 pts): eliminates ping-pong swings without distorting search parity
    if (isP1Turn !== undefined) {
        score += isP1Turn ? 2.0 : -2.0;
    }

    return score;
}

// Generate ordered candidate moves for AI search.
// Moves are ordered best-first to maximise alpha-beta pruning efficiency.
export function generateSmartMoves(playerNum, p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls) {
    const activePos = playerNum === 1 ? p1Pos : p2Pos;
    const oppPos   = playerNum === 1 ? p2Pos : p1Pos;
    const wallsLeft = playerNum === 1 ? p1Walls : p2Walls;
    const activeGoalY = playerNum === 1 ? 8 : 0;
    const oppGoalY    = playerNum === 1 ? 0 : 8;

    // --- 1. PAWN MOVES (ordered: prefer on-path and forward moves) ---
    const validPawnMoves = getValidPawnMoves(
        activePos.x, activePos.y, oppPos.x, oppPos.y, hWalls, vWalls
    );
    const activePath = findShortestPath(activePos.x, activePos.y, activeGoalY, hWalls, vWalls, oppPos);
    const pathSet = activePath ? new Set(activePath.map(p => `${p.x},${p.y}`)) : new Set();

    const pawnMoves = validPawnMoves.map(m => {
        const onPath = pathSet.has(`${m.x},${m.y}`);
        const yGain  = playerNum === 1 ? m.y - activePos.y : activePos.y - m.y;
        return { type: 'move', to: m, _s: (onPath ? 6 : 0) + yGain * 3 };
    });
    pawnMoves.sort((a, b) => b._s - a._s);

    if (wallsLeft <= 0) return pawnMoves.map(({ _s, ...m }) => m);

    // --- 2. WALL CANDIDATES (scored by path-blocking importance) ---
    const candidateMap = new Map(); // wallKey -> importance score
    const oppPath = findShortestPath(oppPos.x, oppPos.y, oppGoalY, hWalls, vWalls, activePos);

    // Walls that cross the opponent's shortest path (highest priority).
    // Earlier cuts (closer to opponent) score higher since they block more remaining path.
    if (oppPath) {
        const n = oppPath.length;
        for (let i = 0; i < n - 1; i++) {
            const cur = oppPath[i], next = oppPath[i + 1];
            const importance = (n - i) * 2;

            if (cur.x === next.x) {
                // Vertical step → horizontal wall blocks it
                const yMin = Math.min(cur.y, next.y);
                for (const wx of [cur.x, cur.x - 1]) {
                    if (wx >= 0 && wx <= 7) {
                        const k = `${wx},${yMin},h`;
                        candidateMap.set(k, Math.max(candidateMap.get(k) || 0, importance));
                    }
                }
            } else {
                // Horizontal step → vertical wall blocks it
                const xMin = Math.min(cur.x, next.x);
                for (const wy of [cur.y, cur.y - 1]) {
                    if (wy >= 0 && wy <= 7) {
                        const k = `${xMin},${wy},v`;
                        candidateMap.set(k, Math.max(candidateMap.get(k) || 0, importance));
                    }
                }
            }
        }
    }

    // Positional candidates in a radius around both pawns:
    // - Around the opponent (offensive blocking)
    // - Around the active player (defensive protection)
    for (const [pos, base] of [[oppPos, 2], [activePos, 1]]) {
        for (let x = Math.max(0, pos.x - 2); x <= Math.min(7, pos.x + 2); x++) {
            for (let y = Math.max(0, pos.y - 2); y <= Math.min(7, pos.y + 2); y++) {
                for (const t of ['h', 'v']) {
                    const k = `${x},${y},${t}`;
                    if (!candidateMap.has(k)) candidateMap.set(k, base);
                }
            }
        }
    }

    // Validate candidates, sort by importance, cap at top 20 to preserve tactical depth
    const wallMoves = [];
    for (const [wallStr, score] of candidateMap) {
        const [wx, wy, type] = wallStr.split(',');
        const x = parseInt(wx), y = parseInt(wy);
        if (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
            if (validateWallPlacement(x, y, type, p1Pos, p2Pos, hWalls, vWalls)) {
                wallMoves.push({ type: 'wall', x, y, wallType: type, _s: score });
            }
        }
    }
    wallMoves.sort((a, b) => b._s - a._s);

    return [
        ...pawnMoves.map(({ _s, ...m }) => m),
        ...wallMoves.slice(0, 20).map(({ _s, ...m }) => m)
    ];
}

// Get best moves for hint display.
// Always runs at depth 5 to match game move quality analysis.
export function getBestMoves(player, p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls) {
    const hWallsArray = new Uint8Array(64);
    const vWallsArray = new Uint8Array(64);
    for (const key of hWalls.keys()) {
        const [x, y] = key.split(',').map(Number);
        hWallsArray[y * 8 + x] = 1;
    }
    for (const key of vWalls.keys()) {
        const [x, y] = key.split(',').map(Number);
        vWallsArray[y * 8 + x] = 1;
    }

    const isP1 = player === 1;
    const result = minimax(
        5,
        -Infinity,
        Infinity,
        isP1,
        p1Pos,
        p2Pos,
        hWallsArray,
        vWallsArray,
        p1Walls,
        p2Walls
    );

    if (result && result.move) {
        return [result.move];
    }
    return [];
}

// Get both best moves for current player and threat moves for opponent
export function getBestMovesAndThreats(player, p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls) {
    const oppPlayer = player === 1 ? 2 : 1;
    const bestMoves = getBestMoves(player, p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls);
    const threatMoves = getBestMoves(oppPlayer, p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls);
    return { bestMoves, threatMoves };
}


