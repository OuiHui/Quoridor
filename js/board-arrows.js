import { parseNotation } from './notation.js';
import { state } from './state.js';
import {
    createSVGElement,
    setupGlowFilters,
    renderSingleHighlight,
    renderSingleSketchWall,
    renderSingleArrow
} from './board-arrow-render.js';

const overlayState = {
    customArrows: [],
    customHighlights: [],
    customSketchWalls: [],
    presetGoalArrows: [],
    stepArrow: null,
    presetStepArrows: [],
    presetStepSketchWalls: [],
    pathArrows: [],
    isRightDragging: false,
    startCell: null,
    currentHoverCell: null,
    activeColor: 'green'
};

export function initBoardArrows() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    let svgEl = document.getElementById('board-arrows-svg');
    if (svgEl) svgEl.remove();

    svgEl = createSVGElement('svg', {
        id: 'board-arrows-svg',
        class: 'board-arrows-svg',
        style: 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 15;'
    });

    const defs = createSVGElement('defs');
    setupGlowFilters(defs);
    svgEl.appendChild(defs);
    boardEl.appendChild(svgEl);

    boardEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    window.addEventListener('contextmenu', (e) => {
        if (overlayState.isRightDragging) {
            e.preventDefault();
            return false;
        }
    });

    boardEl.addEventListener('mousedown', handleMousedown);
    window.addEventListener('mousemove', handleMousemove);
    window.addEventListener('mouseup', handleMouseup);
    window.addEventListener('resize', renderArrows);
}

function handleMousedown(e) {
    if (e.button === 2) {
        e.preventDefault();
        const cell = getCellFromEvent(e);
        if (cell) {
            overlayState.isRightDragging = true;
            overlayState.startCell = cell;
            overlayState.currentHoverCell = cell;
            
            if (e.altKey) overlayState.activeColor = 'red';
            else if (e.shiftKey) overlayState.activeColor = 'blue';
            else if (e.ctrlKey) overlayState.activeColor = 'orange';
            else overlayState.activeColor = 'green';
            
            renderArrows();
        }
    } else if (e.button === 0) {
        if (overlayState.customArrows.length > 0 || overlayState.customHighlights.length > 0 || overlayState.customSketchWalls.length > 0) {
            clearCustomArrows();
        }
    }
}

function handleMousemove(e) {
    if (!overlayState.isRightDragging || !overlayState.startCell) return;
    const cell = getCellFromEvent(e);
    if (cell && (cell.x !== overlayState.currentHoverCell?.x || cell.y !== overlayState.currentHoverCell?.y)) {
        overlayState.currentHoverCell = cell;
        renderArrows();
    }
}

function handleMouseup(e) {
    if (e.button !== 2 || !overlayState.isRightDragging || !overlayState.startCell) return;
    e.preventDefault();

    const endCell = getCellFromEvent(e) || overlayState.currentHoverCell || overlayState.startCell;
    const start = overlayState.startCell;
    const dx = Math.abs(endCell.x - start.x);
    const dy = Math.abs(endCell.y - start.y);

    if (start.x === endCell.x && start.y === endCell.y) {
        if (state.interactionMode !== 'wall-h' && state.interactionMode !== 'wall-v') {
            toggleHighlight(start, overlayState.activeColor);
        }
    } else if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
        if (e.shiftKey || e.altKey || e.ctrlKey) {
            if (dx === 1 && dy === 0) {
                toggleCustomSketchWall(Math.min(start.x, endCell.x), Math.min(start.y, 7), 'v', overlayState.activeColor);
            } else {
                toggleCustomSketchWall(Math.min(start.x, 7), Math.min(start.y, endCell.y), 'h', overlayState.activeColor);
            }
        } else {
            toggleArrow(start, endCell, overlayState.activeColor);
        }
    } else {
        toggleArrow(start, endCell, overlayState.activeColor);
    }

    overlayState.isRightDragging = false;
    overlayState.startCell = null;
    overlayState.currentHoverCell = null;
    renderArrows();
}

function getCellFromEvent(e) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return null;

    const boardRect = boardEl.getBoundingClientRect();
    const { clientX, clientY } = e;

    if (
        clientX < boardRect.left - 50 || clientX > boardRect.right + 50 ||
        clientY < boardRect.top - 50 || clientY > boardRect.bottom + 50
    ) {
        return null;
    }

    let closestCell = null;
    let minSqDist = Infinity;

    boardEl.querySelectorAll('.board-cell').forEach(cellEl => {
        const x = parseInt(cellEl.dataset.x);
        const y = parseInt(cellEl.dataset.y);
        const rect = cellEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const sqDist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
        if (sqDist < minSqDist) {
            minSqDist = sqDist;
            closestCell = { x, y };
        }
    });

    return closestCell;
}

function toggleHighlight(cell, color) {
    const idx = overlayState.customHighlights.findIndex(h => h.x === cell.x && h.y === cell.y);
    if (idx >= 0) {
        if (overlayState.customHighlights[idx].color === color) {
            overlayState.customHighlights.splice(idx, 1);
        } else {
            overlayState.customHighlights[idx].color = color;
        }
    } else {
        overlayState.customHighlights.push({ x: cell.x, y: cell.y, color });
    }
}

function toggleArrow(from, to, color) {
    const idx = overlayState.customArrows.findIndex(a => 
        a.from.x === from.x && a.from.y === from.y && a.to.x === to.x && a.to.y === to.y
    );
    if (idx >= 0) {
        if (overlayState.customArrows[idx].color === color) {
            overlayState.customArrows.splice(idx, 1);
        } else {
            overlayState.customArrows[idx].color = color;
        }
    } else {
        overlayState.customArrows.push({ from: { ...from }, to: { ...to }, color });
    }
}

export function toggleCustomSketchWall(x, y, type, color = 'orange') {
    if (x < 0 || x > 7 || y < 0 || y > 7) return;
    const idx = overlayState.customSketchWalls.findIndex(w => w.x === x && w.y === y && w.type === type);
    if (idx >= 0) {
        if (overlayState.customSketchWalls[idx].color === color) {
            overlayState.customSketchWalls.splice(idx, 1);
        } else {
            overlayState.customSketchWalls[idx].color = color;
        }
    } else {
        overlayState.customSketchWalls.push({ x, y, type, color });
    }
    renderArrows();
}

export function clearCustomArrows() {
    overlayState.customArrows = [];
    overlayState.customHighlights = [];
    overlayState.customSketchWalls = [];
    renderArrows();
}

function parsePoint(point) {
    return typeof point === 'string' ? parseNotation(point) : point;
}

export function setPresetGoalArrows(arrows) {
    if (!Array.isArray(arrows)) {
        overlayState.presetGoalArrows = [];
    } else {
        overlayState.presetGoalArrows = arrows.map(a => {
            const from = parsePoint(a.from);
            const to = parsePoint(a.to);
            if (!from || !to) return null;
            return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, color: a.color || 'green' };
        }).filter(Boolean);
    }
    renderArrows();
}

export function setStepArrow(arrow) {
    if (!arrow) {
        overlayState.stepArrow = null;
    } else {
        const from = parsePoint(arrow.from);
        const to = parsePoint(arrow.to);
        if (from && to) {
            overlayState.stepArrow = { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, color: arrow.color || 'orange' };
        } else {
            overlayState.stepArrow = null;
        }
    }
    renderArrows();
}

export function setPresetStepArrows(arrows) {
    if (!Array.isArray(arrows)) {
        overlayState.presetStepArrows = [];
    } else {
        overlayState.presetStepArrows = arrows.map(a => {
            const from = parsePoint(a.from);
            const to = parsePoint(a.to);
            if (!from || !to) return null;
            return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, color: a.color || 'red', label: a.label || '' };
        }).filter(Boolean);
    }
    renderArrows();
}

export function setPresetStepSketchWalls(walls) {
    if (!Array.isArray(walls)) {
        overlayState.presetStepSketchWalls = [];
    } else {
        overlayState.presetStepSketchWalls = walls.map(w => {
            if (typeof w === 'string') {
                const parsed = parseNotation(w);
                return (parsed && parsed.type === 'wall') ? { x: parsed.x, y: parsed.y, type: parsed.wallType, color: 'orange' } : null;
            }
            return { x: w.x, y: w.y, type: w.type || w.wallType || 'h', color: w.color || 'orange' };
        }).filter(Boolean);
    }
    renderArrows();
}

function compressPathToContinuousArrows(path, color) {
    if (!Array.isArray(path) || path.length < 2) return [];
    
    const arrows = [];
    let startNode = path[0];
    let curDx = path[1].x - path[0].x;
    let curDy = path[1].y - path[0].y;
    
    for (let i = 1; i < path.length - 1; i++) {
        const nextDx = path[i + 1].x - path[i].x;
        const nextDy = path[i + 1].y - path[i].y;
        
        if (nextDx !== curDx || nextDy !== curDy) {
            arrows.push({
                from: { x: startNode.x, y: startNode.y },
                to: { x: path[i].x, y: path[i].y },
                color
            });
            startNode = path[i];
            curDx = nextDx;
            curDy = nextDy;
        }
    }
    
    const lastNode = path[path.length - 1];
    arrows.push({
        from: { x: startNode.x, y: startNode.y },
        to: { x: lastNode.x, y: lastNode.y },
        color
    });
    
    return arrows;
}

export function setShortestPathArrows(p1Path, p2Path) {
    if (!state.showPaths) {
        overlayState.pathArrows = [];
    } else {
        const p1Arrows = compressPathToContinuousArrows(p1Path, 'green');
        const p2Arrows = compressPathToContinuousArrows(p2Path, 'blue');
        overlayState.pathArrows = [...p1Arrows, ...p2Arrows];
    }
    renderArrows();
}

function isSketchWallBlocked(w) {
    if (!state || !state.hWalls || !state.vWalls) return false;
    const { x, y, type } = w;

    if (type === 'h') {
        if (state.hWalls.has(`${x},${y}`)) return true;
        if (state.hWalls.has(`${x - 1},${y}`)) return true;
        if (state.hWalls.has(`${x + 1},${y}`)) return true;
        if (state.vWalls.has(`${x},${y}`)) return true;
    } else if (type === 'v') {
        if (state.vWalls.has(`${x},${y}`)) return true;
        if (state.vWalls.has(`${x},${y - 1}`)) return true;
        if (state.vWalls.has(`${x},${y + 1}`)) return true;
        if (state.hWalls.has(`${x},${y}`)) return true;
    }

    return false;
}

export function renderArrows() {
    const svgEl = document.getElementById('board-arrows-svg');
    if (!svgEl) return;

    if (state && (state.hWalls || state.vWalls)) {
        overlayState.customSketchWalls = overlayState.customSketchWalls.filter(w => !isSketchWallBlocked(w));
        overlayState.presetStepSketchWalls = overlayState.presetStepSketchWalls.filter(w => !isSketchWallBlocked(w));
    }

    svgEl.querySelectorAll('.board-arrow-item, circle').forEach(el => el.remove());

    overlayState.presetGoalArrows.forEach(a => renderSingleArrow(svgEl, a.from, a.to, a.color, { isPreset: true }));
    overlayState.pathArrows.forEach(a => renderSingleArrow(svgEl, a.from, a.to, a.color, { isPreset: true }));
    overlayState.presetStepSketchWalls.forEach(w => renderSingleSketchWall(svgEl, w.x, w.y, w.type, w.color));
    overlayState.presetStepArrows.forEach(a => renderSingleArrow(svgEl, a.from, a.to, a.color, { isStep: true }));
    if (overlayState.stepArrow) renderSingleArrow(svgEl, overlayState.stepArrow.from, overlayState.stepArrow.to, overlayState.stepArrow.color, { isStep: true });

    overlayState.customHighlights.forEach(hl => renderSingleHighlight(svgEl, hl.x, hl.y, hl.color));
    overlayState.customSketchWalls.forEach(w => renderSingleSketchWall(svgEl, w.x, w.y, w.type, w.color));
    overlayState.customArrows.forEach(a => renderSingleArrow(svgEl, a.from, a.to, a.color, { isPreset: false }));

    if (overlayState.isRightDragging && overlayState.startCell && overlayState.currentHoverCell) {
        const { startCell, currentHoverCell, activeColor } = overlayState;
        if (startCell.x === currentHoverCell.x && startCell.y === currentHoverCell.y) {
            renderSingleHighlight(svgEl, startCell.x, startCell.y, activeColor, true);
        } else {
            renderSingleArrow(svgEl, startCell, currentHoverCell, activeColor, { isPreview: true });
        }
    }
}
