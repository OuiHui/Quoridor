import { state } from './state.js';
import { validateWallPlacement, getValidPawnMoves } from './engine.js';
import { executePawnMove, executeWallPlacement, stepHistory } from './game.js';
import { playbookNextStep, playbookPrevStep } from './playbook.js';
import { playSound } from './sfx.js';
import { logAction } from './ui-diagnostics.js';

function setKeyboardSelectedCell(x, y) {
    state.keyboardSelectedCell = { x, y };
    document.querySelectorAll('.board-cell.keyboard-highlight').forEach(cell => {
        cell.classList.remove('keyboard-highlight');
    });
    const targetCell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (targetCell) {
        targetCell.classList.add('keyboard-highlight');
    }
}

function navigatePawnMoveSelection(key) {
    const active = state.turn === 1 ? state.p1Pos : state.p2Pos;
    const passive = state.turn === 1 ? state.p2Pos : state.p1Pos;
    const moves = getValidPawnMoves(active.x, active.y, passive.x, passive.y, state.hWalls, state.vWalls);
    if (moves.length === 0) return;

    let filtered = [];
    if (key === 'w') {
        filtered = moves.filter(mv => mv.y > active.y);
        filtered.sort((a, b) => Math.abs(a.x - active.x) - Math.abs(b.x - active.x));
    } else if (key === 's') {
        filtered = moves.filter(mv => mv.y < active.y);
        filtered.sort((a, b) => Math.abs(a.x - active.x) - Math.abs(b.x - active.x));
    } else if (key === 'a') {
        filtered = moves.filter(mv => mv.x < active.x);
        filtered.sort((a, b) => Math.abs(a.y - active.y) - Math.abs(b.y - active.y));
    } else if (key === 'd') {
        filtered = moves.filter(mv => mv.x > active.x);
        filtered.sort((a, b) => Math.abs(a.y - active.y) - Math.abs(b.y - active.y));
    }

    if (filtered.length > 0) {
        setKeyboardSelectedCell(filtered[0].x, filtered[0].y);
    }
}

export function showKeyboardBarrierPreview() {
    if (!state.keyboardJoint) return;
    const { x, y } = state.keyboardJoint;
    const type = state.interactionMode === 'wall-h' ? 'h' : 'v';
    const wallsLeft = state.turn === 1 ? state.p1Walls : state.p2Walls;
    if (wallsLeft <= 0) return;

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

function navigateBarrierSelection(key) {
    if (!state.keyboardJoint) {
        state.keyboardJoint = { x: 3, y: 3 };
    }
    let { x, y } = state.keyboardJoint;
    if (key === 'w') y = Math.min(7, y + 1);
    else if (key === 's') y = Math.max(0, y - 1);
    else if (key === 'a') x = Math.max(0, x - 1);
    else if (key === 'd') x = Math.min(7, x + 1);

    state.keyboardJoint = { x, y };
    showKeyboardBarrierPreview();
}

function executeKeyboardSelectedAction() {
    if (state.interactionMode === 'move') {
        if (state.keyboardSelectedCell) {
            const { x, y } = state.keyboardSelectedCell;
            const cell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
            if (cell && cell.classList.contains('valid-move')) {
                executePawnMove(x, y);
                state.keyboardSelectedCell = null;
            }
        }
    } else {
        if (state.keyboardJoint) {
            const { x, y } = state.keyboardJoint;
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
    }
}

export function initKeyboardControls({ toggleHintMode, setInteractionMode }) {
    const handleKeyDown = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        if (state.trainingWatchActive) return;

        const isAITurn = state.gameMode === 'ai' &&
            ((state.turn === 1 && state.aiSettings.color === 'p1') ||
                (state.turn === 2 && state.aiSettings.color === 'p2'));
        if (isAITurn) return;

        if (state.activePlaybook) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                playbookNextStep();
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                playbookPrevStep();
                e.preventDefault();
                return;
            }
        }

        const key = e.key.toLowerCase();

        if (key === 'h') {
            toggleHintMode();
            e.preventDefault();
            return;
        }
        if (key === 'f') {
            setInteractionMode('move');
            e.preventDefault();
            return;
        }
        if (key === 'q') {
            setInteractionMode(state.interactionMode === 'wall-h' ? 'move' : 'wall-h');
            if (state.interactionMode === 'wall-h') {
                showKeyboardBarrierPreview();
            }
            e.preventDefault();
            return;
        }
        if (key === 'e') {
            setInteractionMode(state.interactionMode === 'wall-v' ? 'move' : 'wall-v');
            if (state.interactionMode === 'wall-v') {
                showKeyboardBarrierPreview();
            }
            e.preventDefault();
            return;
        }

        if (['w', 'a', 's', 'd'].includes(key)) {
            if (state.interactionMode === 'move') {
                navigatePawnMoveSelection(key);
            } else {
                navigateBarrierSelection(key);
            }
            e.preventDefault();
        }

        if (e.key === '[') {
            stepHistory(-1);
            e.preventDefault();
            return;
        }
        if (e.key === ']') {
            stepHistory(1);
            e.preventDefault();
            return;
        }

        if (e.key === 'Enter') {
            executeKeyboardSelectedAction();
            e.preventDefault();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
}
