#pragma once

#include <vector>
#include <string>
#include <set>
#include <map>
#include <tuple>
#include <utility>

struct Action {
    std::string type; // "move" or "wall"
    std::string move_dir; // "N", "S", "E", "W", "jump_N", etc.
    int to_x = -1;
    int to_y = -1;
    char wall_type = ' '; // 'h' or 'v'
    int wall_x = -1;
    int wall_y = -1;

    Action() = default;

    static Action Move(const std::string& dir, int x, int y) {
        Action a;
        a.type = "move";
        a.move_dir = dir;
        a.to_x = x;
        a.to_y = y;
        return a;
    }

    static Action Wall(char wtype, int x, int y) {
        Action a;
        a.type = "wall";
        a.wall_type = wtype;
        a.wall_x = x;
        a.wall_y = y;
        return a;
    }
};

class QuoridorGame {
public:
    std::pair<int, int> p1_pos;
    std::pair<int, int> p2_pos;
    
    // Arrays for fast wall presence checks (8x8 intersections)
    bool h_walls[8][8];
    bool v_walls[8][8];
    
    // 0: none, 1: P1, 2: P2
    int h_wall_owners[8][8];
    int v_wall_owners[8][8];

    int p1_walls_left;
    int p2_walls_left;
    bool is_p1_turn;

    QuoridorGame();

    QuoridorGame clone() const;
    QuoridorGame clone_and_step(const Action& action) const;

    bool is_move_blocked(int x1, int y1, int x2, int y2) const;
    std::vector<std::pair<int, int>> get_shortest_path(std::pair<int, int> start, int target_y, std::pair<int, int> opp_pos = {-1, -1}) const;
    bool has_path_to_row(std::pair<int, int> start, int target_y) const;

    std::vector<Action> get_valid_pawn_moves(bool is_p1) const;
    bool validate_wall_placement(int wx, int wy, char wall_type) const;
    std::vector<std::tuple<int, int, char>> get_candidate_walls() const;
    std::vector<Action> get_valid_actions() const;

    void step(const Action& action);
    int is_game_over() const;

    double evaluate_heuristic() const;
    
    // Python-friendly formats for pybind11 serialization
    std::set<std::pair<int, int>> get_h_walls_set() const;
    std::set<std::pair<int, int>> get_v_walls_set() const;
    std::map<std::string, int> get_h_wall_owners_map() const;
    std::map<std::string, int> get_v_wall_owners_map() const;
};
