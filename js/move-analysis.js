import { state } from './state.js';
import { formatMoveNotation } from './notation.js';
import { evaluateBoard, minimax } from './ai.js';
import { renderMatchHistoryUI, getBoardStateKey } from './ui-diagnostics.js';

export function captureStateSnapshot() {
    return {
        p1Pos: { ...state.p1Pos },
        p2Pos: { ...state.p2Pos },
        p1Walls: state.p1Walls,
        p2Walls: state.p2Walls,
        hWalls: new Map(state.hWalls),
        vWalls: new Map(state.vWalls),
        turn: state.turn
    };
}

export function isSameMove(m1, m2) {
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

function updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl, historyItem = null, bestMove = null) {
    let loss = 0;
    if (player === 1) {
        if (bestScore === Infinity) {
            loss = chosenScore === Infinity ? 0 : Infinity;
        } else {
            loss = bestScore - chosenScore;
        }
    } else {
        if (bestScore === -Infinity) {
            loss = chosenScore === -Infinity ? 0 : Infinity;
        } else {
            loss = chosenScore - bestScore;
        }
    }

    let classification = 'optimal';
    let text = 'Optimal';
    
    if (loss <= 0) {
        classification = 'optimal';
        text = 'Optimal';
    } else if (loss <= 4) {
        classification = 'good';
        text = 'Good Move';
    } else if (loss <= 15) {
        classification = 'inaccuracy';
        text = 'Inaccuracy';
    } else {
        classification = 'blunder';
        text = 'Blunder';
    }

    const bestMoveNotation = bestMove ? formatMoveNotation(bestMove) : null;

    const qualityObj = {
        classification,
        text,
        player,
        score: chosenScore,
        bestScore,
        loss,
        bestMoveNotation
    };

    state.lastMoveQuality = qualityObj;

    if (historyItem) {
        historyItem.moveQuality = qualityObj;
        renderMatchHistoryUI();
    }

    if (badgeEl && badgeTextEl) {
        badgeEl.className = `eval-move-badge ${classification}`;
        badgeTextEl.textContent = text;
        badgeEl.classList.remove('hidden');
    }
}

export function analyzeMoveQuality(chosenMove, player, historyItem = null, stateBefore = null) {
    const isP1 = player === 1;
    const badgeEl = document.getElementById('eval-move-badge');
    const badgeTextEl = document.getElementById('eval-move-badge-text');

    const baseP1Pos = stateBefore ? { ...stateBefore.p1Pos } : { ...state.p1Pos };
    const baseP2Pos = stateBefore ? { ...stateBefore.p2Pos } : { ...state.p2Pos };
    const baseP1Walls = stateBefore ? stateBefore.p1Walls : state.p1Walls;
    const baseP2Walls = stateBefore ? stateBefore.p2Walls : state.p2Walls;
    const baseHWalls = stateBefore ? new Map(stateBefore.hWalls) : new Map(state.hWalls);
    const baseVWalls = stateBefore ? new Map(stateBefore.vWalls) : new Map(state.vWalls);

    if (state.previousPrecomputedEvaluations && state.previousPrecomputedEvaluations.scores) {
        const key = getBoardStateKey(stateBefore || state);
        if (state.previousPrecomputedEvaluations.key === key) {
            const moveKey = chosenMove.type === 'move' ? `move:${chosenMove.to.x},${chosenMove.to.y}` : `wall:${chosenMove.x},${chosenMove.y},${chosenMove.wallType}`;
            const chosenScore = state.previousPrecomputedEvaluations.scores.get(moveKey);
            const bestScore = state.previousPrecomputedEvaluations.bestScore !== null ? 
                state.previousPrecomputedEvaluations.bestScore : 
                state.previousPrecomputedEvaluations.currentEval;

            if (chosenScore !== undefined && bestScore !== null) {
                updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl, historyItem);
                return;
            }
        }
    }

    if (badgeEl && badgeTextEl) {
        badgeEl.className = 'eval-move-badge thinking';
        badgeTextEl.textContent = 'Analyzing...';
        badgeEl.classList.remove('hidden');
    }

    const historyLenSnapshot = state.history.length;
    const depth = 5;

    setTimeout(() => {
        if (state.history.length !== historyLenSnapshot) return;

        let bestScore = null;
        let bestCandidate = null;

        const result = minimax(
            depth,
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
        bestScore = result.score;
        bestCandidate = result.move;
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
            chosenScore = chosenResult.score;
        }

        updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl, historyItem, bestCandidate);
    }, 50);
}
