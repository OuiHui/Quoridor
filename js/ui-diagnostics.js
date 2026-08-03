import { state } from './state.js';
import { findShortestPath, getValidPawnMoves } from './engine.js';
import { getBestMoves, getBestMovesAndThreats } from './ai.js';
import { renderHints, clearHints } from './ui-hints.js';
import { getWallNotation } from './notation.js';
import { updateEvalBar } from './ui-eval-bar.js';
import { checkGameVictory } from './ui-modal.js';

export {
    getBoardStateKey,
    showEvalBarLoading,
    updateEvalBarUI,
    precomputeNextMoves,
    updateEvalBar
} from './ui-eval-bar.js';

export {
    setHistoryJumpCallback,
    renderMatchHistoryUI,
    logAction,
    clearLogs,
    removeLastLog
} from './ui-history.js';

export {
    triggerGameOver,
    checkGameVictory
} from './ui-modal.js';

export function updateActionBarUI() {
    const actionBar = document.getElementById('action-selection-bar');
    if (!actionBar) return;

    actionBar.className = `action-selection-bar p${state.turn}-turn`;

    const btnMove = document.getElementById('btn-mode-move');
    const btnWallH = document.getElementById('btn-mode-wall-h');
    const btnWallV = document.getElementById('btn-mode-wall-v');

    if (!btnMove || !btnWallH || !btnWallV) return;

    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0 && state.interactionMode !== 'move') {
        state.interactionMode = 'move';
    }

    btnMove.classList.remove('active');
    btnWallH.classList.remove('active');
    btnWallV.classList.remove('active');

    if (state.interactionMode === 'move') {
        btnMove.classList.add('active');
    } else if (state.interactionMode === 'wall-h') {
        btnWallH.classList.add('active');
    } else if (state.interactionMode === 'wall-v') {
        btnWallV.classList.add('active');
    }

    const isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    const isPlaybookViewing = state.activePlaybook !== null && !state.playbookPracticeMode;
    const isLocked = isAITurn || isPlaybookViewing || state.trainingWatchActive;

    btnMove.disabled = isLocked;
    btnWallH.disabled = isLocked || (wallsLeft <= 0);
    btnWallV.disabled = isLocked || (wallsLeft <= 0);
}

export function updateUI() {
    state.keyboardSelectedCell = null;
    document.querySelectorAll('.board-cell.keyboard-highlight').forEach(c => c.classList.remove('keyboard-highlight'));

    updateActionBarUI();
    const boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.classList.remove('mode-move', 'mode-wall-h', 'mode-wall-v');
        boardEl.classList.add(`mode-${state.interactionMode}`);
    }

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

    const diagP1 = document.getElementById('diag-p1-dist');
    if (diagP1) diagP1.textContent = p1Len;
    const diagP2 = document.getElementById('diag-p2-dist');
    if (diagP2) diagP2.textContent = p2Len;

    const tempoDiff = p2Len - p1Len;
    const tempoEl = document.getElementById('diag-tempo-diff');
    if (tempoEl) {
        tempoEl.textContent = tempoDiff > 0 ? `+${tempoDiff} P1` : tempoDiff < 0 ? `${tempoDiff} P2` : '0 (Equal)';
        tempoEl.style.color = tempoDiff > 0 ? 'var(--color-p1)' : tempoDiff < 0 ? 'var(--color-p2)' : 'var(--color-text-muted)';
    }

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

    if (!isAITurn && !isPlaybookViewing && state.interactionMode === 'move') {
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
            const { bestMoves, threatMoves } = getBestMovesAndThreats(
                turnSnapshot,
                p1PosSnapshot,
                p2PosSnapshot,
                hWallsSnapshot,
                vWallsSnapshot,
                p1WallsSnapshot,
                p2WallsSnapshot
            );
            if (state.hintOn && state.turn === turnSnapshot) {
                renderHints(bestMoves, threatMoves);
            }
        }, 50);
    } else {
        clearHints();
    }
}

export function analyzePlacedWallEfficiency(x, y, type, playerWhoPlaced) {}

export function hideWallAnalyzer() {}
