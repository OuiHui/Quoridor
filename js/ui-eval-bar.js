import { state } from './state.js';
import { minimax, evaluateBoard, generateSmartMoves } from './ai.js';
import { findShortestPathLengthFast } from './engine.js';
import { tensorizeBoardState } from './ai-mcts.js';
import { evaluatePositionInWorker } from './worker-manager.js';

export async function evaluatePositionWithNN(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn) {
    if (window.quoridorONNXSession && window.ort) {
        try {
            const tensorData = tensorizeBoardState(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn);
            const inputTensor = new window.ort.Tensor('float32', tensorData, [1, 11, 9, 9]);
            const results = await window.quoridorONNXSession.run({ input: inputTensor });
            const rawValue = results.value.data[0];
            const p1Value = turn === 1 ? rawValue : -rawValue;
            return p1Value * 100;
        } catch (e) {
            console.warn('Main thread ONNX eval error:', e);
        }
    }

    try {
        const res = await evaluatePositionInWorker({
            p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, turn
        });
        if (res && res.score !== undefined && res.score !== null) {
            return res.score;
        }
    } catch (e) {
        // Fallback to minimax handled by caller
    }

    return null;
}

export function getBoardStateKey(st) {
    const hKeys = Array.from(st.hWalls.keys()).sort().join(';');
    const vKeys = Array.from(st.vWalls.keys()).sort().join(';');
    return `${st.p1Pos.x},${st.p1Pos.y}|${st.p2Pos.x},${st.p2Pos.y}|${st.p1Walls}|${st.p2Walls}|${st.turn}|${hKeys}|${vKeys}`;
}

export function showEvalBarLoading() {
    const valEl = document.getElementById('eval-score-value');
    const bubbleEl = document.getElementById('eval-score-bubble');
    if (valEl) {
        valEl.textContent = '...';
        valEl.style.color = 'var(--color-text-muted)';
    }
    if (bubbleEl) {
        bubbleEl.classList.add('loading');
    }
}

export function updateEvalBarUI(score) {
    const fillEl = document.getElementById('eval-bar-fill');
    const valEl = document.getElementById('eval-score-value');
    const bubbleEl = document.getElementById('eval-score-bubble');
    const badgeEl = document.getElementById('eval-move-badge');
    const badgeTextEl = document.getElementById('eval-move-badge-text');

    if (!fillEl || !valEl) return;

    if (bubbleEl) {
        bubbleEl.classList.remove('loading');
    }

    let percent;
    if (score === Infinity) {
        percent = 100;
        valEl.textContent = '#1';
        valEl.style.color = 'var(--color-p1)';
    } else if (score === -Infinity) {
        percent = 0;
        valEl.textContent = '#2';
        valEl.style.color = 'var(--color-p2)';
    } else {
        const limit = 120;
        const clamped = Math.max(-limit, Math.min(limit, score));
        percent = 50 + (clamped / limit) * 50;

        const displayScore = score / 10;
        if (displayScore > 0) {
            valEl.textContent = `+${displayScore.toFixed(1)}`;
            valEl.style.color = 'var(--color-p1)';
        } else if (displayScore < 0) {
            valEl.textContent = `${displayScore.toFixed(1)}`;
            valEl.style.color = 'var(--color-p2)';
        } else {
            valEl.textContent = '0.0';
            valEl.style.color = 'var(--color-text-muted)';
        }
    }

    fillEl.style.height = `${percent}%`;

    if (state.lastMoveQuality && badgeEl && badgeTextEl) {
        badgeEl.className = `eval-move-badge ${state.lastMoveQuality.classification}`;
        badgeTextEl.textContent = state.lastMoveQuality.text;
        badgeEl.classList.remove('hidden');
    } else if (badgeEl) {
        badgeEl.classList.add('hidden');
    }
}

export function precomputeNextMoves() {
    const key = getBoardStateKey(state);

    if (state.precomputedEvaluations && state.precomputedEvaluations.key === key) {
        return;
    }

    const p1PosSnapshot = { ...state.p1Pos };
    const p2PosSnapshot = { ...state.p2Pos };
    const p1WallsSnapshot = state.p1Walls;
    const p2WallsSnapshot = state.p2Walls;
    const turnSnapshot = state.turn;
    const hWallsSnapshot = new Map(state.hWalls);
    const vWallsSnapshot = new Map(state.vWalls);

    state.precomputedEvaluations = {
        key: key,
        status: 'computing',
        scores: new Map(),
        bestScore: null,
        currentEval: null
    };

    evaluatePositionWithNN(p1PosSnapshot, p2PosSnapshot, hWallsSnapshot, vWallsSnapshot, p1WallsSnapshot, p2WallsSnapshot, turnSnapshot).then(nnScore => {
        if (nnScore !== null && getBoardStateKey(state) === key) {
            state.precomputedEvaluations.currentEval = nnScore;
            const currentItem = state.historyIndex > 0 ? state.history[state.historyIndex - 1] : null;
            if (!currentItem || currentItem.evalScore === null || currentItem.evalScore === undefined) {
                updateEvalBarUI(nnScore);
            }
        }
    });

    const depth = 5;

    setTimeout(() => {
        if (getBoardStateKey(state) !== key) return;

        let score = state.precomputedEvaluations.currentEval;
        if (score === null || score === undefined) {
            if (state.previousPrecomputedEvaluations) {
                const lastMove = state.history[state.history.length - 1];
                if (lastMove) {
                    const moveKey = lastMove.type === 'move' ? `move:${lastMove.to.x},${lastMove.to.y}` : `wall:${lastMove.x},${lastMove.y},${lastMove.wallType}`;
                    score = state.previousPrecomputedEvaluations.scores.get(moveKey);
                }
            }
        }

        if (score === undefined || score === null) {
            const result = minimax(
                depth,
                -Infinity,
                Infinity,
                turnSnapshot === 1,
                p1PosSnapshot,
                p2PosSnapshot,
                hWallsSnapshot,
                vWallsSnapshot,
                p1WallsSnapshot,
                p2WallsSnapshot
            );
            score = result.score;
            if (score === undefined || score === null) {
                score = evaluateBoard(p1PosSnapshot, p2PosSnapshot, hWallsSnapshot, vWallsSnapshot, p1WallsSnapshot, p2WallsSnapshot, turnSnapshot === 1);
            }
        }

        state.precomputedEvaluations.currentEval = score;
        const currentItem = state.historyIndex > 0 ? state.history[state.historyIndex - 1] : null;
        if (!currentItem || currentItem.evalScore === null || currentItem.evalScore === undefined) {
            updateEvalBarUI(score);
        }

        const hWallsArray = new Uint8Array(64);
        const vWallsArray = new Uint8Array(64);
        for (const k of hWallsSnapshot.keys()) {
            const [wx, wy] = k.split(',').map(Number);
            hWallsArray[wy * 8 + wx] = 1;
        }
        for (const k of vWallsSnapshot.keys()) {
            const [wx, wy] = k.split(',').map(Number);
            vWallsArray[wy * 8 + wx] = 1;
        }

        const candidates = generateSmartMoves(
            turnSnapshot,
            p1PosSnapshot,
            p2PosSnapshot,
            hWallsArray,
            vWallsArray,
            p1WallsSnapshot,
            p2WallsSnapshot
        );

        if (candidates.length === 0) {
            state.precomputedEvaluations.status = 'done';
            return;
        }

        const isP1 = turnSnapshot === 1;

        const candDistances = candidates.map(move => {
            let nextP1Pos = { ...p1PosSnapshot };
            let nextP2Pos = { ...p2PosSnapshot };

            const idx = move.y * 8 + move.x;
            if (move.type === 'move') {
                if (isP1) nextP1Pos = move.to;
                else nextP2Pos = move.to;
            } else {
                if (move.wallType === 'h') hWallsArray[idx] = 1;
                else vWallsArray[idx] = 1;
            }

            const p1Len = findShortestPathLengthFast(nextP1Pos.x, nextP1Pos.y, 8, hWallsArray, vWallsArray, nextP2Pos.x, nextP2Pos.y);
            const p2Len = findShortestPathLengthFast(nextP2Pos.x, nextP2Pos.y, 0, hWallsArray, vWallsArray, nextP1Pos.x, nextP1Pos.y);

            if (move.type === 'wall') {
                if (move.wallType === 'h') hWallsArray[idx] = 0;
                else vWallsArray[idx] = 0;
            }

            const activeLen = isP1 ? p1Len : p2Len;
            const oppLen = isP1 ? p2Len : p1Len;

            return {
                move: move,
                activeLen: activeLen < 0 ? Infinity : activeLen,
                oppLen: oppLen < 0 ? -Infinity : oppLen
            };
        });

        candDistances.sort((a, b) => {
            if (a.activeLen !== b.activeLen) {
                return a.activeLen - b.activeLen;
            }
            return b.oppLen - a.oppLen;
        });

        const sortedCandidates = candDistances.map(cd => cd.move);

        let candIdx = 0;
        let bestScore = isP1 ? -Infinity : Infinity;

        function processNextCandidate() {
            if (getBoardStateKey(state) !== key) return;

            const move = sortedCandidates[candIdx];
            let nextP1Pos = { ...p1PosSnapshot };
            let nextP2Pos = { ...p2PosSnapshot };
            let nextP1Walls = p1WallsSnapshot;
            let nextP2Walls = p2WallsSnapshot;

            const idx = move.y * 8 + move.x;
            if (move.type === 'move') {
                if (isP1) nextP1Pos = move.to;
                else nextP2Pos = move.to;
            } else {
                if (move.wallType === 'h') hWallsArray[idx] = 1;
                else vWallsArray[idx] = 1;

                if (isP1) nextP1Walls--;
                else nextP2Walls--;
            }

            const result = minimax(
                depth - 1,
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

            if (move.type === 'wall') {
                if (move.wallType === 'h') hWallsArray[idx] = 0;
                else vWallsArray[idx] = 0;
            }

            const moveKey = move.type === 'move' ? `move:${move.to.x},${move.to.y}` : `wall:${move.x},${move.y},${move.wallType}`;
            state.precomputedEvaluations.scores.set(moveKey, result.score);

            if (isP1) {
                if (result.score > bestScore) bestScore = result.score;
            } else {
                if (result.score < bestScore) bestScore = result.score;
            }

            candIdx++;
            if (candIdx < candidates.length) {
                setTimeout(processNextCandidate, 0);
            } else {
                state.precomputedEvaluations.bestScore = bestScore;
                state.precomputedEvaluations.status = 'done';
            }
        }

        processNextCandidate();
    }, 0);
}

export function updateEvalBar() {
    if (state.trainingWatchActive) {
        const fillEl = document.getElementById('eval-bar-fill');
        const valEl = document.getElementById('eval-score-value');
        const bubbleEl = document.getElementById('eval-score-bubble');
        if (fillEl) fillEl.style.height = '50%';
        if (valEl) {
            valEl.textContent = 'Live';
            valEl.style.color = 'var(--color-text-muted)';
        }
        if (bubbleEl) {
            bubbleEl.classList.remove('loading');
        }
        return;
    }
    let scoreUpdated = false;

    if (state.historyIndex > 0 && state.historyIndex <= state.history.length) {
        const currentMoveItem = state.history[state.historyIndex - 1];
        if (currentMoveItem && currentMoveItem.evalScore !== undefined && currentMoveItem.evalScore !== null) {
            updateEvalBarUI(currentMoveItem.evalScore);
            scoreUpdated = true;
        }
    }

    if (!scoreUpdated && state.previousPrecomputedEvaluations) {
        const lastMove = state.history[state.history.length - 1];
        if (lastMove) {
            const moveKey = lastMove.type === 'move' ? `move:${lastMove.to.x},${lastMove.to.y}` : `wall:${lastMove.x},${lastMove.y},${lastMove.wallType}`;
            const cachedScore = state.previousPrecomputedEvaluations.scores.get(moveKey);
            if (cachedScore !== undefined) {
                updateEvalBarUI(cachedScore);
                scoreUpdated = true;
            } else if (state.previousPrecomputedEvaluations.currentEval !== null) {
                updateEvalBarUI(state.previousPrecomputedEvaluations.currentEval);
                scoreUpdated = true;
            }
        }
    }

    if (!scoreUpdated && state.precomputedEvaluations && state.precomputedEvaluations.currentEval !== null) {
        updateEvalBarUI(state.precomputedEvaluations.currentEval);
        scoreUpdated = true;
    }

    if (!scoreUpdated) {
        showEvalBarLoading();
    }

    precomputeNextMoves();
}
