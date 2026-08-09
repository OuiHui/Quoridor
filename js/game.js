import { state } from './state.js';
import { playSound } from './sfx.js';
import { getPawnNotation, getWallNotation, formatMoveNotation } from './notation.js';
import { makeAIMove, resetMCTSTree } from './ai.js';
import { resetWorkerMCTS } from './worker-manager.js';
import { verifyPlaybookPracticeMove, exitPlaybookMode, updatePlaybookUI } from './playbook.js';
import { updatePawnPositions, renderPlacedWalls } from './ui-board.js';
import { updateUI, logAction, analyzePlacedWallEfficiency, hideWallAnalyzer, clearLogs, renderMatchHistoryUI } from './ui-diagnostics.js';
import { clearHints } from './ui-hints.js';
import { clearCustomArrows } from './board-arrows.js';

import { getValidPawnMoves, findShortestPath } from './engine.js';
import { parseNotation } from './notation.js';
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

    let prevEval = 0;
    if (state.history.length > 0) {
        const last = state.history[state.history.length - 1];
        if (last && last.evalScore !== null && last.evalScore !== undefined) {
            prevEval = last.evalScore;
        }
    }

    let initialPawnEval = prevEval;
    if (state.previousPrecomputedEvaluations) {
        const moveKey = `move:${x},${y}`;
        const chosen = state.previousPrecomputedEvaluations.scores.get(moveKey);
        const best = state.previousPrecomputedEvaluations.bestScore !== null ? 
            state.previousPrecomputedEvaluations.bestScore : 
            state.previousPrecomputedEvaluations.currentEval;

        if (chosen !== undefined && best !== null) {
            const loss = player === 1 ? (best - chosen) : (chosen - best);
            initialPawnEval = loss <= 2 ? prevEval : chosen;
        }
    }

    const historyItem = {
        id: state.history.length + 1,
        type: 'move',
        player,
        from: oldPos,
        to: { x, y },
        notation,
        stateBefore,
        stateAfter,
        moveQuality: null,
        evalScore: initialPawnEval !== undefined ? initialPawnEval : null
    };

    state.history.push(historyItem);
    state.historyIndex = state.history.length;

    analyzeMoveQuality({ type: 'move', to: { x, y } }, player, historyItem, stateBefore);

    clearHints();
    clearCustomArrows();
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

    let prevWallEval = 0;
    if (state.history.length > 0) {
        const last = state.history[state.history.length - 1];
        if (last && last.evalScore !== null && last.evalScore !== undefined) {
            prevWallEval = last.evalScore;
        }
    }

    let initialWallEval = prevWallEval;
    if (state.previousPrecomputedEvaluations) {
        const moveKey = `wall:${x},${y},${wallType}`;
        const chosen = state.previousPrecomputedEvaluations.scores.get(moveKey);
        const best = state.previousPrecomputedEvaluations.bestScore !== null ? 
            state.previousPrecomputedEvaluations.bestScore : 
            state.previousPrecomputedEvaluations.currentEval;

        if (chosen !== undefined && best !== null) {
            const loss = player === 1 ? (best - chosen) : (chosen - best);
            initialWallEval = loss <= 2 ? prevWallEval : chosen;
        }
    }

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
        moveQuality: null,
        evalScore: initialWallEval !== undefined ? initialWallEval : null
    };

    state.history.push(historyItem);
    state.historyIndex = state.history.length;

    analyzeMoveQuality({ type: 'wall', x, y, wallType }, player, historyItem, stateBefore);

    clearHints();
    clearCustomArrows();

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
    resetWorkerMCTS();
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

function normalizeMoveData(item) {
    if (typeof item === 'string') {
        const parsed = parseNotation(item);
        if (!parsed) throw new Error(`Invalid move notation string: "${item}"`);
        if (parsed.type === 'pawn') {
            return { type: 'move', to: { x: parsed.x, y: parsed.y } };
        } else {
            return { type: 'wall', x: parsed.x, y: parsed.y, wallType: parsed.wallType };
        }
    }
    
    if (item && typeof item === 'object') {
        if (item.notation) {
            const parsed = parseNotation(item.notation);
            if (parsed) {
                if (parsed.type === 'pawn') {
                    return { type: 'move', to: { x: parsed.x, y: parsed.y } };
                } else {
                    return { type: 'wall', x: parsed.x, y: parsed.y, wallType: parsed.wallType };
                }
            }
        }
        
        if (item.type === 'move' || item.type === 'pawn') {
            const x = item.to ? item.to.x : item.x;
            const y = item.to ? item.to.y : item.y;
            if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
                throw new Error(`Invalid pawn move coordinates in object: ${JSON.stringify(item)}`);
            }
            return { type: 'move', to: { x: Number(x), y: Number(y) } };
        }
        
        if (item.type === 'wall') {
            const x = Number(item.x);
            const y = Number(item.y);
            const wallType = item.wallType || item.orientation;
            if (isNaN(x) || isNaN(y) || !wallType) {
                throw new Error(`Invalid wall placement parameters in object: ${JSON.stringify(item)}`);
            }
            return { type: 'wall', x, y, wallType: wallType.toLowerCase() };
        }
    }

    throw new Error(`Unrecognized move item format: ${JSON.stringify(item)}`);
}

export function importGameFromJSON(parsedData) {
    let movesList = [];
    if (Array.isArray(parsedData)) {
        movesList = parsedData;
    } else if (parsedData && Array.isArray(parsedData.history)) {
        movesList = parsedData.history;
    } else if (parsedData && Array.isArray(parsedData.moves)) {
        movesList = parsedData.moves;
    } else {
        throw new Error("Invalid JSON structure: Expected a game export object, or an array of moves in 'history' / 'moves'.");
    }

    if (movesList.length === 0) {
        throw new Error("No moves found in the provided JSON data.");
    }

    resetBoardState();

    for (let i = 0; i < movesList.length; i++) {
        const rawMove = movesList[i];
        const normalized = normalizeMoveData(rawMove);
        const player = state.turn;
        const stateBefore = captureStateSnapshot();

        state.previousPrecomputedEvaluations = state.precomputedEvaluations;
        state.precomputedEvaluations = null;

        if (normalized.type === 'move') {
            const { x, y } = normalized.to;
            const active = player === 1 ? state.p1Pos : state.p2Pos;
            const passive = player === 1 ? state.p2Pos : state.p1Pos;
            
            const validMoves = getValidPawnMoves(active.x, active.y, passive.x, passive.y, state.hWalls, state.vWalls);
            const isValid = validMoves.some(m => m.x === x && m.y === y);
            if (!isValid) {
                const pawnNot = getPawnNotation(x, y);
                throw new Error(`Move ${i + 1} (P${player}): Move to ${pawnNot} from (${active.x},${active.y}) is illegal.`);
            }

            const oldPos = { ...active };
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
                moveQuality: null,
                evalScore: null
            };

            state.history.push(historyItem);
            state.historyIndex = state.history.length;
            analyzeMoveQuality({ type: 'move', to: { x, y } }, player, historyItem, stateBefore, { sync: true, depth: 4 });
        } else if (normalized.type === 'wall') {
            const { x, y, wallType } = normalized;
            const wallsLeft = player === 1 ? state.p1Walls : state.p2Walls;
            if (wallsLeft <= 0) {
                throw new Error(`Move ${i + 1} (P${player}): P${player} has no remaining walls.`);
            }

            const key = `${x},${y}`;
            if (wallType === 'h') {
                if (state.hWalls.has(key) || state.vWalls.has(key)) {
                    throw new Error(`Move ${i + 1} (P${player}): Wall collision at ${getWallNotation(x, y, wallType)}.`);
                }
                if (state.hWalls.has(`${x - 1},${y}`) || state.hWalls.has(`${x + 1},${y}`)) {
                    throw new Error(`Move ${i + 1} (P${player}): Overlaps horizontal wall at ${getWallNotation(x, y, wallType)}.`);
                }
                state.hWalls.set(key, player);
            } else {
                if (state.hWalls.has(key) || state.vWalls.has(key)) {
                    throw new Error(`Move ${i + 1} (P${player}): Wall collision at ${getWallNotation(x, y, wallType)}.`);
                }
                if (state.vWalls.has(`${x},${y - 1}`) || state.vWalls.has(`${x},${y + 1}`)) {
                    throw new Error(`Move ${i + 1} (P${player}): Overlaps vertical wall at ${getWallNotation(x, y, wallType)}.`);
                }
                state.vWalls.set(key, player);
            }

            const p1Path = findShortestPath(state.p1Pos.x, state.p1Pos.y, 8, state.hWalls, state.vWalls);
            const p2Path = findShortestPath(state.p2Pos.x, state.p2Pos.y, 0, state.hWalls, state.vWalls);

            if (!p1Path || !p2Path) {
                if (wallType === 'h') state.hWalls.delete(key);
                else state.vWalls.delete(key);
                throw new Error(`Move ${i + 1} (P${player}): Wall at ${getWallNotation(x, y, wallType)} blocks a player's goal.`);
            }

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
                moveQuality: null,
                evalScore: null
            };

            state.history.push(historyItem);
            state.historyIndex = state.history.length;
            analyzeMoveQuality({ type: 'wall', x, y, wallType }, player, historyItem, stateBefore, { sync: true, depth: 4 });
        }

        state.turn = state.turn === 1 ? 2 : 1;
    }

    renderPlacedWalls();
    updatePawnPositions();
    updateUI();
    renderMatchHistoryUI();
    logAction(`Game successfully imported (${state.history.length} moves loaded for analysis).`, 'system');
}
