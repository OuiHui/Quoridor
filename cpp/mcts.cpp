#include "mcts.h"
#include <cmath>
#include <random>
#include <algorithm>
#include <iostream>
#include <queue>
#include <cstring>

// Helper functions for action mappings
static int map_action_to_index(const Action& action) {
    if (action.type == "move") {
        static const std::map<std::string, int> move_dir_to_idx = {
            {"N", 0}, {"S", 1}, {"E", 2}, {"W", 3},
            {"jump_N", 4}, {"jump_S", 5}, {"jump_E", 6}, {"jump_W", 7},
            {"jump_NE", 8}, {"jump_NW", 9}, {"jump_SE", 10}, {"jump_SW", 11}
        };
        auto it = move_dir_to_idx.find(action.move_dir);
        if (it != move_dir_to_idx.end()) return it->second;
        return 0;
    } else if (action.type == "wall") {
        int wx = action.wall_x;
        int wy = action.wall_y;
        if (action.wall_type == 'h') {
            return 12 + wy * 8 + wx;
        } else {
            return 76 + wy * 8 + wx;
        }
    }
    return 0;
}

static Action rotate_action_180(const Action& action) {
    if (action.type == "move") {
        static const std::map<std::string, std::string> rot_map = {
            {"N", "S"}, {"S", "N"}, {"E", "W"}, {"W", "E"},
            {"jump_N", "jump_S"}, {"jump_S", "jump_N"}, {"jump_E", "jump_W"}, {"jump_W", "jump_E"},
            {"jump_NE", "jump_SW"}, {"jump_NW", "jump_SE"}, {"jump_SE", "jump_NW"}, {"jump_SW", "jump_NE"}
        };
        auto it = rot_map.find(action.move_dir);
        std::string r_dir = (it != rot_map.end()) ? it->second : action.move_dir;
        return Action::Move(r_dir, 8 - action.to_x, 8 - action.to_y);
    } else if (action.type == "wall") {
        return Action::Wall(action.wall_type, 7 - action.wall_x, 7 - action.wall_y);
    }
    return action;
}

static int map_action_to_index_perspective(const Action& action, bool is_p1_turn) {
    if (is_p1_turn) {
        return map_action_to_index(action);
    } else {
        return map_action_to_index(rotate_action_180(action));
    }
}

// MCTSNode implementation
MCTSNode::MCTSNode(const QuoridorGame& state, MCTSNode* parent_node, int act_idx, double p)
    : game_state(state), parent(parent_node), action_idx(act_idx), prior(p) {
}

MCTSNode::~MCTSNode() {
    for (auto& pair : children) {
        delete pair.second;
    }
}

bool MCTSNode::is_leaf() const {
    return children.empty();
}

static void compute_reverse_bfs_distances(const QuoridorGame& g, int target_y, int dist_out[9][9]) {
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            dist_out[x][y] = 20;
        }
    }
    std::queue<std::pair<int, int>> q;
    for (int x = 0; x < 9; ++x) {
        dist_out[x][target_y] = 0;
        q.push({x, target_y});
    }

    const std::pair<int, int> dirs[4] = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
    while (!q.empty()) {
        auto curr = q.front();
        q.pop();
        int cx = curr.first;
        int cy = curr.second;
        int next_d = dist_out[cx][cy] + 1;

        for (const auto& d : dirs) {
            int nx = cx + d.first;
            int ny = cy + d.second;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !g.is_move_blocked(cx, cy, nx, ny)) {
                if (dist_out[nx][ny] > next_d) {
                    dist_out[nx][ny] = next_d;
                    q.push({nx, ny});
                }
            }
        }
    }
}

static void compute_dag_criticality(const QuoridorGame& g, std::pair<int, int> start_pos, int target_y, const int R[9][9], float crit_out[9][9]) {
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            crit_out[x][y] = 0.0f;
        }
    }

    int sx = start_pos.first;
    int sy = start_pos.second;
    int L = R[sx][sy];
    if (L >= 20) return;
    if (L == 0) {
        crit_out[sx][sy] = 1.0f;
        return;
    }

    int D[9][9];
    uint64_t num_fwd[9][9];
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            D[x][y] = -1;
            num_fwd[x][y] = 0;
        }
    }

    D[sx][sy] = 0;
    num_fwd[sx][sy] = 1;
    std::queue<std::pair<int, int>> q;
    q.push({sx, sy});

    const std::pair<int, int> dirs[4] = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
    while (!q.empty()) {
        auto curr = q.front();
        q.pop();
        int cx = curr.first;
        int cy = curr.second;

        for (const auto& d : dirs) {
            int nx = cx + d.first;
            int ny = cy + d.second;
            if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !g.is_move_blocked(cx, cy, nx, ny)) {
                if (D[nx][ny] == -1) {
                    D[nx][ny] = D[cx][cy] + 1;
                    num_fwd[nx][ny] = num_fwd[cx][cy];
                    q.push({nx, ny});
                } else if (D[nx][ny] == D[cx][cy] + 1) {
                    num_fwd[nx][ny] += num_fwd[cx][cy];
                }
            }
        }
    }

    uint64_t num_rev[9][9];
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            num_rev[x][y] = 0;
        }
    }
    for (int x = 0; x < 9; ++x) {
        if (R[x][target_y] == 0) {
            num_rev[x][target_y] = 1;
        }
    }

    for (int d = 1; d <= L; ++d) {
        for (int x = 0; x < 9; ++x) {
            for (int y = 0; y < 9; ++y) {
                if (R[x][y] == d) {
                    for (const auto& dir : dirs) {
                        int nx = x + dir.first;
                        int ny = y + dir.second;
                        if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9 && !g.is_move_blocked(x, y, nx, ny) && R[nx][ny] == d - 1) {
                            num_rev[x][y] += num_rev[nx][ny];
                        }
                    }
                }
            }
        }
    }

    uint64_t total_paths = num_rev[sx][sy];
    if (total_paths == 0) return;

    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            if (D[x][y] >= 0 && (D[x][y] + R[x][y] == L)) {
                crit_out[x][y] = static_cast<float>(static_cast<double>(num_fwd[x][y] * num_rev[x][y]) / static_cast<double>(total_paths));
            }
        }
    }
}

// MCTS implementation
MCTS::MCTS(double c_puct, double dirichlet_alpha, double dirichlet_eps, double c_fpu, bool use_gumbel)
    : c_puct(c_puct), dirichlet_alpha(dirichlet_alpha), dirichlet_eps(dirichlet_eps), c_fpu(c_fpu), use_gumbel(use_gumbel) {
}

std::vector<float> MCTS::mirror_policy_cpp(const std::vector<float>& policy) {
    std::vector<float> mirrored(140, 0.0f);
    if (policy.empty()) return mirrored;
    // Pawn moves (0..11)
    mirrored[0] = policy[0]; // N
    mirrored[1] = policy[1]; // S
    mirrored[2] = policy[3]; // E -> W
    mirrored[3] = policy[2]; // W -> E
    mirrored[4] = policy[4]; // jump_N
    mirrored[5] = policy[5]; // jump_S
    mirrored[6] = policy[7]; // jump_E -> jump_W
    mirrored[7] = policy[6]; // jump_W -> jump_E
    mirrored[8] = policy[9]; // jump_NE -> jump_NW
    mirrored[9] = policy[8]; // jump_NW -> jump_NE
    mirrored[10] = policy[11]; // jump_SE -> jump_SW
    mirrored[11] = policy[10]; // jump_SW -> jump_SE

    // Horizontal walls (12..75)
    for (int wy = 0; wy < 8; ++wy) {
        for (int wx = 0; wx < 8; ++wx) {
            int orig_idx = 12 + wy * 8 + wx;
            int mirr_idx = 12 + wy * 8 + (7 - wx);
            mirrored[mirr_idx] = policy[orig_idx];
        }
    }

    // Vertical walls (76..139)
    for (int wy = 0; wy < 8; ++wy) {
        for (int wx = 0; wx < 8; ++wx) {
            int orig_idx = 76 + wy * 8 + wx;
            int mirr_idx = 76 + wy * 8 + (7 - wx);
            mirrored[mirr_idx] = policy[orig_idx];
        }
    }
    return mirrored;
}

std::vector<float> MCTS::encode_state_cpp(const QuoridorGame& game) {
    // 11 channels of 9x9 size = 891 elements
    std::vector<float> tensor(11 * 9 * 9, 0.0f);
    
    auto set_val = [&](int ch, int x, int y, float val) {
        tensor[ch * 9 * 9 + x * 9 + y] = val;
    };
    
    std::pair<int, int> active_pos, opp_pos;
    int active_walls, opp_walls;
    QuoridorGame view_game;
    view_game.is_p1_turn = true;

    if (game.is_p1_turn) {
        active_pos = game.p1_pos;
        opp_pos = game.p2_pos;
        active_walls = game.p1_walls_left;
        opp_walls = game.p2_walls_left;
        view_game.p1_pos = active_pos;
        view_game.p2_pos = opp_pos;
        view_game.p1_walls_left = active_walls;
        view_game.p2_walls_left = opp_walls;
        std::memcpy(view_game.h_walls, game.h_walls, sizeof(game.h_walls));
        std::memcpy(view_game.v_walls, game.v_walls, sizeof(game.v_walls));
    } else {
        // Rotate state by 180 degrees for Player 2 perspective
        active_pos = {8 - game.p2_pos.first, 8 - game.p2_pos.second};
        opp_pos = {8 - game.p1_pos.first, 8 - game.p1_pos.second};
        active_walls = game.p2_walls_left;
        opp_walls = game.p1_walls_left;
        view_game.p1_pos = active_pos;
        view_game.p2_pos = opp_pos;
        view_game.p1_walls_left = active_walls;
        view_game.p2_walls_left = opp_walls;
        for (int x = 0; x < 8; ++x) {
            for (int y = 0; y < 8; ++y) {
                view_game.h_walls[7 - x][7 - y] = game.h_walls[x][y];
                view_game.v_walls[7 - x][7 - y] = game.v_walls[x][y];
            }
        }
    }

    // 0. Active pawn position
    set_val(0, active_pos.first, active_pos.second, 1.0f);
    
    // 1. Opponent pawn position
    set_val(1, opp_pos.first, opp_pos.second, 1.0f);
    
    // 2. Horizontal walls (8x8 in 9x9)
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            if (view_game.h_walls[x][y]) set_val(2, x, y, 1.0f);
        }
    }
    
    // 3. Vertical walls (8x8 in 9x9)
    for (int x = 0; x < 8; ++x) {
        for (int y = 0; y < 8; ++y) {
            if (view_game.v_walls[x][y]) set_val(3, x, y, 1.0f);
        }
    }
    
    // 4. Active player 2D Reverse-BFS Distance Map (to target row 8)
    int R_active[9][9];
    compute_reverse_bfs_distances(view_game, 8, R_active);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(4, x, y, std::min(static_cast<float>(R_active[x][y]) / 20.0f, 1.0f));
        }
    }
    
    // 5. Opponent player 2D Reverse-BFS Distance Map (to target row 0)
    int R_opp[9][9];
    compute_reverse_bfs_distances(view_game, 0, R_opp);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(5, x, y, std::min(static_cast<float>(R_opp[x][y]) / 20.0f, 1.0f));
        }
    }
    
    // 6. Active player All-Shortest-Paths DAG Criticality Mask
    float crit_active[9][9];
    compute_dag_criticality(view_game, active_pos, 8, R_active, crit_active);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(6, x, y, crit_active[x][y]);
        }
    }
    
    // 7. Opponent player All-Shortest-Paths DAG Criticality Mask
    float crit_opp[9][9];
    compute_dag_criticality(view_game, opp_pos, 0, R_opp, crit_opp);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(7, x, y, crit_opp[x][y]);
        }
    }
    
    // 8. Active walls left / 10.0
    float active_walls_norm = std::min(static_cast<float>(active_walls) / 10.0f, 1.0f);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(8, x, y, active_walls_norm);
        }
    }
    
    // 9. Opponent walls left / 10.0
    float opp_walls_norm = std::min(static_cast<float>(opp_walls) / 10.0f, 1.0f);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(9, x, y, opp_walls_norm);
        }
    }
    
    // 10. Path advantage: (opp_dist - active_dist) / 16.0, clamped to [-1, 1]
    // alongside jump-parity tempo: even Manhattan distance gives active player straight jump initiative (+1.0),
    // odd gives opponent jump initiative (-1.0). Arranged in checkerboard ((x+y)%2 == 0: path_advantage, odd: jump_parity)
    // preserving horizontal symmetry and 180-degree perspective invariance.
    float active_dist_raw = static_cast<float>(R_active[active_pos.first][active_pos.second]);
    float opp_dist_raw = static_cast<float>(R_opp[opp_pos.first][opp_pos.second]);
    float path_advantage = std::max(-1.0f, std::min(1.0f, (opp_dist_raw - active_dist_raw) / 16.0f));
    int m_dist = std::abs(active_pos.first - opp_pos.first) + std::abs(active_pos.second - opp_pos.second);
    float jump_parity = (m_dist % 2 == 0) ? 1.0f : -1.0f;
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            float val = ((x + y) % 2 == 0) ? path_advantage : jump_parity;
            set_val(10, x, y, val);
        }
    }
    
    return tensor;
}

std::pair<std::vector<std::vector<int>>, std::vector<double>> MCTS::run_search_batched(
    const std::vector<QuoridorGame>& games,
    ModelEvalCallback eval_cb,
    int num_simulations
) {
    int K = static_cast<int>(games.size());
    
    // 1. Initialize root nodes
    std::vector<MCTSNode*> roots(K);
    for (int i = 0; i < K; ++i) {
        roots[i] = new MCTSNode(games[i]);
    }
    
    std::random_device rd;
    std::mt19937 gen(rd());

    struct GumbelCandidate {
        int action_idx;
        double gumbel_noise;
        double prior;
        bool active;
    };
    std::vector<std::vector<GumbelCandidate>> gumbel_candidates(K);
    bool is_gumbel_active = use_gumbel || (num_simulations <= 128);
    
    // 2. Perform simulations with Virtual Loss parallel batching
    int virtual_batch_size = 4;
    for (int sim = 0; sim < num_simulations; sim += virtual_batch_size) {
        int current_batch_run = std::min(virtual_batch_size, num_simulations - sim);
        
        struct TraversalItem {
            int game_idx;
            MCTSNode* leaf;
            std::vector<MCTSNode*> path;
            bool from_tt = false;
            std::vector<float> cached_policy;
            float cached_value = 0.0f;
            uint64_t canon_hash = 0;
            bool is_mirrored = false;
        };
        std::vector<TraversalItem> traversals;
        std::vector<int> eval_indices;
        std::vector<float> batched_inputs;

        // --- Selection Step with Virtual Loss ---
        for (int v_step = 0; v_step < current_batch_run; ++v_step) {
            for (int i = 0; i < K; ++i) {
                MCTSNode* node = roots[i];
                std::vector<MCTSNode*> path;
                path.push_back(node);
                node->virtual_loss += 1;

                while (!node->is_leaf() && node->game_state.is_game_over() == 0 && (node == roots[i] || node->proven_status == ProvenStatus::UNRESOLVED)) {
                    MCTSNode* best_child = nullptr;
                    double best_score = -1e9;

                    // Root Selection: Gumbel Sequential Halving or KataGo Forced Playouts
                    if (node == roots[i]) {
                        if (is_gumbel_active && !gumbel_candidates[i].empty()) {
                            int min_visits = 1e9;
                            double best_perturbed = -1e9;
                            for (const auto& cand : gumbel_candidates[i]) {
                                if (!cand.active) continue;
                                auto it = node->children.find(cand.action_idx);
                                if (it != node->children.end()) {
                                    MCTSNode* child = it->second;
                                    int eff_N = child->N + child->virtual_loss;
                                    double perturbed = std::log(std::max(1e-8, cand.prior)) + cand.gumbel_noise;
                                    if (eff_N < min_visits || (eff_N == min_visits && perturbed > best_perturbed)) {
                                        min_visits = eff_N;
                                        best_perturbed = perturbed;
                                        best_child = child;
                                    }
                                }
                            }
                        } else {
                            // KataGo Forced Playouts at root node
                            double k_forced = 2.0;
                            double sqrt_root_n = std::sqrt(std::max(1, node->N));
                            double max_deficit = 0.0;
                            for (const auto& pair : node->children) {
                                MCTSNode* child = pair.second;
                                int n_forced = static_cast<int>(std::floor(k_forced * child->prior * sqrt_root_n));
                                int eff_N = child->N + child->virtual_loss;
                                if (eff_N < n_forced) {
                                    double deficit = n_forced - eff_N;
                                    if (deficit > max_deficit) {
                                        max_deficit = deficit;
                                        best_child = child;
                                    }
                                }
                            }
                        }
                    }

                    if (best_child == nullptr) {
                        if (is_gumbel_active) {
                            double total_n = static_cast<double>(node->N + node->virtual_loss);
                            for (const auto& pair : node->children) {
                                MCTSNode* child = pair.second;
                                int eff_N = child->N + child->virtual_loss;
                                double score = child->prior - static_cast<double>(eff_N) / (1.0 + total_n);
                                if (score > best_score) {
                                    best_score = score;
                                    best_child = child;
                                }
                            }
                        } else {
                            for (const auto& pair : node->children) {
                                MCTSNode* child = pair.second;
                                int eff_N = child->N + child->virtual_loss;
                                // KataGo FPU Reduction: unvisited child receives parent Q minus c_fpu
                                double q_val = (eff_N > 0) ? -((child->W - child->virtual_loss) / eff_N) : (node->Q - c_fpu);
                                double u = q_val + c_puct * child->prior * (std::sqrt(node->N + node->virtual_loss) / (1.0 + eff_N));
                                if (u > best_score) {
                                    best_score = u;
                                    best_child = child;
                                }
                            }
                        }
                    }
                    node = best_child;
                    path.push_back(node);
                    node->virtual_loss += 1;
                }

                traversals.push_back({i, node, path});

                if (node->game_state.is_game_over() == 0 && node->is_leaf()) {
                    // Zero-Wall Race Solver check: instantly evaluate leaves without calling NN (root must expand)
                    int guaranteed = (node == roots[i]) ? 0 : node->game_state.get_guaranteed_winner();
                    if (guaranteed != 0) {
                        double g_val = (guaranteed == 1) ? (node->game_state.is_p1_turn ? 1.0 : -1.0)
                                                          : (node->game_state.is_p1_turn ? -1.0 : 1.0);
                        node->proven_status = (g_val > 0) ? ProvenStatus::PROVEN_WIN : ProvenStatus::PROVEN_LOSS;
                        bool is_mirr = false;
                        uint64_t c_hash = node->game_state.get_canonical_hash(&is_mirr);
                        tt.store(c_hash, {}, static_cast<float>(g_val), node->proven_status);
                    } else {
                        // Transposition Table lookup
                        bool is_mirr = false;
                        uint64_t c_hash = node->game_state.get_canonical_hash(&is_mirr);
                        TTEntry entry;
                        if (tt.lookup(c_hash, entry) && !entry.policy.empty()) {
                            auto& cur_trav = traversals.back();
                            cur_trav.from_tt = true;
                            cur_trav.canon_hash = c_hash;
                            cur_trav.is_mirrored = is_mirr;
                            cur_trav.cached_value = entry.value;
                            cur_trav.cached_policy = is_mirr ? mirror_policy_cpp(entry.policy) : entry.policy;
                            if (entry.proven_status != ProvenStatus::UNRESOLVED) {
                                node->proven_status = entry.proven_status;
                            }
                        } else {
                            auto& cur_trav = traversals.back();
                            cur_trav.canon_hash = c_hash;
                            cur_trav.is_mirrored = is_mirr;
                            eval_indices.push_back(static_cast<int>(traversals.size()) - 1);
                            std::vector<float> enc = encode_state_cpp(node->game_state);
                            batched_inputs.insert(batched_inputs.end(), enc.begin(), enc.end());
                        }
                    }
                }
            }
        }

        // --- Model Evaluation Step ---
        std::vector<float> batch_policies;
        std::vector<float> batch_values;
        if (!eval_indices.empty()) {
            int num_items = static_cast<int>(eval_indices.size());
            auto eval_res = eval_cb(batched_inputs, num_items);
            batch_policies = eval_res.first;
            batch_values = eval_res.second;
        }

        // --- Expansion, Un-virtual loss & Backpropagation Step ---
        std::vector<double> traversal_values(traversals.size(), 0.0);
        int eval_counter = 0;

        for (size_t t_idx = 0; t_idx < traversals.size(); ++t_idx) {
            MCTSNode* leaf = traversals[t_idx].leaf;
            bool was_leaf_unexpanded = leaf->is_leaf();

            if (leaf->game_state.is_game_over() != 0 || leaf->proven_status != ProvenStatus::UNRESOLVED) {
                if (leaf->game_state.is_game_over() != 0) {
                    int winner = leaf->game_state.is_game_over();
                    traversal_values[t_idx] = (winner == 1) ? (leaf->game_state.is_p1_turn ? 1.0 : -1.0)
                                                             : (leaf->game_state.is_p1_turn ? -1.0 : 1.0);
                    leaf->proven_status = (traversal_values[t_idx] > 0) ? ProvenStatus::PROVEN_WIN : ProvenStatus::PROVEN_LOSS;
                } else {
                    traversal_values[t_idx] = (leaf->proven_status == ProvenStatus::PROVEN_WIN) ? 1.0 : -1.0;
                }
            } else if (traversals[t_idx].from_tt) {
                traversal_values[t_idx] = traversals[t_idx].cached_value;

                if (was_leaf_unexpanded) {
                    std::vector<Action> valid_actions = leaf->game_state.get_valid_actions();
                    leaf->valid_actions = valid_actions;
                    std::vector<int> valid_indices;
                    for (const auto& act : valid_actions) {
                        valid_indices.push_back(map_action_to_index_perspective(act, leaf->game_state.is_p1_turn));
                    }
                    leaf->valid_action_indices = valid_indices;

                    std::vector<double> policy_prior(140, 0.0);
                    double policy_sum = 0.0;
                    for (int idx : valid_indices) {
                        double model_p = traversals[t_idx].cached_policy[idx];
                        policy_prior[idx] = model_p;
                        policy_sum += model_p;
                    }
                    if (policy_sum > 1e-8) {
                        for (int idx : valid_indices) policy_prior[idx] /= policy_sum;
                    } else {
                        double uniform_p = 1.0 / valid_indices.size();
                        for (int idx : valid_indices) policy_prior[idx] = uniform_p;
                    }

                    for (size_t act_idx = 0; act_idx < valid_actions.size(); ++act_idx) {
                        int global_idx = valid_indices[act_idx];
                        QuoridorGame next_game = leaf->game_state.clone_and_step(valid_actions[act_idx]);
                        leaf->children[global_idx] = new MCTSNode(
                            next_game, leaf, global_idx, policy_prior[global_idx]
                        );
                    }
                }
            } else {
                int batch_pos = eval_counter++;
                traversal_values[t_idx] = batch_values[batch_pos];
                
                int guaranteed = (leaf == roots[traversals[t_idx].game_idx]) ? 0 : leaf->game_state.get_guaranteed_winner();
                if (guaranteed != 0) {
                    traversal_values[t_idx] = (guaranteed == 1) ? (leaf->game_state.is_p1_turn ? 1.0 : -1.0)
                                                                 : (leaf->game_state.is_p1_turn ? -1.0 : 1.0);
                    leaf->proven_status = (traversal_values[t_idx] > 0) ? ProvenStatus::PROVEN_WIN : ProvenStatus::PROVEN_LOSS;
                }

                std::vector<float> raw_policy(140, 0.0f);
                for (int a = 0; a < 140; ++a) {
                    raw_policy[a] = batch_policies[batch_pos * 140 + a];
                }

                // Store canonical orientation in Transposition Table
                std::vector<float> canon_policy = traversals[t_idx].is_mirrored ? mirror_policy_cpp(raw_policy) : raw_policy;
                tt.store(traversals[t_idx].canon_hash, canon_policy, static_cast<float>(traversal_values[t_idx]), leaf->proven_status);

                if (was_leaf_unexpanded) {
                    std::vector<Action> valid_actions = leaf->game_state.get_valid_actions();
                    leaf->valid_actions = valid_actions;
                    std::vector<int> valid_indices;
                    for (const auto& act : valid_actions) {
                        valid_indices.push_back(map_action_to_index_perspective(act, leaf->game_state.is_p1_turn));
                    }
                    leaf->valid_action_indices = valid_indices;

                    std::vector<double> policy_prior(140, 0.0);
                    double policy_sum = 0.0;
                    for (int idx : valid_indices) {
                        double model_p = raw_policy[idx];
                        policy_prior[idx] = model_p;
                        policy_sum += model_p;
                    }
                    if (policy_sum > 1e-8) {
                        for (int idx : valid_indices) policy_prior[idx] /= policy_sum;
                    } else {
                        double uniform_p = 1.0 / valid_indices.size();
                        for (int idx : valid_indices) policy_prior[idx] = uniform_p;
                    }

                    for (size_t act_idx = 0; act_idx < valid_actions.size(); ++act_idx) {
                        int global_idx = valid_indices[act_idx];
                        QuoridorGame next_game = leaf->game_state.clone_and_step(valid_actions[act_idx]);
                        leaf->children[global_idx] = new MCTSNode(
                            next_game, leaf, global_idx, policy_prior[global_idx]
                        );
                    }

                    if (sim == 0 && leaf == roots[traversals[t_idx].game_idx] && !leaf->children.empty() && !is_gumbel_active) {
                        std::gamma_distribution<double> gamma(dirichlet_alpha, 1.0);
                        double noise_sum = 0.0;
                        std::vector<double> noises;
                        noises.reserve(leaf->children.size());
                        for (size_t c = 0; c < leaf->children.size(); ++c) {
                            double val = gamma(gen);
                            if (val < 1e-8) val = 1e-8;
                            noises.push_back(val);
                            noise_sum += val;
                        }
                        size_t n_idx = 0;
                        for (auto& pair : leaf->children) {
                            double n = noises[n_idx++] / noise_sum;
                            pair.second->prior = (1.0 - dirichlet_eps) * pair.second->prior + dirichlet_eps * n;
                        }
                    }
                }
            }

            // Remove Virtual Loss
            for (MCTSNode* n : traversals[t_idx].path) {
                n->virtual_loss -= 1;
            }

            // Backpropagate
            MCTSNode* node = leaf;
            double v = traversal_values[t_idx];
            while (node != nullptr) {
                node->N += 1;
                node->W += v;
                node->Q = node->W / node->N;

                if (!node->is_leaf() && node->proven_status == ProvenStatus::UNRESOLVED) {
                    bool all_children_proven_win = true; 
                    bool any_child_proven_loss = false;
                    if (node->children.empty()) {
                        all_children_proven_win = false;
                    } else {
                        for (const auto& pair : node->children) {
                            MCTSNode* child = pair.second;
                            if (child->proven_status == ProvenStatus::PROVEN_LOSS) {
                                any_child_proven_loss = true;
                                break;
                            } else if (child->proven_status != ProvenStatus::PROVEN_WIN) {
                                all_children_proven_win = false;
                            }
                        }
                    }
                    if (any_child_proven_loss) {
                        node->proven_status = ProvenStatus::PROVEN_WIN;
                        node->Q = 1.0;
                        node->W = node->N * 1.0;
                    } else if (all_children_proven_win && node->children.size() == node->valid_actions.size()) {
                        node->proven_status = ProvenStatus::PROVEN_LOSS;
                        node->Q = -1.0;
                        node->W = node->N * -1.0;
                    }
                }

                if (node->proven_status == ProvenStatus::PROVEN_WIN) {
                    v = 1.0;
                } else if (node->proven_status == ProvenStatus::PROVEN_LOSS) {
                    v = -1.0;
                } else {
                    v = node->Q;
                }
                v = -v;
                node = node->parent;
            }
        }

        // Initialize Gumbel candidates after root expansion at sim == 0
        if (sim == 0 && is_gumbel_active) {
            std::uniform_real_distribution<double> unif(1e-7, 1.0 - 1e-7);
            for (int i = 0; i < K; ++i) {
                MCTSNode* root = roots[i];
                if (root->children.empty()) continue;
                struct CandScore {
                    int act_idx;
                    double noise;
                    double prior;
                    double perturbed_logit;
                };
                std::vector<CandScore> scores;
                for (const auto& pair : root->children) {
                    double u = unif(gen);
                    double g = -std::log(-std::log(u));
                    double score = std::log(std::max(1e-8, pair.second->prior)) + g;
                    scores.push_back({pair.first, g, pair.second->prior, score});
                }
                std::sort(scores.begin(), scores.end(), [](const CandScore& a, const CandScore& b) {
                    return a.perturbed_logit > b.perturbed_logit;
                });
                int m_top = std::min(16, static_cast<int>(scores.size()));
                for (int s_idx = 0; s_idx < static_cast<int>(scores.size()); ++s_idx) {
                    bool active = (s_idx < m_top);
                    gumbel_candidates[i].push_back({scores[s_idx].act_idx, scores[s_idx].noise, scores[s_idx].prior, active});
                }
            }
        }

        // Sequential Halving checkpoints (at 25%, 50%, 75% of simulation budget)
        if (is_gumbel_active && sim > 0) {
            int q1 = num_simulations / 4;
            int q2 = num_simulations / 2;
            int q3 = (3 * num_simulations) / 4;
            bool is_checkpoint = (sim == q1 || sim == q2 || sim == q3 || (sim + virtual_batch_size >= num_simulations));
            if (is_checkpoint) {
                for (int i = 0; i < K; ++i) {
                    MCTSNode* root = roots[i];
                    std::vector<int> active_indices;
                    for (size_t c_idx = 0; c_idx < gumbel_candidates[i].size(); ++c_idx) {
                        if (gumbel_candidates[i][c_idx].active) {
                            active_indices.push_back(static_cast<int>(c_idx));
                        }
                    }
                    if (active_indices.size() > 1) {
                        int max_child_N = 0;
                        for (const auto& pair : root->children) {
                            if (pair.second->N > max_child_N) max_child_N = pair.second->N;
                        }
                        double sigma_scale = (50.0 + max_child_N) * 1.0;

                        std::sort(active_indices.begin(), active_indices.end(), [&](int a_idx, int b_idx) {
                            const auto& cand_a = gumbel_candidates[i][a_idx];
                            const auto& cand_b = gumbel_candidates[i][b_idx];
                            MCTSNode* child_a = root->children[cand_a.action_idx];
                            MCTSNode* child_b = root->children[cand_b.action_idx];
                            double q_a = child_a->N > 0 ? -child_a->Q : -1.0;
                            double q_b = child_b->N > 0 ? -child_b->Q : -1.0;
                            double score_a = std::log(std::max(1e-8, cand_a.prior)) + cand_a.gumbel_noise + sigma_scale * q_a;
                            double score_b = std::log(std::max(1e-8, cand_b.prior)) + cand_b.gumbel_noise + sigma_scale * q_b;
                            return score_a > score_b;
                        });
                        int keep_count = std::max(1, static_cast<int>(active_indices.size()) / 2);
                        for (size_t k = keep_count; k < active_indices.size(); ++k) {
                            gumbel_candidates[i][active_indices[k]].active = false;
                        }
                    }
                }
            }
        }
    }
    
    // 3. Package visit count distributions and root Q values with Policy Target Pruning / Completed Q Targets
    std::vector<std::vector<int>> visit_counts(K, std::vector<int>(140, 0));
    std::vector<double> root_q_values(K, 0.0);
    
    for (int i = 0; i < K; ++i) {
        root_q_values[i] = roots[i]->Q;

        if (is_gumbel_active) {
            // Gumbel Completed Q-values Policy Target:
            // pi'(a) = softmax(logit(a) + sigma(completedQ(a)))
            int max_child_n = 0;
            for (const auto& pair : roots[i]->children) {
                if (pair.second->N > max_child_n) max_child_n = pair.second->N;
            }
            double sigma_scale = (50.0 + max_child_n) * 1.0;

            double min_visited_q = 1.0;
            bool any_visited = false;
            for (const auto& pair : roots[i]->children) {
                if (pair.second->N > 0) {
                    double q_val = -pair.second->Q;
                    if (q_val < min_visited_q) min_visited_q = q_val;
                    any_visited = true;
                }
            }
            if (!any_visited) min_visited_q = roots[i]->Q - c_fpu;

            double max_logit = -1e9;
            std::vector<std::pair<int, double>> imp_logits;
            for (const auto& pair : roots[i]->children) {
                int a_idx = pair.first;
                MCTSNode* child = pair.second;
                double q_a = (child->N > 0) ? -child->Q : min_visited_q;
                double l = std::log(std::max(1e-8, child->prior)) + sigma_scale * q_a;
                imp_logits.push_back({a_idx, l});
                if (l > max_logit) max_logit = l;
            }

            double sum_exp = 0.0;
            std::vector<std::pair<int, double>> exp_probs;
            for (const auto& p : imp_logits) {
                double e = std::exp(p.second - max_logit);
                exp_probs.push_back({p.first, e});
                sum_exp += e;
            }

            for (const auto& p : exp_probs) {
                double prob = (sum_exp > 1e-9) ? (p.second / sum_exp) : (1.0 / exp_probs.size());
                visit_counts[i][p.first] = std::max(1, static_cast<int>(std::round(prob * 10000.0)));
            }
        } else {
            int best_act = -1;
            int max_n = -1;
            for (const auto& pair : roots[i]->children) {
                if (pair.second->N > max_n) {
                    max_n = pair.second->N;
                    best_act = pair.first;
                }
            }

            double k_forced = 2.0;
            double sqrt_root_n = std::sqrt(std::max(1, roots[i]->N));
            int pruned_sum = 0;

            for (const auto& pair : roots[i]->children) {
                int action_idx = pair.first;
                MCTSNode* child = pair.second;
                int n_forced = static_cast<int>(std::floor(k_forced * child->prior * sqrt_root_n));
                int pruned_visits = child->N;
                if (action_idx != best_act) {
                    pruned_visits = std::max(0, child->N - n_forced);
                }
                visit_counts[i][action_idx] = pruned_visits;
                pruned_sum += pruned_visits;
            }

            if (pruned_sum == 0) {
                for (const auto& pair : roots[i]->children) {
                    visit_counts[i][pair.first] = pair.second->N;
                }
            }
        }

        delete roots[i]; // Cleans up the tree recursively
    }
    
    return {visit_counts, root_q_values};
}
