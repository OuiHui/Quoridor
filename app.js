/**
 * Quoridor Playbook & Trainer
 * Modular Mediator and Entry Point
 */

// Import HTML Templates
import headerHtml from './components/header.html?raw';
import playbookHtml from './components/playbook-panel.html?raw';
import boardHtml from './components/board-container.html?raw';
import diagnosticsHtml from './components/diagnostics-panel.html?raw';
import footerHtml from './components/footer.html?raw';
import modalHtml from './components/modal.html?raw';

// Import State and Engines
import { state } from './js/state.js';
import { playSound } from './js/sfx.js';
import { validateWallPlacement } from './js/engine.js';
import { getBestMoves } from './js/ai.js';
import { initPlaybook } from './js/playbook.js';

// Import UI Views
import { renderBoard, updatePawnPositions, renderPlacedWalls } from './js/ui-board.js';
import { updateUI, logAction } from './js/ui-diagnostics.js';
import { renderHints, clearHints } from './js/ui-hints.js';

// Import Game State Controllers
import {
    executePawnMove,
    executeWallPlacement,
    undoMove,
    resetBoardState,
    resetGame,
    setGameMode
} from './js/game.js';

// RESOLVE CLAMPED WALL FROM TRACK EDGE HOVER/CLICK
function getWallFromEdge(e, x, y, edgeType) {
    if (edgeType === 'h') {
        let wx;
        if (x === 0) {
            wx = 0;
        } else if (x === 8) {
            wx = 7;
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            wx = mouseX < rect.width / 2 ? x - 1 : x;
        }
        return { wx, wy: y, type: 'h' };
    } else {
        let wy;
        if (y === 0) {
            wy = 0;
        } else if (y === 8) {
            wy = 7;
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            wy = mouseY < rect.height / 2 ? y : y - 1;
        }
        return { wx: x, wy, type: 'v' };
    }
}

// VIEW EVENT CALLBACKS wired by Mediator

function handleCellClick(x, y) {
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    const cell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (!cell || !cell.classList.contains('valid-move')) return;
    executePawnMove(x, y);
}

function handleEdgeMouseMove(e, x, y, edgeType) {
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0) return;

    const { wx, wy, type } = getWallFromEdge(e, x, y, edgeType);
    const isValid = validateWallPlacement(wx, wy, type, state.p1Pos, state.p2Pos, state.hWalls, state.vWalls);

    const preview = document.getElementById('preview-wall');
    if (preview) {
        preview.className = `preview-wall visible ${type === 'h' ? 'horizontal' : 'vertical'} ${state.turn === 1 ? 'p1-preview' : 'p2-preview'}`;
        if (!isValid) preview.classList.add('invalid');

        if (type === 'h') {
            preview.style.gridColumn = `${2 * wx + 1} / span 3`;
            preview.style.gridRow = `${16 - 2 * wy}`;
        } else {
            preview.style.gridColumn = `${2 * wx + 2}`;
            preview.style.gridRow = `${15 - 2 * wy} / span 3`;
        }
    }
}

function handleEdgeMouseLeave(e, x, y, edgeType) {
    const preview = document.getElementById('preview-wall');
    if (preview) preview.classList.remove('visible');
}

function handleEdgeClick(e, x, y, edgeType) {
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0) {
        playSound('error');
        logAction("Error: No walls left!", "system");
        return;
    }

    const { wx, wy, type } = getWallFromEdge(e, x, y, edgeType);
    const isValid = validateWallPlacement(wx, wy, type, state.p1Pos, state.p2Pos, state.hWalls, state.vWalls);
    if (!isValid) {
        playSound('error');
        logAction("Error: Invalid wall placement (overlaps or blocks path)", "system");
        return;
    }

    executeWallPlacement(wx, wy, type);
}

// BOOTSTRAP INITIALIZATION
function init() {
    // 1. Inject HTML Templates
    const headerEl = document.querySelector('.app-header');
    if (headerEl) headerEl.innerHTML = headerHtml;

    const playbookEl = document.querySelector('.left-panel');
    if (playbookEl) playbookEl.innerHTML = playbookHtml;

    const boardContainerEl = document.querySelector('.board-container');
    if (boardContainerEl) boardContainerEl.innerHTML = boardHtml;

    const diagnosticsEl = document.querySelector('.right-panel');
    if (diagnosticsEl) diagnosticsEl.innerHTML = diagnosticsHtml;

    const footerEl = document.querySelector('.app-footer');
    if (footerEl) footerEl.innerHTML = footerHtml;

    const modalEl = document.getElementById('modal-container');
    if (modalEl) modalEl.innerHTML = modalHtml;

    // 2. Render Board View passing Mediator callbacks
    renderBoard({
        onCellClick: handleCellClick,
        onEdgeMouseMove: handleEdgeMouseMove,
        onEdgeMouseLeave: handleEdgeMouseLeave,
        onEdgeClick: handleEdgeClick
    });

    // 3. Playbook binds (inject game actions)
    initPlaybook({
        executePawnMove,
        executeWallPlacement,
        undoMove,
        updateUI,
        setGameMode,
        resetBoardState,
        renderPlacedWalls,
        updatePawnPositions,
        logAction
    });

    // 4. Quick Board control binds
    document.getElementById('btn-undo').addEventListener('click', undoMove);
    document.getElementById('btn-reset-board').addEventListener('click', resetGame);

    // Wire up auto-hint toggle trigger
    const hintBtn = document.getElementById('btn-hint');
    hintBtn.addEventListener('click', () => {
        state.hintOn = !state.hintOn;
        if (state.hintOn) {
            hintBtn.textContent = 'Hint: On';
            hintBtn.classList.remove('btn-secondary');
            hintBtn.classList.add('btn-accent');
            
            const turnSnapshot = state.turn;
            const p1PosSnapshot = { ...state.p1Pos };
            const p2PosSnapshot = { ...state.p2Pos };
            const hWallsSnapshot = new Map(state.hWalls);
            const vWallsSnapshot = new Map(state.vWalls);
            const p1WallsSnapshot = state.p1Walls;
            const p2WallsSnapshot = state.p2Walls;

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
            
            logAction('Auto hints enabled.', 'system');
        } else {
            hintBtn.textContent = 'Hint: Off';
            hintBtn.classList.remove('btn-accent');
            hintBtn.classList.add('btn-secondary');
            clearHints();
            logAction('Auto hints disabled.', 'system');
        }
    });

    // Hint Wall hover/click delegation
    const boardEl = document.getElementById('board');
    boardEl.addEventListener('mousemove', (e) => {
        if (e.target.classList.contains('hint-wall')) {
            if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            const type = e.target.dataset.type;

            let isAITurn = state.gameMode === 'ai' &&
                ((state.turn === 1 && state.aiSettings.color === 'p1') ||
                    (state.turn === 2 && state.aiSettings.color === 'p2'));
            if (isAITurn) return;

            const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
            if (wallsLeft <= 0) return;

            const preview = document.getElementById('preview-wall');
            if (preview) {
                preview.className = `preview-wall visible ${type === 'h' ? 'horizontal' : 'vertical'} ${state.turn === 1 ? 'p1-preview' : 'p2-preview'}`;
                if (type === 'h') {
                    preview.style.gridColumn = `${2 * x + 1} / span 3`;
                    preview.style.gridRow = `${16 - 2 * y}`;
                } else {
                    preview.style.gridColumn = `${2 * x + 2}`;
                    preview.style.gridRow = `${15 - 2 * y} / span 3`;
                }
            }
        }
    });

    boardEl.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('hint-wall')) {
            if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
            const preview = document.getElementById('preview-wall');
            if (preview) preview.classList.remove('visible');
        }
    });

    boardEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('hint-wall')) {
            if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            const type = e.target.dataset.type;

            let isAITurn = state.gameMode === 'ai' &&
                ((state.turn === 1 && state.aiSettings.color === 'p1') ||
                    (state.turn === 2 && state.aiSettings.color === 'p2'));
            if (isAITurn) return;

            const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
            if (wallsLeft <= 0) {
                playSound('error');
                logAction("Error: No walls left!", "system");
                return;
            }

            executeWallPlacement(x, y, type);
        }
    });

    // Checkbox binds
    document.getElementById('chk-show-paths').addEventListener('change', (e) => {
        state.showPaths = e.target.checked;
        updateUI();
    });

    document.getElementById('chk-sound').addEventListener('change', (e) => {
        state.soundEnabled = e.target.checked;
    });

    // 5. Game Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setGameMode(btn.dataset.mode));
    });

    // AI Difficulty select
    document.getElementById('ai-difficulty').addEventListener('change', (e) => {
        state.aiSettings.difficulty = e.target.value;
        logAction(`AI difficulty set to ${e.target.value.toUpperCase()}.`, 'system');
    });

    document.getElementById('ai-color').addEventListener('change', (e) => {
        state.aiSettings.color = e.target.value;
        resetGame();
    });

    // Modal buttons
    document.getElementById('modal-btn-restart').addEventListener('click', () => {
        document.getElementById('modal-container').classList.add('hidden');
        resetGame();
    });
    document.getElementById('modal-btn-close').addEventListener('click', () => {
        document.getElementById('modal-container').classList.add('hidden');
    });

    setGameMode('sandbox');
}

window.addEventListener('DOMContentLoaded', init);
