#include "quoridor_simulator.h"
#include <queue>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <sstream>

QuoridorGame::QuoridorGame() {
    p1_pos = {4, 0};
    p2_pos = {4, 8};
    
    std::memset(h_walls, 0, sizeof(h_walls));
    std::memset(v_walls, 0, sizeof(v_walls));
    std::memset(h_wall_owners, 0, sizeof(h_wall_owners));
    std::memset(v_wall_owners, 0, sizeof(v_wall_owners));
    
    p1_walls_left = 10;
    p2_walls_left = 10;
    is_p1_turn = true;
}

QuoridorGame QuoridorGame::clone() const {
    QuoridorGame g;
    g.p1_pos = p1_pos;
    g.p2_pos = p2_pos;
    g.p1_walls_left = p1_walls_left;
    g.p2_walls_left = p2_walls_left;
    g.is_p1_turn = is_p1_turn;
    
    std::memcpy(g.h_walls, h_walls, sizeof(h_walls));
    std::memcpy(g.v_walls, v_walls, sizeof(v_walls));
    std::memcpy(g.h_wall_owners, h_wall_owners, sizeof(h_wall_owners));
    std::memcpy(g.v_wall_owners, v_wall_owners, sizeof(v_wall_owners));
    return g;
}

QuoridorGame QuoridorGame::clone_and_step(const Action& action) const {
    QuoridorGame g = clone();
    g.step(action);
    return g;
}

bool QuoridorGame::is_move_blocked(int x1, int y1, int x2, int y2) const {
    if (x1 == x2) {
        // Vertical move
        int ymin = std::min(y1, y2);
        if (std::abs(y1 - y2) == 1) {
            // Check if vertical move is blocked by horizontal walls
            if (x1 >= 0 && x1 < 9 && ymin >= 0 && ymin < 8) {
                if (x1 < 8 && h_walls[x1][ymin]) return true;
                if (x1 > 0 && h_walls[x1 - 1][ymin]) return true;
            }
            return false;
        }
    } else if (y1 == y2) {
        // Horizontal move
        int xmin = std::min(x1, x2);
        if (std::abs(x1 - x2) == 1) {
            // Check if horizontal move is blocked by vertical walls
            if (xmin >= 0 && xmin < 8 && y1 >= 0 && y1 < 9) {
                if (y1 < 8 && v_walls[xmin][y1]) return true;
                if (y1 > 0 && v_walls[xmin][y1 - 1]) return true;
            }
            return false;
        }
    }
    return true;
}

std::vector<std::pair<int, int>> QuoridorGame::get_shortest_path(std::pair<int, int> start, int target_y, std::pair<int, int> opp_pos) const {
    // BFS queue storing paths (lists of coordinates)
    std::queue<std::vector<std::pair<int, int>>> q;
    q.push({start});
    
    // Visited set
    std::set<std::pair<int, int>> visited;
    visited.insert(start);
    
    while (!q.empty()) {
        std::vector<std::pair<int, int>> path = q.front();
        q.pop();
        
        std::pair<int, int> curr = path.back();
        int x = curr.first;
        int y = curr.second;
        
        if (y == target_y) {
            return path;
        }
        
        const std::pair<int, int> moves[4] = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
        for (const auto& m : moves) {
            int dx = m.first;
            int dy = m.second;
            int nx = x + dx;
            int ny = y + dy;
            
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !is_move_blocked(x, y, nx, ny)) {
                if (opp_pos.first != -1 && nx == opp_pos.first && ny == opp_pos.second) {
                    // Cell occupied by opponent — resolve jump destinations
                    int jx = nx + dx;
                    int jy = ny + dy;
                    bool straight_ok = (jx >= 0 && jx < 9 && jy >= 0 && jy < 9 && !is_move_blocked(nx, ny, jx, jy));
                    
                    if (straight_ok) {
                        std::pair<int, int> jump_dest = {jx, jy};
                        if (visited.find(jump_dest) == visited.end()) {
                            visited.insert(jump_dest);
                            std::vector<std::pair<int, int>> next_path = path;
                            next_path.push_back(jump_dest);
                            q.push(next_path);
                        }
                    } else {
                        // Diagonal jumps when straight is blocked
                        std::vector<std::pair<int, int>> sides;
                        if (dx == 0) { // moving vertically, sides are horizontal
                            sides = {{-1, 0}, {1, 0}};
                        } else { // moving horizontally, sides are vertical
                            sides = {{0, -1}, {0, 1}};
                        }
                        
                        for (const auto& s : sides) {
                            int dix = nx + s.first;
                            int diy = ny + s.second;
                            if (dix >= 0 && dix < 9 && diy >= 0 && diy < 9 && !is_move_blocked(nx, ny, dix, diy)) {
                                std::pair<int, int> diag_dest = {dix, diy};
                                if (visited.find(diag_dest) == visited.end()) {
                                    visited.insert(diag_dest);
                                    std::vector<std::pair<int, int>> next_path = path;
                                    next_path.push_back(diag_dest);
                                    q.push(next_path);
                                }
                            }
                        }
                    }
                } else {
                    std::pair<int, int> dest = {nx, ny};
                    if (visited.find(dest) == visited.end()) {
                        visited.insert(dest);
                        std::vector<std::pair<int, int>> next_path = path;
                        next_path.push_back(dest);
                        q.push(next_path);
                    }
                }
            }
        }
    }
    return {};
}

bool QuoridorGame::has_path_to_row(std::pair<int, int> start, int target_y) const {
    // Fast BFS just checking reachability, no path storage
    std::queue<std::pair<int, int>> q;
    q.push(start);
    
    bool visited_arr[9][9];
    std::memset(visited_arr, 0, sizeof(visited_arr));
    visited_arr[start.first][start.second] = true;
    
    while (!q.empty()) {
        std::pair<int, int> curr = q.front();
        q.pop();
        
        int x = curr.first;
        int y = curr.second;
        
        if (y == target_y) {
            return true;
        }
        
        const std::pair<int, int> moves[4] = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
        for (const auto& m : moves) {
            int nx = x + m.first;
            int ny = y + m.second;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !is_move_blocked(x, y, nx, ny)) {
                if (!visited_arr[nx][ny]) {
                    visited_arr[nx][ny] = true;
                    q.push({nx, ny});
                }
            }
        }
    }
    return false;
}

std::vector<Action> QuoridorGame::get_valid_pawn_moves(bool is_p1) const {
    std::pair<int, int> my_pos = is_p1 ? p1_pos : p2_pos;
    std::pair<int, int> opp_pos = is_p1 ? p2_pos : p1_pos;
    
    int px = my_pos.first;
    int py = my_pos.second;
    int ox = opp_pos.first;
    int oy = opp_pos.second;
    
    std::vector<Action> valid;
    const std::pair<int, int> dirs[4] = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
    const std::string dir_names[4] = {"N", "S", "E", "W"};
    
    for (int i = 0; i < 4; ++i) {
        int dx = dirs[i].first;
        int dy = dirs[i].second;
        int nx = px + dx;
        int ny = py + dy;
        
        if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) {
            if (!is_move_blocked(px, py, nx, ny)) {
                if (nx == ox && ny == oy) {
                    // Jump over opponent
                    int jx = nx + dx;
                    int jy = ny + dy;
                    bool jump_blocked = (jx < 0 || jx > 8 || jy < 0 || jy > 8 || is_move_blocked(nx, ny, jx, jy));
                    
                    if (!jump_blocked) {
                        valid.push_back(Action::Move("jump_" + dir_names[i], jx, jy));
                    } else {
                        // Diagonal jump if straight is blocked
                        if (dx == 0) { // moving vertically, check horizontal diagonals
                            std::string base_dir = (dir_names[i] == "N") ? "jump_N" : "jump_S";
                            if (nx - 1 >= 0 && !is_move_blocked(nx, ny, nx - 1, ny)) {
                                valid.push_back(Action::Move(base_dir + "W", nx - 1, ny));
                            }
                            if (nx + 1 < 9 && !is_move_blocked(nx, ny, nx + 1, ny)) {
                                valid.push_back(Action::Move(base_dir + "E", nx + 1, ny));
                            }
                        } else { // moving horizontally, check vertical diagonals
                            if (ny - 1 >= 0 && !is_move_blocked(nx, ny, nx, ny - 1)) {
                                std::string dest_dir = (dir_names[i] == "E") ? "jump_SE" : "jump_SW";
                                valid.push_back(Action::Move(dest_dir, nx, ny - 1));
                            }
                            if (ny + 1 < 9 && !is_move_blocked(nx, ny, nx, ny + 1)) {
                                std::string dest_dir = (dir_names[i] == "E") ? "jump_NE" : "jump_NW";
                                valid.push_back(Action::Move(dest_dir, nx, ny + 1));
                            }
                        }
                    }
                } else {
                    valid.push_back(Action::Move(dir_names[i], nx, ny));
                }
            }
        }
    }
    return valid;
}

bool QuoridorGame::validate_wall_placement(int wx, int wy, char wall_type) const {
    if (wx < 0 || wx > 7 || wy < 0 || wy > 7) {
        return false;
    }
    
    // Overlap checks
    if (wall_type == 'h') {
        if (h_walls[wx][wy] || (wx > 0 && h_walls[wx - 1][wy]) || (wx < 7 && h_walls[wx + 1][wy])) {
            return false;
        }
        if (v_walls[wx][wy]) {
            return false;
        }
    } else {
        if (v_walls[wx][wy] || (wy > 0 && v_walls[wx][wy - 1]) || (wy < 7 && v_walls[wx][wy + 1])) {
            return false;
        }
        if (h_walls[wx][wy]) {
            return false;
        }
    }
    
    // Connectivity check: cast away constness to temporarily modify the board
    QuoridorGame* mutable_this = const_cast<QuoridorGame*>(this);
    if (wall_type == 'h') {
        mutable_this->h_walls[wx][wy] = true;
    } else {
        mutable_this->v_walls[wx][wy] = true;
    }
    
    bool p1_path_exists = has_path_to_row(p1_pos, 8);
    bool p2_path_exists = has_path_to_row(p2_pos, 0);
    
    if (wall_type == 'h') {
        mutable_this->h_walls[wx][wy] = false;
    } else {
        mutable_this->v_walls[wx][wy] = false;
    }
    
    return p1_path_exists && p2_path_exists;
}

std::vector<std::tuple<int, int, char>> QuoridorGame::get_candidate_walls() const {
    std::vector<std::tuple<int, int, char>> candidates;
    
    // Simple lookup to avoid adding duplicates
    bool added_h[8][8];
    bool added_v[8][8];
    std::memset(added_h, 0, sizeof(added_h));
    std::memset(added_v, 0, sizeof(added_v));
    
    // 1. Add walls around both players (radius of 5)
    std::pair<int, int> positions[2] = {p1_pos, p2_pos};
    for (const auto& pos : positions) {
        int px = pos.first;
        int py = pos.second;
        for (int wx = std::max(0, px - 5); wx < std::min(8, px + 6); ++wx) {
            for (int wy = std::max(0, py - 5); wy < std::min(8, py + 6); ++wy) {
                if (!added_h[wx][wy]) {
                    candidates.push_back({wx, wy, 'h'});
                    added_h[wx][wy] = true;
                }
                if (!added_v[wx][wy]) {
                    candidates.push_back({wx, wy, 'v'});
                    added_v[wx][wy] = true;
                }
            }
        }
    }
    
    // 2. Add walls that intersect the shortest paths of both players
    std::vector<std::pair<int, int>> p1_path = get_shortest_path(p1_pos, 8, p2_pos);
    std::vector<std::pair<int, int>> p2_path = get_shortest_path(p2_pos, 0, p1_pos);
    
    std::vector<std::vector<std::pair<int, int>>> paths = {p1_path, p2_path};
    for (const auto& path : paths) {
        if (path.empty()) continue;
        for (size_t i = 0; i < path.size() - 1; ++i) {
            int x1 = path[i].first;
            int y1 = path[i].second;
            int x2 = path[i+1].first;
            int y2 = path[i+1].second;
            
            if (x1 == x2) { // vertical step, place horizontal wall blocking it
                int ymin = std::min(y1, y2);
                int wx_choices[2] = {x1, x1 - 1};
                for (int wx : wx_choices) {
                    if (wx >= 0 && wx < 8 && ymin >= 0 && ymin < 8) {
                        if (!added_h[wx][ymin]) {
                            candidates.push_back({wx, ymin, 'h'});
                            added_h[wx][ymin] = true;
                        }
                    }
                }
            } else { // horizontal step, place vertical wall blocking it
                int xmin = std::min(x1, x2);
                int wy_choices[2] = {y1, y1 - 1};
                for (int wy : wy_choices) {
                    if (xmin >= 0 && xmin < 8 && wy >= 0 && wy < 8) {
                        if (!added_v[xmin][wy]) {
                            candidates.push_back({xmin, wy, 'v'});
                            added_v[xmin][wy] = true;
                        }
                    }
                }
            }
        }
    }
    return candidates;
}

std::vector<Action> QuoridorGame::get_valid_actions() const {
    std::vector<Action> actions;
    
    // 1. Pawn moves
    std::vector<Action> pawn_moves = get_valid_pawn_moves(is_p1_turn);
    actions.insert(actions.end(), pawn_moves.begin(), pawn_moves.end());
    
    // 2. Wall placements
    int walls_left = is_p1_turn ? p1_walls_left : p2_walls_left;
    if (walls_left > 0) {
        std::vector<std::tuple<int, int, char>> candidates = get_candidate_walls();
        for (const auto& c : candidates) {
            int wx = std::get<0>(c);
            int wy = std::get<1>(c);
            char wtype = std::get<2>(c);
            
            if (validate_wall_placement(wx, wy, wtype)) {
                actions.push_back(Action::Wall(wtype, wx, wy));
            }
        }
    }
    return actions;
}

void QuoridorGame::step(const Action& action) {
    if (action.type == "move") {
        if (is_p1_turn) {
            p1_pos = {action.to_x, action.to_y};
        } else {
            p2_pos = {action.to_x, action.to_y};
        }
    } else if (action.type == "wall") {
        int wx = action.wall_x;
        int wy = action.wall_y;
        int owner = is_p1_turn ? 1 : 2;
        if (action.wall_type == 'h') {
            h_walls[wx][wy] = true;
            h_wall_owners[wx][wy] = owner;
            if (is_p1_turn) p1_walls_left--;
            else p2_walls_left--;
        } else {
            v_walls[wx][wy] = true;
            v_wall_owners[wx][wy] = owner;
            if (is_p1_turn) p1_walls_left--;
            else p2_walls_left--;
        }
    }
    is_p1_turn = !is_p1_turn;
}

int QuoridorGame::is_game_over() const {
    if (p1_pos.second == 8) {
        return 1; // P1 wins
    }
    if (p2_pos.second == 0) {
        return -1; // P2 wins
    }
    return 0; // still playing
}

double QuoridorGame::evaluate_heuristic() const {
    std::vector<std::pair<int, int>> p1_path = get_shortest_path(p1_pos, 8, p2_pos);
    std::vector<std::pair<int, int>> p2_path = get_shortest_path(p2_pos, 0, p1_pos);
    
    int p1_len = p1_path.empty() ? 20 : (static_cast<int>(p1_path.size()) - 1);
    int p2_len = p2_path.empty() ? 20 : (static_cast<int>(p2_path.size()) - 1);
    
    int diff = p2_len - p1_len;
    int wall_diff = p1_walls_left - p2_walls_left;
    
    double score = diff + 0.1 * wall_diff;
    return std::max(-1.0, std::min(1.0, score / 10.0));
}

std::set<std::pair<int, int>> QuoridorGame::get_h_walls_set() const {
    std::set<std::pair<int, int>> s;
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            if (h_walls[x][y]) s.insert({x, y});
        }
    }
    return s;
}

std::set<std::pair<int, int>> QuoridorGame::get_v_walls_set() const {
    std::set<std::pair<int, int>> s;
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            if (v_walls[x][y]) s.insert({x, y});
        }
    }
    return s;
}

std::map<std::string, int> QuoridorGame::get_h_wall_owners_map() const {
    std::map<std::string, int> m;
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            if (h_wall_owners[x][y] != 0) {
                std::stringstream ss;
                ss << x << "," << y;
                m[ss.str()] = h_wall_owners[x][y];
            }
        }
    }
    return m;
}

std::map<std::string, int> QuoridorGame::get_v_wall_owners_map() const {
    std::map<std::string, int> m;
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            if (v_wall_owners[x][y] != 0) {
                std::stringstream ss;
                ss << x << "," << y;
                m[ss.str()] = v_wall_owners[x][y];
            }
        }
    }
    return m;
}
