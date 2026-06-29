// Global Game State
export const state = {
    // Player positions (0-indexed: x is col 0..8, y is row 0..8)
    p1Pos: { x: 4, y: 0 },
    p2Pos: { x: 4, y: 8 },
    p1Walls: 10,
    p2Walls: 10,
    
    // Maps storing placed walls as "x,y" => player
    hWalls: new Map(),
    vWalls: new Map(),
    
    turn: 1, // 1 for Player 1, 2 for Player 2
    gameMode: 'sandbox', // 'sandbox', 'pvp', 'ai'
    aiSettings: {
        difficulty: 'medium', // 'easy', 'medium', 'hard'
        color: 'p2'           // 'p1' or 'p2'
    },
    
    // History for undo stack
    history: [],
    
    // Playbook Training State
    activePlaybook: null,
    playbookStep: 0,
    playbookPracticeMode: false,
    playbookAutoplayTimer: null,
    
    // Path display state
    showPaths: true,
    soundEnabled: true,
    hintOn: false,

    // Training Live Watch State
    trainingWatchActive: false,

    // Precomputed evaluations caching
    precomputedEvaluations: null,
    previousPrecomputedEvaluations: null
};
