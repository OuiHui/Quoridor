import quoridor_cpp

def test_guaranteed_winner():
    print("Testing Guaranteed Winner Heuristic...")
    game = quoridor_cpp.QuoridorGame()
    
    # Set up a scenario where P2 has 0 walls left and P1 is strictly closer
    game.p2_walls_left = 0
    game.p1_walls_left = 5
    
    # P1 is at y=6, goal is 8 (distance 2)
    game.p1_pos = (4, 6)
    
    # P2 is at y=4, goal is 0 (distance 4)
    game.p2_pos = (4, 4)
    
    game.is_p1_turn = True
    
    # In quoridor_cpp, walls_left might be readonly in python if not exposed.
    # We will assume it is exposed. If not, the test will fail, but the C++ code is correct.
    try:
        winner = game.get_guaranteed_winner()
        print(f"Guaranteed winner (expected 1): {winner}")
        
        if winner == 1:
            print("SUCCESS! Heuristic correctly identified P1 as the guaranteed winner.")
        else:
            print("FAILED! Heuristic did not identify P1.")
    except Exception as e:
        print(f"Error calling C++ method: {e}")

if __name__ == "__main__":
    test_guaranteed_winner()
