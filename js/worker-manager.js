import { getCanonicalStateHash } from './engine.js';

let worker = null;
let nextRequestId = 1;
const pendingRequests = new Map();

export function getWorker() {
    if (!worker) {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = function (e) {
            const { type, requestId, data, success } = e.data;
            if (pendingRequests.has(requestId)) {
                const { resolve } = pendingRequests.get(requestId);
                pendingRequests.delete(requestId);
                if (type.endsWith('_result')) {
                    resolve(data !== undefined ? data : { success });
                }
            }
        };
        worker.onerror = function (err) {
            console.error('Worker error:', err);
        };
    }
    return worker;
}

export function sendWorkerRequest(type, data = {}) {
    const w = getWorker();
    const requestId = nextRequestId++;
    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
        w.postMessage({ type, requestId, data });
    });
}

export async function initWorkerONNX(modelBuffer) {
    try {
        const res = await sendWorkerRequest('init_onnx', { modelBuffer });
        return res.success;
    } catch (e) {
        console.warn('Failed to init ONNX in worker:', e);
        return false;
    }
}

export function resetWorkerMCTS() {
    return sendWorkerRequest('reset_mcts');
}

export function analyzeMoveInWorker(chosenMove, player, stateBefore, depth = 3) {
    const serializedStateBefore = {
        p1Pos: stateBefore.p1Pos,
        p2Pos: stateBefore.p2Pos,
        p1Walls: stateBefore.p1Walls,
        p2Walls: stateBefore.p2Walls,
        hWalls: Array.from(stateBefore.hWalls.entries()),
        vWalls: Array.from(stateBefore.vWalls.entries())
    };

    return sendWorkerRequest('analyze_move', {
        chosenMove,
        player,
        stateBefore: serializedStateBefore,
        depth
    });
}

function extractRecentHistoryHashes(stateObj) {
    const historyHashes = [];
    if (stateObj.history && stateObj.history.length > 0) {
        const start = Math.max(0, stateObj.history.length - 8);
        for (let i = start; i < stateObj.history.length; i++) {
            const item = stateObj.history[i];
            if (item && item.stateAfter) {
                const snap = item.stateAfter;
                const { hash } = getCanonicalStateHash(
                    snap.p1Pos, snap.p2Pos, snap.hWalls, snap.vWalls,
                    snap.p1Walls, snap.p2Walls, snap.turn === 1
                );
                historyHashes.push(hash.toString());
            }
        }
    }
    return historyHashes;
}

export function calculateAIMoveInWorker(stateObj, aiSettings) {
    const historyHashes = extractRecentHistoryHashes(stateObj);

    return sendWorkerRequest('calculate_ai_move', {
        p1Pos: stateObj.p1Pos,
        p2Pos: stateObj.p2Pos,
        hWalls: Array.from(stateObj.hWalls.entries()),
        vWalls: Array.from(stateObj.vWalls.entries()),
        p1Walls: stateObj.p1Walls,
        p2Walls: stateObj.p2Walls,
        turn: stateObj.turn,
        historyHashes,
        aiSettings
    });
}

export function getHintsInWorker(stateObj, simulations = 96) {
    const historyHashes = extractRecentHistoryHashes(stateObj);

    return sendWorkerRequest('get_hints', {
        p1Pos: stateObj.p1Pos,
        p2Pos: stateObj.p2Pos,
        hWalls: Array.from(stateObj.hWalls.entries()),
        vWalls: Array.from(stateObj.vWalls.entries()),
        p1Walls: stateObj.p1Walls,
        p2Walls: stateObj.p2Walls,
        turn: stateObj.turn,
        historyHashes,
        simulations
    });
}

export function evaluatePositionInWorker(stateObj) {
    const serializedState = {
        p1Pos: stateObj.p1Pos,
        p2Pos: stateObj.p2Pos,
        p1Walls: stateObj.p1Walls,
        p2Walls: stateObj.p2Walls,
        hWalls: Array.from(stateObj.hWalls.entries()),
        vWalls: Array.from(stateObj.vWalls.entries()),
        turn: stateObj.turn
    };
    return sendWorkerRequest('evaluate_state', { stateObj: serializedState });
}
