import * as ort from 'onnxruntime-web';
import { findShortestPath, getValidPawnMoves, getGuaranteedWinner } from './engine.js';
import { evaluateBoard } from './ai-eval.js';
import { minimax } from './ai-search.js';
import { runMCTS, resetMCTSTree, tensorizeBoardState } from './ai-mcts.js';

let modelSession = null;
self.ort = ort;

// Initialize ONNX runtime in Web Worker
async function initONNX(modelArrayBuffer) {
    try {
        if (ort.env && ort.env.wasm) {
            ort.env.wasm.numThreads = self.navigator ? (self.navigator.hardwareConcurrency || 4) : 4;
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
        }
        modelSession = await ort.InferenceSession.create(new Uint8Array(modelArrayBuffer));
        console.log('AlphaZero ONNX model loaded successfully in Web Worker!');
        return true;
    } catch (err) {
        console.error('Failed to load ONNX session in worker:', err);
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

    if (type === 'evaluate_state') {
        const { stateObj } = data;
        const p1Pos = stateObj.p1Pos;
        const p2Pos = stateObj.p2Pos;
        const p1Walls = stateObj.p1Walls;
        const p2Walls = stateObj.p2Walls;
        const turn = stateObj.turn;
        const hWalls = deserializeMap(stateObj.hWalls);
        const vWalls = deserializeMap(stateObj.vWalls);

        const gw = getGuaranteedWinner(p1Pos, p2Pos, p1Walls, p2Walls, turn === 1, hWalls, vWalls);
        if (gw === 1) {
            self.postMessage({ type: 'evaluate_state_result', requestId, data: { score: Infinity, isNN: true } });
            return;
        }
        if (gw === -1) {
            self.postMessage({ type: 'evaluate_state_result', requestId, data: { score: -Infinity, isNN: true } });
            return;
        }

        let evalScore = null;
        let isNN = false;

        if (modelSession && self.ort) {
            try {
                const tensorData = tensorizeBoardState(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn);
                const inputTensor = new self.ort.Tensor('float32', tensorData, [1, 11, 9, 9]);
                const results = await modelSession.run({ input: inputTensor });
                const rawValue = results.value.data[0];
                const p1Value = turn === 1 ? rawValue : -rawValue;
                evalScore = p1Value * 100;
                isNN = true;
            } catch (err) {
                console.warn('Worker ONNX inference error:', err);
            }
        }

        if (evalScore === null) {
            const result = minimax(
                4,
                -Infinity,
                Infinity,
                turn === 1,
                p1Pos,
                p2Pos,
                hWalls,
                vWalls,
                p1Walls,
                p2Walls
            );
            evalScore = result.score;
            if (evalScore === undefined || evalScore === null) {
                evalScore = evaluateBoard(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn === 1);
            }
        }

        self.postMessage({ type: 'evaluate_state_result', requestId, data: { score: evalScore, isNN } });
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
        const { p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn } = data;
        const hWallsMap = deserializeMap(hWalls);
        const vWallsMap = deserializeMap(vWalls);

        if (!modelSession) {
            console.error('Worker error: AlphaZero ONNX model is not loaded yet.');
            self.postMessage({
                type: 'calculate_ai_move_result',
                requestId,
                data: {
                    bestMove: null,
                    error: 'AlphaZero ONNX model is not loaded yet.',
                    engine: 'AlphaZero MCTS'
                }
            });
            return;
        }

        const bestMove = await runMCTS(
            p1Pos,
            p2Pos,
            hWallsMap,
            vWallsMap,
            p1Walls,
            p2Walls,
            turn,
            300,
            modelSession
        );

        self.postMessage({
            type: 'calculate_ai_move_result',
            requestId,
            data: {
                bestMove,
                engine: 'AlphaZero MCTS',
                simulations: 300
            }
        });
        return;
    }
};
