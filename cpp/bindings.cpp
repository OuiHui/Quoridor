#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>
#include "quoridor_simulator.h"
#include "mcts.h"

namespace py = pybind11;

// Wrapper function to run the batch MCTS search from Python
std::pair<py::list, py::list> run_search_batched_py(
    MCTS& mcts,
    const py::list& games_py,
    py::function eval_cb_py,
    int num_simulations
) {
    int K = py::len(games_py);
    std::vector<QuoridorGame> games(K);
    for (int i = 0; i < K; ++i) {
        games[i] = games_py[i].cast<QuoridorGame>();
    }
    
    // Define the C++ callback wrapping the Python callable
    ModelEvalCallback cpp_cb = [&eval_cb_py](const std::vector<float>& inputs, int num_items) {
        // Construct NumPy array input of shape [M, 11, 9, 9]
        py::array_t<float> input_array({static_cast<size_t>(num_items), static_cast<size_t>(11), static_cast<size_t>(9), static_cast<size_t>(9)}, inputs.data());
        
        // Invoke python neural-net evaluator
        py::tuple out = eval_cb_py(input_array).cast<py::tuple>();
        
        // Extract values
        py::array_t<float> policies_arr = out[0].cast<py::array_t<float>>();
        py::array_t<float> values_arr = out[1].cast<py::array_t<float>>();
        
        std::vector<float> policies(policies_arr.data(), policies_arr.data() + policies_arr.size());
        std::vector<float> values(values_arr.data(), values_arr.data() + values_arr.size());
        
        return std::make_pair(policies, values);
    };
    
    // Run search
    auto results = mcts.run_search_batched(games, cpp_cb, num_simulations);
    
    // Package outputs back to python lists
    py::list visit_counts_py;
    for (int i = 0; i < K; ++i) {
        py::list counts;
        for (int v : results.first[i]) {
            counts.append(v);
        }
        visit_counts_py.append(counts);
    }
    
    py::list q_values_py;
    for (double q : results.second) {
        q_values_py.append(q);
    }
    
    return std::make_pair(visit_counts_py, q_values_py);
}

PYBIND11_MODULE(quoridor_cpp, m) {
    m.doc() = "High-performance C++ Quoridor Simulator and AlphaZero MCTS Engine bindings";

    py::class_<Action>(m, "Action")
        .def(py::init<>())
        .def_readwrite("type", &Action::type)
        .def_readwrite("move_dir", &Action::move_dir)
        .def_readwrite("to_x", &Action::to_x)
        .def_readwrite("to_y", &Action::to_y)
        .def_readwrite("wall_type", &Action::wall_type)
        .def_readwrite("wall_x", &Action::wall_x)
        .def_readwrite("wall_y", &Action::wall_y)
        .def_static("Move", &Action::Move)
        .def_static("Wall", &Action::Wall);

    py::class_<QuoridorGame>(m, "QuoridorGame")
        .def(py::init<>())
        .def_readwrite("p1_pos", &QuoridorGame::p1_pos)
        .def_readwrite("p2_pos", &QuoridorGame::p2_pos)
        .def_readwrite("p1_walls_left", &QuoridorGame::p1_walls_left)
        .def_readwrite("p2_walls_left", &QuoridorGame::p2_walls_left)
        .def_readwrite("is_p1_turn", &QuoridorGame::is_p1_turn)
        .def_readwrite("h_bitboard", &QuoridorGame::h_bitboard)
        .def_readwrite("v_bitboard", &QuoridorGame::v_bitboard)
        .def("update_bitboards", &QuoridorGame::update_bitboards)
        .def("get_canonical_hash", [](const QuoridorGame& g) {
            bool is_mirr = false;
            uint64_t h = g.get_canonical_hash(&is_mirr);
            return py::make_tuple(h, is_mirr);
        })
        .def_static("mirror_bitboard_horizontal", &QuoridorGame::mirror_bitboard_horizontal)
        .def("clone", &QuoridorGame::clone)
        .def("clone_and_step", &QuoridorGame::clone_and_step)
        .def("is_move_blocked", &QuoridorGame::is_move_blocked)
        .def("get_shortest_path", &QuoridorGame::get_shortest_path, py::arg("start"), py::arg("target_y"), py::arg("opp_pos") = std::pair<int, int>{-1, -1})
        .def("has_path_to_row", &QuoridorGame::has_path_to_row)
        .def("get_valid_pawn_moves", &QuoridorGame::get_valid_pawn_moves)
        .def("validate_wall_placement", &QuoridorGame::validate_wall_placement)
        .def("validate_wall_placement_cached", &QuoridorGame::validate_wall_placement_cached)
        .def("count_wall_contacts", &QuoridorGame::count_wall_contacts)
        .def("get_candidate_walls", &QuoridorGame::get_candidate_walls)
        .def("get_valid_actions", &QuoridorGame::get_valid_actions)
        .def("step", &QuoridorGame::step)
        .def("is_game_over", &QuoridorGame::is_game_over)
        .def("get_guaranteed_winner", &QuoridorGame::get_guaranteed_winner)
        .def("are_shortest_path_dags_disjoint", [](const QuoridorGame& g) {
            int l1 = 0, l2 = 0;
            bool disjoint = g.are_shortest_path_dags_disjoint(l1, l2);
            return std::make_tuple(disjoint, l1, l2);
        })
        .def("evaluate_heuristic", &QuoridorGame::evaluate_heuristic)
        // Helper properties to fetch sets/dicts matching the python simulator behavior
        .def_property_readonly("h_walls", &QuoridorGame::get_h_walls_set)
        .def_property_readonly("v_walls", &QuoridorGame::get_v_walls_set)
        .def_property_readonly("h_wall_owners", &QuoridorGame::get_h_wall_owners_map)
        .def_property_readonly("v_wall_owners", &QuoridorGame::get_v_wall_owners_map);

    py::class_<MCTS>(m, "MCTS")
        .def(py::init<double, double, double, double, bool>(), py::arg("c_puct") = 1.4, py::arg("dirichlet_alpha") = 0.3, py::arg("dirichlet_eps") = 0.25, py::arg("c_fpu") = 0.20, py::arg("use_gumbel") = false)
        .def_readwrite("c_puct", &MCTS::c_puct)
        .def_readwrite("dirichlet_alpha", &MCTS::dirichlet_alpha)
        .def_readwrite("dirichlet_eps", &MCTS::dirichlet_eps)
        .def_readwrite("c_fpu", &MCTS::c_fpu)
        .def_readwrite("use_gumbel", &MCTS::use_gumbel)
        .def("clear_transposition_table", &MCTS::clear_transposition_table)
        .def("get_tt_size", &MCTS::get_tt_size)
        .def_static("mirror_policy_cpp", &MCTS::mirror_policy_cpp)
        .def("run_search_batched", &run_search_batched_py)
        .def_static("encode_state_cpp", &MCTS::encode_state_cpp);
}
