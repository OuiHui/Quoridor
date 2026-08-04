/**
 * Board Arrows & Visual Overlay Module
 * Allows drawing right-click arrows and cell highlights (chess.com style)
 * as well as rendering preset opening goal arrows for Playbook lines.
 */

import { parseNotation } from './notation.js';

// Internal state for custom user-drawn arrows and highlights
let customArrows = [];      // Array of { from: {x, y}, to: {x, y}, color: 'green'|'blue'|'red'|'orange' }
let customHighlights = [];  // Array of { x, y, color: 'green'|'blue'|'red'|'orange' }
let presetGoalArrows = [];  // Array of { from: {x, y}, to: {x, y}, color: 'green'|'blue'|'red'|'orange' }

let isRightDragging = false;
let startCell = null;
let currentHoverCell = null;
let activeColor = 'green';

const COLOR_MAP = {
    green:  { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.25)',  glow: 'rgba(34, 197, 94, 0.5)' },
    red:    { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.25)',  glow: 'rgba(239, 68, 68, 0.5)' },
    blue:   { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.25)',  glow: 'rgba(59, 130, 246, 0.5)' },
    orange: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.25)', glow: 'rgba(245, 158, 11, 0.5)' }
};

/**
 * Initializes the SVG overlay layer on the board and attaches mouse event listeners.
 */
export function initBoardArrows() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    // Remove old SVG if exists
    let svgEl = document.getElementById('board-arrows-svg');
    if (svgEl) svgEl.remove();

    // Create fresh SVG overlay
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('id', 'board-arrows-svg');
    svgEl.setAttribute('class', 'board-arrows-svg');
    svgEl.style.position = 'absolute';
    svgEl.style.top = '0';
    svgEl.style.left = '0';
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';
    svgEl.style.pointerEvents = 'none';
    svgEl.style.zIndex = '15';

    // SVG Defs for glow filters
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Glow filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'arrow-glow');
    filter.setAttribute('x', '-30%');
    filter.setAttribute('y', '-30%');
    filter.setAttribute('width', '160%');
    filter.setAttribute('height', '160%');
    filter.innerHTML = `<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.6"/>`;
    defs.appendChild(filter);

    svgEl.appendChild(defs);
    boardEl.appendChild(svgEl);

    // Contextmenu prevention on board and window while dragging
    boardEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    window.addEventListener('contextmenu', (e) => {
        if (isRightDragging) {
            e.preventDefault();
            return false;
        }
    });

    // Mousedown (right click to draw arrows)
    boardEl.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            // Right click
            e.preventDefault();
            const cell = getCellFromEvent(e);
            if (cell) {
                isRightDragging = true;
                startCell = cell;
                currentHoverCell = cell;
                
                // Determine color based on modifiers
                if (e.altKey) activeColor = 'red';
                else if (e.shiftKey) activeColor = 'blue';
                else if (e.ctrlKey) activeColor = 'orange';
                else activeColor = 'green';
                
                renderArrows();
            }
        } else if (e.button === 0) {
            // Left click clears custom arrows
            if (customArrows.length > 0 || customHighlights.length > 0) {
                clearCustomArrows();
            }
        }
    });

    // Mousemove for drag preview
    window.addEventListener('mousemove', (e) => {
        if (!isRightDragging || !startCell) return;
        const cell = getCellFromEvent(e);
        if (cell && (cell.x !== currentHoverCell?.x || cell.y !== currentHoverCell?.y)) {
            currentHoverCell = cell;
            renderArrows();
        }
    });

    // Mouseup to finalize arrow or circle highlight
    window.addEventListener('mouseup', (e) => {
        if (e.button === 2 && isRightDragging && startCell) {
            e.preventDefault();
            const endCell = getCellFromEvent(e) || currentHoverCell || startCell;
            
            if (startCell.x === endCell.x && startCell.y === endCell.y) {
                // Single cell right click -> toggle circle highlight
                toggleHighlight(startCell, activeColor);
            } else {
                // Dragged from cell A to cell B -> toggle arrow
                toggleArrow(startCell, endCell, activeColor);
            }
            
            isRightDragging = false;
            startCell = null;
            currentHoverCell = null;
            renderArrows();
        }
    });

    // Resize handler
    window.addEventListener('resize', () => {
        renderArrows();
    });
}

/**
 * Extracts board cell coordinates {x, y} from mouse event.
 * Uses Euclidean distance to all 81 cell centers for maximum precision across grid wall tracks.
 */
function getCellFromEvent(e) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return null;

    const boardRect = boardEl.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Check if mouse is outside board box + buffer
    if (
        clientX < boardRect.left - 50 ||
        clientX > boardRect.right + 50 ||
        clientY < boardRect.top - 50 ||
        clientY > boardRect.bottom + 50
    ) {
        return null;
    }

    let closestCell = null;
    let minSqDist = Infinity;

    const cells = boardEl.querySelectorAll('.board-cell');
    cells.forEach(cellEl => {
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

/**
 * Toggles a circle highlight on a single cell.
 */
function toggleHighlight(cell, color) {
    const idx = customHighlights.findIndex(h => h.x === cell.x && h.y === cell.y);
    if (idx >= 0) {
        if (customHighlights[idx].color === color) {
            customHighlights.splice(idx, 1);
        } else {
            customHighlights[idx].color = color;
        }
    } else {
        customHighlights.push({ x: cell.x, y: cell.y, color });
    }
}

/**
 * Toggles an arrow between two cells.
 */
function toggleArrow(from, to, color) {
    const idx = customArrows.findIndex(a => 
        a.from.x === from.x && a.from.y === from.y &&
        a.to.x === to.x && a.to.y === to.y
    );
    if (idx >= 0) {
        if (customArrows[idx].color === color) {
            customArrows.splice(idx, 1);
        } else {
            customArrows[idx].color = color;
        }
    } else {
        customArrows.push({ from: { ...from }, to: { ...to }, color });
    }
}

/**
 * Clears all user-drawn arrows and highlights.
 */
export function clearCustomArrows() {
    customArrows = [];
    customHighlights = [];
    renderArrows();
}

/**
 * Sets preset goal arrows (for Playbook opening lines).
 * Accepts array of { from: 'e1'|{x,y}, to: 'e5'|{x,y}, color: 'green' }
 */
export function setPresetGoalArrows(arrows) {
    if (!arrows || !Array.isArray(arrows)) {
        presetGoalArrows = [];
    } else {
        presetGoalArrows = arrows.map(a => {
            let from = typeof a.from === 'string' ? parseNotation(a.from) : a.from;
            let to = typeof a.to === 'string' ? parseNotation(a.to) : a.to;
            if (!from || !to) return null;
            return {
                from: { x: from.x, y: from.y },
                to: { x: to.x, y: to.y },
                color: a.color || 'green'
            };
        }).filter(Boolean);
    }
    renderArrows();
}

/**
 * Gets exact pixel center of cell (x, y) relative to #board element.
 */
function getCellCenterPixels(x, y) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return null;
    const cellEl = boardEl.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (!cellEl) return null;

    const boardRect = boardEl.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();

    return {
        x: cellRect.left + cellRect.width / 2 - boardRect.left,
        y: cellRect.top + cellRect.height / 2 - boardRect.top,
        width: cellRect.width,
        height: cellRect.height
    };
}

/**
 * Re-renders all SVG arrows and highlights.
 */
export function renderArrows() {
    const svgEl = document.getElementById('board-arrows-svg');
    if (!svgEl) return;

    // Clear existing dynamic arrow/highlight items except <defs>
    svgEl.querySelectorAll('.board-arrow-item, circle').forEach(el => el.remove());

    // 1. Render Preset Opening Goal Arrows
    presetGoalArrows.forEach(arrow => {
        renderSingleArrow(svgEl, arrow.from, arrow.to, arrow.color, { isPreset: true });
    });

    // 2. Render Custom Highlights
    customHighlights.forEach(hl => {
        renderSingleHighlight(svgEl, hl.x, hl.y, hl.color);
    });

    // 3. Render Custom User Arrows
    customArrows.forEach(arrow => {
        renderSingleArrow(svgEl, arrow.from, arrow.to, arrow.color, { isPreset: false });
    });

    // 4. Render Active Drag Preview Arrow
    if (isRightDragging && startCell && currentHoverCell) {
        if (startCell.x === currentHoverCell.x && startCell.y === currentHoverCell.y) {
            renderSingleHighlight(svgEl, startCell.x, startCell.y, activeColor, true);
        } else {
            renderSingleArrow(svgEl, startCell, currentHoverCell, activeColor, { isPreview: true });
        }
    }
}

/**
 * Renders a circle highlight around a cell.
 */
function renderSingleHighlight(svgEl, x, y, colorKey, isPreview = false) {
    const center = getCellCenterPixels(x, y);
    if (!center) return;

    const colorData = COLOR_MAP[colorKey] || COLOR_MAP.green;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', center.x);
    circle.setAttribute('cy', center.y);
    circle.setAttribute('r', center.width * 0.42);
    circle.setAttribute('fill', colorData.fill);
    circle.setAttribute('stroke', colorData.stroke);
    circle.setAttribute('stroke-width', '3.5');
    if (isPreview) circle.setAttribute('stroke-dasharray', '5 3');
    circle.setAttribute('filter', 'url(#arrow-glow)');

    svgEl.appendChild(circle);
}

/**
 * Renders a single arrow line with a 2D shaft polygon and SVG arrowhead polygon from (from.x, from.y) to (to.x, to.y).
 * Guarantees zero clipping bugs on horizontal (dy=0) or vertical (dx=0) line filters.
 */
function renderSingleArrow(svgEl, from, to, colorKey, { isPreset = false, isPreview = false } = {}) {
    const start = getCellCenterPixels(from.x, from.y);
    const end = getCellCenterPixels(to.x, to.y);
    if (!start || !end) return;

    const colorData = COLOR_MAP[colorKey] || COLOR_MAP.green;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const headLength = isPreset ? 14 : 16;
    const headWidth = isPreset ? 12 : 14;

    const startOffset = start.width * 0.18;
    const endOffset = end.width * 0.20;

    // Start point of arrow shaft
    const x1 = start.x + ux * startOffset;
    const y1 = start.y + uy * startOffset;

    // Tip point of arrowhead
    const tipX = end.x - ux * endOffset;
    const tipY = end.y - uy * endOffset;

    // Base center of arrowhead
    const baseX = tipX - ux * headLength;
    const baseY = tipY - uy * headLength;

    // Left and right corners of arrowhead base
    const leftX = baseX + nx * (headWidth / 2);
    const leftY = baseY + ny * (headWidth / 2);
    const rightX = baseX - nx * (headWidth / 2);
    const rightY = baseY - ny * (headWidth / 2);

    // Group element for the arrow (attaches glow filter to combined 2D bounds of shaft + arrowhead)
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'board-arrow-item');
    g.setAttribute('filter', 'url(#arrow-glow)');

    const thickness = isPreset ? 5.5 : 6.5;
    const halfThick = thickness / 2;

    if (isPreset) {
        // Dashed line shaft for preset goal arrows
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', baseX + ux * 2);
        line.setAttribute('y2', baseY + uy * 2);
        line.setAttribute('stroke', colorData.stroke);
        line.setAttribute('stroke-width', thickness);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', isPreview ? '0.6' : '0.9');
        line.setAttribute('stroke-dasharray', '7 4');
        g.appendChild(line);
    } else {
        // 2D Polygon shaft for solid custom arrows (100% immune to 1D line SVG filter clipping bugs)
        const x1_l = x1 + nx * halfThick;
        const y1_l = y1 + ny * halfThick;
        const x1_r = x1 - nx * halfThick;
        const y1_r = y1 - ny * halfThick;

        const x2_l = baseX + ux * 2 + nx * halfThick;
        const y2_l = baseY + uy * 2 + ny * halfThick;
        const x2_r = baseX + ux * 2 - nx * halfThick;
        const y2_r = baseY + uy * 2 - ny * halfThick;

        const shaftPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        shaftPoly.setAttribute('points', `${x1_l},${y1_l} ${x2_l},${y2_l} ${x2_r},${y2_r} ${x1_r},${y1_r}`);
        shaftPoly.setAttribute('fill', colorData.stroke);
        shaftPoly.setAttribute('opacity', isPreview ? '0.6' : '0.9');
        g.appendChild(shaftPoly);
    }

    // Arrowhead Polygon
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`);
    polygon.setAttribute('fill', colorData.stroke);
    polygon.setAttribute('opacity', isPreview ? '0.6' : '0.9');

    g.appendChild(polygon);
    svgEl.appendChild(g);
}
