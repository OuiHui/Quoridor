import { state } from './state.js';
import { playSound } from './sfx.js';
import { parseNotation } from './notation.js';
import { PLAYBOOK_DATA } from './playbook-data.js';

let boardActions = null; // Dependency injected board actions from app.js

export function initPlaybook(actions) {
    boardActions = actions;
    
    const selector = document.getElementById('playbook-select');
    if (selector) {
        selector.addEventListener('change', (e) => {
            loadPlaybook(e.target.value);
        });
    }
    
    const prevBtn = document.getElementById('pb-prev');
    if (prevBtn) prevBtn.addEventListener('click', playbookPrevStep);
    
    const nextBtn = document.getElementById('pb-next');
    if (nextBtn) nextBtn.addEventListener('click', playbookNextStep);
    
    const resetBtn = document.getElementById('pb-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetPlaybook);
    
    const autoplayBtn = document.getElementById('pb-autoplay');
    if (autoplayBtn) autoplayBtn.addEventListener('click', togglePlaybookAutoplay);
    
    const practiceBtn = document.getElementById('pb-practice');
    if (practiceBtn) practiceBtn.addEventListener('click', togglePlaybookPractice);

    const deactivateBtn = document.getElementById('pb-deactivate');
    if (deactivateBtn) deactivateBtn.addEventListener('click', exitPlaybookMode);

    const toggleCollapseBtn = document.getElementById('pb-toggle-collapse');
    const leftPanel = document.querySelector('.left-panel');
    const collapsedTitle = document.getElementById('pb-collapsed-title');
    
    const toggleCollapse = () => {
        if (leftPanel) {
            leftPanel.classList.toggle('collapsed');
        }
    };
    
    if (toggleCollapseBtn) toggleCollapseBtn.addEventListener('click', toggleCollapse);
    if (collapsedTitle) collapsedTitle.addEventListener('click', toggleCollapse);
}

export function loadPlaybook(key) {
    // Clear autoplay
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        const autoplayBtn = document.getElementById('pb-autoplay');
        if (autoplayBtn) autoplayBtn.textContent = "Auto Play";
    }
    
    if (key === 'none') {
        state.activePlaybook = null;
        document.getElementById('playbook-info').classList.add('hidden');
        document.getElementById('playbook-empty').classList.remove('hidden');
        const boardEl = document.getElementById('board');
        if (boardEl) boardEl.classList.remove('playbook-locked');
        if (boardActions && boardActions.clearLogs) {
            boardActions.clearLogs();
        }

        const headerTitle = document.getElementById('logs-header-title');
        if (headerTitle) headerTitle.textContent = "Match History";
        const gameLogs = document.getElementById('game-logs');
        if (gameLogs) gameLogs.classList.remove('hidden');
        const pbMovesList = document.getElementById('playbook-moves-list');
        if (pbMovesList) pbMovesList.classList.add('hidden');
        return;
    }
    
    state.activePlaybook = PLAYBOOK_DATA[key];
    state.playbookStep = 0;
    state.playbookPracticeMode = false;

    const headerTitle = document.getElementById('logs-header-title');
    if (headerTitle) headerTitle.textContent = "Playbook Sequence";
    const gameLogs = document.getElementById('game-logs');
    if (gameLogs) gameLogs.classList.add('hidden');
    const pbMovesList = document.getElementById('playbook-moves-list');
    if (pbMovesList) pbMovesList.classList.remove('hidden');
    
    // UI details
    document.getElementById('playbook-empty').classList.add('hidden');
    document.getElementById('playbook-info').classList.remove('hidden');
    const titleEl = document.getElementById('playbook-title');
    titleEl.textContent = state.activePlaybook.title;
    if (state.activePlaybook.side === 'p2') {
        titleEl.style.color = 'var(--color-p2)';
    } else {
        titleEl.style.color = 'var(--color-p1)';
    }
    document.getElementById('playbook-description').textContent = state.activePlaybook.description;
    
    // Render list of moves
    const listEl = document.getElementById('playbook-moves-list');
    listEl.innerHTML = '';
    
    state.activePlaybook.moves.forEach((mv, index) => {
        const item = document.createElement('div');
        const playerNum = index % 2 === 0 ? 1 : 2;
        item.className = `pb-move-item pb-move-p${playerNum}`;
        item.dataset.index = index;
        item.innerHTML = `
            <span>${index + 1}. Player ${playerNum} (${mv.notation})</span>
            <span style="font-size:0.7rem; color:var(--color-text-muted)">Info</span>
        `;
        item.addEventListener('click', () => jumpToPlaybookStep(index + 1));
        listEl.appendChild(item);
    });
    
    // Set board to sandbox mode when playbook is loaded
    if (boardActions) {
        boardActions.setGameMode('sandbox');
        // Reset board to initial positions
        boardActions.resetBoardState();
        if (boardActions.clearLogs) {
            boardActions.clearLogs();
        }
    }
    
    updatePlaybookUI();
}

export function updatePlaybookUI() {
    const pb = state.activePlaybook;
    if (!pb) {
        const boardEl = document.getElementById('board');
        if (boardEl) boardEl.classList.remove('playbook-locked');
        return;
    }
    
    const boardEl = document.getElementById('board');
    if (boardEl) {
        if (state.playbookPracticeMode) {
            boardEl.classList.remove('playbook-locked');
        } else {
            boardEl.classList.add('playbook-locked');
        }
    }
    
    const step = state.playbookStep;
    document.getElementById('pb-step-counter').textContent = `Step ${step} / ${pb.moves.length}`;
    
    // Highlight active step in sequence
    document.querySelectorAll('.pb-move-item').forEach(el => {
        const idx = parseInt(el.dataset.index);
        el.classList.remove('active', 'active-p1', 'active-p2');
        if (idx === step - 1) {
            const playerNum = idx % 2 === 0 ? 1 : 2;
            el.classList.add('active', `active-p${playerNum}`);
            // Scroll to it
            el.scrollIntoView({ block: 'nearest' });
        }
    });
    
    // Update step message description
    const statusMsg = document.getElementById('pb-practice-status');
    if (state.playbookPracticeMode) {
        if (step === pb.moves.length) {
            statusMsg.textContent = "🏆 Playbook successfully completed! You nailed it!";
            statusMsg.className = "playbook-status-msg success";
        } else {
            const nextMove = pb.moves[step];
            const playerNum = step % 2 === 0 ? 1 : 2;
            statusMsg.textContent = `Practice: Player ${playerNum}'s turn. Play move: ${nextMove.notation.toUpperCase()}`;
            statusMsg.className = "playbook-status-msg";
            highlightPlaybookHint(nextMove.notation);
        }
    } else {
        if (step === 0) {
            statusMsg.textContent = "Click 'Next' or 'Auto Play' to step through the sequence.";
        } else {
            statusMsg.textContent = pb.moves[step - 1].desc;
        }
        statusMsg.className = "playbook-status-msg";
    }
}

// Highlight the cell or joint representing the next playbook move to guide the player
export function highlightPlaybookHint(notation) {
    // Clear old valid moves first
    document.querySelectorAll('.board-cell').forEach(cell => {
        cell.classList.remove('valid-move');
    });
    
    const parsed = parseNotation(notation);
    if (!parsed) return;
    
    if (parsed.type === 'pawn') {
        const cell = document.querySelector(`.board-cell[data-x="${parsed.x}"][data-y="${parsed.y}"]`);
        if (cell) cell.classList.add('valid-move');
    }
}

export function playbookNextStep() {
    const pb = state.activePlaybook;
    if (!pb || state.playbookStep >= pb.moves.length) return;
    
    // Apply step
    const nextMove = pb.moves[state.playbookStep];
    const parsed = parseNotation(nextMove.notation);
    
    // Apply to board state (implicitly skipping validation bypass for the sake of playbook demonstration)
    if (parsed.type === 'pawn') {
        const player = state.turn;
        
        // Push onto history stack
        state.history.push({
            type: 'move',
            player,
            from: player === 1 ? { ...state.p1Pos } : { ...state.p2Pos },
            to: { x: parsed.x, y: parsed.y }
        });
        
        if (player === 1) state.p1Pos = { x: parsed.x, y: parsed.y };
        else state.p2Pos = { x: parsed.x, y: parsed.y };
        
        if (boardActions) {
            boardActions.logAction(`Playbook Step ${state.playbookStep + 1} (P${player}): Pawn to ${nextMove.notation}`, `p${player}`);
        }
        playSound('move');
        state.turn = state.turn === 1 ? 2 : 1;
        if (boardActions) {
            boardActions.updatePawnPositions();
        }
    } else {
        const player = state.turn;
        const wallKey = `${parsed.x},${parsed.y}`;
        
        state.history.push({
            type: 'wall',
            player,
            x: parsed.x,
            y: parsed.y,
            wallType: parsed.wallType
        });
        
        if (parsed.wallType === 'h') state.hWalls.set(wallKey, player);
        else state.vWalls.set(wallKey, player);
        
        if (player === 1) state.p1Walls--;
        else state.p2Walls--;
        
        if (boardActions) {
            boardActions.logAction(`Playbook Step ${state.playbookStep + 1} (P${player}): Wall at ${nextMove.notation}`, `p${player}`);
        }
        playSound('wall');
        state.turn = state.turn === 1 ? 2 : 1;
        if (boardActions) {
            boardActions.renderPlacedWalls();
        }
    }
    
    state.playbookStep++;
    if (boardActions) {
        boardActions.updateUI();
    }
    updatePlaybookUI();
}

export function playbookPrevStep() {
    const pb = state.activePlaybook;
    if (!pb || state.playbookStep <= 0) return;
    
    // Perform an undo
    if (boardActions) {
        boardActions.undoMove();
    }
    state.playbookStep--;
    
    updatePlaybookUI();
}

export function jumpToPlaybookStep(targetStep) {
    if (!state.activePlaybook) return;
    
    // Stop autoplay
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        const autoplayBtn = document.getElementById('pb-autoplay');
        if (autoplayBtn) autoplayBtn.textContent = "Auto Play";
    }
    
    // If we need to go backward or reset
    if (targetStep < state.playbookStep) {
        while (state.playbookStep > targetStep) {
            playbookPrevStep();
        }
    } else {
        // Go forward
        while (state.playbookStep < targetStep) {
            playbookNextStep();
        }
    }
}

export function resetPlaybook() {
    jumpToPlaybookStep(0);
}

export function togglePlaybookAutoplay() {
    const btn = document.getElementById('pb-autoplay');
    
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        btn.textContent = "Auto Play";
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    } else {
        state.playbookPracticeMode = false;
        const practiceBtn = document.getElementById('pb-practice');
        if (practiceBtn) {
            practiceBtn.classList.remove('btn-accent');
            practiceBtn.classList.add('btn-secondary');
            practiceBtn.textContent = "Practice Mode";
        }
        
        btn.textContent = "Pause";
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        
        // Auto play sequence step by step
        state.playbookAutoplayTimer = setInterval(() => {
            if (state.playbookStep < state.activePlaybook.moves.length) {
                playbookNextStep();
            } else {
                clearInterval(state.playbookAutoplayTimer);
                state.playbookAutoplayTimer = null;
                btn.textContent = "Auto Play";
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            }
        }, 1200);
    }
    updatePlaybookUI();
}

export function togglePlaybookPractice() {
    state.playbookPracticeMode = !state.playbookPracticeMode;
    const btn = document.getElementById('pb-practice');
    
    // Clear autoplay
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        const autoplayBtn = document.getElementById('pb-autoplay');
        if (autoplayBtn) autoplayBtn.textContent = "Auto Play";
    }
    
    if (state.playbookPracticeMode) {
        btn.textContent = "Exit Practice";
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-accent');
        
        // Reset board to beginning of playbook to practice from step 0
        if (boardActions) {
            boardActions.resetBoardState();
            if (boardActions.clearLogs) {
                boardActions.clearLogs();
            }
        }
        state.playbookStep = 0;
    } else {
        btn.textContent = "Practice Mode";
        btn.classList.remove('btn-accent');
        btn.classList.add('btn-secondary');
    }
    
    if (boardActions) {
        boardActions.updateUI();
    }
    updatePlaybookUI();
}

// Verifies if the move made by user matches the next move required in the playbook practice
export function verifyPlaybookPracticeMove() {
    const pb = state.activePlaybook;
    if (!pb || !state.playbookPracticeMode || state.playbookStep >= pb.moves.length) return;
    
    const targetMove = pb.moves[state.playbookStep];
    const lastPlayed = state.history[state.history.length - 1];
    
    let correct = false;
    const parsedTarget = parseNotation(targetMove.notation);
    
    if (parsedTarget.type === 'pawn' && lastPlayed.type === 'move') {
        correct = lastPlayed.to.x === parsedTarget.x && lastPlayed.to.y === parsedTarget.y;
    } else if (parsedTarget.type === 'wall' && lastPlayed.type === 'wall') {
        correct = lastPlayed.x === parsedTarget.x && 
                  lastPlayed.y === parsedTarget.y && 
                  lastPlayed.wallType === parsedTarget.wallType;
    }
    
    const statusMsg = document.getElementById('pb-practice-status');
    if (correct) {
        state.playbookStep++;
        statusMsg.textContent = `Correct move! ${targetMove.desc}`;
        statusMsg.className = "playbook-status-msg success";
        playSound('win');
        
        // If it's a playbook autoplay sequence, trigger next move if it's the AI's turn
        setTimeout(() => {
            updatePlaybookUI();
        }, 1000);
    } else {
        // Incorrect: Undo the player's move immediately to enforce practice path
        statusMsg.textContent = `Incorrect move. Try again! Expected: ${targetMove.notation.toUpperCase()}`;
        statusMsg.className = "playbook-status-msg error";
        playSound('error');
        
        setTimeout(() => {
            if (boardActions) {
                boardActions.undoMove();
            }
            updatePlaybookUI();
        }, 800);
    }
}

export function exitPlaybookMode() {
    state.activePlaybook = null;
    state.playbookStep = 0;
    state.playbookPracticeMode = false;
    
    const select = document.getElementById('playbook-select');
    if (select) select.value = 'none';
    
    document.getElementById('playbook-info').classList.add('hidden');
    document.getElementById('playbook-empty').classList.remove('hidden');
    
    const boardEl = document.getElementById('board');
    if (boardEl) boardEl.classList.remove('playbook-locked');
    
    // Stop autoplay
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        const autoplayBtn = document.getElementById('pb-autoplay');
        if (autoplayBtn) autoplayBtn.textContent = "Auto Play";
    }

    // Restore Match History UI
    const headerTitle = document.getElementById('logs-header-title');
    if (headerTitle) headerTitle.textContent = "Match History";
    const gameLogs = document.getElementById('game-logs');
    if (gameLogs) gameLogs.classList.remove('hidden');
    const pbMovesList = document.getElementById('playbook-moves-list');
    if (pbMovesList) pbMovesList.classList.add('hidden');
}
