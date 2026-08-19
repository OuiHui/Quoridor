import os
import sys
import argparse
import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from eval_tactics import run_tactical_suite, print_tactical_report
from eval_arena import run_arena_battle, print_arena_report
from play_vs_minimax import run_battle


def run_full_evaluation(model_path="quoridor_model.onnx", baseline_path=None, simulations=400):
    print("=================================================================")
    print("           ALPHAZERO COMPREHENSIVE 4-TIER AUDIT")
    print(f"Target Model: {model_path}")
    print("=================================================================\n")
    
    # 1. Tier 1: Tactical & Representation Health Suite
    print("--- [TIER 1] Tactical Benchmark Suite ---")
    tactical_report = run_tactical_suite(model_path=model_path, simulations=simulations)
    print_tactical_report(tactical_report)
    
    # 2. Tier 2: Bot Benchmark (Depth 2 Minimax)
    print("\n--- [TIER 2] Minimax Benchmark (Depth 2, 6 Games) ---")
    run_battle(
        checkpoint_path="quoridor_checkpoint.pth",
        onnx_path=model_path,
        depth=2,
        simulations=simulations,
        num_games=6,
        visualize=False
    )
    
    # 3. Tier 3: Arena Battle (if baseline provided or available)
    if baseline_path and os.path.exists(baseline_path):
        print(f"\n--- [TIER 3] Checkpoint Arena vs Baseline ({os.path.basename(baseline_path)}) ---")
        arena_report = run_arena_battle(
            model_a_path=model_path,
            model_b_path=baseline_path,
            num_games=6,
            simulations=simulations,
            verbose=False
        )
        print_arena_report(arena_report)
    else:
        print("\n--- [TIER 3] Checkpoint Arena: Skipped (no baseline path specified) ---")


def main():
    parser = argparse.ArgumentParser(
        description="Quoridor AlphaZero Comprehensive Evaluation Suite",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", help="Evaluation Mode")

    # Subcommand: tactics
    tactics_parser = subparsers.add_parser("tactics", help="Run tactical puzzle suite & representation diversity check")
    tactics_parser.add_argument("--model", type=str, default="quoridor_model.onnx", help="Path to ONNX or .pth checkpoint")
    tactics_parser.add_argument("--sims", type=int, default=400, help="MCTS simulations per puzzle")

    # Subcommand: arena
    arena_parser = subparsers.add_parser("arena", help="Run head-to-head tournament between two AlphaZero models")
    arena_parser.add_argument("--model_a", type=str, required=True, help="Path to Model A (ONNX or .pth)")
    arena_parser.add_argument("--model_b", type=str, required=True, help="Path to Model B (ONNX or .pth)")
    arena_parser.add_argument("--games", type=int, default=10, help="Number of games to play")
    arena_parser.add_argument("--sims", type=int, default=400, help="MCTS simulations per turn")
    arena_parser.add_argument("--verbose", "-v", action="store_true", help="Print game progress")

    # Subcommand: bot
    bot_parser = subparsers.add_parser("bot", help="Run matches against heuristic Minimax bot")
    bot_parser.add_argument("--model", type=str, default="quoridor_model.onnx", help="Path to ONNX or .pth checkpoint")
    bot_parser.add_argument("--depth", type=int, default=2, help="Minimax search depth")
    bot_parser.add_argument("--games", type=int, default=10, help="Number of games to play")
    bot_parser.add_argument("--sims", type=int, default=800, help="MCTS simulations per turn")
    bot_parser.add_argument("--verbose", "-v", action="store_true", help="Print step-by-step boards")

    # Subcommand: full
    full_parser = subparsers.add_parser("full", help="Run comprehensive audit (Tactics + Bot + Arena)")
    full_parser.add_argument("--model", type=str, default="quoridor_model.onnx", help="Path to ONNX or .pth checkpoint")
    full_parser.add_argument("--baseline", type=str, default=None, help="Optional baseline model for arena comparison")
    full_parser.add_argument("--sims", type=int, default=400, help="MCTS simulations per turn")

    args = parser.parse_args()

    if args.command == "tactics":
        report = run_tactical_suite(model_path=args.model, simulations=args.sims)
        print_tactical_report(report)
    elif args.command == "arena":
        report = run_arena_battle(
            model_a_path=args.model_a,
            model_b_path=args.model_b,
            num_games=args.games,
            simulations=args.sims,
            verbose=args.verbose
        )
        print_arena_report(report)
    elif args.command == "bot":
        run_battle(
            checkpoint_path="quoridor_checkpoint.pth",
            onnx_path=args.model,
            depth=args.depth,
            simulations=args.sims,
            num_games=args.games,
            visualize=args.verbose
        )
    elif args.command == "full":
        run_full_evaluation(
            model_path=args.model,
            baseline_path=args.baseline,
            simulations=args.sims
        )
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
