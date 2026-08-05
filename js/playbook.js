import { state } from './state.js';
import { playSound } from './sfx.js';
import { parseNotation, formatMoveNotation } from './notation.js';
import { PLAYBOOK_DATA } from './playbook-data.js';
import { captureStateSnapshot } from './move-analysis.js';
import { setPresetGoalArrows, setStepArrow, setPresetStepArrows, setPresetStepSketchWalls } from './board-arrows.js';


let boardActions = null; // Dependency injected board actions from app.js

export function showPlaybookView() {
    const settingsView = document.getElementById('left-panel-settings');
    const playbookView = document.getElementById('left-panel-playbook');
    const titleEl = document.getElementById('left-panel-header-title');
    if (settingsView) settingsView.classList.add('hidden');
    if (playbookView) playbookView.classList.remove('hidden');
    if (titleEl) titleEl.textContent = "Opening Playbook";
}

export function showSettingsView() {
    const settingsView = document.getElementById('left-panel-settings');
    const playbookView = document.getElementById('left-panel-playbook');
    const titleEl = document.getElementById('left-panel-header-title');
    if (playbookView) playbookView.classList.add('hidden');
    if (settingsView) settingsView.classList.remove('hidden');
    if (titleEl) titleEl.textContent = "Game Settings";
}

export function populatePlaybookSelector() {
    const selector = document.getElementById('playbook-select');
    if (!selector) return;

    const currentVal = selector.value;
    selector.innerHTML = '<option value="none">-- Select an Opening --</option>';

    for (const [key, data] of Object.entries(PLAYBOOK_DATA)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = data.title;
        selector.appendChild(opt);
    }

    if (currentVal && PLAYBOOK_DATA[currentVal]) {
        selector.value = currentVal;
    }
}

export function initPlaybook(actions) {
    boardActions = actions;
    populatePlaybookSelector();
    
    const openPlaybookBtn = document.getElementById('btn-open-playbook');
    if (openPlaybookBtn) {
        openPlaybookBtn.addEventListener('click', () => {
            showPlaybookView();
        });
    }

    const backToSettingsBtn = document.getElementById('pb-back-to-settings');
    if (backToSettingsBtn) {
        backToSettingsBtn.addEventListener('click', () => {
            exitPlaybookMode();
        });
    }

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

function preloadPlaybookHistory(moves) {
    state.history = [];
    state.historyIndex = 0;

    let p1 = { x: 4, y: 0 };
    let p2 = { x: 4, y: 8 };
    let p1w = 10;
    let p2w = 10;
    let hw = new Map();
    let vw = new Map();
    let trn = 1;

    moves.forEach((mv, idx) => {
        const parsed = parseNotation(mv.notation);
        if (!parsed) return;

        const player = trn;
        const stateBefore = {
            p1Pos: { ...p1 },
            p2Pos: { ...p2 },
            p1Walls: p1w,
            p2Walls: p2w,
            hWalls: new Map(hw),
            vWalls: new Map(vw),
            turn: trn
        };

        if (parsed.type === 'pawn') {
            const oldPos = player === 1 ? { ...p1 } : { ...p2 };
            if (player === 1) p1 = { x: parsed.x, y: parsed.y };
            else p2 = { x: parsed.x, y: parsed.y };

            const stateAfter = {
                p1Pos: { ...p1 },
                p2Pos: { ...p2 },
                p1Walls: p1w,
                p2Walls: p2w,
                hWalls: new Map(hw),
                vWalls: new Map(vw),
                turn: trn === 1 ? 2 : 1
            };
            const notation = formatMoveNotation({ type: 'move', to: { x: parsed.x, y: parsed.y } }) || mv.notation;

            state.history.push({
                id: idx + 1,
                type: 'move',
                player,
                from: oldPos,
                to: { x: parsed.x, y: parsed.y },
                notation,
                stateBefore,
                stateAfter,
                moveQuality: null
            });
        } else {
            const wallKey = `${parsed.x},${parsed.y}`;
            if (parsed.wallType === 'h') hw.set(wallKey, player);
            else vw.set(wallKey, player);

            if (player === 1) p1w--;
            else p2w--;

            const stateAfter = {
                p1Pos: { ...p1 },
                p2Pos: { ...p2 },
                p1Walls: p1w,
                p2Walls: p2w,
                hWalls: new Map(hw),
                vWalls: new Map(vw),
                turn: trn === 1 ? 2 : 1
            };
            const notation = formatMoveNotation({ type: 'wall', x: parsed.x, y: parsed.y, wallType: parsed.wallType }) || mv.notation;

            state.history.push({
                id: idx + 1,
                type: 'wall',
                player,
                x: parsed.x,
                y: parsed.y,
                wallType: parsed.wallType,
                notation,
                stateBefore,
                stateAfter,
                moveQuality: null
            });
        }
        trn = trn === 1 ? 2 : 1;
    });

    if (boardActions && boardActions.jumpToHistoryState) {
        boardActions.jumpToHistoryState(0);
    }
}

export function loadPlaybook(key) {
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        const autoplayBtn = document.getElementById('pb-autoplay');
        if (autoplayBtn) autoplayBtn.textContent = "Auto Play";
    }
    
    if (key === 'none') {
        state.activePlaybook = null;
        setPresetGoalArrows([]);
        setStepArrow(null);
        setPresetStepArrows([]);
        setPresetStepSketchWalls([]);
        document.getElementById('playbook-info').classList.add('hidden');
        document.getElementById('playbook-empty').classList.remove('hidden');
        const boardEl = document.getElementById('board');
        if (boardEl) boardEl.classList.remove('playbook-locked');
        if (boardActions && boardActions.resetBoardState) {
            boardActions.resetBoardState();
        }
        return;
    }
    
    showPlaybookView();
    state.activePlaybook = PLAYBOOK_DATA[key];
    state.playbookStep = 0;
    state.playbookPracticeMode = false;
    setPresetGoalArrows(state.activePlaybook ? state.activePlaybook.goalArrows : []);
    setStepArrow(null);
    setPresetStepArrows([]);
    setPresetStepSketchWalls([]);

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
    
    if (boardActions) {
        boardActions.setGameMode('sandbox');
    }

    preloadPlaybookHistory(state.activePlaybook.moves);
    updatePlaybookUI();
}

export function updatePlaybookUI() {
    const pb = state.activePlaybook;
    if (!pb) {
        const boardEl = document.getElementById('board');
        if (boardEl) boardEl.classList.remove('playbook-locked');
        setStepArrow(null);
        setPresetStepArrows([]);
        setPresetStepSketchWalls([]);
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
    
    // Update step move arrow, step tactical threat arrows, and step sketch walls for current move in playbook
    if (step > 0 && pb.moves[step - 1]) {
        // Hide overall goal arrows during step-by-step playback to prevent clutter
        setPresetGoalArrows([]);

        const currentMove = pb.moves[step - 1];
        const lastMove = state.history[step - 1];
        
        if (lastMove && lastMove.type === 'move') {
            setStepArrow({ from: lastMove.from, to: lastMove.to, color: 'orange' });
        } else {
            setStepArrow(null);
        }

        setPresetStepArrows(currentMove.arrows || []);
        setPresetStepSketchWalls(currentMove.sketchWalls || []);
    } else {
        // Step 0: Show overall goal overview arrows
        setPresetGoalArrows(pb.goalArrows || []);
        setStepArrow(null);
        setPresetStepArrows([]);
        setPresetStepSketchWalls([]);
    }

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
            statusMsg.textContent = "Click 'Next' or 'Auto Play' or use Match History to step through.";
        } else {
            statusMsg.textContent = pb.moves[step - 1] ? pb.moves[step - 1].desc : '';
        }
        statusMsg.className = "playbook-status-msg";
    }
}

export function highlightPlaybookHint(notation) {
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
    if (!state.activePlaybook) return;
    jumpToPlaybookStep(state.playbookStep + 1);
}

export function playbookPrevStep() {
    if (!state.activePlaybook) return;
    jumpToPlaybookStep(state.playbookStep - 1);
}

export function jumpToPlaybookStep(targetStep) {
    if (!state.activePlaybook) return;
    
    if (targetStep < 0) targetStep = 0;
    if (targetStep > state.activePlaybook.moves.length) targetStep = state.activePlaybook.moves.length;

    if (boardActions && boardActions.jumpToHistoryState) {
        boardActions.jumpToHistoryState(targetStep);
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
    setPresetGoalArrows([]);
    setStepArrow(null);
    setPresetStepArrows([]);
    setPresetStepSketchWalls([]);
    
    const select = document.getElementById('playbook-select');
    if (select) select.value = 'none';
    
    document.getElementById('playbook-info').classList.add('hidden');
    document.getElementById('playbook-empty').classList.remove('hidden');
    
    const boardEl = document.getElementById('board');
    if (boardEl) boardEl.classList.remove('playbook-locked');
    
    if (state.playbookAutoplayTimer) {
        clearInterval(state.playbookAutoplayTimer);
        state.playbookAutoplayTimer = null;
        const autoplayBtn = document.getElementById('pb-autoplay');
        if (autoplayBtn) autoplayBtn.textContent = "Auto Play";
    }

    showSettingsView();
}

