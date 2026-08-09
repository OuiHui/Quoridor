import { state } from './state.js';
import { formatMoveNotation } from './notation.js';
import { evaluateBoard, minimax } from './ai.js';
import { renderMatchHistoryUI, getBoardStateKey } from './ui-diagnostics.js';
import { updateEvalBarUI } from './ui-eval-bar.js';
import { analyzeMoveInWorker } from './worker-manager.js';

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

function evalToWinProb(evalScore) {
    if (evalScore === Infinity) return 1.0;
    if (evalScore === -Infinity) return 0.0;
    if (evalScore === null || evalScore === undefined) return 0.5;
    return 1 / (1 + Math.pow(10, -evalScore / 100));
}

function classifyMove(chosenScore, bestScore, player, secondBestScore = null) {
    let loss = 0;
    let winLoss = 0;
    
    const bestWinProb = player === 1 ? evalToWinProb(bestScore) : (1 - evalToWinProb(bestScore));
    const chosenWinProb = player === 1 ? evalToWinProb(chosenScore) : (1 - evalToWinProb(chosenScore));
    winLoss = Math.max(0, (bestWinProb - chosenWinProb) * 100);

    if (player === 1) {
        loss = (bestScore === Infinity) ? (chosenScore === Infinity ? 0 : Infinity) : (bestScore - chosenScore);
    } else {
        loss = (bestScore === -Infinity) ? (chosenScore === -Infinity ? 0 : Infinity) : (chosenScore - bestScore);
    }

    const playerWinning = bestWinProb >= 0.70;
    const chosenWinning = chosenWinProb >= 0.55;

    let secondWinLoss = null;
    if (secondBestScore !== null && secondBestScore !== undefined) {
        const secondWinProb = player === 1 ? evalToWinProb(secondBestScore) : (1 - evalToWinProb(secondBestScore));
        secondWinLoss = Math.max(0, (bestWinProb - secondWinProb) * 100);
    }

    let classification = 'best';
    let text = 'Best';
    let symbol = '★';

    if (winLoss <= 2.0) {
        if (secondWinLoss !== null && secondWinLoss >= 10.0 && (chosenWinProb >= 0.70 || Math.abs(chosenScore) > Math.abs(secondBestScore || 0))) {
            classification = 'brilliant';
            text = 'Brilliant';
            symbol = '!!';
        } else if (secondWinLoss !== null && secondWinLoss >= 6.0) {
            classification = 'great';
            text = 'Great Move';
            symbol = '!';
        } else {
            classification = 'best';
            text = 'Best';
            symbol = '★';
        }
    } else if (winLoss <= 6.0) {
        classification = 'excellent';
        text = 'Excellent';
        symbol = '✓';
    } else if (winLoss <= 12.0) {
        classification = 'good';
        text = 'Good';
        symbol = '👍';
    } else if (playerWinning && !chosenWinning && winLoss >= 15.0) {
        classification = 'miss';
        text = 'Miss';
        symbol = '❌';
    } else if (winLoss <= 22.0) {
        classification = 'inaccuracy';
        text = 'Inaccuracy';
        symbol = '?!';
    } else if (winLoss <= 40.0) {
        classification = 'mistake';
        text = 'Mistake';
        symbol = '?';
    } else {
        classification = 'blunder';
        text = 'Blunder';
        symbol = '??';
    }

    return { classification, text, symbol, loss, winLoss };
}

function updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl, historyItem = null, bestMove = null, secondBestScore = null) {
    const { classification, text, symbol, loss } = classifyMove(chosenScore, bestScore, player, secondBestScore);
    const bestMoveNotation = bestMove ? formatMoveNotation(bestMove) : null;

    let prevEval = null;
    if (historyItem && historyItem.id > 1) {
        const prevItem = state.history[historyItem.id - 2];
        if (prevItem && prevItem.evalScore !== null && prevItem.evalScore !== undefined) {
            prevEval = prevItem.evalScore;
        }
    }

    const isBestMove = (loss <= 2 || classification === 'best' || classification === 'great' || classification === 'brilliant');
    let resultingEvalScore;
    if (isBestMove) {
        resultingEvalScore = prevEval !== null ? prevEval : (bestScore !== null ? bestScore : 0);
    } else {
        resultingEvalScore = chosenScore;
    }

    const qualityObj = {
        classification,
        text,
        symbol,
        player,
        score: resultingEvalScore,
        chosenScore,
        bestScore,
        loss,
        bestMoveNotation
    };

    state.lastMoveQuality = qualityObj;

    if (historyItem) {
        historyItem.moveQuality = qualityObj;
        historyItem.evalScore = resultingEvalScore;
        if (state.historyIndex === historyItem.id) {
            updateEvalBarUI(resultingEvalScore);
        }
        renderMatchHistoryUI();
    }

    if (badgeEl && badgeTextEl) {
        badgeEl.className = `eval-move-badge ${classification}`;
        badgeTextEl.textContent = `${symbol} ${text}`;
        badgeEl.classList.remove('hidden');
    }
}

export function analyzeMoveQuality(chosenMove, player, historyItem = null, stateBefore = null, options = {}) {
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
                const sortedScores = Array.from(state.previousPrecomputedEvaluations.scores.values()).sort((a, b) => isP1 ? b - a : a - b);
                const secondBestScore = sortedScores.length > 1 ? sortedScores[1] : null;
                updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl, historyItem, null, secondBestScore);
                return;
            }
        }
    }

    const depth = options.depth || 4;

    const performAnalysis = () => {
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
                Math.max(1, depth - 1),
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
    };

    if (options.sync) {
        performAnalysis();
    } else {
        if (badgeEl && badgeTextEl) {
            badgeEl.className = 'eval-move-badge thinking';
            badgeTextEl.textContent = 'Analyzing...';
            badgeEl.classList.remove('hidden');
        }

        const targetHistoryItem = historyItem;
        const currentSnapshot = stateBefore || captureStateSnapshot();
        
        analyzeMoveInWorker(chosenMove, player, currentSnapshot, depth).then((res) => {
            if (targetHistoryItem && !state.history.includes(targetHistoryItem)) return;
            if (res) {
                updateMoveQualityUI(
                    res.chosenScore,
                    res.bestScore,
                    player,
                    badgeEl,
                    badgeTextEl,
                    historyItem,
                    res.bestCandidate
                );
            }
        }).catch((err) => {
            console.error('Error during worker move quality analysis:', err);
            if (targetHistoryItem && !state.history.includes(targetHistoryItem)) return;
            performAnalysis();
        });
    }
}
