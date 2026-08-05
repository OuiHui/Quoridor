// Openings Database with Strategic Goal Arrows, Per-Step Threat Arrows, and Threat Sketch Walls
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
            { 
                notation: 'e2', 
                desc: "Player 1 steps forward, claiming center presence.",
                arrows: [{ from: 'e2', to: 'e9', color: 'green' }],
                sketchWalls: []
            },
            { 
                notation: 'e8', 
                desc: "Player 2 mirrors, moving forward to e8.",
                arrows: [{ from: 'e8', to: 'e1', color: 'blue' }],
                sketchWalls: []
            },
            { 
                notation: 'e3', 
                desc: "Player 1 advances to e3, preparing the Reed double-wall bottleneck at row 3.",
                arrows: [{ from: 'e3', to: 'c3', color: 'orange' }, { from: 'e3', to: 'f3', color: 'orange' }],
                sketchWalls: ['c3h', 'f3h']
            },
            { 
                notation: 'e7', 
                desc: "Player 2 advances to e7, staying head-to-head in the central channel.",
                arrows: [{ from: 'e7', to: 'e3', color: 'blue' }],
                sketchWalls: []
            },
            { 
                notation: 'c3h', 
                desc: "Player 1 places c3h, closing off the left side of the third row.",
                arrows: [{ from: 'e7', to: 'g7', color: 'red' }],
                sketchWalls: ['c3h', 'f3h']
            },
            { 
                notation: 'd7h', 
                desc: "Player 2 places d7h to establish their own defensive block.",
                arrows: [{ from: 'e3', to: 'c3', color: 'red' }],
                sketchWalls: ['d7h']
            },
            { 
                notation: 'f3h', 
                desc: "Player 1 places the second horizontal wall at f3h. The Reed double-wall structure is complete!",
                arrows: [{ from: 'e7', to: 'a7', color: 'red' }, { from: 'e7', to: 'i7', color: 'red' }],
                sketchWalls: ['c3h', 'f3h']
            },
            { 
                notation: 'f7h', 
                desc: "Player 2 blocks the right side at f7h, neutralizing symmetry.",
                arrows: [{ from: 'e4', to: 'e9', color: 'green' }],
                sketchWalls: ['f7h']
            },
            { 
                notation: 'e4', 
                desc: "Player 1 steps into the bottleneck at e4, ready to break through.",
                arrows: [{ from: 'e4', to: 'e9', color: 'green' }],
                sketchWalls: ['c3h', 'f3h']
            }
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
            { notation: 'e2', desc: "Player 1 steps forward to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e3', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['e2v'] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e4', desc: "Player 1 reaches the center line at e4.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['e2v'] },
            { notation: 'e6', desc: "Player 2 meets Player 1 face-to-face at e6.", arrows: [{ from: 'e6', to: 'e4', color: 'red' }], sketchWalls: [] },
            { notation: 'e2v', desc: "Player 1 places a vertical wall at e2v, directly behind their pawn to secure their alignment.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['e2v'] },
            { notation: 'd3h', desc: "Player 2 places a horizontal wall at d3h to defend the flank.", arrows: [{ from: 'e4', to: 'd4', color: 'orange' }], sketchWalls: ['d3h'] },
            { notation: 'd4', desc: "Player 1 sidesteps to d4, seeking a path around the center.", arrows: [{ from: 'd4', to: 'd9', color: 'green' }], sketchWalls: ['e2v', 'd3h'] }
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
            { notation: 'e2', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e3', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e4', desc: "Player 1 advances to e4.", arrows: [{ from: 'e4', to: 'e6', color: 'orange' }], sketchWalls: [] },
            { notation: 'e6', desc: "Player 2 advances to e6, coming adjacent to Player 1.", arrows: [{ from: 'e6', to: 'e4', color: 'red' }], sketchWalls: [] },
            { notation: 'e5', desc: "Player 1 steps onto e5, occupying the center square.", arrows: [{ from: 'e6', to: 'e4', color: 'red' }], sketchWalls: [] },
            { notation: 'e4', desc: "Player 2 jumps directly over Player 1, landing at e4! Player 2 gains the lead.", arrows: [{ from: 'e4', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'f5', desc: "Player 1 sidesteps to f5, adapting to the jump.", arrows: [{ from: 'f5', to: 'f9', color: 'green' }], sketchWalls: [] }
        ]
    },
    'mirror-defense': {
        title: "Mirror Defense",
        side: "p2",
        description: "Player 2 mirrors Player 1's movements and wall placements. This neutralizes early aggression and challenges Player 1 to break the symmetry creatively.",
        goalArrows: [
            { from: 'e9', to: 'e1', color: 'blue' },
            { from: 'e1', to: 'e5', color: 'green' },
            { from: 'e9', to: 'e5', color: 'blue' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 starts e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 mirrors with e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd1h', desc: "Player 1 places an early horizontal wall at d1h.", arrows: [{ from: 'd1', to: 'b1', color: 'green' }], sketchWalls: ['d1h'] },
            { notation: 'd8h', desc: "Player 2 mirrors, placing a horizontal wall at d8h.", arrows: [{ from: 'd8', to: 'b8', color: 'blue' }], sketchWalls: ['d1h', 'd8h'] },
            { notation: 'e3', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e7', desc: "Player 2 mirrors with e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'f3v', desc: "Player 1 places a vertical wall at f3v.", arrows: [{ from: 'f3', to: 'f5', color: 'green' }], sketchWalls: ['f3v'] },
            { notation: 'f6v', desc: "Player 2 mirrors with a vertical wall at f6v.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: ['f3v', 'f6v'] }
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
            { notation: 'e2', desc: "Player 1 advances to center at e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances straight to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd2', desc: "Player 1 sidesteps to d2 to build off-center momentum.", arrows: [{ from: 'd2', to: 'd9', color: 'green' }], sketchWalls: [] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd3', desc: "Player 1 advances along the d-file.", arrows: [{ from: 'd3', to: 'd9', color: 'green' }], sketchWalls: ['d6h'] },
            { notation: 'e6', desc: "Player 2 continues down the e-file.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd4', desc: "Player 1 reaches d4, establishing a clear flank corridor.", arrows: [{ from: 'd4', to: 'd9', color: 'green' }], sketchWalls: ['d6h'] },
            { notation: 'd6h', desc: "Player 2 places d6h to halt Player 1's d-file sprint.", arrows: [{ from: 'd4', to: 'c4', color: 'red' }], sketchWalls: ['d6h'] },
            { notation: 'c4', desc: "Player 1 steps outward to c4 to maneuver around the block.", arrows: [{ from: 'c4', to: 'c9', color: 'green' }], sketchWalls: ['d6h'] }
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
            { notation: 'e2', desc: "Player 1 steps forward to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e3', desc: "Player 1 steps forward to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd7h', desc: "Player 1 places a horizontal wall at d7h behind Player 2, leaving a gap on the f-column.", arrows: [{ from: 'e8', to: 'f8', color: 'red' }], sketchWalls: ['d7h'] },
            { notation: 'f8', desc: "Player 2 sidesteps to f8 toward the open gap.", arrows: [{ from: 'f8', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
            { notation: 'f7h', desc: "Player 1 places f7h to seal off the right side, extending the narrow funnel.", arrows: [{ from: 'f8', to: 'f6', color: 'red' }], sketchWalls: ['d7h', 'f7h'] },
            { notation: 'f7', desc: "Player 2 steps down into the forced corridor.", arrows: [{ from: 'f7', to: 'f1', color: 'blue' }], sketchWalls: ['d7h', 'f7h'] },
            { notation: 'e4', desc: "Player 1 advances towards their own target square.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['d7h', 'f7h'] }
        ]
    },
    'box-trap': {
        title: "Box Trap Opening (Stone Box)",
        side: "p1",
        description: "Player 1 uses combination walls to form a U-shaped pocket around the central rows, forcing the opponent into a long lateral detour.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e8', to: 'b8', color: 'red' }
        ],
        moves: [
            { notation: 'e2', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e3', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['c3h'] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'c3h', desc: "Player 1 places a horizontal wall at c3h.", arrows: [{ from: 'e7', to: 'e6', color: 'blue' }], sketchWalls: ['c3h', 'f3h'] },
            { notation: 'e6', desc: "Player 2 advances down to e6.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: ['c3h', 'f3h'] },
            { notation: 'f3h', desc: "Player 1 places horizontal wall f3h on the opposite side.", arrows: [{ from: 'e6', to: 'd6', color: 'red' }], sketchWalls: ['c3h', 'f3h', 'd2v'] },
            { notation: 'd6', desc: "Player 2 sidesteps to d6.", arrows: [{ from: 'd6', to: 'a6', color: 'red' }], sketchWalls: ['c3h', 'f3h', 'd2v'] },
            { notation: 'd2v', desc: "Player 1 drops vertical wall d2v, locking in the stone box structure.", arrows: [{ from: 'd6', to: 'a6', color: 'red' }], sketchWalls: ['c3h', 'f3h', 'd2v'] }
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
            { notation: 'e2', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e3', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
            { notation: 'd7h', desc: "Player 2 drops horizontal wall d7h directly in front of Player 2's pawn to halt Player 1.", arrows: [{ from: 'e3', to: 'f3', color: 'red' }], sketchWalls: ['d7h'] },
            { notation: 'f2', desc: "Player 1 sidesteps right to f2 searching for a detour.", arrows: [{ from: 'f2', to: 'f9', color: 'green' }], sketchWalls: ['d7h'] },
            { notation: 'e7', desc: "Player 2 advances down behind their defensive wall.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: ['d7h'] },
            { notation: 'f3', desc: "Player 1 advances along the f-file.", arrows: [{ from: 'f3', to: 'f9', color: 'green' }], sketchWalls: ['f6v'] },
            { notation: 'f6v', desc: "Player 2 drops vertical wall f6v to block Player 1's new path.", arrows: [{ from: 'f3', to: 'h3', color: 'red' }], sketchWalls: ['d7h', 'f6v'] }
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
            { notation: 'e2', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd2v', desc: "Player 1 places vertical wall d2v to lock down the left rail.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v'] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: ['d2v'] },
            { notation: 'f2v', desc: "Player 1 places vertical wall f2v to lock down the right rail.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v'] },
            { notation: 'e6', desc: "Player 2 advances into the narrow e-file corridor.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: ['d2v', 'f2v'] },
            { notation: 'e3', desc: "Player 1 advances down the secure central channel.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v'] },
            { notation: 'd6h', desc: "Player 2 places a horizontal wall to plug the top of the rail.", arrows: [{ from: 'e3', to: 'd3', color: 'red' }], sketchWalls: ['d2v', 'f2v', 'd6h'] },
            { notation: 'e4', desc: "Player 1 advances to e4.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v', 'd6h'] }
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
            { notation: 'e2', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'd7h', desc: "Player 1 immediately drops horizontal wall d7h on row 7.", arrows: [{ from: 'e8', to: 'f8', color: 'red' }], sketchWalls: ['d7h'] },
            { notation: 'f8', desc: "Player 2 is forced to step right to f8.", arrows: [{ from: 'f8', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
            { notation: 'e3', desc: "Player 1 continues advancing while Player 2 is delayed.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
            { notation: 'f7', desc: "Player 2 advances along the f-file.", arrows: [{ from: 'f7', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
            { notation: 'e4', desc: "Player 1 claims central tempo at e4.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
            { notation: 'f6', desc: "Player 2 advances to f6.", arrows: [{ from: 'f6', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] }
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
            { notation: 'e2', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
            { notation: 'e8', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'e3', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['c6h'] },
            { notation: 'e7', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
            { notation: 'c6h', desc: "Player 1 places horizontal wall c6h to push Player 2 off-center.", arrows: [{ from: 'e7', to: 'd7', color: 'red' }], sketchWalls: ['c6h', 'c5v'] },
            { notation: 'd7', desc: "Player 2 sidesteps to d7.", arrows: [{ from: 'd7', to: 'd1', color: 'blue' }], sketchWalls: ['c6h', 'c5v'] },
            { notation: 'c5v', desc: "Player 1 places vertical wall c5v to constrain Player 2's lateral recovery.", arrows: [{ from: 'd7', to: 'c7', color: 'red' }], sketchWalls: ['c6h', 'c5v'] },
            { notation: 'c7', desc: "Player 2 maneuvers around the wall to c7.", arrows: [{ from: 'c7', to: 'c1', color: 'blue' }], sketchWalls: ['c6h', 'c5v'] },
            { notation: 'e4', desc: "Player 1 advances straight down the center.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['c6h', 'c5v'] }
        ]
    }
};
