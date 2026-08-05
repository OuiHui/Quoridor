// Openings Database with Strategic Goal Arrows, Per-Step Threat Arrows, Sketch Walls, and Variation Branches
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
        variations: [
            {
                id: "main",
                name: "Main Line: Bottleneck Breakthrough",
                divergencePoint: 0,
                divergenceNote: "Standard line where opponent respects the bottleneck.",
                midgamePlan: "The double walls on row 3 create a narrow choke point. The goal is to occupy e4 and control the single entry cell into P2's territory.",
                midgameKeyTakeaways: ["Control the e4 bottleneck", "Conserve walls for late game", "Force P2 laterally"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 steps forward, claiming center presence.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 mirrors, moving forward to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3, preparing the Reed double-wall bottleneck at row 3.", arrows: [{ from: 'e3', to: 'c3', color: 'orange' }, { from: 'e3', to: 'f3', color: 'orange' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7, staying head-to-head in the central channel.", arrows: [{ from: 'e7', to: 'e3', color: 'blue' }], sketchWalls: [] },
                    { notation: 'c3h', phase: 'opening', desc: "Player 1 places c3h, closing off the left side of the third row.", arrows: [{ from: 'e7', to: 'g7', color: 'red' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'd7h', phase: 'opening', desc: "Player 2 places d7h to establish their own defensive block.", arrows: [{ from: 'e3', to: 'c3', color: 'red' }], sketchWalls: ['d7h'] },
                    { notation: 'f3h', phase: 'opening', desc: "Player 1 places the second horizontal wall at f3h. The Reed double-wall structure is complete!", arrows: [{ from: 'e7', to: 'a7', color: 'red' }, { from: 'e7', to: 'i7', color: 'red' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'f7h', phase: 'opening', desc: "Player 2 blocks the right side at f7h, neutralizing symmetry.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['f7h'] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 steps into the bottleneck at e4, ready to break through.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'e6', phase: 'midgame', desc: "Player 2 challenges the center, stepping to e6.", arrows: [{ from: 'e6', to: 'e4', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd5h', phase: 'midgame', desc: "Player 1 drops d5h, forcing Player 2 to detour around the new barrier.", arrows: [{ from: 'e6', to: 'g6', color: 'red' }], sketchWalls: ['d5h'] },
                    { notation: 'f6', phase: 'midgame', desc: "Player 2 sidesteps to f6 to go around.", arrows: [{ from: 'f6', to: 'f1', color: 'blue' }], sketchWalls: ['d5h'] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 1 pushes forward to e5, exploiting the tempo advantage.", arrows: [{ from: 'e5', to: 'e9', color: 'green' }], sketchWalls: ['d5h'] }
                ]
            },
            {
                id: "var-flank",
                name: "Branch A: Opponent Flank Escape",
                divergencePoint: 6,
                divergenceNote: "Diverges at Move 6: Opponent sidesteps instead of mirroring walls.",
                midgamePlan: "If the opponent attempts to bypass the double walls early, immediately drop containment walls (e.g. vertical walls) to seal off the side corridors.",
                midgameKeyTakeaways: ["Seal side corridors", "Use vertical walls for containment", "Capitalize on P2's detour"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 steps forward, claiming center presence.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 mirrors, moving forward to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'c3', color: 'orange' }, { from: 'e3', to: 'f3', color: 'orange' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e3', color: 'blue' }], sketchWalls: [] },
                    { notation: 'c3h', phase: 'opening', desc: "Player 1 places c3h.", arrows: [{ from: 'e7', to: 'g7', color: 'red' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'd7', phase: 'opening', desc: "Player 2 sidesteps to d7, avoiding the center confrontation.", arrows: [{ from: 'd7', to: 'a7', color: 'blue' }], sketchWalls: [] },
                    { notation: 'f3h', phase: 'opening', desc: "Player 1 finishes the Reed double-wall.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'c7', phase: 'opening', desc: "Player 2 continues running to the flank at c7.", arrows: [{ from: 'c7', to: 'c1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'b5v', phase: 'midgame', desc: "Player 1 drops b5v, cutting off Player 2's flank run and forcing a massive detour.", arrows: [{ from: 'c7', to: 'f7', color: 'red' }], sketchWalls: ['b5v'] },
                    { notation: 'd7', phase: 'midgame', desc: "Player 2 is forced to walk back towards the center.", arrows: [{ from: 'd7', to: 'f7', color: 'blue' }], sketchWalls: ['b5v'] },
                    { notation: 'e4', phase: 'midgame', desc: "Player 1 casually takes the central bottleneck.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['b5v'] }
                ]
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
        variations: [
            {
                id: "main",
                name: "Main Line: Flank Shift",
                divergencePoint: 0,
                divergenceNote: "Standard line.",
                midgamePlan: "e2v splits the bottom half vertically. P1 uses this anchor to construct walls on the left flank, pushing P2 into a deep detour.",
                midgameKeyTakeaways: ["Use e2v as an anchor", "Build left-flank wall chains", "Shift to the open file"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 steps forward to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['e2v'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 reaches the center line at e4.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['e2v'] },
                    { notation: 'e6', phase: 'opening', desc: "Player 2 meets Player 1 face-to-face at e6.", arrows: [{ from: 'e6', to: 'e4', color: 'red' }], sketchWalls: [] },
                    { notation: 'e2v', phase: 'opening', desc: "Player 1 places a vertical wall at e2v, directly behind their pawn to secure their alignment.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['e2v'] },
                    { notation: 'd3h', phase: 'opening', desc: "Player 2 places a horizontal wall at d3h to defend the flank.", arrows: [{ from: 'e4', to: 'd4', color: 'orange' }], sketchWalls: ['d3h'] },
                    { notation: 'd4', phase: 'midgame', desc: "Player 1 sidesteps to d4, seeking a path around the center.", arrows: [{ from: 'd4', to: 'd9', color: 'green' }], sketchWalls: ['e2v', 'd3h'] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 2 pushes to e5.", arrows: [{ from: 'e5', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'c5h', phase: 'midgame', desc: "Player 1 drops c5h, sealing Player 2's detour path on the left.", arrows: [{ from: 'e5', to: 'g5', color: 'red' }], sketchWalls: ['c5h'] },
                    { notation: 'f5', phase: 'midgame', desc: "Player 2 is forced to turn right to f5.", arrows: [{ from: 'f5', to: 'f1', color: 'blue' }], sketchWalls: ['c5h'] },
                    { notation: 'd5', phase: 'midgame', desc: "Player 1 freely marches up the d-file.", arrows: [{ from: 'd5', to: 'd9', color: 'green' }], sketchWalls: [] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Tempo Recovery Trap",
                divergencePoint: 0,
                divergenceNote: "Standard line where P2 wins the center jump.",
                midgamePlan: "After P2 jumps, P1 is down 1 tempo. P1 must immediately wall behind P2 to cut off their escape and neutralize the tempo loss.",
                midgameKeyTakeaways: ["Wall immediately behind jumping pawn", "Create a lateral maze", "Re-establish tempo lead"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 advances to e4.", arrows: [{ from: 'e4', to: 'e6', color: 'orange' }], sketchWalls: [] },
                    { notation: 'e6', phase: 'opening', desc: "Player 2 advances to e6, coming adjacent to Player 1.", arrows: [{ from: 'e6', to: 'e4', color: 'red' }], sketchWalls: [] },
                    { notation: 'e5', phase: 'opening', desc: "Player 1 steps onto e5, occupying the center square.", arrows: [{ from: 'e6', to: 'e4', color: 'red' }], sketchWalls: [] },
                    { notation: 'e4', phase: 'opening', desc: "Player 2 jumps directly over Player 1, landing at e4! Player 2 gains the lead.", arrows: [{ from: 'e4', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'f5', phase: 'midgame', desc: "Player 1 sidesteps to f5, adapting to the jump.", arrows: [{ from: 'f5', to: 'f9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'midgame', desc: "Player 2 continues down the e-file.", arrows: [{ from: 'e3', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd3h', phase: 'midgame', desc: "Player 1 plays d3h behind P2, cutting off their escape.", arrows: [{ from: 'e3', to: 'c3', color: 'red' }], sketchWalls: ['d3h'] },
                    { notation: 'd3', phase: 'midgame', desc: "Player 2 sidesteps to d3.", arrows: [{ from: 'd3', to: 'a3', color: 'blue' }], sketchWalls: ['d3h'] },
                    { notation: 'f6', phase: 'midgame', desc: "Player 1 sprints up the f-file.", arrows: [{ from: 'f6', to: 'f9', color: 'green' }], sketchWalls: [] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Symmetry Break",
                divergencePoint: 0,
                divergenceNote: "Standard line where P1 attempts to break symmetry.",
                midgamePlan: "Mirroring conserves P2's mental energy. When P1 breaks symmetry with an asymmetric move, P2 drops an intercept wall to turn P1's move into a self-block.",
                midgameKeyTakeaways: ["Punish asymmetry", "Maintain path dominance", "Conserve walls"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 starts e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 mirrors with e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd1h', phase: 'opening', desc: "Player 1 places an early horizontal wall at d1h.", arrows: [{ from: 'd1', to: 'b1', color: 'green' }], sketchWalls: ['d1h'] },
                    { notation: 'd8h', phase: 'opening', desc: "Player 2 mirrors, placing a horizontal wall at d8h.", arrows: [{ from: 'd8', to: 'b8', color: 'blue' }], sketchWalls: ['d1h', 'd8h'] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 mirrors with e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'f3v', phase: 'opening', desc: "Player 1 places a vertical wall at f3v.", arrows: [{ from: 'f3', to: 'f5', color: 'green' }], sketchWalls: ['f3v'] },
                    { notation: 'f6v', phase: 'opening', desc: "Player 2 mirrors with a vertical wall at f6v.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: ['f3v', 'f6v'] },
                    { notation: 'f3', phase: 'midgame', desc: "Player 1 breaks symmetry by moving to f3.", arrows: [{ from: 'f3', to: 'f9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e5h', phase: 'midgame', desc: "Player 2 immediately punishes the asymmetry with e5h.", arrows: [{ from: 'f3', to: 'g3', color: 'red' }], sketchWalls: ['e5h'] },
                    { notation: 'g3', phase: 'midgame', desc: "Player 1 is forced to detour to g3.", arrows: [{ from: 'g3', to: 'i3', color: 'green' }], sketchWalls: [] },
                    { notation: 'e6', phase: 'midgame', desc: "Player 2 calmly advances down the e-file with path advantage.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: [] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Flank Switching",
                divergencePoint: 0,
                divergenceNote: "Standard line.",
                midgamePlan: "By occupying the d-file early, P1 forces P2 to spend walls. P1 uses P2's wall placements to shift between c-file and b-file, protecting their flank.",
                midgameKeyTakeaways: ["Shift leftward to avoid blocks", "Use vertical walls to shield flank", "Drain P2's walls"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to center at e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances straight to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd2', phase: 'opening', desc: "Player 1 sidesteps to d2 to build off-center momentum.", arrows: [{ from: 'd2', to: 'd9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd3', phase: 'opening', desc: "Player 1 advances along the d-file.", arrows: [{ from: 'd3', to: 'd9', color: 'green' }], sketchWalls: ['d6h'] },
                    { notation: 'e6', phase: 'opening', desc: "Player 2 continues down the e-file.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd4', phase: 'opening', desc: "Player 1 reaches d4, establishing a clear flank corridor.", arrows: [{ from: 'd4', to: 'd9', color: 'green' }], sketchWalls: ['d6h'] },
                    { notation: 'd6h', phase: 'opening', desc: "Player 2 places d6h to halt Player 1's d-file sprint.", arrows: [{ from: 'd4', to: 'c4', color: 'red' }], sketchWalls: ['d6h'] },
                    { notation: 'c4', phase: 'midgame', desc: "Player 1 steps outward to c4 to maneuver around the block.", arrows: [{ from: 'c4', to: 'c9', color: 'green' }], sketchWalls: ['d6h'] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 2 advances to e5.", arrows: [{ from: 'e5', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'c5', phase: 'midgame', desc: "Player 1 pushes up the c-file.", arrows: [{ from: 'c5', to: 'c9', color: 'green' }], sketchWalls: [] },
                    { notation: 'c6h', phase: 'midgame', desc: "Player 2 blocks again at c6h.", arrows: [{ from: 'c5', to: 'b5', color: 'red' }], sketchWalls: ['c6h'] },
                    { notation: 'b5', phase: 'midgame', desc: "Player 1 shifts to b5.", arrows: [{ from: 'b5', to: 'b9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e4', phase: 'midgame', desc: "Player 2 advances to e4.", arrows: [{ from: 'e4', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'a5v', phase: 'midgame', desc: "Player 1 drops a5v, creating an unblockable highway on the b-file.", arrows: [{ from: 'b5', to: 'b9', color: 'green' }], sketchWalls: ['a5v'] }
                ]
            }
        ]
    },
    'alaire-gap': {
        title: "Alaire's Gap Opening (Gap Gambit)",
        side: "p1",
        description: "Popularized in top-level play, Player 1 places horizontal walls behind Player 2 while leaving a single-cell bottleneck. This funnels Player 2 through a controlled gap while Player 1 advances.",
        goalArrows: [
            { from: 'e1', to: 'e9', color: 'green' },
            { from: 'e7', to: 'f7', color: 'red' }
        ],
        variations: [
            {
                id: "main",
                name: "Main Line: Funnel Squeeze",
                divergencePoint: 0,
                divergenceNote: "Standard line where opponent enters the funnel.",
                midgamePlan: "Once P2 is funneled into the 1-cell gap at f6/f7, P1 controls when to close or extend the gap. P1 uses the threat of closing the gap to gain free pawn moves.",
                midgameKeyTakeaways: ["Delay closing the gap", "Force P2 to walk the channel", "Close gap if P2 retreats"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 steps forward to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 steps forward to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd7h', phase: 'opening', desc: "Player 1 places a horizontal wall at d7h behind Player 2, leaving a gap on the f-column.", arrows: [{ from: 'e7', to: 'f7', color: 'red' }], sketchWalls: ['d7h'] },
                    { notation: 'f7', phase: 'opening', desc: "Player 2 sidesteps to f7 toward the open gap.", arrows: [{ from: 'f7', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
                    { notation: 'f7h', phase: 'opening', desc: "Player 1 places f7h to seal off the right side, extending the narrow funnel.", arrows: [{ from: 'f7', to: 'f6', color: 'red' }], sketchWalls: ['d7h', 'f7h'] },
                    { notation: 'f6', phase: 'opening', desc: "Player 2 steps down into the forced corridor.", arrows: [{ from: 'f6', to: 'f1', color: 'blue' }], sketchWalls: ['d7h', 'f7h'] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 advances towards their own target square.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['d7h', 'f7h'] },
                    { notation: 'f5', phase: 'midgame', desc: "Player 2 continues down the funnel.", arrows: [{ from: 'f5', to: 'f1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 1 matches pace, taking free moves while P2 is contained.", arrows: [{ from: 'e5', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'f6', phase: 'midgame', desc: "Player 2 tries to backtrack to escape.", arrows: [{ from: 'f6', to: 'h6', color: 'red' }], sketchWalls: [] },
                    { notation: 'f4h', phase: 'midgame', desc: "Player 1 drops f4h, sealing P2 in a dead-end pocket and forcing a massive backtrack.", arrows: [{ from: 'f6', to: 'i6', color: 'red' }], sketchWalls: ['f4h'] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Total Center Lockout",
                divergencePoint: 0,
                divergenceNote: "Standard line.",
                midgamePlan: "The Stone Box denies P2 access to the entire d/e/f columns. P1 uses the open top of the box as a protected launching pad, extending P2's detour with remaining walls.",
                midgameKeyTakeaways: ["Protect your launch pad", "Extend the box laterally", "March through the center"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['c3h'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'c3h', phase: 'opening', desc: "Player 1 places a horizontal wall at c3h.", arrows: [{ from: 'e7', to: 'e6', color: 'blue' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'e6', phase: 'opening', desc: "Player 2 advances down to e6.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: ['c3h', 'f3h'] },
                    { notation: 'f3h', phase: 'opening', desc: "Player 1 places horizontal wall f3h on the opposite side.", arrows: [{ from: 'e6', to: 'd6', color: 'red' }], sketchWalls: ['c3h', 'f3h', 'd2v'] },
                    { notation: 'd6', phase: 'opening', desc: "Player 2 sidesteps to d6.", arrows: [{ from: 'd6', to: 'a6', color: 'red' }], sketchWalls: ['c3h', 'f3h', 'd2v'] },
                    { notation: 'd2v', phase: 'opening', desc: "Player 1 drops vertical wall d2v, locking in the stone box structure.", arrows: [{ from: 'd6', to: 'a6', color: 'red' }], sketchWalls: ['c3h', 'f3h', 'd2v'] },
                    { notation: 'c6', phase: 'midgame', desc: "Player 2 continues moving laterally.", arrows: [{ from: 'c6', to: 'a6', color: 'blue' }], sketchWalls: [] },
                    { notation: 'b6h', phase: 'midgame', desc: "Player 1 extends the box with b6h, pushing P2 all the way to a6.", arrows: [{ from: 'c6', to: 'a6', color: 'red' }], sketchWalls: ['b6h'] },
                    { notation: 'b6', phase: 'midgame', desc: "Player 2 moves to b6.", arrows: [{ from: 'b6', to: 'a6', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e4', phase: 'midgame', desc: "Player 1 calmly exits the box through the secure center.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: [] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Containment Squeeze",
                divergencePoint: 0,
                divergenceNote: "Standard defensive block.",
                midgamePlan: "P2 stops P1's central rush, then uses the time P1 spends finding a detour to advance P2's pawn. If P1 breaks out, P2 drops secondary blockades to contain them.",
                midgameKeyTakeaways: ["Layer secondary blockades", "Advance while P1 is detouring", "Keep P1 contained below row 4"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
                    { notation: 'd7h', phase: 'opening', desc: "Player 2 drops horizontal wall d7h directly in front of Player 2's pawn to halt Player 1.", arrows: [{ from: 'e3', to: 'f3', color: 'red' }], sketchWalls: ['d7h'] },
                    { notation: 'f2', phase: 'opening', desc: "Player 1 sidesteps right to f2 searching for a detour.", arrows: [{ from: 'f2', to: 'f9', color: 'green' }], sketchWalls: ['d7h'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances down behind their defensive wall.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: ['d7h'] },
                    { notation: 'f3', phase: 'opening', desc: "Player 1 advances along the f-file.", arrows: [{ from: 'f3', to: 'f9', color: 'green' }], sketchWalls: ['f6v'] },
                    { notation: 'f6v', phase: 'opening', desc: "Player 2 drops vertical wall f6v to block Player 1's new path.", arrows: [{ from: 'f3', to: 'h3', color: 'red' }], sketchWalls: ['d7h', 'f6v'] },
                    { notation: 'g3', phase: 'midgame', desc: "Player 1 tries to go around again via g3.", arrows: [{ from: 'g3', to: 'g9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e6', phase: 'midgame', desc: "Player 2 advances to e6, gaining huge ground.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'g4', phase: 'midgame', desc: "Player 1 pushes g4.", arrows: [{ from: 'g4', to: 'g9', color: 'green' }], sketchWalls: [] },
                    { notation: 'g5h', phase: 'midgame', desc: "Player 2 drops g5h, completely sealing the right side and trapping P1 on rows 1-3.", arrows: [{ from: 'g4', to: 'i4', color: 'red' }], sketchWalls: ['g5h'] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: The Shielded Expressway",
                divergencePoint: 0,
                divergenceNote: "Standard double rail.",
                midgamePlan: "The double vertical rails make it impossible for P2 to place horizontal walls across e2. Once P2 caps the top, P1 exits laterally or blows open a new corridor.",
                midgameKeyTakeaways: ["Use rails as permanent armor", "Exit laterally when capped", "Extend rails upward"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd2v', phase: 'opening', desc: "Player 1 places vertical wall d2v to lock down the left rail.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: ['d2v'] },
                    { notation: 'f2v', phase: 'opening', desc: "Player 1 places vertical wall f2v to lock down the right rail.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v'] },
                    { notation: 'e6', phase: 'opening', desc: "Player 2 advances into the narrow e-file corridor.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: ['d2v', 'f2v'] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances down the secure central channel.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v'] },
                    { notation: 'd6h', phase: 'opening', desc: "Player 2 places a horizontal wall to plug the top of the rail.", arrows: [{ from: 'e3', to: 'd3', color: 'red' }], sketchWalls: ['d2v', 'f2v', 'd6h'] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 advances to e4.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['d2v', 'f2v', 'd6h'] },
                    { notation: 'f6', phase: 'midgame', desc: "Player 2 steps laterally to f6.", arrows: [{ from: 'f6', to: 'f1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'f4', phase: 'midgame', desc: "Player 1 exits the capped rail laterally.", arrows: [{ from: 'f4', to: 'f9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 2 steps back to e5.", arrows: [{ from: 'e5', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'f5h', phase: 'midgame', desc: "Player 1 blocks P2 with f5h, securing the f-file.", arrows: [{ from: 'e5', to: 'd5', color: 'red' }], sketchWalls: ['f5h'] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Early Path Distortion",
                divergencePoint: 0,
                divergenceNote: "Standard line.",
                midgamePlan: "By striking row 7 immediately, P1 forces P2 into path-planning mode. P1 maintains tempo by placing follow-up walls whenever P2 tries to merge back to the center.",
                midgameKeyTakeaways: ["Keep P2 isolated on the flank", "Control the center with your pawn", "Maintain tempo advantage"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'd7h', phase: 'opening', desc: "Player 1 immediately drops horizontal wall d7h on row 7.", arrows: [{ from: 'e8', to: 'f8', color: 'red' }], sketchWalls: ['d7h'] },
                    { notation: 'f8', phase: 'opening', desc: "Player 2 is forced to step right to f8.", arrows: [{ from: 'f8', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 continues advancing while Player 2 is delayed.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
                    { notation: 'f7', phase: 'opening', desc: "Player 2 advances along the f-file.", arrows: [{ from: 'f7', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 claims central tempo at e4.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['d7h'] },
                    { notation: 'f6', phase: 'opening', desc: "Player 2 advances to f6.", arrows: [{ from: 'f6', to: 'f1', color: 'blue' }], sketchWalls: ['d7h'] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 1 steps to e5.", arrows: [{ from: 'e5', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e6', phase: 'midgame', desc: "Player 2 attempts to merge back onto the e-file.", arrows: [{ from: 'e6', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'f5v', phase: 'midgame', desc: "Player 1 drops f5v, keeping P2 isolated on the f-file.", arrows: [{ from: 'e6', to: 'f6', color: 'red' }], sketchWalls: ['f5v'] },
                    { notation: 'f6', phase: 'midgame', desc: "Player 2 is pushed back to f6.", arrows: [{ from: 'f6', to: 'g6', color: 'blue' }], sketchWalls: ['f5v'] },
                    { notation: 'e6', phase: 'midgame', desc: "Player 1 advances freely to e6.", arrows: [{ from: 'e6', to: 'e9', color: 'green' }], sketchWalls: [] }
                ]
            }
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
        variations: [
            {
                id: "main",
                name: "Main Line: Outer Corner Pinning",
                divergencePoint: 0,
                divergenceNote: "Standard line.",
                midgamePlan: "P2 is displaced towards the corner on rows 6-8. P1 seals the corner exit, forcing P2 to backtrack behind row 8 to get out.",
                midgameKeyTakeaways: ["Seal the corner exit", "Force massive detours", "March straight down the center"],
                moves: [
                    { notation: 'e2', phase: 'opening', desc: "Player 1 advances to e2.", arrows: [{ from: 'e2', to: 'e9', color: 'green' }], sketchWalls: [] },
                    { notation: 'e8', phase: 'opening', desc: "Player 2 advances to e8.", arrows: [{ from: 'e8', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e3', phase: 'opening', desc: "Player 1 advances to e3.", arrows: [{ from: 'e3', to: 'e9', color: 'green' }], sketchWalls: ['c6h'] },
                    { notation: 'e7', phase: 'opening', desc: "Player 2 advances to e7.", arrows: [{ from: 'e7', to: 'e1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'c6h', phase: 'opening', desc: "Player 1 places horizontal wall c6h to push Player 2 off-center.", arrows: [{ from: 'e7', to: 'd7', color: 'red' }], sketchWalls: ['c6h', 'c5v'] },
                    { notation: 'd7', phase: 'opening', desc: "Player 2 sidesteps to d7.", arrows: [{ from: 'd7', to: 'd1', color: 'blue' }], sketchWalls: ['c6h', 'c5v'] },
                    { notation: 'c5v', phase: 'opening', desc: "Player 1 places vertical wall c5v to constrain Player 2's lateral recovery.", arrows: [{ from: 'd7', to: 'c7', color: 'red' }], sketchWalls: ['c6h', 'c5v'] },
                    { notation: 'c7', phase: 'opening', desc: "Player 2 maneuvers around the wall to c7.", arrows: [{ from: 'c7', to: 'c1', color: 'blue' }], sketchWalls: ['c6h', 'c5v'] },
                    { notation: 'e4', phase: 'opening', desc: "Player 1 advances straight down the center.", arrows: [{ from: 'e4', to: 'e9', color: 'green' }], sketchWalls: ['c6h', 'c5v'] },
                    { notation: 'b7', phase: 'midgame', desc: "Player 2 continues moving left into the corner.", arrows: [{ from: 'b7', to: 'b1', color: 'blue' }], sketchWalls: [] },
                    { notation: 'b7h', phase: 'midgame', desc: "Player 1 drops b7h, completely sealing the corner exit.", arrows: [{ from: 'b7', to: 'a7', color: 'red' }], sketchWalls: ['b7h'] },
                    { notation: 'a7', phase: 'midgame', desc: "Player 2 is forced to a7.", arrows: [{ from: 'a7', to: 'a8', color: 'blue' }], sketchWalls: [] },
                    { notation: 'e5', phase: 'midgame', desc: "Player 1 marches forward while P2 is trapped.", arrows: [{ from: 'e5', to: 'e9', color: 'green' }], sketchWalls: [] }
                ]
            }
        ]
    }
};
