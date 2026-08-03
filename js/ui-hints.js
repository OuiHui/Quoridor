import { state } from './state.js';

// Render the best move hints and opponent threats visually on the board
export function renderHints(bestMoves = [], threatMoves = []) {
    clearHints();
    
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    
    // 1. Render Opponent Threat Moves (Crimson Red styling)
    threatMoves.forEach(move => {
        if (!move) return;
        if (move.type === 'move') {
            const cell = document.querySelector(`.board-cell[data-x="${move.to.x}"][data-y="${move.to.y}"]`);
            if (cell) {
                cell.classList.add('threat-cell');
                cell.title = "Opponent Threat";
            }
        } else {
            const wall = document.createElement('div');
            const oppPlayer = state.turn === 1 ? 2 : 1;
            const playerClass = oppPlayer === 2 ? 'p2-wall' : 'p1-wall';
            if (move.wallType === 'h') {
                wall.className = `placed-wall horizontal hint-wall threat-wall ${playerClass}`;
                wall.style.gridColumn = `${2 * move.x + 1} / span 3`;
                wall.style.gridRow = `${16 - 2 * move.y}`;
                wall.dataset.type = 'h';
            } else {
                wall.className = `placed-wall vertical hint-wall threat-wall ${playerClass}`;
                wall.style.gridColumn = `${2 * move.x + 2}`;
                wall.style.gridRow = `${15 - 2 * move.y} / span 3`;
                wall.dataset.type = 'v';
            }
            wall.dataset.x = move.x;
            wall.dataset.y = move.y;
            wall.title = "Opponent Threat";
            boardEl.appendChild(wall);
        }
    });

    // 2. Render Best Moves for Current Player (Gold styling)
    bestMoves.forEach(move => {
        if (!move) return;
        if (move.type === 'move') {
            const cell = document.querySelector(`.board-cell[data-x="${move.to.x}"][data-y="${move.to.y}"]`);
            if (cell) {
                cell.classList.add('hint-cell');
                cell.title = "Recommended Best Move";
            }
        } else {
            const wall = document.createElement('div');
            const playerClass = state.turn === 2 ? 'p2-wall' : 'p1-wall';
            if (move.wallType === 'h') {
                wall.className = `placed-wall horizontal hint-wall ${playerClass}`;
                wall.style.gridColumn = `${2 * move.x + 1} / span 3`;
                wall.style.gridRow = `${16 - 2 * move.y}`;
                wall.dataset.type = 'h';
            } else {
                wall.className = `placed-wall vertical hint-wall ${playerClass}`;
                wall.style.gridColumn = `${2 * move.x + 2}`;
                wall.style.gridRow = `${15 - 2 * move.y} / span 3`;
                wall.dataset.type = 'v';
            }
            wall.dataset.x = move.x;
            wall.dataset.y = move.y;
            wall.title = "Recommended Best Move";
            boardEl.appendChild(wall);
        }
    });
}

// Clear all active best-move and threat hint overlays
export function clearHints() {
    document.querySelectorAll('.board-cell.hint-cell, .board-cell.threat-cell').forEach(el => {
        el.classList.remove('hint-cell', 'threat-cell');
        if (el.title === "Recommended Best Move" || el.title === "Opponent Threat") {
            el.removeAttribute('title');
        }
    });
    document.querySelectorAll('.placed-wall.hint-wall, .placed-wall.threat-wall').forEach(el => {
        el.remove();
    });
}
