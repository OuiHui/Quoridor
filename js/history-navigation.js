import { state } from './state.js';
import { playSound } from './sfx.js';
import { updatePawnPositions, renderPlacedWalls } from './ui-board.js';
import { updateUI, hideWallAnalyzer, renderMatchHistoryUI } from './ui-diagnostics.js';
import { clearHints } from './ui-hints.js';

export function jumpToHistoryState(targetIndex) {
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex > state.history.length) targetIndex = state.history.length;

    state.historyIndex = targetIndex;
    state.previousPrecomputedEvaluations = null;
    state.precomputedEvaluations = null;

    clearHints();
    hideWallAnalyzer();

    if (targetIndex === 0) {
        state.p1Pos = { x: 4, y: 0 };
        state.p2Pos = { x: 4, y: 8 };
        state.p1Walls = 10;
        state.p2Walls = 10;
        state.hWalls.clear();
        state.vWalls.clear();
        state.turn = 1;
        state.lastMoveQuality = null;
    } else {
        const item = state.history[targetIndex - 1];
        const snap = item.stateAfter;
        state.p1Pos = { ...snap.p1Pos };
        state.p2Pos = { ...snap.p2Pos };
        state.p1Walls = snap.p1Walls;
        state.p2Walls = snap.p2Walls;
        state.hWalls = new Map(snap.hWalls);
        state.vWalls = new Map(snap.vWalls);
        state.turn = item.player === 1 ? 2 : 1;
        state.lastMoveQuality = item.moveQuality || null;
    }

    playSound('move');
    updatePawnPositions();
    renderPlacedWalls();
    updateUI();
    renderMatchHistoryUI();
}

export function stepHistory(direction) {
    jumpToHistoryState(state.historyIndex + direction);
}
