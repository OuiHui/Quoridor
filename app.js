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
import trainingWatchHtml from './components/training-watch.html?raw';
import trainingStatsPanelHtml from './components/training-stats-panel.html?raw';

// Import State and Engines
import { state } from './js/state.js';
import { playSound } from './js/sfx.js';
import { validateWallPlacement, getValidPawnMoves } from './js/engine.js';
import { getBestMoves } from './js/ai.js';
import { initPlaybook, playbookNextStep, playbookPrevStep } from './js/playbook.js';

// Import UI Views
import { renderBoard, updatePawnPositions, renderPlacedWalls } from './js/ui-board.js';
import { updateUI, logAction, clearLogs, setHistoryJumpCallback } from './js/ui-diagnostics.js';
import { renderHints, clearHints } from './js/ui-hints.js';
import { initTrainingWatch, showTrainingWatch, hideTrainingWatch } from './js/training-watch.js';

// Import Game State Controllers
import {
    executePawnMove,
    executeWallPlacement,
    undoMove,
    resetBoardState,
    resetGame,
    setGameMode,
    jumpToHistoryState,
    stepHistory
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
    if (state.trainingWatchActive) return;
    if (state.activePlaybook !== null && !state.playbookPracticeMode) return;
    if (state.interactionMode !== 'move') return;
    const cell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (!cell || !cell.classList.contains('valid-move')) return;
    executePawnMove(x, y);
}

function handleCellMouseEnter(x, y) {
    if (state.trainingWatchActive) return;
    if (state.interactionMode !== 'move') return;
    const cell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (cell && cell.classList.contains('valid-move')) {
        state.keyboardSelectedCell = { x, y };
        document.querySelectorAll('.board-cell.keyboard-highlight').forEach(c => c.classList.remove('keyboard-highlight'));
        cell.classList.add('keyboard-highlight');
    }
}

function handleEdgeMouseMove(e, x, y, edgeType) {
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

function handleEdgeMouseLeave(e, x, y, edgeType) {
    const preview = document.getElementById('preview-wall');
    if (preview) preview.classList.remove('visible');
}

function handleEdgeClick(e, x, y, edgeType) {
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

function handleJointMouseMove(e, x, y) {
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

function handleJointMouseLeave(e, x, y) {
    const preview = document.getElementById('preview-wall');
    if (preview) preview.classList.remove('visible');
}

function handleJointClick(e, x, y) {
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

    // Inject training watch overlay into body
    const twMount = document.createElement('div');
    twMount.innerHTML = trainingWatchHtml;
    document.body.appendChild(twMount.firstElementChild);
    initTrainingWatch(trainingStatsPanelHtml);

    // Add Watch Training button to header
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const watchBtn = document.createElement('button');
        watchBtn.id = 'btn-watch-training';
        watchBtn.className = 'btn-watch-training';
        watchBtn.innerHTML = '⬡ Watch Training';
        watchBtn.addEventListener('click', () => showTrainingWatch());
        headerRight.prepend(watchBtn);
    }

    // 2. Render Board View passing Mediator callbacks
    renderBoard({
        onCellClick: handleCellClick,
        onCellMouseEnter: handleCellMouseEnter,
        onEdgeMouseMove: handleEdgeMouseMove,
        onEdgeMouseLeave: handleEdgeMouseLeave,
        onEdgeClick: handleEdgeClick,
        onJointMouseMove: handleJointMouseMove,
        onJointMouseLeave: handleJointMouseLeave,
        onJointClick: handleJointClick
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
        logAction,
        clearLogs,
        jumpToHistoryState
    });


    // Wire up interaction mode buttons
    const setInteractionMode = (mode) => {
        if (state.trainingWatchActive) return;
        let isAITurn = state.gameMode === 'ai' &&
            ((state.turn === 1 && state.aiSettings.color === 'p1') ||
                (state.turn === 2 && state.aiSettings.color === 'p2'));
        if (isAITurn) return;

        state.interactionMode = mode;
        const preview = document.getElementById('preview-wall');
        if (preview) preview.classList.remove('visible');
        updateUI();
    };

    document.getElementById('btn-mode-move').addEventListener('click', () => setInteractionMode('move'));
    document.getElementById('btn-mode-wall-h').addEventListener('click', () => setInteractionMode('wall-h'));
    document.getElementById('btn-mode-wall-v').addEventListener('click', () => setInteractionMode('wall-v'));

    setHistoryJumpCallback(jumpToHistoryState);

    // 4. Quick Board & Match History control binds
    const btnHistFirst = document.getElementById('btn-history-first');
    const btnHistPrev = document.getElementById('btn-history-prev');
    const btnHistNext = document.getElementById('btn-history-next');
    const btnHistLatest = document.getElementById('btn-history-latest');

    if (btnHistFirst) btnHistFirst.addEventListener('click', () => jumpToHistoryState(0));
    if (btnHistPrev) btnHistPrev.addEventListener('click', () => stepHistory(-1));
    if (btnHistNext) btnHistNext.addEventListener('click', () => stepHistory(1));
    if (btnHistLatest) btnHistLatest.addEventListener('click', () => jumpToHistoryState(state.history.length));

    document.getElementById('btn-undo').addEventListener('click', () => {
        if (state.trainingWatchActive) return;
        undoMove();
    });
    document.getElementById('btn-reset-board').addEventListener('click', () => {
        if (state.trainingWatchActive) return;
        resetGame();
    });


    // Wire up auto-hint toggle trigger
    const hintBtn = document.getElementById('btn-hint');
    hintBtn.addEventListener('click', () => {
        if (state.trainingWatchActive) return;
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
        } else {
            hintBtn.textContent = 'Hint: Off';
            hintBtn.classList.remove('btn-accent');
            hintBtn.classList.add('btn-secondary');
            clearHints();
        }
    });


    // Hint Wall hover/click delegation
    const boardEl = document.getElementById('board');
    boardEl.addEventListener('mousemove', (e) => {
        if (state.trainingWatchActive) return;
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
        if (state.trainingWatchActive) return;
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

    // Keyboard Shortcuts and WASD navigation
    const setKeyboardSelectedCell = (x, y) => {
        state.keyboardSelectedCell = { x, y };
        document.querySelectorAll('.board-cell.keyboard-highlight').forEach(cell => {
            cell.classList.remove('keyboard-highlight');
        });
        const targetCell = document.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
        if (targetCell) {
            targetCell.classList.add('keyboard-highlight');
        }
    };

    const navigatePawnMoveSelection = (key) => {
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
    };

    const showKeyboardBarrierPreview = () => {
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
    };

    const navigateBarrierSelection = (key) => {
        if (!state.keyboardJoint) {
            state.keyboardJoint = { x: 3, y: 3 };
        }
        let { x, y } = state.keyboardJoint;
        if (key === 'w') {
            y = Math.min(7, y + 1);
        } else if (key === 's') {
            y = Math.max(0, y - 1);
        } else if (key === 'a') {
            x = Math.max(0, x - 1);
        } else if (key === 'd') {
            x = Math.min(7, x + 1);
        }
        state.keyboardJoint = { x, y };
        showKeyboardBarrierPreview();
    };

    const executeKeyboardSelectedAction = () => {
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
    };

    const handleKeyDown = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        if (state.trainingWatchActive) return;

        let isAITurn = state.gameMode === 'ai' &&
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

    setGameMode('sandbox');
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const timestamp = Date.now();
        const modelRes = await fetch(`./quoridor_model.onnx?t=${timestamp}`);
        if (!modelRes.ok) throw new Error(`HTTP error status: ${modelRes.status}`);
        const modelBuffer = await modelRes.arrayBuffer();

        if (window.ort) {
            window.quoridorONNXSession = await ort.InferenceSession.create(new Uint8Array(modelBuffer));
            console.log("AlphaZero ONNX model loaded successfully!");
        }
    } catch (e) {
        console.warn("AlphaZero ONNX model could not be loaded. AI will fall back to Minimax evaluation:", e);
    } finally {
        init();
    }
});
