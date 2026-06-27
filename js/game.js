import { state } from './state.js';
import { playSound } from './sfx.js';
import { getPawnNotation, getWallNotation } from './notation.js';
import { getValidPawnMoves, findShortestPath, validateWallPlacement } from './engine.js';
import { makeAIMove, evaluateBoard, generateSmartMoves, minimax } from './ai.js';
import { verifyPlaybookPracticeMove, exitPlaybookMode, updatePlaybookUI } from './playbook.js';
import { updatePawnPositions, renderPlacedWalls } from './ui-board.js';
import { updateUI, logAction, analyzePlacedWallEfficiency, hideWallAnalyzer, clearLogs } from './ui-diagnostics.js';
import { clearHints } from './ui-hints.js';

// Analyse move quality compared to the optimal move
export function analyzeMoveQuality(chosenMove, player) {
    // Fixed depth of 5 to match eval bar depth for consistent move quality badges
    const depth = 5;
    
    const candidates = generateSmartMoves(
        player,
        state.p1Pos,
        state.p2Pos,
        state.hWalls,
        state.vWalls,
        state.p1Walls,
        state.p2Walls
    );
    
    if (candidates.length === 0) return;
    
    const isP1 = player === 1;
    
    const getMoveScore = (move) => {
        let nextP1Pos = { ...state.p1Pos };
        let nextP2Pos = { ...state.p2Pos };
        let nextP1Walls = state.p1Walls;
        let nextP2Walls = state.p2Walls;
        
        const tempHWalls = new Map(state.hWalls);
        const tempVWalls = new Map(state.vWalls);
        
        if (move.type === 'move') {
            if (isP1) nextP1Pos = move.to;
            else nextP2Pos = move.to;
        } else {
            const key = `${move.x},${move.y}`;
            if (move.wallType === 'h') tempHWalls.set(key, player);
            else tempVWalls.set(key, player);
            
            if (isP1) nextP1Walls--;
            else nextP2Walls--;
        }
        
        // Use minimax to evaluate the resulting state accurately
        const result = minimax(
            depth - 1, 
            -Infinity, 
            Infinity, 
            !isP1, 
            nextP1Pos, 
            nextP2Pos, 
            tempHWalls, 
            tempVWalls, 
            nextP1Walls, 
            nextP2Walls
        );
        
        // If depth-1 is 0, minimax returns a static score, otherwise it searches
        return result.score;
    };
    
    let bestScore = isP1 ? -Infinity : Infinity;
    for (const cand of candidates) {
        const score = getMoveScore(cand);
        if (isP1) {
            if (score > bestScore) bestScore = score;
        } else {
            if (score < bestScore) bestScore = score;
        }
    }
    
    const chosenScore = getMoveScore(chosenMove);
    
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
}

// Process pawn movement
export function executePawnMove(x, y) {
    const player = state.turn;
    const oldPos = player === 1 ? { ...state.p1Pos } : { ...state.p2Pos };
    
    analyzeMoveQuality({ type: 'move', to: { x, y } }, player);
    
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
