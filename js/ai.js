// Re-export all AI functions to keep dependencies intact and files under 300 lines
export { evaluateBoard, generateSmartMoves, getBestMoves, getBestMovesAndThreats } from './ai-eval.js';
export { minimax, makeAIMove } from './ai-search.js';
export { runMCTS, resetMCTSTree, areStatesEqual } from './ai-mcts.js';


