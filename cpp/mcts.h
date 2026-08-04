#pragma once

#include "quoridor_simulator.h"
#include <map>
#include <vector>
#include <memory>
#include <functional>

enum class ProvenStatus {
    UNRESOLVED,
    PROVEN_WIN,
    PROVEN_LOSS
};

struct MCTSNode {
    QuoridorGame game_state;
    MCTSNode* parent = nullptr;
    int action_idx = -1;
    double prior = 0.0;
    int N = 0;
    double W = 0.0;
    double Q = 0.0;
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

    MCTS(double c_puct = 1.4, double dirichlet_alpha = 0.3, double dirichlet_eps = 0.15);

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
