// Check if a basic cell-to-cell move is blocked by a wall
export function isMoveBlocked(x1, y1, x2, y2, hWalls, vWalls) {
    if (!(hWalls instanceof Map)) {
        return isMoveBlockedFast(x1, y1, x2, y2, hWalls, vWalls);
    }
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
            
            const isStraightInBounds = jx >= 0 && jx <= 8 && jy >= 0 && jy <= 8;
            const isStraightBlockedByWall = isStraightInBounds && isMoveBlocked(nx, ny, jx, jy, hWalls, vWalls);

            if (isStraightInBounds && !isStraightBlockedByWall) {
                moves.push({ x: jx, y: jy });
            } else if (isStraightBlockedByWall) {
                // Diagonal jumps only allowed when straight jump is blocked by a wall
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
export function findShortestPath(startX, startY, targetY, hWalls, vWalls, oppPos = null) {
    if (!(hWalls instanceof Map)) {
        return findShortestPathFast(startX, startY, targetY, hWalls, vWalls, oppPos ? oppPos.x : -1, oppPos ? oppPos.y : -1);
    }
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
            
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !isMoveBlocked(x, y, nx, ny, hWalls, vWalls)) {
                if (oppPos && nx === oppPos.x && ny === oppPos.y) {
                    const jx = nx + d.dx;
                    const jy = ny + d.dy;
                    const straightInBounds = (jx >= 0 && jx < 9 && jy >= 0 && jy < 9);
                    const straightBlocked = straightInBounds && isMoveBlocked(nx, ny, jx, jy, hWalls, vWalls);

                    if (straightInBounds && !straightBlocked) {
                        const key = `${jx},${jy}`;
                        if (!visited.has(key)) {
                            visited.add(key);
                            queue.push({ x: jx, y: jy, path: path.concat([{ x, y }]) });
                        }
                    } else if (straightBlocked) {
                        const sides = d.dx === 0 ? [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }] : [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
                        for (const s of sides) {
                            const dix = nx + s.dx;
                            const diy = ny + s.dy;
                            if (dix >= 0 && dix < 9 && diy >= 0 && diy < 9 && !isMoveBlocked(nx, ny, dix, diy, hWalls, vWalls)) {
                                const key = `${dix},${diy}`;
                                if (!visited.has(key)) {
                                    visited.add(key);
                                    queue.push({ x: dix, y: diy, path: path.concat([{ x, y }]) });
                                }
                            }
                        }
                    }
                } else {
                    const key = `${nx},${ny}`;
                    if (!visited.has(key)) {
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

// Count contacts for Slatton's 2-contact rule
export function countWallContacts(wx, wy, type, hWalls, vWalls) {
    if (!(hWalls instanceof Map)) {
        return countWallContactsFast(wx, wy, type, hWalls, vWalls);
    }
    if (type === 'h') {
        let c0 = (wx === 0);
        if (!c0 && wx >= 2 && hWalls.has(`${wx - 2},${wy}`)) c0 = true;
        if (!c0 && wy >= 1 && vWalls.has(`${wx},${wy - 1}`)) c0 = true;
        if (!c0 && wy + 1 < 8 && vWalls.has(`${wx},${wy + 1}`)) c0 = true;

        let c1 = false;
        if (wy >= 1 && vWalls.has(`${wx + 1},${wy - 1}`)) c1 = true;
        if (!c1 && wy + 1 < 8 && vWalls.has(`${wx + 1},${wy + 1}`)) c1 = true;

        let c2 = (wx === 7);
        if (!c2 && wx + 2 < 8 && hWalls.has(`${wx + 2},${wy}`)) c2 = true;
        if (!c2 && wy >= 1 && vWalls.has(`${wx + 2},${wy - 1}`)) c2 = true;
        if (!c2 && wy + 1 < 8 && vWalls.has(`${wx + 2},${wy + 1}`)) c2 = true;

        return (c0 ? 1 : 0) + (c1 ? 1 : 0) + (c2 ? 1 : 0);
    } else {
        let c0 = (wy === 0);
        if (!c0 && wy >= 2 && vWalls.has(`${wx},${wy - 2}`)) c0 = true;
        if (!c0 && wx >= 1 && hWalls.has(`${wx - 1},${wy}`)) c0 = true;
        if (!c0 && wx + 1 < 8 && hWalls.has(`${wx + 1},${wy}`)) c0 = true;

        let c1 = false;
        if (wx >= 1 && hWalls.has(`${wx - 1},${wy + 1}`)) c1 = true;
        if (!c1 && wx + 1 < 8 && hWalls.has(`${wx + 1},${wy + 1}`)) c1 = true;

        let c2 = (wy === 7);
        if (!c2 && wy + 2 < 8 && vWalls.has(`${wx},${wy + 2}`)) c2 = true;
        if (!c2 && wx >= 1 && hWalls.has(`${wx - 1},${wy + 2}`)) c2 = true;
        if (!c2 && wx + 1 < 8 && hWalls.has(`${wx + 1},${wy + 2}`)) c2 = true;

        return (c0 ? 1 : 0) + (c1 ? 1 : 0) + (c2 ? 1 : 0);
    }
}

export function doesWallIntersectPath(wx, wy, type, path) {
    if (!path || path.length < 2) return false;
    for (let i = 0; i < path.length - 1; i++) {
        const x1 = path[i].x;
        const y1 = path[i].y;
        const x2 = path[i + 1].x;
        const y2 = path[i + 1].y;

        if (x1 === x2) {
            const ymin = Math.min(y1, y2);
            const ymax = Math.max(y1, y2);
            if (type === 'h' && (wx === x1 || wx === x1 - 1)) {
                if (ymax - ymin === 1) {
                    if (ymin === wy) return true;
                } else if (ymin <= wy && wy < ymax) {
                    return true;
                }
            }
        } else if (y1 === y2) {
            const xmin = Math.min(x1, x2);
            const xmax = Math.max(x1, x2);
            if (type === 'v' && (wy === y1 || wy === y1 - 1)) {
                if (xmax - xmin === 1) {
                    if (xmin === wx) return true;
                } else if (xmin <= wx && wx < xmax) {
                    return true;
                }
            }
        } else {
            if (type === 'h') {
                if ((wy === y1 || wy === y2 || wy === Math.min(y1, y2)) &&
                    (wx >= Math.min(x1, x2) - 1 && wx <= Math.max(x1, x2))) {
                    return true;
                }
            } else {
                if ((wx === x1 || wx === x2 || wx === Math.min(x1, x2)) &&
                    (wy >= Math.min(y1, y2) - 1 && wy <= Math.max(y1, y2))) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Validates both overlap and path-blocking rules using 3-Tier filter
export function validateWallPlacement(wx, wy, type, p1Pos, p2Pos, hWalls, vWalls, p1Path = null, p2Path = null) {
    if (!(hWalls instanceof Map)) {
        return validateWallPlacementFast(wx, wy, type, p1Pos, p2Pos, hWalls, vWalls, p1Path, p2Path);
    }
    // Tier 1: Overlap Check
    if (isWallPlacementOverlap(wx, wy, type, hWalls, vWalls)) {
        return false;
    }

    // Tier 2a: Cached Shortest-Path Intersection Check
    if (p1Path && p2Path && p1Path.length > 0 && p2Path.length > 0 &&
        !doesWallIntersectPath(wx, wy, type, p1Path) &&
        !doesWallIntersectPath(wx, wy, type, p2Path)) {
        return true;
    }

    // Tier 2b: Slatton's 2-contact rule (fewer than 2 contacts cannot disconnect the board)
    if (countWallContacts(wx, wy, type, hWalls, vWalls) < 2) {
        return true;
    }
    
    // Tier 3: Full BFS path-blocking check
    const wallKey = `${wx},${wy}`;
    if (type === 'h') hWalls.set(wallKey, true);
    else vWalls.set(wallKey, true);
    
    const p1Possible = findShortestPath(p1Pos.x, p1Pos.y, 8, hWalls, vWalls);
    const p2Possible = findShortestPath(p2Pos.x, p2Pos.y, 0, hWalls, vWalls);
    
    if (type === 'h') hWalls.delete(wallKey);
    else vWalls.delete(wallKey);
    
    return p1Possible !== null && p2Possible !== null;
}

// --- OPTIMIZED FAST IMPLEMENTATIONS USING FLAT TYPED ARRAYS (Uint8Array) ---

export function isMoveBlockedFast(x1, y1, x2, y2, hWallsArray, vWallsArray) {
    if (x1 === x2) {
        // Vertical movement
        const yMin = Math.min(y1, y2);
        if (Math.abs(y1 - y2) === 1) {
            const idx1 = yMin * 8 + x1;
            const idx2 = yMin * 8 + (x1 - 1);
            const wall1 = (x1 >= 0 && x1 <= 7) ? hWallsArray[idx1] : 0;
            const wall2 = (x1 - 1 >= 0 && x1 - 1 <= 7) ? hWallsArray[idx2] : 0;
            return wall1 || wall2;
        }
    } else if (y1 === y2) {
        // Horizontal movement
        const xMin = Math.min(x1, x2);
        if (Math.abs(x1 - x2) === 1) {
            const idx1 = y1 * 8 + xMin;
            const idx2 = (y1 - 1) * 8 + xMin;
            const wall1 = (y1 >= 0 && y1 <= 7) ? vWallsArray[idx1] : 0;
            const wall2 = (y1 - 1 >= 0 && y1 - 1 <= 7) ? vWallsArray[idx2] : 0;
            return wall1 || wall2;
        }
    }
    return true;
}

export function findShortestPathFast(startX, startY, targetY, hWallsArray, vWallsArray, oppX = -1, oppY = -1) {
    const startIdx = startY * 9 + startX;
    if (startY === targetY) {
        return [{ x: startX, y: startY }];
    }

    const queue = new Uint8Array(81);
    const visited = new Uint8Array(81);
    const parent = new Int8Array(81);
    parent.fill(-1);

    let head = 0;
    let tail = 0;

    queue[tail++] = startIdx;
    visited[startIdx] = 1;

    let targetIdx = -1;

    const dirs = [
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 }
    ];

    while (head < tail) {
        const curr = queue[head++];
        const cx = curr % 9;
        const cy = Math.floor(curr / 9);

        if (cy === targetY) {
            targetIdx = curr;
            break;
        }

        for (let i = 0; i < 4; i++) {
            const dx = dirs[i].dx;
            const dy = dirs[i].dy;
            const nx = cx + dx;
            const ny = cy + dy;

            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !isMoveBlockedFast(cx, cy, nx, ny, hWallsArray, vWallsArray)) {
                if (oppX !== -1 && nx === oppX && ny === oppY) {
                    const jx = nx + dx;
                    const jy = ny + dy;
                    const straightInBounds = (jx >= 0 && jx < 9 && jy >= 0 && jy < 9);
                    const straightBlocked = straightInBounds && isMoveBlockedFast(nx, ny, jx, jy, hWallsArray, vWallsArray);

                    if (straightInBounds && !straightBlocked) {
                        const nextIdx = jy * 9 + jx;
                        if (!visited[nextIdx]) {
                            visited[nextIdx] = 1;
                            parent[nextIdx] = curr;
                            queue[tail++] = nextIdx;
                        }
                    } else if (straightBlocked) {
                        const sides = dx === 0 ? [{ sx: -1, sy: 0 }, { sx: 1, sy: 0 }] : [{ sx: 0, sy: -1 }, { sx: 0, sy: 1 }];
                        for (let s = 0; s < 2; s++) {
                            const dix = nx + sides[s].sx;
                            const diy = ny + sides[s].sy;
                            if (dix >= 0 && dix < 9 && diy >= 0 && diy < 9 && !isMoveBlockedFast(nx, ny, dix, diy, hWallsArray, vWallsArray)) {
                                const nextIdx = diy * 9 + dix;
                                if (!visited[nextIdx]) {
                                    visited[nextIdx] = 1;
                                    parent[nextIdx] = curr;
                                    queue[tail++] = nextIdx;
                                }
                            }
                        }
                    }
                } else {
                    const nextIdx = ny * 9 + nx;
                    if (!visited[nextIdx]) {
                        visited[nextIdx] = 1;
                        parent[nextIdx] = curr;
                        queue[tail++] = nextIdx;
                    }
                }
            }
        }
    }

    if (targetIdx === -1) return null;

    const path = [];
    let curr = targetIdx;
    while (curr !== -1) {
        path.push({ x: curr % 9, y: Math.floor(curr / 9) });
        curr = parent[curr];
    }
    path.reverse();
    return path;
}

export function findShortestPathLengthFast(startX, startY, targetY, hWallsArray, vWallsArray, oppX = -1, oppY = -1) {
    const startIdx = startY * 9 + startX;
    if (startY === targetY) {
        return 1;
    }

    const queue = new Uint8Array(81);
    const dist = new Uint8Array(81);
    const visited = new Uint8Array(81);

    let head = 0;
    let tail = 0;

    queue[tail++] = startIdx;
    visited[startIdx] = 1;
    dist[startIdx] = 1;

    const dirs = [
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 }
    ];

    while (head < tail) {
        const curr = queue[head++];
        const cx = curr % 9;
        const cy = Math.floor(curr / 9);
        const currDist = dist[curr];

        if (cy === targetY) {
            return currDist;
        }

        for (let i = 0; i < 4; i++) {
            const dx = dirs[i].dx;
            const dy = dirs[i].dy;
            const nx = cx + dx;
            const ny = cy + dy;

            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !isMoveBlockedFast(cx, cy, nx, ny, hWallsArray, vWallsArray)) {
                if (oppX !== -1 && nx === oppX && ny === oppY) {
                    const jx = nx + dx;
                    const jy = ny + dy;
                    const straightInBounds = (jx >= 0 && jx < 9 && jy >= 0 && jy < 9);
                    const straightBlocked = straightInBounds && isMoveBlockedFast(nx, ny, jx, jy, hWallsArray, vWallsArray);

                    if (straightInBounds && !straightBlocked) {
                        const nextIdx = jy * 9 + jx;
                        if (!visited[nextIdx]) {
                            visited[nextIdx] = 1;
                            dist[nextIdx] = currDist + 1;
                            queue[tail++] = nextIdx;
                        }
                    } else if (straightBlocked) {
                        const sides = dx === 0 ? [{ sx: -1, sy: 0 }, { sx: 1, sy: 0 }] : [{ sx: 0, sy: -1 }, { sx: 0, sy: 1 }];
                        for (let s = 0; s < 2; s++) {
                            const dix = nx + sides[s].sx;
                            const diy = ny + sides[s].sy;
                            if (dix >= 0 && dix < 9 && diy >= 0 && diy < 9 && !isMoveBlockedFast(nx, ny, dix, diy, hWallsArray, vWallsArray)) {
                                const nextIdx = diy * 9 + dix;
                                if (!visited[nextIdx]) {
                                    visited[nextIdx] = 1;
                                    dist[nextIdx] = currDist + 1;
                                    queue[tail++] = nextIdx;
                                }
                            }
                        }
                    }
                } else {
                    const nextIdx = ny * 9 + nx;
                    if (!visited[nextIdx]) {
                        visited[nextIdx] = 1;
                        dist[nextIdx] = currDist + 1;
                        queue[tail++] = nextIdx;
                    }
                }
            }
        }
    }

    return -1;
}

export function hasPathFast(startX, startY, targetY, hWallsArray, vWallsArray) {
    const startIdx = startY * 9 + startX;
    if (startY === targetY) {
        return true;
    }

    const queue = new Uint8Array(81);
    const visited = new Uint8Array(81);

    let head = 0;
    let tail = 0;

    queue[tail++] = startIdx;
    visited[startIdx] = 1;

    while (head < tail) {
        const curr = queue[head++];
        const cx = curr % 9;
        const cy = Math.floor(curr / 9);

        if (cy === targetY) {
            return true;
        }

        if (cy + 1 < 9) {
            const nextIdx = (cy + 1) * 9 + cx;
            if (!visited[nextIdx] && !isMoveBlockedFast(cx, cy, cx, cy + 1, hWallsArray, vWallsArray)) {
                visited[nextIdx] = 1;
                queue[tail++] = nextIdx;
            }
        }
        if (cy - 1 >= 0) {
            const nextIdx = (cy - 1) * 9 + cx;
            if (!visited[nextIdx] && !isMoveBlockedFast(cx, cy, cx, cy - 1, hWallsArray, vWallsArray)) {
                visited[nextIdx] = 1;
                queue[tail++] = nextIdx;
            }
        }
        if (cx + 1 < 9) {
            const nextIdx = cy * 9 + (cx + 1);
            if (!visited[nextIdx] && !isMoveBlockedFast(cx, cy, cx + 1, cy, hWallsArray, vWallsArray)) {
                visited[nextIdx] = 1;
                queue[tail++] = nextIdx;
            }
        }
        if (cx - 1 >= 0) {
            const nextIdx = cy * 9 + (cx - 1);
            if (!visited[nextIdx] && !isMoveBlockedFast(cx, cy, cx - 1, cy, hWallsArray, vWallsArray)) {
                visited[nextIdx] = 1;
                queue[tail++] = nextIdx;
            }
        }
    }

    return false;
}

export function isWallPlacementOverlapFast(wx, wy, type, hWallsArray, vWallsArray) {
    if (wx < 0 || wx > 7 || wy < 0 || wy > 7) return true;
    
    const idx = wy * 8 + wx;
    if (type === 'h') {
        if (hWallsArray[idx] || (wx - 1 >= 0 && hWallsArray[idx - 1]) || (wx + 1 <= 7 && hWallsArray[idx + 1])) {
            return true;
        }
        if (vWallsArray[idx]) {
            return true;
        }
    } else if (type === 'v') {
        if (vWallsArray[idx] || (wy - 1 >= 0 && vWallsArray[idx - 8]) || (wy + 1 <= 7 && vWallsArray[idx + 8])) {
            return true;
        }
        if (hWallsArray[idx]) {
            return true;
        }
    }
    return false;
}

export function countWallContactsFast(wx, wy, type, hWallsArray, vWallsArray) {
    if (type === 'h') {
        let c0 = (wx === 0);
        if (!c0 && wx >= 2 && hWallsArray[wy * 8 + (wx - 2)]) c0 = true;
        if (!c0 && wy >= 1 && vWallsArray[(wy - 1) * 8 + wx]) c0 = true;
        if (!c0 && wy + 1 < 8 && vWallsArray[(wy + 1) * 8 + wx]) c0 = true;

        let c1 = false;
        if (wy >= 1 && vWallsArray[(wy - 1) * 8 + (wx + 1)]) c1 = true;
        if (!c1 && wy + 1 < 8 && vWallsArray[(wy + 1) * 8 + (wx + 1)]) c1 = true;

        let c2 = (wx === 7);
        if (!c2 && wx + 2 < 8 && hWallsArray[wy * 8 + (wx + 2)]) c2 = true;
        if (!c2 && wy >= 1 && vWallsArray[(wy - 1) * 8 + (wx + 2)]) c2 = true;
        if (!c2 && wy + 1 < 8 && vWallsArray[(wy + 1) * 8 + (wx + 2)]) c2 = true;

        return (c0 ? 1 : 0) + (c1 ? 1 : 0) + (c2 ? 1 : 0);
    } else {
        let c0 = (wy === 0);
        if (!c0 && wy >= 2 && vWallsArray[(wy - 2) * 8 + wx]) c0 = true;
        if (!c0 && wx >= 1 && hWallsArray[wy * 8 + (wx - 1)]) c0 = true;
        if (!c0 && wx + 1 < 8 && hWallsArray[wy * 8 + (wx + 1)]) c0 = true;

        let c1 = false;
        if (wx >= 1 && hWallsArray[(wy + 1) * 8 + (wx - 1)]) c1 = true;
        if (!c1 && wx + 1 < 8 && hWallsArray[(wy + 1) * 8 + (wx + 1)]) c1 = true;

        let c2 = (wy === 7);
        if (!c2 && wy + 2 < 8 && vWallsArray[(wy + 2) * 8 + wx]) c2 = true;
        if (!c2 && wx >= 1 && hWallsArray[(wy + 2) * 8 + (wx - 1)]) c2 = true;
        if (!c2 && wx + 1 < 8 && hWallsArray[(wy + 2) * 8 + (wx + 1)]) c2 = true;

        return (c0 ? 1 : 0) + (c1 ? 1 : 0) + (c2 ? 1 : 0);
    }
}

export function validateWallPlacementFast(wx, wy, type, p1Pos, p2Pos, hWallsArray, vWallsArray, p1Path = null, p2Path = null) {
    if (isWallPlacementOverlapFast(wx, wy, type, hWallsArray, vWallsArray)) {
        return false;
    }

    // Tier 2a: Cached Shortest-Path Intersection Check
    if (p1Path && p2Path && p1Path.length > 0 && p2Path.length > 0 &&
        !doesWallIntersectPath(wx, wy, type, p1Path) &&
        !doesWallIntersectPath(wx, wy, type, p2Path)) {
        return true;
    }

    // Tier 2b: Slatton's 2-contact rule
    if (countWallContactsFast(wx, wy, type, hWallsArray, vWallsArray) < 2) {
        return true;
    }
    
    // Tier 3: Full BFS reachability check
    const wallIdx = wy * 8 + wx;
    if (type === 'h') hWallsArray[wallIdx] = 1;
    else vWallsArray[wallIdx] = 1;
    
    const p1Possible = hasPathFast(p1Pos.x, p1Pos.y, 8, hWallsArray, vWallsArray);
    const p2Possible = hasPathFast(p2Pos.x, p2Pos.y, 0, hWallsArray, vWallsArray);
    
    if (type === 'h') hWallsArray[wallIdx] = 0;
    else vWallsArray[wallIdx] = 0;
    
    return p1Possible && p2Possible;
}

export function areShortestPathDAGsDisjoint(p1Pos, p2Pos, hWalls, vWalls) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    // 1. P1 forward BFS from p1Pos
    const d1 = new Int16Array(81).fill(-1);
    let q = [p1Pos.x * 9 + p1Pos.y];
    d1[p1Pos.x * 9 + p1Pos.y] = 0;
    let head = 0;
    while (head < q.length) {
        const curr = q[head++];
        const cx = Math.floor(curr / 9);
        const cy = curr % 9;
        for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
                const nIdx = nx * 9 + ny;
                if (d1[nIdx] === -1 && !isMoveBlocked(cx, cy, nx, ny, hWalls, vWalls)) {
                    d1[nIdx] = d1[curr] + 1;
                    q.push(nIdx);
                }
            }
        }
    }

    // 2. P1 reverse BFS from row 8
    const r1 = new Int16Array(81).fill(-1);
    q = [];
    head = 0;
    for (let x = 0; x < 9; x++) {
        r1[x * 9 + 8] = 0;
        q.push(x * 9 + 8);
    }
    while (head < q.length) {
        const curr = q[head++];
        const cx = Math.floor(curr / 9);
        const cy = curr % 9;
        for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
                const nIdx = nx * 9 + ny;
                if (r1[nIdx] === -1 && !isMoveBlocked(cx, cy, nx, ny, hWalls, vWalls)) {
                    r1[nIdx] = r1[curr] + 1;
                    q.push(nIdx);
                }
            }
        }
    }

    const l1 = r1[p1Pos.x * 9 + p1Pos.y];
    if (l1 <= 0 || l1 > 100) return { disjoint: false, l1: 999, l2: 999 };

    // 3. P2 forward BFS from p2Pos
    const d2 = new Int16Array(81).fill(-1);
    q = [p2Pos.x * 9 + p2Pos.y];
    d2[p2Pos.x * 9 + p2Pos.y] = 0;
    head = 0;
    while (head < q.length) {
        const curr = q[head++];
        const cx = Math.floor(curr / 9);
        const cy = curr % 9;
        for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
                const nIdx = nx * 9 + ny;
                if (d2[nIdx] === -1 && !isMoveBlocked(cx, cy, nx, ny, hWalls, vWalls)) {
                    d2[nIdx] = d2[curr] + 1;
                    q.push(nIdx);
                }
            }
        }
    }

    // 4. P2 reverse BFS from row 0
    const r2 = new Int16Array(81).fill(-1);
    q = [];
    head = 0;
    for (let x = 0; x < 9; x++) {
        r2[x * 9 + 0] = 0;
        q.push(x * 9 + 0);
    }
    while (head < q.length) {
        const curr = q[head++];
        const cx = Math.floor(curr / 9);
        const cy = curr % 9;
        for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
                const nIdx = nx * 9 + ny;
                if (r2[nIdx] === -1 && !isMoveBlocked(cx, cy, nx, ny, hWalls, vWalls)) {
                    r2[nIdx] = r2[curr] + 1;
                    q.push(nIdx);
                }
            }
        }
    }

    const l2 = r2[p2Pos.x * 9 + p2Pos.y];
    if (l2 <= 0 || l2 > 100) return { disjoint: false, l1: 999, l2: 999 };

    // 5. Check if DAGs intersect
    for (let i = 0; i < 81; i++) {
        const inDag1 = (d1[i] >= 0 && r1[i] >= 0 && d1[i] + r1[i] === l1);
        const inDag2 = (d2[i] >= 0 && r2[i] >= 0 && d2[i] + r2[i] === l2);
        if (inDag1 && inDag2) {
            return { disjoint: false, l1, l2 };
        }
    }

    return { disjoint: true, l1, l2 };
}

// Guaranteed winner solver check: returns 1 for P1 win, -1 for P2 win, 0 for ongoing.
// Mirrors C++ QuoridorGame::get_guaranteed_winner().
export function getGuaranteedWinner(p1Pos, p2Pos, p1Walls, p2Walls, isP1Turn, hWalls, vWalls) {
    if (p1Pos.y === 8) return 1;
    if (p2Pos.y === 0) return -1;

    const { disjoint, l1, l2 } = areShortestPathDAGsDisjoint(p1Pos, p2Pos, hWalls, vWalls);
    if (l1 >= 999 || l2 >= 999) return 0;

    // Both players have 0 walls left: deterministic pawn race
    if (p1Walls === 0 && p2Walls === 0) {
        // High margin: 2 full plies guarantees win regardless of jump parity
        if (l1 <= l2 - 2) return 1;
        if (l2 <= l1 - 2) return -1;

        // Tight margin (|l1 - l2| <= 1): require disjoint DAGs to preclude jump flips
        if (disjoint) {
            if (l1 < l2) return 1;
            if (l2 < l1) return -1;
            return isP1Turn ? 1 : -1;
        }
        return 0;
    }

    // One player has 0 walls left: conservative bounds with jump parity guard
    if (p2Walls === 0) {
        if (l1 <= l2 - 2) return 1;
        if (isP1Turn && l1 <= l2 - 1 && disjoint) return 1;
    }
    if (p1Walls === 0) {
        if (l2 <= l1 - 2) return -1;
        if (!isP1Turn && l2 <= l1 - 1 && disjoint) return -1;
    }

    return 0;
}

export function getWallBitboards(hWalls, vWalls) {
    let hBitboard = 0n;
    let vBitboard = 0n;

    if (hWalls instanceof Map) {
        for (const key of hWalls.keys()) {
            const [wx, wy] = key.split(',').map(Number);
            if (wx >= 0 && wx < 8 && wy >= 0 && wy < 8) {
                hBitboard |= (1n << BigInt(wy * 8 + wx));
            }
        }
    } else if (hWalls) {
        for (let i = 0; i < 64; i++) {
            if (hWalls[i]) hBitboard |= (1n << BigInt(i));
        }
    }

    if (vWalls instanceof Map) {
        for (const key of vWalls.keys()) {
            const [wx, wy] = key.split(',').map(Number);
            if (wx >= 0 && wx < 8 && wy >= 0 && wy < 8) {
                vBitboard |= (1n << BigInt(wy * 8 + wx));
            }
        }
    } else if (vWalls) {
        for (let i = 0; i < 64; i++) {
            if (vWalls[i]) vBitboard |= (1n << BigInt(i));
        }
    }

    return { hBitboard, vBitboard };
}

export function mirrorBitboardHorizontal(b) {
    b = ((b & 0x5555555555555555n) << 1n) | ((b >> 1n) & 0x5555555555555555n);
    b = ((b & 0x3333333333333333n) << 2n) | ((b >> 2n) & 0x3333333333333333n);
    b = ((b & 0x0F0F0F0F0F0F0F0Fn) << 4n) | ((b >> 4n) & 0x0F0F0F0F0F0F0F0Fn);
    return b;
}

function splitmix64(x) {
    x = (x + 0x9e3779b97f4a7c15n) & 0xFFFFFFFFFFFFFFFFn;
    x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xFFFFFFFFFFFFFFFFn;
    x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & 0xFFFFFFFFFFFFFFFFn;
    return (x ^ (x >> 31n)) & 0xFFFFFFFFFFFFFFFFn;
}

export function getCanonicalStateHash(p1Pos, p2Pos, hWalls, vWalls, p1Walls, p2Walls, isP1Turn) {
    const { hBitboard, vBitboard } = (typeof hWalls === 'bigint' && typeof vWalls === 'bigint')
        ? { hBitboard: hWalls, vBitboard: vWalls }
        : getWallBitboards(hWalls, vWalls);

    const p1_x = p1Pos.x, p1_y = p1Pos.y;
    const p2_x = p2Pos.x, p2_y = p2Pos.y;
    const m_p1_x = 8 - p1_x;
    const m_p2_x = 8 - p2_x;

    const m_h = mirrorBitboardHorizontal(hBitboard);
    const m_v = mirrorBitboardHorizontal(vBitboard);

    const act_x = isP1Turn ? p1_x : p2_x;
    const m_act_x = 8 - act_x;
    const opp_x = isP1Turn ? p2_x : p1_x;
    const m_opp_x = 8 - opp_x;

    let isMirrored = false;
    if (act_x !== m_act_x) {
        isMirrored = act_x > m_act_x;
    } else if (opp_x !== m_opp_x) {
        isMirrored = opp_x > m_opp_x;
    } else if (hBitboard !== m_h) {
        isMirrored = hBitboard > m_h;
    } else if (vBitboard !== m_v) {
        isMirrored = vBitboard > m_v;
    }

    const c_p1_x = isMirrored ? m_p1_x : p1_x;
    const c_p2_x = isMirrored ? m_p2_x : p2_x;
    const c_h = isMirrored ? m_h : hBitboard;
    const c_v = isMirrored ? m_v : vBitboard;

    let meta = (BigInt(c_p1_x) << 20n) | (BigInt(p1_y) << 16n)
             | (BigInt(c_p2_x) << 12n) | (BigInt(p2_y) << 8n)
             | (BigInt(p1Walls) << 4n) | BigInt(p2Walls);
    if (isP1Turn) meta |= (1n << 24n);

    const h = splitmix64(c_h ^ splitmix64(c_v) ^ splitmix64(meta));
    return { hash: h.toString(16), isMirrored };
}
