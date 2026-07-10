// Openings Database
export const PLAYBOOK_DATA = {
    reed: {
        title: "Dr. Reed's Opening (Double Wall)",
        side: "p1",
        description: "Places two horizontal walls early on at c3h and f3h. This creates a narrow bottleneck in the center, forcing the opponent to navigate through a controlled corridor while you advance your pawn.",
        moves: [
            { notation: 'e2', desc: "Player 1 steps forward, claiming center presence." },
            { notation: 'e8', desc: "Player 2 mirrors, moving forward to e8." },
            { notation: 'e3', desc: "Player 1 advances to e3, expanding space." },
            { notation: 'e7', desc: "Player 2 advances to e7, meeting Player 1." },
            { notation: 'c3h', desc: "Player 1 places a horizontal wall at c3h. This closes off the left side of the third row." },
            { notation: 'd7h', desc: "Player 2 places d7h to establish their own defensive block." },
            { notation: 'f3h', desc: "Player 1 places the second horizontal wall at f3h. The Reed double-wall structure is complete!" },
            { notation: 'f7h', desc: "Player 2 blocks the right side at f7h, neutralizing symmetry." },
            { notation: 'e4', desc: "Player 1 steps into the bottleneck at e4, ready to break through." }
        ]
    },
    shiller: {
        title: "Shiller Opening (Tempo Vertical)",
        side: "p1",
        description: "Named after Champion Larry Shiller. After three pawn moves, Player 1 places a vertical wall directly behind their pawn. This aligns Player 1's own path while adding complex routing decisions for the opponent.",
        moves: [
            { notation: 'e2', desc: "Player 1 steps forward to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'e3', desc: "Player 1 advances to e3." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'e4', desc: "Player 1 reaches the center line at e4." },
            { notation: 'e6', desc: "Player 2 meets Player 1 face-to-face at e6." },
            { notation: 'e2v', desc: "Player 1 places a vertical wall at e2v, directly behind their pawn to secure their alignment." },
            { notation: 'd3h', desc: "Player 2 places a horizontal wall at d3h to defend the flank." },
            { notation: 'd4', desc: "Player 1 sidesteps to d4, seeking a path around the center." }
        ]
    },
    'center-rush': {
        title: "Standard Center Rush",
        side: "p1",
        description: "Focuses strictly on pawn movement speed. Players race to the center to force a pawn jump. Winning the jump grants a critical 1-tempo advantage.",
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'e3', desc: "Player 1 advances to e3." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'e4', desc: "Player 1 advances to e4." },
            { notation: 'e6', desc: "Player 2 advances to e6, coming adjacent to Player 1." },
            { notation: 'e5', desc: "Player 1 steps onto e5, occupying the center square." },
            { notation: 'e4', desc: "Player 2 jumps directly over Player 1, landing at e4! Player 2 gains the lead." },
            { notation: 'f5', desc: "Player 1 sidesteps to f5, adapting to the jump." }
        ]
    },
    'mirror-defense': {
        title: "Mirror Defense",
        side: "p2",
        description: "Player 2 mirrors Player 1's movements and wall placements. This neutralizes early aggression and challenges Player 1 to break the symmetry creatively.",
        moves: [
            { notation: 'e2', desc: "Player 1 starts e2." },
            { notation: 'e8', desc: "Player 2 mirrors with e8." },
            { notation: 'd1h', desc: "Player 1 places an early horizontal wall at d1h." },
            { notation: 'd8h', desc: "Player 2 mirrors, placing a horizontal wall at d8h." },
            { notation: 'e3', desc: "Player 1 advances to e3." },
            { notation: 'e7', desc: "Player 2 mirrors with e7." },
            { notation: 'f3v', desc: "Player 1 places a vertical wall at f3v." },
            { notation: 'f6v', desc: "Player 2 mirrors with a vertical wall at f6v." }
        ]
    }
};
