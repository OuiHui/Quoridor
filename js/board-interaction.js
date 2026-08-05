import { state } from './state.js';
import { playSound } from './sfx.js';
import { validateWallPlacement } from './engine.js';
import { logAction } from './ui-history.js';
import { executePawnMove, executeWallPlacement } from './game.js';
import { toggleCustomSketchWall } from './board-arrows.js';

export function getWallFromEdge(e, x, y, edgeType) {
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

export function handleCellClick(x, y) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    if (state.interactionMode !== 'move') return;
    const cell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (!cell || !cell.classList.contains('valid-move')) return;
    executePawnMove(x, y);
}

export function handleCellMouseEnter(x, y) {
    if (state.trainingWatchActive) return;
    if (state.interactionMode !== 'move') return;
    const cell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (cell && cell.classList.contains('valid-move')) {
        state.keyboardSelectedCell = { x, y };
        document.querySelectorAll('.board-cell.keyboard-highlight').forEach(c => c.classList.remove('keyboard-highlight'));
        cell.classList.add('keyboard-highlight');
    }
}

export function handleEdgeMouseMove(e, x, y, edgeType) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    if (state.interactionMode === 'move') return;
    if (state.interactionMode === 'wall-h' && edgeType !== 'h') return;
    if (state.interactionMode === 'wall-v' && edgeType !== 'v') return;

    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0) return;

    const { wx, wy, type } = getWallFromEdge(e, x, y, edgeType);
    state.keyboardJoint = { x: wx, y: wy };
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

export function handleEdgeMouseLeave(e, x, y, edgeType) {
    const preview = document.getElementById('preview-wall');
    if (preview) preview.classList.remove('visible');
}

export function handleEdgeClick(e, x, y, edgeType) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    if (state.interactionMode === 'move') return;
    if (state.interactionMode === 'wall-h' && edgeType !== 'h') return;
    if (state.interactionMode === 'wall-v' && edgeType !== 'v') return;

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

export function handleJointMouseMove(e, x, y) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    if (state.interactionMode === 'move') return;
    const type = state.interactionMode === 'wall-h' ? 'h' : 'v';

    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0) return;

    state.keyboardJoint = { x, y };
    const isValid = validateWallPlacement(x, y, type, state.p1Pos, state.p2Pos, state.hWalls, state.vWalls);

    const preview = document.getElementById('preview-wall');
    if (preview) {
        preview.className = `preview-wall visible ${type === 'h' ? 'horizontal' : 'vertical'} ${state.turn === 1 ? 'p1-preview' : 'p2-preview'}`;
        if (!isValid) preview.classList.add('invalid');

        if (type === 'h') {
            preview.style.gridColumn = `${2 * x + 1} / span 3`;
            preview.style.gridRow = `${16 - 2 * y}`;
        } else {
            preview.style.gridColumn = `${2 * x + 2}`;
            preview.style.gridRow = `${15 - 2 * y} / span 3`;
        }
    }
}

export function handleJointMouseLeave(e, x, y) {
    const preview = document.getElementById('preview-wall');
    if (preview) preview.classList.remove('visible');
}

export function handleJointClick(e, x, y) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    if (state.interactionMode === 'move') return;
    const type = state.interactionMode === 'wall-h' ? 'h' : 'v';

    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0) {
        playSound('error');
        logAction("Error: No walls left!", "system");
        return;
    }

    const isValid = validateWallPlacement(x, y, type, state.p1Pos, state.p2Pos, state.hWalls, state.vWalls);
    if (!isValid) {
        playSound('error');
        logAction("Error: Invalid wall placement (overlaps or blocks path)", "system");
        return;
    }

    executeWallPlacement(x, y, type);
}

export function handleEdgeContextMenu(e, x, y, edgeType) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    if (state.interactionMode === 'move') return;
    if (state.interactionMode === 'wall-h' && edgeType !== 'h') return;
    if (state.interactionMode === 'wall-v' && edgeType !== 'v') return;

    e.preventDefault();
    e.stopPropagation();

    const { wx, wy, type } = getWallFromEdge(e, x, y, edgeType);
    toggleCustomSketchWall(wx, wy, type, 'orange');
}

export function handleJointContextMenu(e, x, y) {
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    let isAITurn = state.gameMode === 'ai' &&
        ((state.turn === 1 && state.aiSettings.color === 'p1') ||
            (state.turn === 2 && state.aiSettings.color === 'p2'));
    if (isAITurn) return;

    if (state.interactionMode === 'move') return;

    e.preventDefault();
    e.stopPropagation();

    const type = state.interactionMode === 'wall-h' ? 'h' : 'v';
    toggleCustomSketchWall(x, y, type, 'orange');
}
