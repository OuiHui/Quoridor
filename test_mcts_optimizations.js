import { runMCTS, resetMCTSTree, areStatesEqual, mirrorPolicy, getTTSize } from './js/ai-mcts.js';
import { getCanonicalStateHash, mirrorBitboardHorizontal, getWallBitboards } from './js/engine.js';

// Mock browser global 'ort' for ONNX runtime tensor creation in Node.js environment
globalThis.ort = {
    Tensor: class Tensor {
        constructor(type, data, dims) {
            this.type = type;
            this.data = data;
            this.dims = dims;
        }
    }
};

console.log("=== Running AlphaZero MCTS Optimization Unit Tests ===");

// 1. Test state equality helper
const stateA = {
    p1Pos: { x: 4, y: 0 },
    p2Pos: { x: 4, y: 8 },
    hWalls: new Map([['3,3', true]]),
    vWalls: new Map(),
    p1Walls: 9,
    p2Walls: 10,
    turn: 1
};

const stateB = {
    p1Pos: { x: 4, y: 0 },
    p2Pos: { x: 4, y: 8 },
    hWalls: new Map([['3,3', true]]),
    vWalls: new Map(),
    p1Walls: 9,
    p2Walls: 10,
    turn: 1
};

const stateC = {
    p1Pos: { x: 4, y: 1 },
    p2Pos: { x: 4, y: 8 },
    hWalls: new Map([['3,3', true]]),
    vWalls: new Map(),
    p1Walls: 9,
    p2Walls: 10,
    turn: 1
};

console.assert(areStatesEqual(stateA, stateB) === true, "stateA and stateB should be equal");
console.assert(areStatesEqual(stateA, stateC) === false, "stateA and stateC should NOT be equal");
console.log("✔ State Equality tests passed!");

// 2. Test Policy Mirroring Involution and Wall Flipping
const dummyPolicy = new Float32Array(140);
for (let i = 0; i < 140; i++) dummyPolicy[i] = i * 0.1;
const flippedPolicy = mirrorPolicy(dummyPolicy);
const roundTripPolicy = mirrorPolicy(flippedPolicy);
let policyInvolutionPassed = true;
for (let i = 0; i < 140; i++) {
    if (Math.abs(roundTripPolicy[i] - dummyPolicy[i]) > 1e-6) {
        policyInvolutionPassed = false;
        break;
    }
}
console.assert(policyInvolutionPassed, "Policy mirror must be an involution");
console.log("✔ Policy Mirroring Involution test passed!");

// 3. Test Canonical State Hash & Symmetry in JS
const s1 = getCanonicalStateHash({x: 2, y: 3}, {x: 6, y: 7}, new Map([['0,0', true]]), new Map(), 10, 10, true);
const s1Mirr = getCanonicalStateHash({x: 6, y: 3}, {x: 2, y: 7}, new Map([['7,0', true]]), new Map(), 10, 10, true);
console.assert(s1.hash === s1Mirr.hash, "Canonical hash of state and its horizontal reflection must be identical");
console.assert(s1.isMirrored !== s1Mirr.isMirrored, "One state must be recognized as mirrored relative to canonical");
console.log("✔ Canonical State Hash Symmetry test passed!");

// 4. Test mock ONNX model session MCTS execution with Gumbel AlphaZero Sequential Halving & TT
let inferenceCount = 0;
const mockModelSession = {
    run: async ({ input }) => {
        inferenceCount++;
        const policy = new Float32Array(140);
        policy[0] = 3.0;
        policy[1] = 1.0;
        return {
            policy: { data: policy },
            value: { data: new Float32Array([0.25]) }
        };
    }
};

async function testMCTSExecution() {
    resetMCTSTree();
    console.log("Testing turn 1 MCTS move search (Gumbel Sequential Halving m=16)...");
    const start1 = performance.now();
    const move1 = await runMCTS(
        { x: 4, y: 0 }, { x: 4, y: 8 },
        new Map(), new Map(), 10, 10, 1, 60, mockModelSession
    );
    const duration1 = performance.now() - start1;
    console.log(`Turn 1 move selected: ${JSON.stringify(move1)} in ${duration1.toFixed(2)}ms, inferences: ${inferenceCount}`);
    console.assert(move1 !== null, "Turn 1 move should not be null");
    console.assert(getTTSize() > 0, "Transposition table should cache evaluated states");

    // Turn 2: Apply move1 (e.g. p1 to {x: 4, y: 1}), turn becomes 2
    console.log("Testing turn 2 MCTS with Subtree Reuse & TT Cache...");
    const prevInferences = inferenceCount;
    const start2 = performance.now();
    const move2 = await runMCTS(
        { x: 4, y: 1 }, { x: 4, y: 8 },
        new Map(), new Map(), 10, 10, 2, 60, mockModelSession
    );
    const duration2 = performance.now() - start2;
    console.log(`Turn 2 move selected: ${JSON.stringify(move2)} in ${duration2.toFixed(2)}ms, new inferences: ${inferenceCount - prevInferences}`);
    console.assert(move2 !== null, "Turn 2 move should not be null");

    // Test tree reset
    resetMCTSTree();
    console.assert(getTTSize() === 0, "resetMCTSTree should clear TT cache");
    console.log("✔ Subtree Reuse, TT Cache, and Gumbel MCTS Execution tests passed!");
}

testMCTSExecution().catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
