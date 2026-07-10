/**
 * Training Watch Banner — polls training_state.json and renders moves onto the main board
 */

import { state } from './state.js';
import { updatePawnPositions, renderPlacedWalls } from './ui-board.js';
import { updateUI, logAction } from './ui-diagnostics.js';
import { resetGame } from './game.js';

const POLL_MS = 500;
const STATE_URL = '/training_state.json';

let pollTimer = null;
let lastTimestamp = null;
let originalMode = 'sandbox';

// Render the incoming game state onto the main board UI
function renderTrainingStateOnMainBoard(data) {
    // 1. Update Positions
    state.p1Pos = { x: data.p1_pos[0], y: data.p1_pos[1] };
    state.p2Pos = { x: data.p2_pos[0], y: data.p2_pos[1] };

    // 2. Clear & Update Placed Walls
    state.hWalls.clear();
    state.vWalls.clear();

    (data.h_walls || []).forEach(([wx, wy]) => {
        const owner = data.h_wall_owners?.[`${wx},${wy}`] || 1;
        state.hWalls.set(`${wx},${wy}`, owner);
    });
    (data.v_walls || []).forEach(([wx, wy]) => {
        const owner = data.v_wall_owners?.[`${wx},${wy}`] || 1;
        state.vWalls.set(`${wx},${wy}`, owner);
    });

    // 3. Update Wall Counts & Turns
    state.p1Walls = data.p1_walls ?? 10;
    state.p2Walls = data.p2_walls ?? 10;
    state.turn = data.current_player === 'P2' ? 2 : 1;

    // 4. Update elements in the UI
    updatePawnPositions();
    renderPlacedWalls();
    updateUI();

    // 5. Update Banner stats
    document.getElementById('tw-move-count').textContent = data.move_count ?? 0;
    document.getElementById('tw-last-move').textContent = data.last_move || '—';

    // 6. Update Left Panel Metrics (Tally and ML losses)
    if (data.metrics) {
        const tallyP1 = document.getElementById('tally-p1');
        const tallyP2 = document.getElementById('tally-p2');
        const tallyDraws = document.getElementById('tally-draws');
        const metricEpoch = document.getElementById('metric-epoch');
        const metricPLoss = document.getElementById('metric-p-loss');
        const metricVLoss = document.getElementById('metric-v-loss');
        const metricEntropy = document.getElementById('metric-entropy');
        const metricLr = document.getElementById('metric-lr');

        if (tallyP1) tallyP1.textContent = data.metrics.p1_wins ?? 0;
        if (tallyP2) tallyP2.textContent = data.metrics.p2_wins ?? 0;
        if (tallyDraws) tallyDraws.textContent = data.metrics.draws ?? 0;

        if (metricEpoch) {
            metricEpoch.textContent = `${data.metrics.epoch ?? 0} / ${data.metrics.total_epochs ?? 50}`;
        }
        if (metricPLoss) {
            metricPLoss.textContent = (data.metrics.policy_loss ?? 0.0).toFixed(4);
        }
        if (metricVLoss) {
            metricVLoss.textContent = (data.metrics.value_loss ?? 0.0).toFixed(4);
        }
        if (metricEntropy) {
            metricEntropy.textContent = (data.metrics.entropy ?? 0.0).toFixed(4);
        }
        if (metricLr) {
            metricLr.textContent = (data.metrics.lr ?? 0.001).toFixed(6);
        }

        // Active Game Info stats in panel
        const watchP1 = document.getElementById('watch-p1-dist');
        const watchP2 = document.getElementById('watch-p2-dist');
        const watchMove = document.getElementById('watch-move-count');
        const watchLast = document.getElementById('watch-last-move');

        const p1Dist = document.getElementById('p1-path-len')?.textContent || '8';
        const p2Dist = document.getElementById('p2-path-len')?.textContent || '8';

        if (watchP1) watchP1.textContent = p1Dist;
        if (watchP2) watchP2.textContent = p2Dist;
        if (watchMove) watchMove.textContent = data.move_count ?? 0;
        if (watchLast) watchLast.textContent = data.last_move || 'Waiting for game...';
    }
}

function applyBannerStatus(data) {
    const liveDot = document.getElementById('tw-live-dot');
    const statusBadge = document.getElementById('tw-status-badge');
    const watchBtn = document.getElementById('btn-watch-training');

    const isPlaying = data.status === 'playing';
    const isEnded = data.status === 'game_over';

    liveDot.className = 'tw-live-dot' + (isPlaying ? ' active' : isEnded ? ' ended' : '');
    statusBadge.textContent = isPlaying ? 'Live' : isEnded ? 'Game Over' : 'Waiting...';
    statusBadge.className = 'tw-status-badge' + (isPlaying ? ' playing' : isEnded ? ' ended' : '');

    if (watchBtn) {
        watchBtn.classList.toggle('live', isPlaying);
    }
}

async function poll() {
    try {
        const res = await fetch(`${STATE_URL}?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();

        applyBannerStatus(data);

        // Only redraw if the training game made progress
        if (data.timestamp !== lastTimestamp) {
            lastTimestamp = data.timestamp;
            renderTrainingStateOnMainBoard(data);
            if (data.last_move) {
                logAction(`[AlphaZero Self-Play] ${data.last_move}`, 'system');
            }
        }
    } catch (e) {
        console.error("Watch poll error:", e);
    }
}

let statsPanelHtml = '';
let originalLeftPanelHtml = '';

export function initTrainingWatch(statsPanelHtmlRaw) {
    statsPanelHtml = statsPanelHtmlRaw;
    document.getElementById('tw-close-btn')?.addEventListener('click', hideTrainingWatch);
}

export function showTrainingWatch() {
    if (state.trainingWatchActive) return;

    // Store original mode so we can restore it on exit
    originalMode = state.gameMode;
    state.gameMode = 'sandbox'; // set to sandbox internally to prevent MCTS/AI triggers
    state.trainingWatchActive = true;

    // Disable visual clues like hints
    state.hintOn = false;
    const hintBtn = document.getElementById('btn-hint');
    if (hintBtn) {
        hintBtn.textContent = 'Hint: Off';
        hintBtn.className = 'btn btn-secondary btn-sm';
    }

    document.getElementById('training-watch-overlay')?.classList.remove('hidden');
    
    // Swap Left Panel content with Training Stats Panel
    const leftPanel = document.querySelector('.left-panel');
    if (leftPanel) {
        originalLeftPanelHtml = leftPanel.innerHTML;
        leftPanel.innerHTML = statsPanelHtml;
    }

    logAction('Training Watch Mode activated. Inputs locked.', 'system');

    // Run poll loop
    if (!pollTimer) {
        pollTimer = setInterval(poll, POLL_MS);
        poll();
    }
}

export function hideTrainingWatch() {
    if (!state.trainingWatchActive) return;

    state.trainingWatchActive = false;
    state.gameMode = originalMode;

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    document.getElementById('training-watch-overlay')?.classList.add('hidden');
    
    // Restore original playbook panel
    const leftPanel = document.querySelector('.left-panel');
    if (leftPanel && originalLeftPanelHtml) {
        leftPanel.innerHTML = originalLeftPanelHtml;
    }

    const watchBtn = document.getElementById('btn-watch-training');
    if (watchBtn) watchBtn.classList.remove('live');

    logAction('Training Watch Mode deactivated. Resetting board.', 'system');
    resetGame();
}
