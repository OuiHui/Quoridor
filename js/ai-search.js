import { state } from './state.js';
import { findShortestPath, getValidPawnMoves } from './engine.js';
import { evaluateBoard, generateSmartMoves } from './ai-eval.js';
import { runMCTS } from './ai-mcts.js';
import { calculateAIMoveInWorker } from './worker-manager.js';

// Alpha-Beta Minimax Search
export function minimax(depth, alpha, beta, maximizingPlayer, p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls) {
    let hWallsArray, vWallsArray;
    if (hWalls instanceof Map) {
        hWallsArray = new Uint8Array(64);
        vWallsArray = new Uint8Array(64);
        for (const key of hWalls.keys()) {
            const [x, y] = key.split(',').map(Number);
            hWallsArray[y * 8 + x] = 1;
        }
        for (const key of vWalls.keys()) {
            const [x, y] = key.split(',').map(Number);
            vWallsArray[y * 8 + x] = 1;
        }
    } else {
        hWallsArray = hWalls;
        vWallsArray = vWalls;
    }

    const p1Path = findShortestPath(p1Pos.x, p1Pos.y, 8, hWallsArray, vWallsArray);
    const p2Path = findShortestPath(p2Pos.x, p2Pos.y, 0, hWallsArray, vWallsArray);

    if (!p1Path || p1Path.length === 1) return { score: Infinity };
    if (!p2Path || p2Path.length === 1) return { score: -Infinity };
    if (depth === 0) {
        return { score: evaluateBoard(p1Pos, p2Pos, hWallsArray, vWallsArray, p1Walls, p2Walls, maximizingPlayer) };
    }

    if (maximizingPlayer) {
        let maxScore = -Infinity;
        let bestMove = null;
        const moves = generateSmartMoves(1, p1Pos, p2Pos, hWallsArray, vWallsArray, p1Walls, p2Walls);

        if (moves.length === 0) {
            return { score: evaluateBoard(p1Pos, p2Pos, hWallsArray, vWallsArray, p1Walls, p2Walls, true) };
        }

        for (const move of moves) {
            let nextP1Pos = { ...p1Pos };
            let nextP1Walls = p1Walls;
            const wallIdx = move.y * 8 + move.x;

            if (move.type === 'move') {
                nextP1Pos = move.to;
            } else {
                if (move.wallType === 'h') hWallsArray[wallIdx] = 1;
                else vWallsArray[wallIdx] = 1;
                nextP1Walls--;
            }

            const result = minimax(depth - 1, alpha, beta, false, nextP1Pos, p2Pos, hWallsArray, vWallsArray, nextP1Walls, p2Walls);

            if (move.type === 'wall') {
                if (move.wallType === 'h') hWallsArray[wallIdx] = 0;
                else vWallsArray[wallIdx] = 0;
            }

            if (result.score > maxScore) {
                maxScore = result.score;
                bestMove = move;
            }
            alpha = Math.max(alpha, result.score);
            if (beta <= alpha) break; // Beta cut-off
        }
        return { score: maxScore, move: bestMove };
    } else {
        let minScore = Infinity;
        let bestMove = null;
        const moves = generateSmartMoves(2, p1Pos, p2Pos, hWallsArray, vWallsArray, p1Walls, p2Walls);

        if (moves.length === 0) {
            return { score: evaluateBoard(p1Pos, p2Pos, hWallsArray, vWallsArray, p1Walls, p2Walls, false) };
        }

        for (const move of moves) {
            let nextP2Pos = { ...p2Pos };
            let nextP2Walls = p2Walls;
            const wallIdx = move.y * 8 + move.x;

            if (move.type === 'move') {
                nextP2Pos = move.to;
            } else {
                if (move.wallType === 'h') hWallsArray[wallIdx] = 1;
                else vWallsArray[wallIdx] = 1;
                nextP2Walls--;
            }

            const result = minimax(depth - 1, alpha, beta, true, p1Pos, nextP2Pos, hWallsArray, vWallsArray, p1Walls, nextP2Walls);

            if (move.type === 'wall') {
                if (move.wallType === 'h') hWallsArray[wallIdx] = 0;
                else vWallsArray[wallIdx] = 0;
            }

            if (result.score < minScore) {
                minScore = result.score;
                bestMove = move;
            }
            beta = Math.min(beta, result.score);
            if (beta <= alpha) break; // Alpha cut-off
        }
        return { score: minScore, move: bestMove };
    }
}

// AI trigger entry point
export function makeAIMove(executePawnMove, executeWallPlacement) {
    const isP1 = state.aiSettings.color === 'p1';

    if ((isP1 && state.turn !== 1) || (!isP1 && state.turn !== 2)) return;

    const hudTurnEl = document.getElementById('hud-turn');
    if (hudTurnEl) {
        hudTurnEl.textContent = `Thinking... (AI)`;
    }

    const currentTurn = state.turn;

    calculateAIMoveInWorker(state, state.aiSettings)
        .then((res) => {
            // Check if game turn changed while thinking
            if (state.turn !== currentTurn) return;

            const bestMove = res ? res.bestMove : null;
            if (bestMove) {
                if (bestMove.type === 'move') {
                    executePawnMove(bestMove.to.x, bestMove.to.y);
                } else {
                    executeWallPlacement(bestMove.x, bestMove.y, bestMove.wallType);
                }
            } else {
                const oppPos = isP1 ? state.p2Pos : state.p1Pos;
                const myPos = isP1 ? state.p1Pos : state.p2Pos;
                const moves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, state.hWalls, state.vWalls);
                if (moves.length > 0) {
                    executePawnMove(moves[0].x, moves[0].y);
                }
            }
        })
        .catch((err) => {
            console.error('Error during AI move calculation in worker:', err);
            // Fallback to basic valid move
            const oppPos = isP1 ? state.p2Pos : state.p1Pos;
            const myPos = isP1 ? state.p1Pos : state.p2Pos;
            const moves = getValidPawnMoves(myPos.x, myPos.y, oppPos.x, oppPos.y, state.hWalls, state.vWalls);
            if (moves.length > 0) {
                executePawnMove(moves[0].x, moves[0].y);
            }
        });
}

