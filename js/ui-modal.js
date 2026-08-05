import { state } from './state.js';
import { playSound } from './sfx.js';
import { logAction } from './ui-history.js';
import { importGameFromJSON } from './game.js';

export function triggerGameOver(title, message) {
    playSound('win');
    logAction(title, 'system');

    const modal = document.getElementById('modal-container');
    if (modal) {
        modal.innerHTML = `
            <div class="modal-card">
                <h3 id="modal-title">${title}</h3>
                <p id="modal-message">${message}</p>
                <div class="modal-buttons">
                    <button class="btn btn-primary" id="modal-btn-restart">Play Again</button>
                    <button class="btn btn-secondary" id="modal-btn-close">Close</button>
                </div>
            </div>
        `;
        document.getElementById('modal-btn-restart').addEventListener('click', () => {
            modal.classList.add('hidden');
            if (window.resetGameCallback) window.resetGameCallback();
        });
        document.getElementById('modal-btn-close').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
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

export function getGameStateExportJSON() {
    const hWallsArr = Array.from(state.hWalls.entries()).map(([k, p]) => `${k}:${p}`);
    const vWallsArr = Array.from(state.vWalls.entries()).map(([k, p]) => `${k}:${p}`);

    const historyFormatted = state.history.map(item => ({
        id: item.id,
        player: item.player,
        type: item.type,
        notation: item.notation,
        evalScore: item.evalScore,
        moveQuality: item.moveQuality ? item.moveQuality.classification : null
    }));

    return {
        version: "1.0",
        timestamp: new Date().toISOString(),
        gameMode: state.gameMode,
        turn: state.turn,
        p1Pos: state.p1Pos,
        p2Pos: state.p2Pos,
        p1Walls: state.p1Walls,
        p2Walls: state.p2Walls,
        hWalls: hWallsArr,
        vWalls: vWallsArr,
        historyIndex: state.historyIndex,
        history: historyFormatted
    };
}

export function getGameStateExportText() {
    const json = getGameStateExportJSON();
    const colNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const p1Coord = `${colNames[json.p1Pos.x]}${json.p1Pos.y + 1}`;
    const p2Coord = `${colNames[json.p2Pos.x]}${json.p2Pos.y + 1}`;

    let text = `Quoridor Game State Export\n`;
    text += `=========================\n`;
    text += `Mode: ${json.gameMode} | Current Turn: P${json.turn}\n`;
    text += `P1 Position: ${p1Coord} (Walls left: ${json.p1Walls})\n`;
    text += `P2 Position: ${p2Coord} (Walls left: ${json.p2Walls})\n`;
    text += `Horizontal Walls (${json.hWalls.length}): ${json.hWalls.length ? json.hWalls.join(', ') : 'None'}\n`;
    text += `Vertical Walls (${json.vWalls.length}): ${json.vWalls.length ? json.vWalls.join(', ') : 'None'}\n\n`;
    text += `Move History (${json.history.length} moves):\n`;

    json.history.forEach((m, idx) => {
        const moveNum = idx + 1;
        const turnNum = Math.ceil(moveNum / 2);
        const prefix = m.player === 1 ? `${turnNum}.` : `${turnNum}...`;
        let evalStr = '0.0';
        if (m.evalScore === Infinity) evalStr = '#1';
        else if (m.evalScore === -Infinity) evalStr = '#2';
        else if (m.evalScore !== null && m.evalScore !== undefined) {
            const v = m.evalScore / 10;
            evalStr = v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
        }
        const qualityStr = m.moveQuality ? ` [${m.moveQuality}]` : '';
        text += `${prefix} P${m.player}: ${m.notation} (Eval: ${evalStr})${qualityStr}\n`;
    });

    return text;
}

export function showExportModal() {
    const modal = document.getElementById('modal-container');
    if (!modal) return;

    const textData = getGameStateExportText();
    const jsonData = JSON.stringify(getGameStateExportJSON(), null, 2);

    modal.innerHTML = `
        <div class="modal-card export-modal-card">
            <div class="export-modal-header">
                <h3>Export Game State</h3>
                <span class="export-subtitle">Copy formatted summary or JSON data below</span>
            </div>
            <div class="export-tabs">
                <button class="export-tab-btn active" id="tab-btn-text">Summary Text</button>
                <button class="export-tab-btn" id="tab-btn-json">Raw JSON</button>
            </div>
            <div class="export-content-container">
                <textarea id="export-textarea" readonly class="export-textarea">${textData}</textarea>
            </div>
            <div class="modal-buttons export-modal-buttons">
                <button class="btn btn-primary" id="btn-copy-export">Copy to Clipboard</button>
                <button class="btn btn-secondary" id="btn-close-export">Close</button>
            </div>
        </div>
    `;

    let activeTab = 'text';
    const textarea = document.getElementById('export-textarea');
    const tabBtnText = document.getElementById('tab-btn-text');
    const tabBtnJson = document.getElementById('tab-btn-json');
    const copyBtn = document.getElementById('btn-copy-export');
    const closeBtn = document.getElementById('btn-close-export');

    tabBtnText.addEventListener('click', () => {
        activeTab = 'text';
        tabBtnText.classList.add('active');
        tabBtnJson.classList.remove('active');
        textarea.value = textData;
    });

    tabBtnJson.addEventListener('click', () => {
        activeTab = 'json';
        tabBtnJson.classList.add('active');
        tabBtnText.classList.remove('active');
        textarea.value = jsonData;
    });

    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(textarea.value);
            const origText = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied!';
            copyBtn.classList.add('btn-success');
            setTimeout(() => {
                copyBtn.textContent = origText;
                copyBtn.classList.remove('btn-success');
            }, 2000);
        } catch (e) {
            textarea.select();
            document.execCommand('copy');
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
}

export function showImportModal() {
    const modal = document.getElementById('modal-container');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-card export-modal-card import-modal-card">
            <div class="export-modal-header">
                <h3>Import Game JSON</h3>
                <span class="export-subtitle">Paste game JSON data or select a JSON file to analyze</span>
            </div>
            <div class="import-file-section">
                <span class="import-file-label" id="import-file-name">No file chosen</span>
                <button class="import-file-btn" id="btn-browse-file">Choose File...</button>
                <input type="file" id="input-import-file" accept=".json" style="display: none;">
            </div>
            <div class="export-content-container">
                <textarea id="import-textarea" class="export-textarea" placeholder='Paste exported game JSON or moves array here, e.g. ["e2", "e8", "e3h"]...'></textarea>
            </div>
            <div id="import-error-container" class="import-error-banner hidden"></div>
            <div class="modal-buttons export-modal-buttons">
                <button class="btn btn-primary" id="btn-do-import">Import & Analyze</button>
                <button class="btn btn-secondary" id="btn-close-import">Cancel</button>
            </div>
        </div>
    `;

    const textarea = document.getElementById('import-textarea');
    const browseBtn = document.getElementById('btn-browse-file');
    const fileInput = document.getElementById('input-import-file');
    const fileNameSpan = document.getElementById('import-file-name');
    const importBtn = document.getElementById('btn-do-import');
    const closeBtn = document.getElementById('btn-close-import');
    const errorContainer = document.getElementById('import-error-container');

    browseBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameSpan.textContent = file.name;
            const reader = new FileReader();
            reader.onload = (evt) => {
                textarea.value = evt.target.result;
            };
            reader.readAsText(file);
        }
    });

    importBtn.addEventListener('click', () => {
        errorContainer.classList.add('hidden');
        errorContainer.textContent = '';

        const rawText = textarea.value.trim();
        if (!rawText) {
            errorContainer.textContent = "Please paste JSON data or select a JSON file to import.";
            errorContainer.classList.remove('hidden');
            return;
        }

        try {
            const parsed = JSON.parse(rawText);
            importGameFromJSON(parsed);
            modal.classList.add('hidden');
        } catch (err) {
            errorContainer.textContent = `Import Error: ${err.message}`;
            errorContainer.classList.remove('hidden');
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
}

