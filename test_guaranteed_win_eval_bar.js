// test_guaranteed_win_eval_bar.js
// Automated verification: confirms that when an opponent is guaranteed to win,
// the evaluation engine detects it and the eval bar renders #2 with 0% fill height.

import { getGuaranteedWinner, findShortestPath } from './js/engine.js';
import { evaluateBoard } from './js/ai-eval.js';

// Mock DOM elements to inspect updateEvalBarUI behavior directly
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
};

// Import updateEvalBarUI after mocking DOM
const { updateEvalBarUI, evaluatePositionWithNN } = await import('./js/ui-eval-bar.js');

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
console.log('VERIFYING GUARANTEED WIN DETECTION & EVAL BAR DISPLAY');
console.log('='.repeat(70));

console.log('\n--- Test 1: Solved Race - Opponent (P2) Guaranteed Win on Opponent Turn ---');
// Scenario: P1 has 0 walls, P2 has distance 2 to goal (row 0), P1 has distance 4 to goal (row 8).
// It is P2's turn (turn = 2, isP1Turn = false).
// P2 can just walk straight to y=0 in 2 moves; P1 needs 4 moves. P2 is 100% guaranteed to win.
const s1 = {
    p1Pos: { x: 4, y: 4 }, // dist to y=8 is 4
    p2Pos: { x: 4, y: 2 }, // dist to y=0 is 2
    p1Walls: 0,
    p2Walls: 5,
    turn: 2,
    hWalls: new Map(),
    vWalls: new Map()
};

const gw1 = getGuaranteedWinner(s1.p1Pos, s1.p2Pos, s1.p1Walls, s1.p2Walls, false, s1.hWalls, s1.vWalls);
assert(gw1 === -1, 'getGuaranteedWinner detects P2 guaranteed win', `winner=${gw1}`);

const score1 = await evaluatePositionWithNN(s1.p1Pos, s1.p2Pos, s1.hWalls, s1.vWalls, s1.p1Walls, s1.p2Walls, 2);
assert(score1 === -Infinity, 'evaluatePositionWithNN returns -Infinity for guaranteed P2 win', `score=${score1}`);

updateEvalBarUI(score1);
assert(mockElements['eval-bar-fill'].style.height === '0%', 'Eval bar fill height drops to 0% (full P2 advantage)', `height=${mockElements['eval-bar-fill'].style.height}`);
assert(mockElements['eval-score-value'].textContent === '#2', 'Eval score badge displays "#2" (Opponent Forced Win)', `text=${mockElements['eval-score-value'].textContent}`);
assert(mockUnitEl.style.display === 'none', 'Score unit ("pts") is cleanly hidden when showing #2', `display=${mockUnitEl.style.display}`);

console.log('\n--- Test 2: Solved Race - Opponent (P2) Guaranteed Win on Player Turn ---');
// Scenario: P1 has 0 walls, P2 has distance 2, P1 has distance 5.
// Even though it is P1's turn (turn = 1, isP1Turn = true), l2 (2) <= l1 - 2 (3).
// After P1 moves, P1 dist is 4, P2 dist is 2. P2 still wins.
const s2 = {
    p1Pos: { x: 4, y: 3 }, // dist to y=8 is 5
    p2Pos: { x: 4, y: 2 }, // dist to y=0 is 2
    p1Walls: 0,
    p2Walls: 0,
    turn: 1,
    hWalls: new Map(),
    vWalls: new Map()
};

const gw2 = getGuaranteedWinner(s2.p1Pos, s2.p2Pos, s2.p1Walls, s2.p2Walls, true, s2.hWalls, s2.vWalls);
assert(gw2 === -1, 'getGuaranteedWinner detects P2 guaranteed win even on P1 turn', `winner=${gw2}`);

const score2 = await evaluatePositionWithNN(s2.p1Pos, s2.p2Pos, s2.hWalls, s2.vWalls, s2.p1Walls, s2.p2Walls, 1);
assert(score2 === -Infinity, 'evaluatePositionWithNN returns -Infinity on P1 turn', `score=${score2}`);

updateEvalBarUI(score2);
assert(mockElements['eval-bar-fill'].style.height === '0%', 'Eval bar fill height is 0%', `height=${mockElements['eval-bar-fill'].style.height}`);
assert(mockElements['eval-score-value'].textContent === '#2', 'Eval score value is "#2"', `text=${mockElements['eval-score-value'].textContent}`);

console.log('\n--- Test 3: Terminal Win - Opponent (P2) Reached Baseline (y=0) ---');
const s3 = {
    p1Pos: { x: 4, y: 6 },
    p2Pos: { x: 4, y: 0 }, // P2 on goal row
    p1Walls: 2,
    p2Walls: 2,
    turn: 2,
    hWalls: new Map(),
    vWalls: new Map()
};

const gw3 = getGuaranteedWinner(s3.p1Pos, s3.p2Pos, s3.p1Walls, s3.p2Walls, false, s3.hWalls, s3.vWalls);
assert(gw3 === -1, 'getGuaranteedWinner identifies terminal P2 win', `winner=${gw3}`);

const score3 = await evaluatePositionWithNN(s3.p1Pos, s3.p2Pos, s3.hWalls, s3.vWalls, s3.p1Walls, s3.p2Walls, 2);
assert(score3 === -Infinity, 'evaluatePositionWithNN returns -Infinity for terminal state', `score=${score3}`);

updateEvalBarUI(score3);
assert(mockElements['eval-bar-fill'].style.height === '0%', 'Eval bar fill height is 0%', `height=${mockElements['eval-bar-fill'].style.height}`);
assert(mockElements['eval-score-value'].textContent === '#2', 'Eval score value is "#2"', `text=${mockElements['eval-score-value'].textContent}`);

console.log('\n--- Test 4: Symmetry - Player 1 (P1) Guaranteed Win ---');
// Scenario: P2 has 0 walls, P1 has distance 2, P2 has distance 4, P1 turn.
const s4 = {
    p1Pos: { x: 4, y: 6 }, // dist 2 to y=8
    p2Pos: { x: 4, y: 4 }, // dist 4 to y=0
    p1Walls: 3,
    p2Walls: 0,
    turn: 1,
    hWalls: new Map(),
    vWalls: new Map()
};

const gw4 = getGuaranteedWinner(s4.p1Pos, s4.p2Pos, s4.p1Walls, s4.p2Walls, true, s4.hWalls, s4.vWalls);
assert(gw4 === 1, 'getGuaranteedWinner detects P1 guaranteed win', `winner=${gw4}`);

const score4 = await evaluatePositionWithNN(s4.p1Pos, s4.p2Pos, s4.hWalls, s4.vWalls, s4.p1Walls, s4.p2Walls, 1);
assert(score4 === Infinity, 'evaluatePositionWithNN returns +Infinity for P1 win', `score=${score4}`);

updateEvalBarUI(score4);
assert(mockElements['eval-bar-fill'].style.height === '100%', 'Eval bar fill height reaches 100% (full P1 blue)', `height=${mockElements['eval-bar-fill'].style.height}`);
assert(mockElements['eval-score-value'].textContent === '#1', 'Eval score badge displays "#1" (P1 Forced Win)', `text=${mockElements['eval-score-value'].textContent}`);

console.log('\n--- Test 5: Minimax Fallback Dominance (-500 / +500) Mapping ---');
// Verify that if evaluateBoard returns -500 (from minimax fallback),
// updateEvalBarUI treats it as #2 and 0% fill.
updateEvalBarUI(-500);
assert(mockElements['eval-bar-fill'].style.height === '0%', 'Score <= -500 maps to 0% fill height', `height=${mockElements['eval-bar-fill'].style.height}`);
assert(mockElements['eval-score-value'].textContent === '#2', 'Score <= -500 displays "#2"', `text=${mockElements['eval-score-value'].textContent}`);

updateEvalBarUI(500);
assert(mockElements['eval-bar-fill'].style.height === '100%', 'Score >= 500 maps to 100% fill height', `height=${mockElements['eval-bar-fill'].style.height}`);
assert(mockElements['eval-score-value'].textContent === '#1', 'Score >= 500 displays "#1"', `text=${mockElements['eval-score-value'].textContent}`);

console.log('\n' + '='.repeat(70));
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed (${(passedTests / totalTests * 100).toFixed(1)}%)`);
console.log('='.repeat(70));

if (passedTests === totalTests) {
    console.log('SUCCESS: All guaranteed win conditions properly evaluated and indicated by the eval bar.\n');
    process.exit(0);
} else {
    console.error('FAILURE: Some guaranteed win conditions failed to be indicated properly.\n');
    process.exit(1);
}

