// Openings Database with Strategic Goal Arrows
export const PLAYBOOK_DATA = {
    reed: {
        title: "Dr. Reed's Opening (Double Wall)",
        side: "p1",
        description: "Places two horizontal walls early on at c3h and f3h. This creates a narrow bottleneck in the center, forcing the opponent to navigate through a controlled corridor while you advance your pawn.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'c3', to: 'e3', color: 'orange' },
            { from: 'f3', to: 'h3', color: 'orange' }
        ],
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
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e2', to: 'e4', color: 'blue' }
        ],
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
        goalArrows: [
            { from: 'e1', to: 'e5', color: 'green' },
            { from: 'e9', to: 'e4', color: 'red' }
        ],
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
        goalArrows: [
            { from: 'e9', to: 'e1', color: 'blue' },
            { from: 'd8', to: 'e8', color: 'orange' }
        ],
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
    },
    sidestep: {
        title: "Sidestep Opening (Flank Rush)",
        side: "p1",
        description: "Player 1 steps sideways to d2 early to bypass expected central wall blockades and establish an off-center offensive channel on the d-file.",
        goalArrows: [
            { from: 'e1', to: 'd2', color: 'green' },
            { from: 'd2', to: 'd9', color: 'green' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to center at e2." },
            { notation: 'e8', desc: "Player 2 advances straight to e8." },
            { notation: 'd2', desc: "Player 1 sidesteps to d2 to build off-center momentum." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'd3', desc: "Player 1 advances along the d-file." },
            { notation: 'e6', desc: "Player 2 continues down the e-file." },
            { notation: 'd4', desc: "Player 1 reaches d4, establishing a clear flank corridor." },
            { notation: 'd6h', desc: "Player 2 places d6h to halt Player 1's d-file sprint." },
            { notation: 'c4', desc: "Player 1 steps outward to c4 to maneuver around the block." }
        ]
    },
    'alaire-gap': {
        title: "Alaire's Gap Opening (Gap Gambit)",
        side: "p1",
        description: "Popularized in top-level play, Player 1 places horizontal walls behind Player 2 while leaving a single-cell bottleneck. This funnels Player 2 through a controlled gap while Player 1 advances.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e8', to: 'f8', color: 'red' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 steps forward to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'e3', desc: "Player 1 steps forward to e3." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'd7h', desc: "Player 1 places a horizontal wall at d7h behind Player 2, leaving a gap on the f-column." },
            { notation: 'f8', desc: "Player 2 sidesteps to f8 toward the open gap." },
            { notation: 'f7h', desc: "Player 1 places f7h to seal off the right side, extending the narrow funnel." },
            { notation: 'f7', desc: "Player 2 steps down into the forced corridor." },
            { notation: 'e4', desc: "Player 1 advances towards their own target square." }
        ]
    },
    'box-trap': {
        title: "Box Trap Opening (Stone Box)",
        side: "p1",
        description: "Player 1 uses combination walls to form a U-shaped pocket around the central rows, forcing the opponent into a long lateral detour.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e8', to: 'a1', color: 'red' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'e3', desc: "Player 1 advances to e3." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'c3h', desc: "Player 1 places a horizontal wall at c3h." },
            { notation: 'e6', desc: "Player 2 advances down to e6." },
            { notation: 'f3h', desc: "Player 1 places horizontal wall f3h on the opposite side." },
            { notation: 'd6', desc: "Player 2 sidesteps to d6." },
            { notation: 'd2v', desc: "Player 1 drops vertical wall d2v, locking in the stone box structure." }
        ]
    },
    'symmetrical-counter': {
        title: "Symmetrical Wall Counter",
        side: "p2",
        description: "A sharp defensive line for Player 2. When Player 1 advances down the center, Player 2 drops an early horizontal wall at d7h to halt Player 1's momentum and seize control of the pace.",
        goalArrows: [
            { from: 'e1', to: 'f2', color: 'green' },
            { from: 'e9', to: 'e1', color: 'blue' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'e3', desc: "Player 1 advances to e3." },
            { notation: 'd7h', desc: "Player 2 drops horizontal wall d7h directly in front of Player 2's pawn to halt Player 1." },
            { notation: 'f2', desc: "Player 1 sidesteps right to f2 searching for a detour." },
            { notation: 'e7', desc: "Player 2 advances down behind their defensive wall." },
            { notation: 'f3', desc: "Player 1 advances along the f-file." },
            { notation: 'f6v', desc: "Player 2 drops vertical wall f6v to block Player 1's new path." }
        ]
    },
    'rail-splitter': {
        title: "The Rail Splitter (Double Vertical)",
        side: "p1",
        description: "Player 1 places parallel vertical walls at d2v and f2v to construct a secure e-file highway, shielding their pawn from lateral wall blocks while advancing straight ahead.",
        goalArrows: [
            { from: 'd2', to: 'd5', color: 'blue' },
            { from: 'f2', to: 'f5', color: 'blue' },
            { from: 'e1', to: 'e9', color: 'green' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'd2v', desc: "Player 1 places vertical wall d2v to lock down the left rail." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'f2v', desc: "Player 1 places vertical wall f2v to lock down the right rail." },
            { notation: 'e6', desc: "Player 2 advances into the narrow e-file corridor." },
            { notation: 'e3', desc: "Player 1 advances down the secure central channel." },
            { notation: 'd6h', desc: "Player 2 places a horizontal wall to plug the top of the rail." },
            { notation: 'e4', desc: "Player 1 advances to e4." }
        ]
    },
    'fast-intercept': {
        title: "Fast Intercept (Early Wall Strike)",
        side: "p1",
        description: "Player 1 places a horizontal wall on row 7 on move 2, catching Player 2 off guard before they can step off their baseline and forcing an immediate detour.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e8', to: 'f8', color: 'red' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'd7h', desc: "Player 1 immediately drops horizontal wall d7h on row 7." },
            { notation: 'f8', desc: "Player 2 is forced to step right to f8." },
            { notation: 'e3', desc: "Player 1 continues advancing while Player 2 is delayed." },
            { notation: 'f7', desc: "Player 2 advances along the f-file." },
            { notation: 'e4', desc: "Player 1 claims central tempo at e4." },
            { notation: 'f6', desc: "Player 2 advances to f6." }
        ]
    },
    'corner-trap': {
        title: "Corner Trap (Diagonal Funnel)",
        side: "p1",
        description: "Player 1 combines offset horizontal and vertical walls to steer the opponent toward the board edges, creating a winding path while Player 1 maintains the center.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e8', to: 'c7', color: 'red' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2." },
            { notation: 'e8', desc: "Player 2 advances to e8." },
            { notation: 'e3', desc: "Player 1 advances to e3." },
            { notation: 'e7', desc: "Player 2 advances to e7." },
            { notation: 'c6h', desc: "Player 1 places horizontal wall c6h to push Player 2 off-center." },
            { notation: 'd7', desc: "Player 2 sidesteps to d7." },
            { notation: 'c5v', desc: "Player 1 places vertical wall c5v to constrain Player 2's lateral recovery." },
            { notation: 'c7', desc: "Player 2 maneuvers around the wall to c7." },
            { notation: 'e4', desc: "Player 1 advances straight down the center." }
        ]
    }
};
