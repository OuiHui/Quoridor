import { state } from './state.js';
import { playSound } from './sfx.js';
import { getPawnNotation, getWallNotation } from './notation.js';
import { getValidPawnMoves, findShortestPath, validateWallPlacement } from './engine.js';
import { makeAIMove, evaluateBoard, generateSmartMoves, minimax } from './ai.js';
import { verifyPlaybookPracticeMove, exitPlaybookMode, updatePlaybookUI } from './playbook.js';
import { updatePawnPositions, renderPlacedWalls } from './ui-board.js';
import { updateUI, logAction, analyzePlacedWallEfficiency, hideWallAnalyzer, clearLogs, getBoardStateKey } from './ui-diagnostics.js';
import { clearHints } from './ui-hints.js';

function updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl) {
    let loss = 0;
    if (player === 1) {
        if (bestScore === Infinity) {
            loss = chosenScore === Infinity ? 0 : Infinity;
        } else {
            loss = bestScore - chosenScore;
        }
    } else {
        if (bestScore === -Infinity) {
            loss = chosenScore === -Infinity ? 0 : Infinity;
        } else {
            loss = chosenScore - bestScore;
        }
    }

    let classification = 'optimal';
    let text = 'Optimal';
    
    if (loss === 0) {
        classification = 'optimal';
        text = 'Optimal';
    } else if (loss <= 4) {
        classification = 'good';
        text = 'Good Move';
    } else if (loss <= 15) {
        classification = 'inaccuracy';
        text = 'Inaccuracy';
    } else {
        classification = 'blunder';
        text = 'Blunder';
    }

    state.lastMoveQuality = {
        classification,
        text,
        player,
        score: chosenScore
    };

    if (badgeEl && badgeTextEl) {
        badgeEl.className = `eval-move-badge ${classification}`;
        badgeTextEl.textContent = text;
        badgeEl.classList.remove('hidden');
    }
}

// Analyse move quality compared to the optimal move
export function analyzeMoveQuality(chosenMove, player) {
    const key = getBoardStateKey(state);
    
    const badgeEl = document.getElementById('eval-move-badge');
    const badgeTextEl = document.getElementById('eval-move-badge-text');

    // 1. Check if cache has already completed for this state key
    if (state.precomputedEvaluations && state.precomputedEvaluations.key === key) {
        const moveKey = chosenMove.type === 'move' ? `move:${chosenMove.to.x},${chosenMove.to.y}` : `wall:${chosenMove.x},${chosenMove.y},${chosenMove.wallType}`;
        const chosenScore = state.precomputedEvaluations.scores.get(moveKey);
        
        let bestScore = state.precomputedEvaluations.bestScore;
        if (bestScore === null) {
            bestScore = state.precomputedEvaluations.currentEval;
        }

        if (chosenScore !== undefined && bestScore !== null) {
            updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl);
            return; // Cache hit: exit instantly!
        }
    }

    // 2. Fallback: calculate ONLY the chosen move score and best score (if missing) deferred
    const depth = 5;
    const p1PosSnapshot = { ...state.p1Pos };
    const p2PosSnapshot = { ...state.p2Pos };
    const p1WallsSnapshot = state.p1Walls;
    const p2WallsSnapshot = state.p2Walls;
    const isP1 = player === 1;

    // Snapshot of maps
    const hWallsSnapshot = new Map(state.hWalls);
    const vWallsSnapshot = new Map(state.vWalls);

    if (badgeEl && badgeTextEl) {
        badgeEl.className = 'eval-move-badge thinking';
        badgeTextEl.textContent = 'Analyzing...';
        badgeEl.classList.remove('hidden');
    }

    const historyLenSnapshot = state.history.length;

    setTimeout(() => {
        if (state.history.length !== historyLenSnapshot) return; // state changed, abort

        // Find bestScore (current state evaluation)
        let bestScore = null;
        if (state.precomputedEvaluations && state.precomputedEvaluations.key === key) {
            bestScore = state.precomputedEvaluations.bestScore !== null ? 
                state.precomputedEvaluations.bestScore : 
                state.precomputedEvaluations.currentEval;
        }

        if (bestScore === null) {
            // Compute current board evaluation (depth 5)
            const result = minimax(
                depth,
                -Infinity,
                Infinity,
                isP1,
                p1PosSnapshot,
                p2PosSnapshot,
                hWallsSnapshot,
                vWallsSnapshot,
                p1WallsSnapshot,
                p2WallsSnapshot
            );
            bestScore = result.score;
            if (bestScore === undefined || bestScore === null) {
                bestScore = evaluateBoard(p1PosSnapshot, p2PosSnapshot, hWallsSnapshot, vWallsSnapshot, p1WallsSnapshot, p2WallsSnapshot, isP1);
            }
        }

        // Convert maps to TypedArrays for the chosen move score calculation
        const hWallsArray = new Uint8Array(64);
        const vWallsArray = new Uint8Array(64);
        for (const k of hWallsSnapshot.keys()) {
            const [x, y] = k.split(',').map(Number);
            hWallsArray[y * 8 + x] = 1;
        }
        for (const k of vWallsSnapshot.keys()) {
            const [x, y] = k.split(',').map(Number);
            vWallsArray[y * 8 + x] = 1;
        }

        let nextP1Pos = { ...p1PosSnapshot };
        let nextP2Pos = { ...p2PosSnapshot };
        let nextP1Walls = p1WallsSnapshot;
        let nextP2Walls = p2WallsSnapshot;
        
        const idx = chosenMove.y * 8 + chosenMove.x;
        if (chosenMove.type === 'move') {
            if (isP1) nextP1Pos = chosenMove.to;
            else nextP2Pos = chosenMove.to;
        } else {
            if (chosenMove.wallType === 'h') hWallsArray[idx] = 1;
            else vWallsArray[idx] = 1;
            
            if (isP1) nextP1Walls--;
            else nextP2Walls--;
        }

        // Compute chosen move score (depth 4)
        const result = minimax(
            depth - 1,
            -Infinity,
            Infinity,
            !isP1,
            nextP1Pos,
            nextP2Pos,
            hWallsArray,
            vWallsArray,
            nextP1Walls,
            nextP2Walls
        );
        const chosenScore = result.score;

        updateMoveQualityUI(chosenScore, bestScore, player, badgeEl, badgeTextEl);
    }, 50);
}

// Process pawn movement
export function executePawnMove(x, y) {
    const player = state.turn;
    const oldPos = player === 1 ? { ...state.p1Pos } : { ...state.p2Pos };
    
    analyzeMoveQuality({ type: 'move', to: { x, y } }, player);
    
    state.previousPrecomputedEvaluations = state.precomputedEvaluations;
    state.precomputedEvaluations = null;
    
    state.history.push({
        type: 'move',
        player,
        from: oldPos,
        to: { x, y }
    });
    
    if (player === 1) state.p1Pos = { x, y };
    else state.p2Pos = { x, y };
    
    clearHints();
    hideWallAnalyzer();
    
    logAction(`Player ${player}: Pawn moved to ${getPawnNotation(x, y)}`, `p${player}`);
    playSound('move');
    
    state.turn = state.turn === 1 ? 2 : 1;
    
    updatePawnPositions();
    updateUI();
    handlePostTurn();
}

// Process wall placement
export function executeWallPlacement(x, y, wallType) {
    const player = state.turn;
    const wallKey = `${x},${y}`;
    
    analyzeMoveQuality({ type: 'wall', x, y, wallType }, player);
    
    state.previousPrecomputedEvaluations = state.precomputedEvaluations;
    state.precomputedEvaluations = null;
    
    state.history.push({
        type: 'wall',
        player,
        x,
        y,
        wallType
    });
    
    if (wallType === 'h') state.hWalls.set(wallKey, player);
    else state.vWalls.set(wallKey, player);
    
    if (player === 1) state.p1Walls--;
    else state.p2Walls--;
    
    clearHints();
    
    logAction(`Player ${player}: Placed wall at ${getWallNotation(x, y, wallType)}`, `p${player}`);
    playSound('wall');
    
    analyzePlacedWallEfficiency(x, y, wallType, player);
    
    state.turn = state.turn === 1 ? 2 : 1;
    
    renderPlacedWalls();
    updateUI();
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
    
    state.previousPrecomputedEvaluations = null;
    state.precomputedEvaluations = null;
    state.lastMoveQuality = null;
    clearHints();
    hideWallAnalyzer();
    
    const last = state.history.pop();
    
    if (last.type === 'move') {
        if (last.player === 1) state.p1Pos = last.from;
        else state.p2Pos = last.from;
    } else {
        const wallKey = `${last.x},${last.y}`;
        if (last.wallType === 'h') state.hWalls.delete(wallKey);
        else state.vWalls.delete(wallKey);
        
        if (last.player === 1) state.p1Walls++;
        else state.p2Walls++;
    }
    
    state.turn = last.player;
    
    logAction(`Undid last move: ${last.type === 'move' ? 'Pawn move' : 'Wall placement'}`, 'system');
    playSound('move');
    
    updatePawnPositions();
    renderPlacedWalls();
    updateUI();
    
    if (state.gameMode === 'ai' && state.history.length > 0) {
        const isAITurnNow = (state.turn === 1 && state.aiSettings.color === 'p1') || 
                            (state.turn === 2 && state.aiSettings.color === 'p2');
        if (isAITurnNow) {
            undoMove(); // Recursive undo
        }
    }
}

// Reset board representation state variables
export function resetBoardState() {
    state.p1Pos = { x: 4, y: 0 };
    state.p2Pos = { x: 4, y: 8 };
    state.p1Walls = 10;
    state.p2Walls = 10;
    state.hWalls.clear();
    state.vWalls.clear();
    state.turn = 1;
    state.history = [];
    state.lastMoveQuality = null;
    
    state.previousPrecomputedEvaluations = null;
    state.precomputedEvaluations = null;
    
    clearHints();
    hideWallAnalyzer();
    
    renderPlacedWalls();
    updatePawnPositions();
}

// Reset Game flow
export function resetGame() {
    clearLogs();
    resetBoardState();
    
    if (state.activePlaybook) {
        state.playbookStep = 0;
        updatePlaybookUI();
    }
    
    logAction("Game reset. Board initialized.", "system");
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
