import { findShortestPath, getValidPawnMoves } from './engine.js';
import { evaluateBoard } from './ai-eval.js';
import { minimax } from './ai-search.js';
import { runMCTS, resetMCTSTree } from './ai-mcts.js';

let modelSession = null;

// Initialize ONNX runtime in Web Worker
async function initONNX(modelArrayBuffer) {
    try {
        if (typeof importScripts === 'function' && !self.ort) {
            try {
                importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
            } catch (e) {
                console.warn('importScripts failed in worker, trying dynamic import:', e);
            }
        }
        
        if (!self.ort) {
            await import('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
        }

        if (self.ort) {
            if (self.ort.env && self.ort.env.wasm) {
                self.ort.env.wasm.numThreads = self.navigator ? (self.navigator.hardwareConcurrency || 4) : 4;
            }
            modelSession = await self.ort.InferenceSession.create(new Uint8Array(modelArrayBuffer));
            console.log('AlphaZero ONNX model loaded successfully in Web Worker!');
            return true;
        }
    } catch (err) {
        console.warn('Failed to load ONNX session in worker:', err);
    }
    return false;
}

function isSameMove(m1, m2) {
    if (!m1 || !m2) return false;
    if (m1.type !== m2.type) return false;
    if (m1.type === 'move') {
        const m1x = m1.to ? m1.to.x : m1.x;
        const m1y = m1.to ? m1.to.y : m1.y;
        const m2x = m2.to ? m2.to.x : m2.x;
        const m2y = m2.to ? m2.to.y : m2.y;
        return m1x === m2x && m1y === m2y;
    } else if (m1.type === 'wall') {
        return m1.x === m2.x && m1.y === m2.y && (m1.wallType || m1.type) === (m2.wallType || m2.type);
    }
    return false;
}

function deserializeMap(entries) {
    return new Map(entries || []);
}

self.onmessage = async function (e) {
    const { type, requestId, data } = e.data;

    if (type === 'init_onnx') {
        const success = await initONNX(data.modelBuffer);
        self.postMessage({ type: 'init_onnx_result', requestId, success });
        return;
    }

    if (type === 'reset_mcts') {
        resetMCTSTree();
        self.postMessage({ type: 'reset_mcts_result', requestId });
        return;
    }

    if (type === 'analyze_move') {
        const { chosenMove, player, stateBefore, depth } = data;
        const isP1 = player === 1;
        
        const baseP1Pos = stateBefore.p1Pos;
        const baseP2Pos = stateBefore.p2Pos;
        const baseP1Walls = stateBefore.p1Walls;
        const baseP2Walls = stateBefore.p2Walls;
        const baseHWalls = deserializeMap(stateBefore.hWalls);
        const baseVWalls = deserializeMap(stateBefore.vWalls);

        const d = depth || 4;

        const result = minimax(
            d,
            -Infinity,
            Infinity,
            isP1,
            baseP1Pos,
            baseP2Pos,
            baseHWalls,
            baseVWalls,
            baseP1Walls,
            baseP2Walls
        );

        let bestScore = result.score;
        let bestCandidate = result.move;

        if (bestScore === undefined || bestScore === null) {
            bestScore = evaluateBoard(baseP1Pos, baseP2Pos, baseHWalls, baseVWalls, baseP1Walls, baseP2Walls, isP1);
        }

        let chosenScore;
        if (isSameMove(chosenMove, bestCandidate)) {
            chosenScore = bestScore;
        } else {
            const hWallsArray = new Uint8Array(64);
            const vWallsArray = new Uint8Array(64);
            for (const k of baseHWalls.keys()) {
                const [x, y] = k.split(',').map(Number);
                hWallsArray[y * 8 + x] = 1;
            }
            for (const k of baseVWalls.keys()) {
                const [x, y] = k.split(',').map(Number);
                vWallsArray[y * 8 + x] = 1;
            }

            let nextP1Pos = { ...baseP1Pos };
            let nextP2Pos = { ...baseP2Pos };
            let nextP1Walls = baseP1Walls;
            let nextP2Walls = baseP2Walls;
            
            if (chosenMove.type === 'move') {
                if (isP1) nextP1Pos = chosenMove.to;
                else nextP2Pos = chosenMove.to;
            } else {
                const idx = chosenMove.y * 8 + chosenMove.x;
                if (chosenMove.wallType === 'h') hWallsArray[idx] = 1;
                else vWallsArray[idx] = 1;
                
                if (isP1) nextP1Walls--;
                else nextP2Walls--;
            }

            const chosenResult = minimax(
                Math.max(1, d - 1),
                -Infinity,
                Infinity,
                !isP1,
                nextP1Pos,
                nextP2Pos,
                hWallsArray,
                vWallsArray,
                nextP1Walls,
                nextP2Walls
            );
            chosenScore = chosenResult.score;
        }

        self.postMessage({
            type: 'analyze_move_result',
            requestId,
            data: {
                chosenScore,
                bestScore,
                bestCandidate,
                player
            }
        });
        return;
    }

    if (type === 'calculate_ai_move') {
        const { p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn, aiSettings } = data;
        const isP1 = aiSettings.color === 'p1';
        const hWallsMap = deserializeMap(hWalls);
        const vWallsMap = deserializeMap(vWalls);

        let bestMove = null;

        if (aiSettings.difficulty === 'easy') {
            const oppPos = isP1 ? p2Pos : p1Pos;
            const myPos = isP1 ? p1Pos : p2Pos;
            const moves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, hWallsMap, vWallsMap);
            const goalY = isP1 ? 8 : 0;

            let bestDist = Infinity;
            for (const m of moves) {
                const path = findShortestPath(m.x, m.y, goalY, hWallsMap, vWallsMap);
                if (path && path.length < bestDist) {
                    bestDist = path.length;
                    bestMove = { type: 'move', to: m };
                }
            }
            if (!bestMove && moves.length > 0) {
                bestMove = { type: 'move', to: moves[Math.floor(Math.random() * moves.length)] };
            }
        } else if (aiSettings.difficulty === 'alphazero') {
            if (modelSession) {
                bestMove = await runMCTS(
                    p1Pos,
                    p2Pos,
                    hWallsMap,
                    vWallsMap,
                    p1Walls,
                    p2Walls,
                    turn,
                    40,
                    modelSession
                );
            } else {
                console.warn('Worker ONNX model not loaded, falling back to minimax for AlphaZero setting.');
                const result = minimax(3, -Infinity, Infinity, isP1, p1Pos, p2Pos, hWallsMap, vWallsMap, p1Walls, p2Walls);
                bestMove = result.move;
            }
        } else {
            const searchDepth = aiSettings.difficulty === 'medium' ? 2 : 3;
            const isMaximizing = isP1;

            const result = minimax(
                searchDepth,
                -Infinity,
                Infinity,
                isMaximizing,
                p1Pos,
                p2Pos,
                hWallsMap,
                vWallsMap,
                p1Walls,
                p2Walls
            );
            bestMove = result.move;
        }

        if (!bestMove) {
            const oppPos = isP1 ? p2Pos : p1Pos;
            const myPos = isP1 ? p1Pos : p2Pos;
            const moves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, hWallsMap, vWallsMap);
            if (moves.length > 0) {
                bestMove = { type: 'move', to: moves[0] };
            }
        }

        self.postMessage({
            type: 'calculate_ai_move_result',
            requestId,
            data: { bestMove }
        });
        return;
    }
};
