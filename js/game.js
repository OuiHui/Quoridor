import { state } from './state.js';
import { playSound } from './sfx.js';
import { getPawnNotation, getWallNotation, formatMoveNotation } from './notation.js';
import { makeAIMove, resetMCTSTree } from './ai.js';
import { verifyPlaybookPracticeMove, exitPlaybookMode, updatePlaybookUI } from './playbook.js';
import { updatePawnPositions, renderPlacedWalls } from './ui-board.js';
import { updateUI, logAction, analyzePlacedWallEfficiency, hideWallAnalyzer, clearLogs, renderMatchHistoryUI } from './ui-diagnostics.js';
import { clearHints } from './ui-hints.js';

import { captureStateSnapshot, analyzeMoveQuality } from './move-analysis.js';
import { jumpToHistoryState, stepHistory } from './history-navigation.js';

export { analyzeMoveQuality, jumpToHistoryState, stepHistory };

// Process pawn movement
export function executePawnMove(x, y) {
    if (state.historyIndex < state.history.length) {
        state.history = state.history.slice(0, state.historyIndex);
    }

    const player = state.turn;
    const oldPos = player === 1 ? { ...state.p1Pos } : { ...state.p2Pos };
    const stateBefore = captureStateSnapshot();

    state.previousPrecomputedEvaluations = state.precomputedEvaluations;
    state.precomputedEvaluations = null;

    if (player === 1) state.p1Pos = { x, y };
    else state.p2Pos = { x, y };

    const stateAfter = captureStateSnapshot();
    const notation = formatMoveNotation({ type: 'move', to: { x, y } });

    const historyItem = {
        id: state.history.length + 1,
        type: 'move',
        player,
        from: oldPos,
        to: { x, y },
        notation,
        stateBefore,
        stateAfter,
        moveQuality: null
    };

    state.history.push(historyItem);
    state.historyIndex = state.history.length;

    analyzeMoveQuality({ type: 'move', to: { x, y } }, player, historyItem, stateBefore);

    clearHints();
    hideWallAnalyzer();

    logAction(`Player ${player}: Pawn moved to ${getPawnNotation(x, y)}`, `p${player}`);
    playSound('move');

    state.turn = state.turn === 1 ? 2 : 1;

    updatePawnPositions();
    updateUI();
    renderMatchHistoryUI();
    handlePostTurn();
}

// Process wall placement
export function executeWallPlacement(x, y, wallType) {
    if (state.historyIndex < state.history.length) {
        state.history = state.history.slice(0, state.historyIndex);
    }

    const player = state.turn;
    const wallKey = `${x},${y}`;
    const stateBefore = captureStateSnapshot();

    state.previousPrecomputedEvaluations = state.precomputedEvaluations;
    state.precomputedEvaluations = null;

    if (wallType === 'h') state.hWalls.set(wallKey, player);
    else state.vWalls.set(wallKey, player);

    if (player === 1) state.p1Walls--;
    else state.p2Walls--;

    const stateAfter = captureStateSnapshot();
    const notation = formatMoveNotation({ type: 'wall', x, y, wallType });

    const historyItem = {
        id: state.history.length + 1,
        type: 'wall',
        player,
        x,
        y,
        wallType,
        notation,
        stateBefore,
        stateAfter,
        moveQuality: null
    };

    state.history.push(historyItem);
    state.historyIndex = state.history.length;

    analyzeMoveQuality({ type: 'wall', x, y, wallType }, player, historyItem, stateBefore);

    clearHints();

    logAction(`Player ${player}: Placed wall at ${getWallNotation(x, y, wallType)}`, `p${player}`);
    playSound('wall');

    state.turn = state.turn === 1 ? 2 : 1;

    renderPlacedWalls();
    updateUI();
    renderMatchHistoryUI();
    handlePostTurn();
}

// Trigger AI if in vs-AI mode
export function handlePostTurn() {
    if (state.gameMode === 'sandbox' && state.activePlaybook && state.playbookPracticeMode) {
        verifyPlaybookPracticeMove();
    } else if (state.gameMode === 'ai') {
        const isAITurn = (state.turn === 1 && state.aiSettings.color === 'p1') || 
                        (state.turn === 2 && state.aiSettings.color === 'p2');
        if (isAITurn) {
            makeAIMove(executePawnMove, executeWallPlacement);
        }
    }
}

// Undo Move logic
export function undoMove() {
    if (state.history.length === 0) return;

    state.history.pop();
    jumpToHistoryState(state.history.length);

    if (state.gameMode === 'ai' && state.history.length > 0) {
        const isAITurnNow = (state.turn === 1 && state.aiSettings.color === 'p1') || 
                            (state.turn === 2 && state.aiSettings.color === 'p2');
        if (isAITurnNow) {
            undoMove();
        }
    }
}

// Reset board representation state variables
export function resetBoardState() {
    resetMCTSTree();
    state.p1Pos = { x: 4, y: 0 };
    state.p2Pos = { x: 4, y: 8 };
    state.p1Walls = 10;
    state.p2Walls = 10;
    state.hWalls.clear();
    state.vWalls.clear();
    state.turn = 1;
    state.interactionMode = 'move';
    state.history = [];
    state.historyIndex = 0;
    state.lastMoveQuality = null;
    
    state.previousPrecomputedEvaluations = null;
    state.precomputedEvaluations = null;
    
    clearHints();
    hideWallAnalyzer();
    
    renderPlacedWalls();
    updatePawnPositions();
    renderMatchHistoryUI();
}

// Reset Game flow
export function resetGame() {
    clearLogs();
    resetBoardState();
    
    if (state.activePlaybook) {
        state.playbookStep = 0;
        updatePlaybookUI();
    }
    
    updateUI();
    
    if (state.gameMode === 'ai' && state.aiSettings.color === 'p1') {
        makeAIMove(executePawnMove, executeWallPlacement);
    }
}

// Set active Game Mode
export function setGameMode(mode) {
    state.gameMode = mode;
    
    const badge = document.getElementById('hud-mode');
    if (badge) {
        badge.textContent = `Mode: ${mode === 'sandbox' ? 'Sandbox' : mode === 'pvp' ? 'Pass & Play' : 'Vs AI'}`;
    }
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    const aiPanel = document.getElementById('ai-settings');
    if (aiPanel) {
        if (mode === 'ai') aiPanel.classList.remove('hidden');
        else aiPanel.classList.add('hidden');
    }
    
    logAction(`Game mode changed to ${badge ? badge.textContent.split(': ')[1] : mode}.`, "system");
    
    if (mode !== 'sandbox') {
        exitPlaybookMode();
    }
    
    resetGame();
}
