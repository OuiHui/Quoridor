import { state } from './state.js';
import { playSound } from './sfx.js';
import { updateUI, logAction, setHistoryJumpCallback } from './ui-diagnostics.js';
import { clearHints } from './ui-hints.js';
import { showExportModal, showImportModal } from './ui-modal.js';
import {
    executeWallPlacement,
    undoMove,
    resetGame,
    setGameMode,
    jumpToHistoryState,
    stepHistory
} from './game.js';

export function setInteractionMode(mode) {
    if (state.trainingWatchActive) return;
    const isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    state.interactionMode = mode;
    const preview = document.getElementById('preview-wall');
    if (preview) preview.classList.remove('visible');
    updateUI();
}

export function toggleHintMode() {
    if (state.trainingWatchActive) return;
    state.hintOn = !state.hintOn;
    const hintBtn = document.getElementById('btn-hint');
    if (state.hintOn) {
        if (hintBtn) {
            hintBtn.textContent = 'Hint: On';
            hintBtn.classList.remove('btn-secondary');
            hintBtn.classList.add('btn-gold');
            hintBtn.classList.remove('btn-accent');
        }
    } else {
        if (hintBtn) {
            hintBtn.textContent = 'Hint: Off';
            hintBtn.classList.remove('btn-accent', 'btn-gold');
            hintBtn.classList.add('btn-secondary');
        }
        clearHints();
    }
    updateUI();
}

function setupHintWallDelegation() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    boardEl.addEventListener('mousemove', (e) => {
        if (state.trainingWatchActive) return;
        if (e.target.classList.contains('hint-wall')) {
            if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            const type = e.target.dataset.type;

            const isAITurn = state.gameMode === 'ai' &&
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
        if (state.trainingWatchActive) return;
        if (e.target.classList.contains('hint-wall')) {
            if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
            const x = parseInt(e.target.dataset.x);
            const y = parseInt(e.target.dataset.y);
            const type = e.target.dataset.type;

            const isAITurn = state.gameMode === 'ai' &&
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
}

export function initUIEvents() {
    // Mode buttons
    document.getElementById('btn-mode-move').addEventListener('click', () => setInteractionMode('move'));
    document.getElementById('btn-mode-wall-h').addEventListener('click', () => setInteractionMode('wall-h'));
    document.getElementById('btn-mode-wall-v').addEventListener('click', () => setInteractionMode('wall-v'));

    setHistoryJumpCallback(jumpToHistoryState);

    // History controls
    const btnHistFirst = document.getElementById('btn-history-first');
    const btnHistPrev = document.getElementById('btn-history-prev');
    const btnHistNext = document.getElementById('btn-history-next');
    const btnHistLatest = document.getElementById('btn-history-latest');
    const btnExportState = document.getElementById('btn-export-state');
    const btnImportState = document.getElementById('btn-import-state');

    if (btnExportState) btnExportState.addEventListener('click', () => showExportModal());
    if (btnImportState) btnImportState.addEventListener('click', () => showImportModal());
    if (btnHistFirst) btnHistFirst.addEventListener('click', () => jumpToHistoryState(0));
    if (btnHistPrev) btnHistPrev.addEventListener('click', () => stepHistory(-1));
    if (btnHistNext) btnHistNext.addEventListener('click', () => stepHistory(1));
    if (btnHistLatest) btnHistLatest.addEventListener('click', () => jumpToHistoryState(state.history.length));

    // Undo & Reset controls
    document.getElementById('btn-undo').addEventListener('click', () => {
        if (state.trainingWatchActive) return;
        undoMove();
    });
    document.getElementById('btn-reset-board').addEventListener('click', () => {
        if (state.trainingWatchActive) return;
        resetGame();
    });

    // Auto-hint toggle
    const hintBtn = document.getElementById('btn-hint');
    if (hintBtn) hintBtn.addEventListener('click', toggleHintMode);

    // Setup board mouse listeners for hint walls
    setupHintWallDelegation();

    // Checkbox binds
    const chkShowPaths = document.getElementById('chk-show-paths');
    if (chkShowPaths) {
        chkShowPaths.addEventListener('change', (e) => {
            state.showPaths = e.target.checked;
            updateUI();
        });
    }

    const chkSound = document.getElementById('chk-sound');
    if (chkSound) {
        chkSound.addEventListener('change', (e) => {
            state.soundEnabled = e.target.checked;
        });
    }

    // Game Mode buttons
    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
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
}
