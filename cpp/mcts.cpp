#include "mcts.h"
#include <cmath>
#include <random>
#include <algorithm>
#include <iostream>

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

// MCTS implementation
MCTS::MCTS(double c_puct, double dirichlet_alpha, double dirichlet_eps)
    : c_puct(c_puct), dirichlet_alpha(dirichlet_alpha), dirichlet_eps(dirichlet_eps) {
}

std::vector<float> MCTS::encode_state_cpp(const QuoridorGame& game) {
    // 11 channels of 9x9 size = 891 elements
    std::vector<float> tensor(11 * 9 * 9, 0.0f);
    
    // Macro helper to set value at (ch, x, y)
    auto set_val = [&](int ch, int x, int y, float val) {
        tensor[ch * 9 * 9 + x * 9 + y] = val;
    };
    
    std::pair<int, int> active_pos, opp_pos;
    int active_walls, opp_walls;
    
    // Wall lists to encode
    std::vector<std::pair<int, int>> h_encoded, v_encoded;
    
    // Shortest path lists
    std::vector<std::pair<int, int>> p1_path = game.get_shortest_path(game.p1_pos, 8, game.p2_pos);
    std::vector<std::pair<int, int>> p2_path = game.get_shortest_path(game.p2_pos, 0, game.p1_pos);
    std::vector<std::pair<int, int>> active_path, opp_path;

    if (game.is_p1_turn) {
        active_pos = game.p1_pos;
        opp_pos = game.p2_pos;
        active_walls = game.p1_walls_left;
        opp_walls = game.p2_walls_left;
        active_path = p1_path;
        opp_path = p2_path;
        
        for (int x = 0; x < 8; ++x) {
            for (int y = 0; y < 8; ++y) {
                if (game.h_walls[x][y]) h_encoded.push_back({x, y});
                if (game.v_walls[x][y]) v_encoded.push_back({x, y});
            }
        }
    } else {
        // Rotate state by 180 degrees for Player 2 perspective
        active_pos = {8 - game.p2_pos.first, 8 - game.p2_pos.second};
        opp_pos = {8 - game.p1_pos.first, 8 - game.p1_pos.second};
        active_walls = game.p2_walls_left;
        opp_walls = game.p1_walls_left;
        
        for (const auto& pt : p2_path) active_path.push_back({8 - pt.first, 8 - pt.second});
        for (const auto& pt : p1_path) opp_path.push_back({8 - pt.first, 8 - pt.second});
        
        for (int x = 0; x < 8; ++x) {
            for (int y = 0; y < 8; ++y) {
                if (game.h_walls[x][y]) h_encoded.push_back({7 - x, 7 - y});
                if (game.v_walls[x][y]) v_encoded.push_back({7 - x, 7 - y});
            }
        }
    }

    // 0. Active pawn position
    set_val(0, active_pos.first, active_pos.second, 1.0f);
    
    // 1. Opponent pawn position
    set_val(1, opp_pos.first, opp_pos.second, 1.0f);
    
    // 2. Horizontal walls
    for (const auto& pt : h_encoded) {
        if (pt.first >= 0 && pt.first < 8 && pt.second >= 0 && pt.second < 8) {
            set_val(2, pt.first, pt.second, 1.0f);
        }
    }
    
    // 3. Vertical walls
    for (const auto& pt : v_encoded) {
        if (pt.first >= 0 && pt.first < 8 && pt.second >= 0 && pt.second < 8) {
            set_val(3, pt.first, pt.second, 1.0f);
        }
    }
    
    // 4. Active player shortest path length / 20.0
    float active_dist_norm = std::min(static_cast<float>(active_path.empty() ? 20 : active_path.size()) / 20.0f, 1.0f);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(4, x, y, active_dist_norm);
        }
    }
    
    // 5. Opponent shortest path length / 20.0
    float opp_dist_norm = std::min(static_cast<float>(opp_path.empty() ? 20 : opp_path.size()) / 20.0f, 1.0f);
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(5, x, y, opp_dist_norm);
        }
    }
    
    // 6. Active path cell mask
    for (const auto& pt : active_path) {
        set_val(6, pt.first, pt.second, 1.0f);
    }
    
    // 7. Opponent path cell mask
    for (const auto& pt : opp_path) {
        set_val(7, pt.first, pt.second, 1.0f);
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
    
    // 10. Unused padding channel
    for (int x = 0; x < 9; ++x) {
        for (int y = 0; y < 9; ++y) {
            set_val(10, x, y, 0.0f);
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
    
    // 2. Perform simulations in lock-step
    for (int sim = 0; sim < num_simulations; ++sim) {
        std::vector<MCTSNode*> selected_leaves(K, nullptr);
        std::vector<int> eval_indices; // indices in [0, K-1] needing model evaluation
        std::vector<float> batched_inputs; // flat size: eval_indices.size() * 11 * 9 * 9
        
        // --- Selection Step ---
        for (int i = 0; i < K; ++i) {
            MCTSNode* node = roots[i];
            
            // Traverse PUCT down to leaf
            while (!node->is_leaf() && node->game_state.is_game_over() == 0) {
                MCTSNode* best_child = nullptr;
                double best_score = -1e9;
                
                for (const auto& pair : node->children) {
                    MCTSNode* child = pair.second;
                    double q_val = (child->N > 0) ? -child->Q : node->Q;
                    double u = q_val + c_puct * child->prior * (std::sqrt(node->N) / (1.0 + child->N));
                    if (u > best_score) {
                        best_score = u;
                        best_child = child;
                    }
                }
                node = best_child;
            }
            selected_leaves[i] = node;
            
            // Check if leaf requires neural network expansion
            if (node->game_state.is_game_over() == 0 && node->is_leaf()) {
                eval_indices.push_back(i);
                std::vector<float> enc = encode_state_cpp(node->game_state);
                batched_inputs.insert(batched_inputs.end(), enc.begin(), enc.end());
            }
        }
        
        // --- Expansion and Evaluation Step ---
        std::vector<float> batch_policies; // shape: [eval_indices.size() * 140]
        std::vector<float> batch_values;   // shape: [eval_indices.size()]
        
        if (!eval_indices.empty()) {
            int num_batch_items = static_cast<int>(eval_indices.size());
            // Call the python callback
            auto eval_res = eval_cb(batched_inputs, num_batch_items);
            batch_policies = eval_res.first;
            batch_values = eval_res.second;
        }
        
        int eval_counter = 0;
        for (int i = 0; i < K; ++i) {
            MCTSNode* leaf = selected_leaves[i];
            double leaf_value = 0.0;
            
            if (leaf->game_state.is_game_over() != 0) {
                // Game over at leaf, reward is terminal status
                int winner = leaf->game_state.is_game_over();
                // Reward from current active perspective:
                leaf_value = (winner == 1) ? (leaf->game_state.is_p1_turn ? 1.0 : -1.0) 
                                           : (leaf->game_state.is_p1_turn ? -1.0 : 1.0);
                leaf->proven_status = (leaf_value > 0) ? ProvenStatus::PROVEN_WIN : ProvenStatus::PROVEN_LOSS;
            } else {
                // Fetch evaluation result from batch
                int batch_idx = eval_counter++;
                leaf_value = batch_values[batch_idx];
                
                int guaranteed = leaf->game_state.get_guaranteed_winner();
                if (guaranteed != 0) {
                    leaf_value = (guaranteed == 1) ? (leaf->game_state.is_p1_turn ? 1.0 : -1.0)
                                                   : (leaf->game_state.is_p1_turn ? -1.0 : 1.0);
                    leaf->proven_status = (leaf_value > 0) ? ProvenStatus::PROVEN_WIN : ProvenStatus::PROVEN_LOSS;
                }
                
                // Get legal actions
                std::vector<Action> valid_actions = leaf->game_state.get_valid_actions();
                leaf->valid_actions = valid_actions;
                
                std::vector<int> valid_indices;
                for (const auto& act : valid_actions) {
                    valid_indices.push_back(map_action_to_index_perspective(act, leaf->game_state.is_p1_turn));
                }
                leaf->valid_action_indices = valid_indices;
                
                // Parse and mask model policy
                std::vector<double> policy_prior(140, 0.0);
                double policy_sum = 0.0;
                for (int idx : valid_indices) {
                    double model_p = batch_policies[batch_idx * 140 + idx];
                    policy_prior[idx] = model_p;
                    policy_sum += model_p;
                }
                
                // Normalize priors
                if (policy_sum > 1e-8) {
                    for (int idx : valid_indices) {
                        policy_prior[idx] /= policy_sum;
                    }
                } else {
                    double uniform_p = 1.0 / valid_indices.size();
                    for (int idx : valid_indices) {
                        policy_prior[idx] = uniform_p;
                    }
                }
                
                // Expand node children
                for (size_t act_idx = 0; act_idx < valid_actions.size(); ++act_idx) {
                    int global_idx = valid_indices[act_idx];
                    QuoridorGame next_game = leaf->game_state.clone_and_step(valid_actions[act_idx]);
                    
                    leaf->children[global_idx] = new MCTSNode(
                        next_game, leaf, global_idx, policy_prior[global_idx]
                    );
                }
                
                // Add Standard Dirichlet Noise at root across all legal child actions
                if (sim == 0 && leaf == roots[i] && !leaf->children.empty()) {
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
                    
                    size_t idx = 0;
                    for (auto& pair : leaf->children) {
                        double n = noises[idx++] / noise_sum;
                        pair.second->prior = (1.0 - dirichlet_eps) * pair.second->prior + dirichlet_eps * n;
                    }
                }
            }
            
            // --- Backpropagation Step ---
            MCTSNode* node = leaf;
            double v = leaf_value;
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

                // If node is proven, force v to be the proven value for its parent
                if (node->proven_status == ProvenStatus::PROVEN_WIN) {
                    v = 1.0;
                } else if (node->proven_status == ProvenStatus::PROVEN_LOSS) {
                    v = -1.0;
                } else {
                    v = node->Q; // standard PUCT backprop
                }
                
                v = -v; // Flip perspective for parent
                node = node->parent;
            }
        }
    }
    
    // 3. Package visit count distributions and root Q values
    std::vector<std::vector<int>> visit_counts(K, std::vector<int>(140, 0));
    std::vector<double> root_q_values(K, 0.0);
    
    for (int i = 0; i < K; ++i) {
        root_q_values[i] = roots[i]->Q;
        for (const auto& pair : roots[i]->children) {
            int action_idx = pair.first;
            MCTSNode* child = pair.second;
            visit_counts[i][action_idx] = child->N;
        }
        delete roots[i]; // Cleans up the tree recursively
    }
    
    return {visit_counts, root_q_values};
}
