// Coordinate helpers
export const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

// Convert coordinates to notation
export function getPawnNotation(x, y) {
    return COLS[x] + (y + 1);
}

export function getWallNotation(x, y, type) {
    return COLS[x] + (y + 1) + type;
}

// Convert move object to notation
export function formatMoveNotation(move) {
    if (!move) return '';
    if (move.type === 'move') {
        return getPawnNotation(move.to.x, move.to.y);
    } else if (move.type === 'wall') {
        return getWallNotation(move.x, move.y, move.wallType);
    }
    return '';
}

// Convert notation back to coordinates
export function parseNotation(notation) {
    if (!notation || notation.length < 2) return null;
    const colChar = notation[0].toLowerCase();
    const x = COLS.indexOf(colChar);
    const y = parseInt(notation[1]) - 1;
    
    if (notation.length === 3) {
        const type = notation[2].toLowerCase();
        return { type: 'wall', x, y, wallType: type };
    }
    return { type: 'pawn', x, y };
}

