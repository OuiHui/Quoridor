import { state } from './state.js';

let historyJumpCallback = null;

export function setHistoryJumpCallback(cb) {
    historyJumpCallback = cb;
}

export function renderMatchHistoryUI() {
    const logsContainer = document.getElementById('game-logs');
    const counterEl = document.getElementById('history-counter');
    const blunderDetailEl = document.getElementById('history-blunder-detail');
    if (!logsContainer) return;

    if (counterEl) {
        counterEl.textContent = `Move ${state.historyIndex} / ${state.history.length}`;
    }

    const btnFirst = document.getElementById('btn-history-first');
    const btnPrev = document.getElementById('btn-history-prev');
    const btnNext = document.getElementById('btn-history-next');
    const btnLatest = document.getElementById('btn-history-latest');

    if (btnFirst) btnFirst.disabled = state.historyIndex <= 0;
    if (btnPrev) btnPrev.disabled = state.historyIndex <= 0;
    if (btnNext) btnNext.disabled = state.historyIndex >= state.history.length;
    if (btnLatest) btnLatest.disabled = state.historyIndex >= state.history.length;

    if (state.history.length === 0) {
        logsContainer.innerHTML = '<div class="muted">No moves recorded yet.</div>';
        if (blunderDetailEl) blunderDetailEl.classList.add('hidden');
        return;
    }

    let html = '';
    state.history.forEach((item, idx) => {
        const moveNum = idx + 1;
        const turnNum = Math.ceil(moveNum / 2);
        const isP1 = item.player === 1;
        const prefix = isP1 ? `${turnNum}.` : `${turnNum}...`;
        const isActive = state.historyIndex === moveNum;

        let qualityBadgeHtml = '';
        if (item.moveQuality) {
            const q = item.moveQuality;
            qualityBadgeHtml = `<span class="hist-quality-tag ${q.classification}">${q.text}</span>`;
        }

        html += `
            <div class="hist-move-item p${item.player} ${isActive ? 'active' : ''}" data-index="${moveNum}">
                <div class="hist-move-header">
                    <span class="hist-turn-prefix">${prefix}</span>
                    <span class="hist-player-badge p${item.player}">P${item.player}</span>
                    <span class="hist-notation">${item.notation}</span>
                </div>
                <div class="hist-move-meta">
                    ${qualityBadgeHtml}
                </div>
            </div>
        `;
    });

    logsContainer.innerHTML = html;

    logsContainer.querySelectorAll('.hist-move-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.index);
            if (historyJumpCallback && !isNaN(idx)) {
                historyJumpCallback(idx);
            }
        });
    });

    const activeEl = logsContainer.querySelector('.hist-move-item.active');
    if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    if (blunderDetailEl) {
        const currentItem = state.historyIndex > 0 ? state.history[state.historyIndex - 1] : null;
        if (currentItem && currentItem.moveQuality && (currentItem.moveQuality.classification === 'blunder' || currentItem.moveQuality.classification === 'inaccuracy')) {
            const q = currentItem.moveQuality;
            blunderDetailEl.innerHTML = `
                <div class="blunder-card ${q.classification}">
                    <div class="blunder-card-header">
                        <span class="blunder-badge ${q.classification}">${q.text.toUpperCase()}</span>
                        <span class="blunder-move-num">Move #${state.historyIndex}</span>
                    </div>
                    <div class="blunder-card-body">
                        <div class="blunder-row">
                            <span class="blunder-label">Played:</span>
                            <span class="blunder-val played">${currentItem.notation}</span>
                        </div>
                        ${q.bestMoveNotation ? `
                        <div class="blunder-row">
                            <span class="blunder-label">Best Move:</span>
                            <span class="blunder-val recommended">${q.bestMoveNotation}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            blunderDetailEl.classList.remove('hidden');
        } else {
            blunderDetailEl.classList.add('hidden');
        }
    }
}

export function logAction(text, type) {
    renderMatchHistoryUI();
}

export function clearLogs() {
    const logsContainer = document.getElementById('game-logs');
    if (logsContainer) {
        logsContainer.innerHTML = '';
    }
}

export function removeLastLog() {
    const logsContainer = document.getElementById('game-logs');
    if (logsContainer && logsContainer.lastElementChild) {
        logsContainer.removeChild(logsContainer.lastElementChild);
    }
}
