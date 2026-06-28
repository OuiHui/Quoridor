import { state } from './state.js';
import { playSound } from './sfx.js';
import { getWallNotation } from './notation.js';
import { findShortestPath, getValidPawnMoves, findShortestPathLengthFast } from './engine.js';
import { evaluateBoard, minimax, getBestMoves, generateSmartMoves } from './ai.js';
import { renderHints, clearHints } from './ui-hints.js';

// Log actions into match history
export function logAction(text, type) {
    const logsContainer = document.getElementById('game-logs');
    if (!logsContainer) return;
    const log = document.createElement('div');
    log.className = `log-entry ${type}-log`;
    log.textContent = text;
    logsContainer.appendChild(log);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Trigger Game Over Modal
export function triggerGameOver(title, message) {
    playSound('win');
    logAction(title, 'system');

    const modal = document.getElementById('modal-container');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    modal.classList.remove('hidden');
}

// Check Victory Conditions
export function checkGameVictory(p1Len, p2Len) {
    if (p1Len === 0) {
        triggerGameOver("Player 1 Wins!", "Player 1 (Blue) successfully navigated to the baseline row.");
    } else if (p2Len === 0) {
        triggerGameOver("Player 2 Wins!", "Player 2 (Amber) successfully navigated to the baseline row.");
    }
}

// Render the evaluation bar
export function getBoardStateKey(state) {
    const hKeys = Array.from(state.hWalls.keys()).sort().join(';');
    const vKeys = Array.from(state.vWalls.keys()).sort().join(';');
    return `${state.p1Pos.x},${state.p1Pos.y}|${state.p2Pos.x},${state.p2Pos.y}|${state.p1Walls}|${state.p2Walls}|${state.turn}|${hKeys}|${vKeys}`;
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
    
    // Check if already computed or currently computing for this key
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

    const depth = 5;

    // Yield control to main thread using setTimeout
    setTimeout(() => {
        if (getBoardStateKey(state) !== key) return; // state changed, abort

        let score;
        // If we already computed the score of this state in the previous turn, use it!
        if (state.previousPrecomputedEvaluations) {
            const lastMove = state.history[state.history.length - 1];
            if (lastMove) {
                const moveKey = lastMove.type === 'move' ? `move:${lastMove.to.x},${lastMove.to.y}` : `wall:${lastMove.x},${lastMove.y},${lastMove.wallType}`;
                score = state.previousPrecomputedEvaluations.scores.get(moveKey);
            }
        }

        if (score === undefined) {
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
        updateEvalBarUI(score);

        // Convert Map walls to TypedArrays for fast minimax child updates
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

        // Sort candidates so that moves resulting in the smallest active player path length are precomputed first!
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

            const p1Len = findShortestPathLengthFast(nextP1Pos.x, nextP1Pos.y, 8, hWallsArray, vWallsArray);
            const p2Len = findShortestPathLengthFast(nextP2Pos.x, nextP2Pos.y, 0, hWallsArray, vWallsArray);

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
            if (getBoardStateKey(state) !== key) return; // state changed, abort

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
                // Yield to event loop to avoid freezing UI
                setTimeout(processNextCandidate, 0);
            } else {
                state.precomputedEvaluations.bestScore = bestScore;
                state.precomputedEvaluations.status = 'done';
            }
        }

        processNextCandidate();
    }, 0);
}

// Render the evaluation bar
export function updateEvalBar() {
    const key = getBoardStateKey(state);
    
    // Check if we already have a precomputed score for this state (from previous turn)
    let scoreUpdated = false;
    if (state.previousPrecomputedEvaluations) {
        const lastMove = state.history[state.history.length - 1];
        if (lastMove) {
            const moveKey = lastMove.type === 'move' ? `move:${lastMove.to.x},${lastMove.to.y}` : `wall:${lastMove.x},${lastMove.y},${lastMove.wallType}`;
            const cachedScore = state.previousPrecomputedEvaluations.scores.get(moveKey);
            if (cachedScore !== undefined) {
                updateEvalBarUI(cachedScore);
                scoreUpdated = true;
            }
        }
    }

    if (!scoreUpdated) {
        showEvalBarLoading();
    }

    // Run/continue the precomputation
    precomputeNextMoves();
}

// UI update sequence for turn indicators, badges, diagnostic logs, and path highlights
export function updateUI() {
    const turnHud = document.getElementById('hud-turn');
    const p1Card = document.getElementById('p1-card');
    const p2Card = document.getElementById('p2-card');

    p1Card.classList.remove('active');
    p2Card.classList.remove('active');

    if (state.turn === 1) {
        turnHud.textContent = "Turn: Player 1 (Blue)";
        turnHud.style.borderColor = "var(--color-p1)";
        turnHud.style.color = "var(--color-p1)";
        p1Card.classList.add('active');
    } else {
        turnHud.textContent = "Turn: Player 2 (Amber)";
        turnHud.style.borderColor = "var(--color-p2)";
        turnHud.style.color = "var(--color-p2)";
        p2Card.classList.add('active');
    }

    document.getElementById('p1-walls-count').textContent = state.p1Walls;
    document.getElementById('p2-walls-count').textContent = state.p2Walls;

    const p1Path = findShortestPath(state.p1Pos.x, state.p1Pos.y, 8, state.hWalls, state.vWalls);
    const p2Path = findShortestPath(state.p2Pos.x, state.p2Pos.y, 0, state.hWalls, state.vWalls);

    const p1Len = p1Path ? p1Path.length - 1 : Infinity;
    const p2Len = p2Path ? p2Path.length - 1 : Infinity;

    document.getElementById('p1-path-len').textContent = p1Len === Infinity ? 'Blocked' : p1Len;
    document.getElementById('p2-path-len').textContent = p2Len === Infinity ? 'Blocked' : p2Len;

    document.getElementById('diag-p1-dist').textContent = p1Len;
    document.getElementById('diag-p2-dist').textContent = p2Len;

    const tempoDiff = p2Len - p1Len;
    const tempoEl = document.getElementById('diag-tempo-diff');
    tempoEl.textContent = tempoDiff > 0 ? `+${tempoDiff} P1` : tempoDiff < 0 ? `${tempoDiff} P2` : '0 (Equal)';
    tempoEl.style.color = tempoDiff > 0 ? 'var(--color-p1)' : tempoDiff < 0 ? 'var(--color-p2)' : 'var(--color-text-muted)';

    document.querySelectorAll('.board-cell').forEach(cell => {
        cell.classList.remove('valid-move', 'p1-path', 'p2-path');
    });

    if (state.showPaths) {
        if (p1Path) {
            p1Path.forEach(pt => {
                const cell = document.querySelector(`.board-cell[data-x="${pt.x}"][data-y="${pt.y}"]`);
                if (cell) cell.classList.add('p1-path');
            });
        }
        if (p2Path) {
            p2Path.forEach(pt => {
                const cell = document.querySelector(`.board-cell[data-x="${pt.x}"][data-y="${pt.y}"]`);
                if (cell) cell.classList.add('p2-path');
            });
        }
    }

    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));

    const isPlaybookViewing = state.activePlaybook !== null && !state.playbookPracticeMode;

    if (!isAITurn && !isPlaybookViewing) {
        const active = state.turn === 1 ? state.p1Pos : state.p2Pos;
        const passive = state.turn === 1 ? state.p2Pos : state.p1Pos;

        const moves = getValidPawnMoves(active.x, active.y, passive.x, passive.y, state.hWalls, state.vWalls);
        moves.forEach(m => {
            const cell = document.querySelector(`.board-cell[data-x="${m.x}"][data-y="${m.y}"]`);
            if (cell) cell.classList.add('valid-move');
        });
    }

    checkGameVictory(p1Len, p2Len);
    updateEvalBar();

    if (state.hintOn && !isAITurn && !isPlaybookViewing) {
        const turnSnapshot = state.turn;
        const p1PosSnapshot = { ...state.p1Pos };
        const p2PosSnapshot = { ...state.p2Pos };
        const p1WallsSnapshot = state.p1Walls;
        const p2WallsSnapshot = state.p2Walls;
        const hWallsSnapshot = new Map(state.hWalls);
        const vWallsSnapshot = new Map(state.vWalls);

        setTimeout(() => {
            if (state.turn !== turnSnapshot) return;
            const bestMoves = getBestMoves(
                turnSnapshot,
                p1PosSnapshot,
                p2PosSnapshot,
                hWallsSnapshot,
                vWallsSnapshot,
                p1WallsSnapshot,
                p2WallsSnapshot
            );
            renderHints(bestMoves);
        }, 50);
    } else {
        clearHints();
    }
}

// Diagnostics helper showing path length changes for placed wall
export function analyzePlacedWallEfficiency(x, y, type, playerWhoPlaced) {
    const readout = document.getElementById('efficiency-readout');
    const analyzerPanel = document.querySelector('.efficiency-analyzer');
    if (!readout || !analyzerPanel) return;

    const wallKey = `${x},${y}`;

    // Temporarily remove the wall to find the "before" path lengths
    if (type === 'h') state.hWalls.delete(wallKey);
    else state.vWalls.delete(wallKey);

    const baseP1 = findShortestPath(state.p1Pos.x, state.p1Pos.y, 8, state.hWalls, state.vWalls).length - 1;
    const baseP2 = findShortestPath(state.p2Pos.x, state.p2Pos.y, 0, state.hWalls, state.vWalls).length - 1;

    // Put the wall back
    if (type === 'h') state.hWalls.set(wallKey, playerWhoPlaced);
    else state.vWalls.set(wallKey, playerWhoPlaced);

    const nextP1 = findShortestPath(state.p1Pos.x, state.p1Pos.y, 8, state.hWalls, state.vWalls).length - 1;
    const nextP2 = findShortestPath(state.p2Pos.x, state.p2Pos.y, 0, state.hWalls, state.vWalls).length - 1;

    const diffP1 = nextP1 - baseP1;
    const diffP2 = nextP2 - baseP2;

    const efficiencyScore = playerWhoPlaced === 1 ? (diffP2 - diffP1) : (diffP1 - diffP2);

    let advice = "Neutral impact. Conserves wall potential.";
    if (efficiencyScore > 0) {
        advice = `Excellent Placement! Adds +${efficiencyScore} net moves to opponent's route.`;
    } else if (efficiencyScore < 0) {
        advice = `Suboptimal: Adds +${Math.abs(efficiencyScore)} moves to your own path.`;
    } else if (diffP1 === 0 && diffP2 === 0) {
        advice = "No direct impact on path lengths. Use for strategic trapping.";
    }

    readout.innerHTML = `
        <div class="efficiency-results">
            <span class="eff-title">WALL PLACED: ${getWallNotation(x, y, type).toUpperCase()}</span>
            <div class="eff-impact-row">
                <span>P1 Path Impact:</span>
                <span class="${diffP1 > 0 ? 'eff-negative' : 'eff-neutral'}">${diffP1 > 0 ? '+' + diffP1 : '0'}</span>
            </div>
            <div class="eff-impact-row">
                <span>P2 Path Impact:</span>
                <span class="${diffP2 > 0 ? 'eff-negative' : 'eff-neutral'}">${diffP2 > 0 ? '+' + diffP2 : '0'}</span>
            </div>
            <div class="eff-impact-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.05)">
                <span style="font-weight:600">Advice:</span>
                <span style="font-weight:600; text-align:right" class="${efficiencyScore > 0 ? 'eff-positive' : efficiencyScore < 0 ? 'eff-negative' : 'eff-neutral'}">${advice}</span>
            </div>
        </div>
    `;

    analyzerPanel.classList.remove('hidden');
}

export function hideWallAnalyzer() {
    const analyzerPanel = document.querySelector('.efficiency-analyzer');
    if (analyzerPanel) {
        analyzerPanel.classList.add('hidden');
    }
}

export function clearLogs() {
    const logsContainer = document.getElementById('game-logs');
    if (logsContainer) {
        logsContainer.innerHTML = '';
    }
}
