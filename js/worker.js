import * as ort from 'onnxruntime-web';
import { findShortestPath, getValidPawnMoves, getGuaranteedWinner, mirrorBoardState } from './engine.js';
import { evaluateBoard } from './ai-eval.js';
import { minimax, ANALYSIS_DEPTH } from './ai-search.js';
import { runMCTS, resetMCTSTree, tensorizeBoardState } from './ai-mcts.js';

let modelSession = null;
self.ort = ort;

// Initialize ONNX runtime in Web Worker
async function initONNX(modelArrayBuffer) {
    try {
        const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
        if (ort.env && ort.env.wasm) {
            ort.env.wasm.numThreads = isCrossOriginIsolated && self.navigator && self.navigator.hardwareConcurrency 
                ? Math.min(4, self.navigator.hardwareConcurrency) 
                : 1;
            ort.env.wasm.simd = true;
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
        }
        modelSession = await ort.InferenceSession.create(new Uint8Array(modelArrayBuffer), {
            executionProviders: ['webgpu', 'wasm'],
            graphOptimizationLevel: 'all'
        });
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

let workerMessageQueue = Promise.resolve();

self.onmessage = function (e) {
    workerMessageQueue = workerMessageQueue.then(async () => {
        try {
            await handleWorkerMessage(e.data);
        } catch (fatalErr) {
            console.error('Worker message execution error:', fatalErr);
            const { type, requestId } = e.data || {};
            if (requestId && type) {
                self.postMessage({
                    type: `${type}_result`,
                    requestId,
                    data: { error: fatalErr.message || String(fatalErr) }
                });
            }
        }
    });
};

async function handleWorkerMessage(dataPayload) {
    const { type, requestId, data } = dataPayload;

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
                let rawValue = results.value.data[0];

                // Symmetrized evaluation: average with horizontal reflection to eliminate lateral noise
                const { mirrP1, mirrP2, mirrHWalls, mirrVWalls } = mirrorBoardState(p1Pos, p2Pos, hWalls, vWalls);
                const mirrTensorData = tensorizeBoardState(mirrP1, mirrP2, mirrHWalls, mirrVWalls, p1Walls, p2Walls, turn);
                const mirrInputTensor = new self.ort.Tensor('float32', mirrTensorData, [1, 11, 9, 9]);
                const mirrResults = await modelSession.run({ input: mirrInputTensor });
                rawValue = (rawValue + mirrResults.value.data[0]) / 2;

                const p1Value = turn === 1 ? rawValue : -rawValue;
                evalScore = p1Value * 100;
                isNN = true;
            } catch (err) {
                console.warn('Worker ONNX inference error:', err);
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

        // Convert once to unified fast Uint8Array for all minimax evaluations
        const baseHWallsArray = new Uint8Array(64);
        const baseVWallsArray = new Uint8Array(64);
        for (const k of baseHWalls.keys()) {
            const [x, y] = k.split(',').map(Number);
            baseHWallsArray[y * 8 + x] = 1;
        }
        for (const k of baseVWalls.keys()) {
            const [x, y] = k.split(',').map(Number);
            baseVWallsArray[y * 8 + x] = 1;
        }

        const d = depth || ANALYSIS_DEPTH;

        const result = minimax(
            d,
            -Infinity,
            Infinity,
            isP1,
            baseP1Pos,
            baseP2Pos,
            baseHWallsArray,
            baseVWallsArray,
            baseP1Walls,
            baseP2Walls
        );

        let bestScore = result.score;
        let bestCandidate = result.move;

        if (bestScore === undefined || bestScore === null) {
            bestScore = evaluateBoard(baseP1Pos, baseP2Pos, baseHWallsArray, baseVWallsArray, baseP1Walls, baseP2Walls, isP1, true);
        }

        let chosenScore;
        if (isSameMove(chosenMove, bestCandidate)) {
            chosenScore = bestScore;
        } else {
            const chosenHWallsArray = new Uint8Array(baseHWallsArray);
            const chosenVWallsArray = new Uint8Array(baseVWallsArray);

            let nextP1Pos = { ...baseP1Pos };
            let nextP2Pos = { ...baseP2Pos };
            let nextP1Walls = baseP1Walls;
            let nextP2Walls = baseP2Walls;
            
            if (chosenMove.type === 'move') {
                if (isP1) nextP1Pos = chosenMove.to;
                else nextP2Pos = chosenMove.to;
            } else {
                const idx = chosenMove.y * 8 + chosenMove.x;
                if (chosenMove.wallType === 'h') chosenHWallsArray[idx] = 1;
                else chosenVWallsArray[idx] = 1;
                
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
                chosenHWallsArray,
                chosenVWallsArray,
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
        const { p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn, historyHashes } = data;
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

        const sims = (data.aiSettings && data.aiSettings.simulations) || 128;
        let bestMove = null;

        try {
            bestMove = await runMCTS(
                p1Pos,
                p2Pos,
                hWallsMap,
                vWallsMap,
                p1Walls,
                p2Walls,
                turn,
                sims,
                modelSession,
                historyHashes
            );
        } catch (err) {
            console.error('Worker runMCTS error:', err);
        }

        if (!bestMove) {
            console.error('AlphaZero MCTS failed to calculate a move.');
            self.postMessage({
                type: 'calculate_ai_move_result',
                requestId,
                data: {
                    bestMove: null,
                    error: 'AlphaZero MCTS failed to calculate a move.',
                    engine: 'AlphaZero MCTS'
                }
            });
            return;
        }

        self.postMessage({
            type: 'calculate_ai_move_result',
            requestId,
            data: {
                bestMove,
                engine: 'AlphaZero MCTS',
                simulations: sims
            }
        });
        return;
    }

    if (type === 'get_hints') {
        const { p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn, historyHashes, simulations } = data;
        const hWallsMap = deserializeMap(hWalls);
        const vWallsMap = deserializeMap(vWalls);
        const oppTurn = turn === 1 ? 2 : 1;

        let bestMoves = [];
        let threatMoves = [];

        if (modelSession) {
            const sims = simulations || 96;
            try {
                const bestMove = await runMCTS(
                    p1Pos, p2Pos, hWallsMap, vWallsMap, p1Walls, p2Walls,
                    turn, sims, modelSession, historyHashes, false
                );
                if (bestMove) bestMoves.push(bestMove);
            } catch (err) {
                console.warn('Worker hint runMCTS error:', err);
            }

            try {
                const threatMove = await runMCTS(
                    p1Pos, p2Pos, hWallsMap, vWallsMap, p1Walls, p2Walls,
                    oppTurn, sims, modelSession, historyHashes, false
                );
                if (threatMove) threatMoves.push(threatMove);
            } catch (err) {
                console.warn('Worker threat hint runMCTS error:', err);
            }
        }

        self.postMessage({
            type: 'get_hints_result',
            requestId,
            data: { bestMoves, threatMoves }
        });
        return;
    }
}
