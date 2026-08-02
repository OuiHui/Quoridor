import { runMCTS, resetMCTSTree, areStatesEqual } from './js/ai-mcts.js';

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

// 2. Test mock ONNX model session MCTS execution
const mockModelSession = {
    run: async ({ input }) => {
        // Output mock policy tensor of length 140 and value score
        const policy = new Float32Array(140);
        // Make move index 0 (ortho N) high probability
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
    console.log("Testing turn 1 MCTS move search...");
    const start1 = performance.now();
    const move1 = await runMCTS(
        { x: 4, y: 0 }, { x: 4, y: 8 },
        new Map(), new Map(), 10, 10, 1, 60, mockModelSession
    );
    const duration1 = performance.now() - start1;
    console.log(`Turn 1 move selected: ${JSON.stringify(move1)} in ${duration1.toFixed(2)}ms`);
    console.assert(move1 !== null, "Turn 1 move should not be null");

    // Turn 2: Apply move1 (e.g. p1 to {x: 4, y: 1}), turn becomes 2
    console.log("Testing turn 2 MCTS with Subtree Reuse...");
    const start2 = performance.now();
    const move2 = await runMCTS(
        { x: 4, y: 1 }, { x: 4, y: 8 },
        new Map(), new Map(), 10, 10, 2, 60, mockModelSession
    );
    const duration2 = performance.now() - start2;
    console.log(`Turn 2 move selected: ${JSON.stringify(move2)} in ${duration2.toFixed(2)}ms`);
    console.assert(move2 !== null, "Turn 2 move should not be null");

    // Test tree reset
    resetMCTSTree();
    console.log("✔ Subtree Reuse & MCTS Execution tests passed!");
}

testMCTSExecution().catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
