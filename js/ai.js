// Re-export all AI functions to keep dependencies intact and files under 300 lines
export { evaluateBoard, generateSmartMoves, getBestMoves } from './ai-eval.js';
export { minimax, makeAIMove } from './ai-search.js';
