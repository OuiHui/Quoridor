// Coordinate helpers
export const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

// Convert coordinates to notation
export function getPawnNotation(x, y) {
    return COLS[x] + (y + 1);
}

export function getWallNotation(x, y, type) {
    return COLS[x] + (y + 1) + type;
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
