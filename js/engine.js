// Check if a basic cell-to-cell move is blocked by a wall
export function isMoveBlocked(x1, y1, x2, y2, hWalls, vWalls) {
    if (x1 === x2) {
        // Vertical movement
        const yMin = Math.min(y1, y2);
        if (Math.abs(y1 - y2) === 1) {
            // Blocked if a horizontal wall exists at (x1, yMin) or (x1-1, yMin)
            return hWalls.has(`${x1},${yMin}`) || hWalls.has(`${x1-1},${yMin}`);
        }
    } else if (y1 === y2) {
        // Horizontal movement
        const xMin = Math.min(x1, x2);
        if (Math.abs(x1 - x2) === 1) {
            // Blocked if a vertical wall exists at (xMin, y1) or (xMin, y1-1)
            return vWalls.has(`${xMin},${y1}`) || vWalls.has(`${xMin},${y1-1}`);
        }
    }
    return true; // Any move that isn't straight 1-cell orthogonal is blocked by default
}

// Find all valid moves for a pawn, considering wall blocks and opponent jumps
export function getValidPawnMoves(px, py, ox, oy, hWalls, vWalls) {
    const moves = [];
    const dirs = [
        { dx: 0, dy: 1 },  // Up
        { dx: 0, dy: -1 }, // Down
        { dx: 1, dy: 0 },  // Right
        { dx: -1, dy: 0 }  // Left
    ];
    
    for (const d of dirs) {
        const nx = px + d.dx;
        const ny = py + d.dy;
        
        // Out of bounds?
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        
        // Blocked by wall?
        if (isMoveBlocked(px, py, nx, ny, hWalls, vWalls)) continue;
        
        // Is opponent here?
        if (nx === ox && ny === oy) {
            // Attempt standard jump
            const jx = nx + d.dx;
            const jy = ny + d.dy;
            
            let jumpBlocked = jx < 0 || jx > 8 || jy < 0 || jy > 8 || isMoveBlocked(nx, ny, jx, jy, hWalls, vWalls);
            
            if (!jumpBlocked) {
                moves.push({ x: jx, y: jy });
            } else {
                // Standard jump blocked - diagonal jumps allowed
                if (d.dx === 0) {
                    // Moving vertically - diagonals are horizontal
                    const leftX = nx - 1;
                    const rightX = nx + 1;
                    
                    if (leftX >= 0 && !isMoveBlocked(nx, ny, leftX, ny, hWalls, vWalls)) {
                        moves.push({ x: leftX, y: ny });
                    }
                    if (rightX <= 8 && !isMoveBlocked(nx, ny, rightX, ny, hWalls, vWalls)) {
                        moves.push({ x: rightX, y: ny });
                    }
                } else {
                    // Moving horizontally - diagonals are vertical
                    const downY = ny - 1;
                    const upY = ny + 1;
                    
                    if (downY >= 0 && !isMoveBlocked(nx, ny, nx, downY, hWalls, vWalls)) {
                        moves.push({ x: nx, y: downY });
                    }
                    if (upY <= 8 && !isMoveBlocked(nx, ny, nx, upY, hWalls, vWalls)) {
                        moves.push({ x: nx, y: upY });
                    }
                }
            }
        } else {
            moves.push({ x: nx, y: ny });
        }
    }
    return moves;
}

// BFS shortest pathfinding to goal row
// Returns the full coordinates array of the path, or null if blocked
export function findShortestPath(startX, startY, targetY, hWalls, vWalls) {
    const queue = [ { x: startX, y: startY, path: [] } ];
    const visited = new Set();
    visited.add(`${startX},${startY}`);
    
    while (queue.length > 0) {
        const { x, y, path } = queue.shift();
        
        if (y === targetY) {
            return path.concat([{ x, y }]);
        }
        
        const dirs = [
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 }
        ];
        
        for (const d of dirs) {
            const nx = x + d.dx;
            const ny = y + d.dy;
            
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
                const key = `${nx},${ny}`;
                if (!visited.has(key)) {
                    if (!isMoveBlocked(x, y, nx, ny, hWalls, vWalls)) {
                        visited.add(key);
                        queue.push({ x: nx, y: ny, path: path.concat([{ x, y }]) });
                    }
                }
            }
        }
    }
    return null; // Path blocked
}

// Validate wall overlap rules
export function isWallPlacementOverlap(wx, wy, type, hWalls, vWalls) {
    if (wx < 0 || wx > 7 || wy < 0 || wy > 7) return true;
    
    if (type === 'h') {
        // Horizontal wall cannot overlap with another horizontal wall at wx, wx-1, or wx+1
        if (hWalls.has(`${wx},${wy}`) || hWalls.has(`${wx-1},${wy}`) || hWalls.has(`${wx+1},${wy}`)) {
            return true;
        }
        // Horizontal wall cannot cross vertical wall at exact same joint wx,wy
        if (vWalls.has(`${wx},${wy}`)) {
            return true;
        }
    } else if (type === 'v') {
        // Vertical wall cannot overlap with another vertical wall at wy, wy-1, or wy+1
        if (vWalls.has(`${wx},${wy}`) || vWalls.has(`${wx},${wy-1}`) || vWalls.has(`${wx},${wy+1}`)) {
            return true;
        }
        // Vertical wall cannot cross horizontal wall at exact same joint wx,wy
        if (hWalls.has(`${wx},${wy}`)) {
            return true;
        }
    }
    return false;
}

// Validates both overlap and path-blocking rules
export function validateWallPlacement(wx, wy, type, p1Pos, p2Pos, hWalls, vWalls) {
    // 1. Overlap Check
    if (isWallPlacementOverlap(wx, wy, type, hWalls, vWalls)) {
        return false;
    }
    
    // 2. Path-blocking Check
    // Temporarily add wall
    const wallKey = `${wx},${wy}`;
    if (type === 'h') hWalls.set(wallKey, true);
    else vWalls.set(wallKey, true);
    
    // Check if both players can still reach their goals
    const p1Path = findShortestPath(p1Pos.x, p1Pos.y, 8, hWalls, vWalls);
    const p2Path = findShortestPath(p2Pos.x, p2Pos.y, 0, hWalls, vWalls);
    
    // Remove wall
    if (type === 'h') hWalls.delete(wallKey);
    else vWalls.delete(wallKey);
    
    return p1Path !== null && p2Path !== null;
}
