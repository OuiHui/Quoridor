#pragma once

#include "quoridor_simulator.h"
#include <map>
#include <unordered_map>
#include <vector>
#include <memory>
#include <functional>
#include <cstdint>

enum class ProvenStatus {
    UNRESOLVED,
    PROVEN_WIN,
    PROVEN_LOSS
};

struct TTEntry {
    std::vector<float> policy; // 140 floats
    float value = 0.0f;
    ProvenStatus proven_status = ProvenStatus::UNRESOLVED;
};

class TranspositionTable {
public:
    std::unordered_map<uint64_t, TTEntry> table;
    size_t max_entries;

    TranspositionTable(size_t max_size = 200000) : max_entries(max_size) {}

    bool lookup(uint64_t hash, TTEntry& entry) const {
        auto it = table.find(hash);
        if (it != table.end()) {
            entry = it->second;
            return true;
        }
        return false;
    }

    void store(uint64_t hash, const std::vector<float>& policy, float value, ProvenStatus status = ProvenStatus::UNRESOLVED) {
        if (table.size() >= max_entries) {
            table.clear();
        }
        TTEntry& e = table[hash];
        e.policy = policy;
        e.value = value;
        e.proven_status = status;
    }

    void clear() {
        table.clear();
    }

    size_t size() const {
        return table.size();
    }
};

struct MCTSNode {
    QuoridorGame game_state;
    MCTSNode* parent = nullptr;
    int action_idx = -1;
    double prior = 0.0;
    int N = 0;
    double W = 0.0;
    double Q = 0.0;
    int virtual_loss = 0;
    ProvenStatus proven_status = ProvenStatus::UNRESOLVED;
    std::map<int, MCTSNode*> children;
    std::vector<Action> valid_actions;
    std::vector<int> valid_action_indices;

    MCTSNode(const QuoridorGame& state, MCTSNode* parent_node = nullptr, int act_idx = -1, double p = 0.0);
    ~MCTSNode();

    bool is_leaf() const;
};

// Python evaluation callback signature: takes a flat float array of batched states of size M*11*9*9
// Returns a pair of: (flat policy float array of size M*140, flat value float array of size M)
typedef std::function<std::pair<std::vector<float>, std::vector<float>>(const std::vector<float>&, int)> ModelEvalCallback;

class MCTS {
public:
    double c_puct;
    double dirichlet_alpha;
    double dirichlet_eps;
    double c_fpu;
    bool use_gumbel;
    TranspositionTable tt;

    MCTS(double c_puct = 1.4, double dirichlet_alpha = 0.07, double dirichlet_eps = 0.15, double c_fpu = 0.20, bool use_gumbel = false);

    void clear_transposition_table() { tt.clear(); }
    size_t get_tt_size() const { return tt.size(); }
    static std::vector<float> mirror_policy_cpp(const std::vector<float>& policy);

    // Parallel lock-step MCTS search for a batch of games.
    // games: list of QuoridorGame objects
    // eval_cb: Python callback to run neural net inference
    // num_simulations: number of simulations per move
    // Returns: a pair of: (visit counts for each game [K][140], average Q value of the root nodes [K])
    std::pair<std::vector<std::vector<int>>, std::vector<double>> run_search_batched(
        const std::vector<QuoridorGame>& games,
        ModelEvalCallback eval_cb,
        int num_simulations
    );

    // Encodes a single game state from the active player's perspective into a flat float vector of size 11*9*9
    static std::vector<float> encode_state_cpp(const QuoridorGame& game);
};
