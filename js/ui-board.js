import { state } from './state.js';

// Update pawn positions in DOM grid cells
export function updatePawnPositions() {
    const p1El = document.getElementById('pawn-p1');
    const p2El = document.getElementById('pawn-p2');
    
    const p1Cell = document.querySelector(`.board-cell[data-x="${state.p1Pos.x}"][data-y="${state.p1Pos.y}"]`);
    const p2Cell = document.querySelector(`.board-cell[data-x="${state.p2Pos.x}"][data-y="${state.p2Pos.y}"]`);
    
    if (p1Cell && p1El) p1Cell.appendChild(p1El);
    if (p2Cell && p2El) p2Cell.appendChild(p2El);
}

// Renders all placed walls
export function renderPlacedWalls() {
    // Clear old placed walls
    document.querySelectorAll('.placed-wall:not(.hint-wall)').forEach(el => el.remove());
    
    const boardEl = document.getElementById('board');
    
    // Draw horizontal walls
    state.hWalls.forEach((player, wallKey) => {
        const [x, y] = wallKey.split(',');
        const col = parseInt(x);
        const row = parseInt(y);
        const playerClass = player === 2 ? 'p2-wall' : 'p1-wall';
        
        const wall = document.createElement('div');
        wall.className = `placed-wall horizontal ${playerClass}`;
        wall.style.gridColumn = `${2 * col + 1} / span 3`;
        wall.style.gridRow = `${16 - 2 * row}`;
        boardEl.appendChild(wall);
    });
    
    // Draw vertical walls
    state.vWalls.forEach((player, wallKey) => {
        const [x, y] = wallKey.split(',');
        const col = parseInt(x);
        const row = parseInt(y);
        const playerClass = player === 2 ? 'p2-wall' : 'p1-wall';
        
        const wall = document.createElement('div');
        wall.className = `placed-wall vertical ${playerClass}`;
        wall.style.gridColumn = `${2 * col + 2}`;
        wall.style.gridRow = `${15 - 2 * row} / span 3`;
        boardEl.appendChild(wall);
    });
}

// Initial Board Generator
export function renderBoard({ onCellClick, onEdgeMouseMove, onEdgeMouseLeave, onEdgeClick }) {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    
    // 1. Create Grid Cells
    for (let y = 8; y >= 0; y--) {
        for (let x = 0; x < 9; x++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.style.gridColumn = `${2 * x + 1}`;
            cell.style.gridRow = `${17 - 2 * y}`;
            
            cell.addEventListener('click', () => onCellClick(x, y));
            
            boardEl.appendChild(cell);
        }
    }
    
    // 2. Create Wall Joint Intersections (64 total, no event listeners)
    for (let y = 7; y >= 0; y--) {
        for (let x = 0; x < 8; x++) {
            const joint = document.createElement('div');
            joint.className = 'board-joint';
            joint.dataset.x = x;
            joint.dataset.y = y;
            joint.style.gridColumn = `${2 * x + 2}`;
            joint.style.gridRow = `${16 - 2 * y}`;
            joint.style.pointerEvents = 'none'; // Ensure joints don't block clicks on edges
            
            boardEl.appendChild(joint);
        }
    }
    
    // 3. Create Wall Edges (144 total: 72 horizontal, 72 vertical)
    // Horizontal edges: Grid column 2x+1, grid row 16-2y
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 9; x++) {
            const edge = document.createElement('div');
            edge.className = 'board-edge horizontal';
            edge.dataset.x = x;
            edge.dataset.y = y;
            edge.style.gridColumn = `${2 * x + 1}`;
            edge.style.gridRow = `${16 - 2 * y}`;
            
            edge.addEventListener('mousemove', (e) => onEdgeMouseMove(e, x, y, 'h'));
            edge.addEventListener('mouseleave', (e) => onEdgeMouseLeave(e, x, y, 'h'));
            edge.addEventListener('click', (e) => onEdgeClick(e, x, y, 'h'));
            
            boardEl.appendChild(edge);
        }
    }

    // Vertical edges: Grid column 2x+2, grid row 17-2y
    for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 8; x++) {
            const edge = document.createElement('div');
            edge.className = 'board-edge vertical';
            edge.dataset.x = x;
            edge.dataset.y = y;
            edge.style.gridColumn = `${2 * x + 2}`;
            edge.style.gridRow = `${17 - 2 * y}`;
            
            edge.addEventListener('mousemove', (e) => onEdgeMouseMove(e, x, y, 'v'));
            edge.addEventListener('mouseleave', (e) => onEdgeMouseLeave(e, x, y, 'v'));
            edge.addEventListener('click', (e) => onEdgeClick(e, x, y, 'v'));
            
            boardEl.appendChild(edge);
        }
    }
    
    // 4. Create single Dynamic Wall Preview Overlay
    const previewWall = document.createElement('div');
    previewWall.className = 'preview-wall';
    previewWall.id = 'preview-wall';
    boardEl.appendChild(previewWall);
    
    // 5. Draw Pawns
    const p1Pawn = document.createElement('div');
    p1Pawn.className = 'pawn pawn-p1';
    p1Pawn.id = 'pawn-p1';
    boardEl.appendChild(p1Pawn);
    
    const p2Pawn = document.createElement('div');
    p2Pawn.className = 'pawn pawn-p2';
    p2Pawn.id = 'pawn-p2';
    boardEl.appendChild(p2Pawn);
    
    updatePawnPositions();
}
