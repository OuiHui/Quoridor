import { state } from './state.js';
import { playSound } from './sfx.js';
import { logAction } from './ui-history.js';

export function triggerGameOver(title, message) {
    playSound('win');
    logAction(title, 'system');

    const modal = document.getElementById('modal-container');
    if (modal) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        modal.classList.remove('hidden');
    }
}

export function checkGameVictory(p1Len, p2Len) {
    if (state.trainingWatchActive) return;
    if (p1Len === 0) {
        triggerGameOver("Player 1 Wins!", "Player 1 (Blue) successfully navigated to the baseline row.");
    } else if (p2Len === 0) {
        triggerGameOver("Player 2 Wins!", "Player 2 (Amber) successfully navigated to the baseline row.");
    }
}
