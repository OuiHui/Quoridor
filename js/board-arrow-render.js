import { parseNotation } from './notation.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const COLOR_MAP = {
    green:  { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.25)',  glow: 'rgba(34, 197, 94, 0.5)' },
    red:    { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.25)',  glow: 'rgba(239, 68, 68, 0.5)' },
    blue:   { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.25)',  glow: 'rgba(59, 130, 246, 0.5)' },
    orange: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.25)', glow: 'rgba(245, 158, 11, 0.5)' }
};

export function createSVGElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) {
        el.setAttribute(key, val);
    }
    return el;
}

export function setupGlowFilters(defs) {
    const arrowFilter = createSVGElement('filter', {
        id: 'arrow-glow', x: '-30%', y: '-30%', width: '160%', height: '160%'
    });
    arrowFilter.innerHTML = '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.6"/>';
    defs.appendChild(arrowFilter);

    const circleFilter = createSVGElement('filter', {
        id: 'circle-glow', x: '-30%', y: '-30%', width: '160%', height: '160%'
    });
    circleFilter.innerHTML = '<feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.6"/>';
    defs.appendChild(circleFilter);
}

export function getCellCenterPixels(x, y) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return null;
    const cellEl = boardEl.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
    if (!cellEl) return null;

    const boardRect = boardEl.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();

    return {
        x: cellRect.left + cellRect.width / 2 - boardRect.left - boardEl.clientLeft,
        y: cellRect.top + cellRect.height / 2 - boardRect.top - boardEl.clientTop,
        width: cellRect.width,
        height: cellRect.height
    };
}

export function getWallPixels(x, y, type) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return null;
    const boardRect = boardEl.getBoundingClientRect();
    
    if (type === 'h') {
        const edge1 = boardEl.querySelector(`.board-edge.horizontal[data-x="${x}"][data-y="${y}"]`);
        const edge2 = boardEl.querySelector(`.board-edge.horizontal[data-x="${Math.min(x + 1, 8)}"][data-y="${y}"]`);
        if (edge1 && edge2) {
            const r1 = edge1.getBoundingClientRect();
            const r2 = edge2.getBoundingClientRect();
            return {
                x: r1.left - boardRect.left - boardEl.clientLeft,
                y: r1.top - boardRect.top - boardEl.clientTop,
                width: r2.right - r1.left,
                height: r1.height
            };
        }
        const cell1 = boardEl.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
        const cell2 = boardEl.querySelector(`.board-cell[data-x="${Math.min(x + 1, 8)}"][data-y="${y}"]`);
        if (!cell1 || !cell2) return null;
        const r1 = cell1.getBoundingClientRect();
        const r2 = cell2.getBoundingClientRect();
        return {
            x: r1.left - boardRect.left - boardEl.clientLeft,
            y: r1.top - boardRect.top - boardEl.clientTop - 12,
            width: r2.right - r1.left,
            height: 12
        };
    } else {
        const edge1 = boardEl.querySelector(`.board-edge.vertical[data-x="${x}"][data-y="${y}"]`);
        const edge2 = boardEl.querySelector(`.board-edge.vertical[data-x="${x}"][data-y="${Math.min(y + 1, 8)}"]`);
        if (edge1 && edge2) {
            const r1 = edge1.getBoundingClientRect();
            const r2 = edge2.getBoundingClientRect();
            return {
                x: r1.left - boardRect.left - boardEl.clientLeft,
                y: r2.top - boardRect.top - boardEl.clientTop,
                width: r1.width,
                height: r1.bottom - r2.top
            };
        }
        const cell1 = boardEl.querySelector(`.board-cell[data-x="${x}"][data-y="${y}"]`);
        const cell2 = boardEl.querySelector(`.board-cell[data-x="${x}"][data-y="${Math.min(y + 1, 8)}"]`);
        if (!cell1 || !cell2) return null;
        const r1 = cell1.getBoundingClientRect();
        const r2 = cell2.getBoundingClientRect();
        return {
            x: r1.right - boardRect.left - boardEl.clientLeft - 6,
            y: r2.top - boardRect.top - boardEl.clientTop,
            width: 12,
            height: r1.bottom - r2.top
        };
    }
}

export function renderSingleHighlight(svgEl, x, y, colorKey, isPreview = false) {
    const center = getCellCenterPixels(x, y);
    if (!center) return;

    const colorData = COLOR_MAP[colorKey] || COLOR_MAP.green;
    const circle = createSVGElement('circle', {
        cx: center.x,
        cy: center.y,
        r: Math.min(center.width, center.height) * 0.40,
        fill: colorData.fill,
        stroke: colorData.stroke,
        'stroke-width': '3.5',
        filter: 'url(#circle-glow)'
    });

    if (isPreview) circle.setAttribute('stroke-dasharray', '5 3');
    svgEl.appendChild(circle);
}

export function renderSingleSketchWall(svgEl, x, y, type, colorKey, isPreview = false) {
    const wallPixels = getWallPixels(x, y, type);
    if (!wallPixels) return;

    const colorData = COLOR_MAP[colorKey] || COLOR_MAP.orange;
    const g = createSVGElement('g', { class: 'board-arrow-item board-sketch-wall', filter: 'url(#circle-glow)' });

    const rect = createSVGElement('rect', {
        x: wallPixels.x, y: wallPixels.y, width: wallPixels.width, height: wallPixels.height, rx: '4', ry: '4',
        fill: colorData.fill, stroke: colorData.stroke,
        'stroke-width': isPreview ? '2' : '3',
        'stroke-dasharray': isPreview ? '4 3' : '6 3',
        opacity: isPreview ? '0.6' : '0.85'
    });

    const isHorizontal = type === 'h';
    const line = createSVGElement('line', {
        x1: isHorizontal ? wallPixels.x + 4 : wallPixels.x + wallPixels.width / 2,
        y1: isHorizontal ? wallPixels.y + wallPixels.height / 2 : wallPixels.y + 4,
        x2: isHorizontal ? wallPixels.x + wallPixels.width - 4 : wallPixels.x + wallPixels.width / 2,
        y2: isHorizontal ? wallPixels.y + wallPixels.height / 2 : wallPixels.y + wallPixels.height - 4,
        stroke: colorData.stroke, 'stroke-width': '2', 'stroke-dasharray': '4 2',
        opacity: isPreview ? '0.7' : '0.95'
    });

    g.appendChild(rect);
    g.appendChild(line);
    svgEl.appendChild(g);
}

export function calculateArrowGeometry(start, end, headLength, headWidth, startOffset, endOffset) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return null;

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const x1 = start.x + ux * startOffset;
    const y1 = start.y + uy * startOffset;
    const tipX = end.x - ux * endOffset;
    const tipY = end.y - uy * endOffset;

    const baseX = tipX - ux * headLength;
    const baseY = tipY - uy * headLength;

    return {
        x1, y1, tipX, tipY, baseX, baseY, ux, uy, nx, ny,
        leftX: baseX + nx * (headWidth / 2),
        leftY: baseY + ny * (headWidth / 2),
        rightX: baseX - nx * (headWidth / 2),
        rightY: baseY - ny * (headWidth / 2)
    };
}

export function renderSingleArrow(svgEl, from, to, colorKey, { isPreset = false, isPreview = false } = {}) {
    const start = getCellCenterPixels(from.x, from.y);
    const end = getCellCenterPixels(to.x, to.y);
    if (!start || !end) return;

    const colorData = COLOR_MAP[colorKey] || COLOR_MAP.green;
    const headLength = isPreset ? 14 : 16;
    const headWidth = isPreset ? 12 : 14;

    const geom = calculateArrowGeometry(
        start, end, headLength, headWidth,
        start.width * 0.18, end.width * 0.20
    );
    if (!geom) return;

    const g = createSVGElement('g', { class: 'board-arrow-item', filter: 'url(#arrow-glow)' });
    const thickness = isPreset ? 5.5 : 6.5;
    const halfThick = thickness / 2;

    if (isPreset) {
        const line = createSVGElement('line', {
            x1: geom.x1, y1: geom.y1,
            x2: geom.baseX + geom.ux * 2, y2: geom.baseY + geom.uy * 2,
            stroke: colorData.stroke, 'stroke-width': thickness,
            'stroke-linecap': 'round', opacity: isPreview ? '0.6' : '0.8',
            'stroke-dasharray': '7 4'
        });
        g.appendChild(line);
    } else {
        const x1_l = geom.x1 + geom.nx * halfThick;
        const y1_l = geom.y1 + geom.ny * halfThick;
        const x1_r = geom.x1 - geom.nx * halfThick;
        const y1_r = geom.y1 - geom.ny * halfThick;

        const x2_l = geom.baseX + geom.ux * 2 + geom.nx * halfThick;
        const y2_l = geom.baseY + geom.uy * 2 + geom.ny * halfThick;
        const x2_r = geom.baseX + geom.ux * 2 - geom.nx * halfThick;
        const y2_r = geom.baseY + geom.uy * 2 - geom.ny * halfThick;

        const shaftPoly = createSVGElement('polygon', {
            points: `${x1_l},${y1_l} ${x2_l},${y2_l} ${x2_r},${y2_r} ${x1_r},${y1_r}`,
            fill: colorData.stroke, opacity: isPreview ? '0.6' : '0.9'
        });
        g.appendChild(shaftPoly);
    }

    const polygon = createSVGElement('polygon', {
        points: `${geom.tipX},${geom.tipY} ${geom.leftX},${geom.leftY} ${geom.rightX},${geom.rightY}`,
        fill: colorData.stroke, opacity: isPreview ? '0.6' : '0.9'
    });

    g.appendChild(polygon);
    svgEl.appendChild(g);
}
