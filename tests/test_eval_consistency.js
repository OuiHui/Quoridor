import { ANALYSIS_DEPTH } from '../js/ai-search.js';
import { state } from '../js/state.js';
import { resetMCTSTree, runMCTS, getActiveMCTSRoot } from '../js/ai-mcts.js';
import { getGameStateExportJSON } from '../js/ui-modal.js';

const mockElements = {
    'eval-bar-fill': { style: { height: '' } },
    'eval-score-value': { textContent: '', style: { color: '' } },
    'eval-score-bubble': { classList: { remove() { }, add() { } } },
    'eval-move-badge': { className: '', classList: { add() { }, remove() { } } },
    'eval-move-badge-text': { textContent: '' },
};
const mockUnitEl = { style: { display: '' } };

global.document = {
    getElementById: (id) => mockElements[id] || null,
    querySelector: (sel) => (sel === '.eval-score-unit' ? mockUnitEl : null),
    querySelectorAll: () => [],
};

const { updateEvalBarUI, updateEvalBar } = await import('../js/ui-eval-bar.js');
const { analyzeMoveQuality } = await import('../js/move-analysis.js');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, detail = '') {
    totalTests++;
    if (condition) {
        console.log(`  [PASS] ${testName} ${detail ? `(${detail})` : ''}`);
        passedTests++;
    } else {
        console.error(`  [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
}

console.log('='.repeat(70));
console.log('VERIFYING EVAL BAR & HINT ENGINE CONSISTENCY');
console.log('='.repeat(70));

// Test 1: Shared Analysis Depth
assert(ANALYSIS_DEPTH === 4, 'ANALYSIS_DEPTH is standardized to 4', `value=${ANALYSIS_DEPTH}`);

// Test 2: Eval Bar prefers nnEval over evalScore
state.history = [
    {
        id: 1,
        player: 1,
        type: 'move',
        to: { x: 4, y: 1 },
        nnEval: 23.45,
        evalScore: 10.8
    }
];
state.historyIndex = 1;

updateEvalBar();
assert(mockElements['eval-score-value'].textContent === '+2.3', 'Eval bar renders nnEval (+2.3) instead of minimax evalScore (+1.1)', `text=${mockElements['eval-score-value'].textContent}`);

// Test 3: Eval bar does NOT fall back to minimax evalScore when nnEval is missing
state.history[0].nnEval = null;
state.history[0].evalScore = 16.8;
updateEvalBar();
assert(mockElements['eval-score-value'].textContent === '...', 'Eval bar does not fall back to minimax evalScore; indicates loading (...)', `text=${mockElements['eval-score-value'].textContent}`);

// Test 4: updateMoveQualityUI does not overwrite active nnEval on eval bar
state.history[0].nnEval = 45.67;
updateEvalBar();
assert(mockElements['eval-score-value'].textContent === '+4.6', 'Eval bar displays updated nnEval (+4.6)', `text=${mockElements['eval-score-value'].textContent}`);

analyzeMoveQuality(
    { type: 'move', to: { x: 4, y: 1 } },
    1,
    state.history[0],
    {
        p1Pos: { x: 4, y: 0 },
        p2Pos: { x: 4, y: 8 },
        p1Walls: 10,
        p2Walls: 10,
        hWalls: new Map(),
        vWalls: new Map()
    },
    { sync: true }
);

assert(state.history[0].evalScore !== null, 'Heuristic evalScore is stored on historyItem for quality badge classification');
assert(state.history[0].nnEval === 45.67, 'nnEval is preserved on historyItem after move analysis');
assert(mockElements['eval-score-value'].textContent === '+4.6', 'Eval bar retained nnEval (+4.6) and was not overwritten by minimax evalScore', `text=${mockElements['eval-score-value'].textContent}`);

// Test 5: Game export JSON includes both nnEval and evalScore
const exported = getGameStateExportJSON();
assert(exported.history.length === 1, 'Export contains move history');
assert(exported.history[0].nnEval === 45.67, 'Exported JSON includes nnEval', `nnEval=${exported.history[0].nnEval}`);
assert(exported.history[0].evalScore !== null, 'Exported JSON includes evalScore', `evalScore=${exported.history[0].evalScore}`);

// Test 6: MCTS advanceTree = false leaves activeMCTSRoot intact
resetMCTSTree();
const mockModelSession = {
    run: async ({ input }) => {
        const B = (input.dims && input.dims[0]) ? input.dims[0] : 1;
        const policy = new Float32Array(B * 140);
        policy[0] = 2.0;
        return {
            policy: { data: policy },
            value: { data: new Float32Array(B).fill(0.1) }
        };
    }
};

await runMCTS(
    { x: 4, y: 0 }, { x: 4, y: 8 },
    new Map(), new Map(), 10, 10, 1, 32, mockModelSession, null, false
);
assert(getActiveMCTSRoot() === null, 'runMCTS with advanceTree=false does not advance activeMCTSRoot');

await runMCTS(
    { x: 4, y: 0 }, { x: 4, y: 8 },
    new Map(), new Map(), 10, 10, 1, 32, mockModelSession, null, true
);
assert(getActiveMCTSRoot() !== null, 'runMCTS with advanceTree=true advances activeMCTSRoot for subtree reuse');

console.log('='.repeat(70));
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed (${(passedTests / totalTests * 100).toFixed(1)}%)`);
console.log('='.repeat(70));

if (passedTests === totalTests) {
    console.log('SUCCESS: All eval and hint consistency tests passed.\n');
    process.exit(0);
} else {
    console.error('FAILURE: Some consistency tests failed.\n');
    process.exit(1);
}
