import { state } from './state.js';

// Render the best move hints visually on the board
export function renderHints(bestMoves) {
    clearHints();
    
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    
    bestMoves.forEach(move => {
        if (move.type === 'move') {
            const cell = document.querySelector(`.board-cell[data-x="${move.to.x}"][data-y="${move.to.y}"]`);
            if (cell) {
                cell.classList.add('hint-cell');
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
            boardEl.appendChild(wall);
        }
    });
}

// Clear all active best-move hint overlays
export function clearHints() {
    document.querySelectorAll('.board-cell.hint-cell').forEach(el => {
        el.classList.remove('hint-cell');
    });
    document.querySelectorAll('.placed-wall.hint-wall').forEach(el => {
        el.remove();
    });
}
