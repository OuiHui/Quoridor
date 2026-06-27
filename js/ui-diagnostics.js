import { state } from './state.js';
import { playSound } from './sfx.js';
import { getWallNotation } from './notation.js';
import { findShortestPath, getValidPawnMoves } from './engine.js';
import { evaluateBoard, minimax, getBestMoves } from './ai.js';
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
export function updateEvalBar() {
    // Fixed depth of 5 for deterministic evaluation of who is winning, assuming optimal moves (best moves) are played onward.
    // This is independent of the AI difficulty settings or player skill levels.
    const depth = 5;
    const isP1 = state.turn === 1;
    const result = minimax(
        depth,
        -Infinity,
        Infinity,
        isP1,
        state.p1Pos,
        state.p2Pos,
        state.hWalls,
        state.vWalls,
        state.p1Walls,
        state.p2Walls
    );
    let score = result.score;
    if (score === undefined || score === null) {
        score = evaluateBoard(state.p1Pos, state.p2Pos, state.hWalls, state.vWalls, state.p1Walls, state.p2Walls, isP1);
    }

    const fillEl = document.getElementById('eval-bar-fill');
    const valEl = document.getElementById('eval-score-value');
    const badgeEl = document.getElementById('eval-move-badge');
    const badgeTextEl = document.getElementById('eval-move-badge-text');

    if (!fillEl || !valEl) return;

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
        const bestMoves = getBestMoves(state.turn, state.p1Pos, state.p2Pos, state.hWalls, state.vWalls, state.p1Walls, state.p2Walls);
        renderHints(bestMoves);
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
