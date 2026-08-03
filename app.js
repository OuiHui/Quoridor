/**
 * Quoridor Playbook & Trainer
 * Modular Mediator and Entry Point
 */

// Import HTML Templates
import headerHtml from './components/header.html?raw';
import playbookHtml from './components/playbook-panel.html?raw';
import boardHtml from './components/board-container.html?raw';
import diagnosticsHtml from './components/diagnostics-panel.html?raw';
import modalHtml from './components/modal.html?raw';
import trainingWatchHtml from './components/training-watch.html?raw';
import trainingStatsPanelHtml from './components/training-stats-panel.html?raw';

// Import Core Modules
import { renderBoard, updatePawnPositions, renderPlacedWalls } from './js/ui-board.js';
import { updateUI, logAction, clearLogs } from './js/ui-diagnostics.js';
import { initTrainingWatch, showTrainingWatch } from './js/training-watch.js';
import { initPlaybook } from './js/playbook.js';
import { loadONNXModel } from './js/model-loader.js';
import { initUIEvents, toggleHintMode, setInteractionMode } from './js/ui-events.js';
import { initKeyboardControls } from './js/keyboard-controls.js';
import { initCustomDropdowns } from './js/ui-dropdown.js';
import {
    handleCellClick,
    handleCellMouseEnter,
    handleEdgeMouseMove,
    handleEdgeMouseLeave,
    handleEdgeClick,
    handleJointMouseMove,
    handleJointMouseLeave,
    handleJointClick
} from './js/board-interaction.js';
import {
    executePawnMove,
    executeWallPlacement,
    undoMove,
    resetBoardState,
    setGameMode,
    jumpToHistoryState
} from './js/game.js';

function injectTemplates() {
    const headerEl = document.querySelector('.app-header');
    if (headerEl) headerEl.innerHTML = headerHtml;

    const playbookEl = document.querySelector('.left-panel');
    if (playbookEl) playbookEl.innerHTML = playbookHtml;

    const boardContainerEl = document.querySelector('.board-container');
    if (boardContainerEl) boardContainerEl.innerHTML = boardHtml;

    const diagnosticsEl = document.querySelector('.right-panel');
    if (diagnosticsEl) diagnosticsEl.innerHTML = diagnosticsHtml;

    const modalEl = document.getElementById('modal-container');
    if (modalEl) modalEl.innerHTML = modalHtml;

    const twMount = document.createElement('div');
    twMount.innerHTML = trainingWatchHtml;
    document.body.appendChild(twMount.firstElementChild);
    initTrainingWatch(trainingStatsPanelHtml);

    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const watchBtn = document.createElement('button');
        watchBtn.id = 'btn-watch-training';
        watchBtn.className = 'btn-watch-training';
        watchBtn.innerHTML = '⬡ Watch Training';
        watchBtn.addEventListener('click', () => showTrainingWatch());
        headerRight.prepend(watchBtn);
    }
}

function init() {
    injectTemplates();

    renderBoard({
        onCellClick: handleCellClick,
        onCellMouseEnter: handleCellMouseEnter,
        onEdgeMouseMove: handleEdgeMouseMove,
        onEdgeMouseLeave: handleEdgeMouseLeave,
        onEdgeClick: handleEdgeClick,
        onJointMouseMove: handleJointMouseMove,
        onJointMouseLeave: handleJointMouseLeave,
        onJointClick: handleJointClick
    });

    initPlaybook({
        executePawnMove,
        executeWallPlacement,
        undoMove,
        updateUI,
        setGameMode,
        resetBoardState,
        renderPlacedWalls,
        updatePawnPositions,
        logAction,
        clearLogs,
        jumpToHistoryState
    });

    initUIEvents();
    initKeyboardControls({ toggleHintMode, setInteractionMode });
    initCustomDropdowns();
    setGameMode('sandbox');
}

window.addEventListener('DOMContentLoaded', () => {
    loadONNXModel().finally(init);
});
