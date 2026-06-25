(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))o(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&o(l)}).observe(document,{childList:!0,subtree:!0});function a(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(s){if(s.ep)return;s.ep=!0;const i=a(s);fetch(s.href,i)}})();const oe=`<div class="header-left">
    <div class="logo-icon"></div>
    <div>
        <h1>QUORIDOR <span>TRAINER</span></h1>
        <p class="subtitle">Master openings, paths, and wall economy</p>
    </div>
</div>
<div class="header-right">
    <div class="diagnostic-badge" id="hud-mode">Mode: Sandbox</div>
    <div class="diagnostic-badge" id="hud-turn">Turn: Player 1 (Blue)</div>
</div>
`,se=`<div class="panel-header">
    <h2>Opening Playbook</h2>
    <div class="mode-indicator" id="playbook-active-badge">Active</div>
</div>
<div class="panel-body">
    <div class="playbook-selector-wrapper">
        <label for="playbook-select">Select Opening:</label>
        <select id="playbook-select">
            <option value="none">-- Select an Opening --</option>
            <option value="reed">Dr. Reed's Opening (Double Wall)</option>
            <option value="shiller">Shiller Opening (Tempo Vertical)</option>
            <option value="center-rush">Standard Center Rush</option>
            <option value="mirror-defense">Mirror Defense</option>
        </select>
    </div>

    <div id="playbook-info" class="playbook-info-card hidden">
        <h3 id="playbook-title">Reed's Opening</h3>
        <p id="playbook-description" class="playbook-desc">
            Places two horizontal walls behind the opponent early on.
        </p>
        
        <div class="playbook-nav">
            <button id="pb-prev" class="btn btn-secondary" title="Previous Step">←</button>
            <span id="pb-step-counter" class="step-counter">Step 0 / 0</span>
            <button id="pb-next" class="btn btn-secondary" title="Next Step">→</button>
        </div>
        
        <div class="playbook-controls">
            <button id="pb-autoplay" class="btn btn-primary btn-sm">Auto Play</button>
            <button id="pb-practice" class="btn btn-accent btn-sm">Practice Mode</button>
            <button id="pb-reset" class="btn btn-secondary btn-sm">Reset</button>
        </div>

        <div class="playbook-status-msg" id="pb-practice-status">
            Click 'Practice' to try the moves yourself!
        </div>

        <div class="playbook-moves-log">
            <h4>Playbook Sequence</h4>
            <div class="moves-list" id="playbook-moves-list">
                <!-- Populated dynamically -->
            </div>
        </div>
    </div>
    
    <div class="playbook-empty-state" id="playbook-empty">
        <div class="info-icon">💡</div>
        <p>Select an opening above to start learning. You'll get step-by-step guidance on optimal moves and wall blockades.</p>
    </div>
</div>
`,le=`<!-- Players Overview HUD -->
<div class="hud-bar">
    <div class="player-hud-card p1-hud active" id="p1-card">
        <div class="hud-player-info">
            <span class="player-dot p1-dot"></span>
            <span class="player-name">Player 1 (Blue)</span>
        </div>
        <div class="hud-stats">
            <div class="hud-stat">
                <span class="stat-label">Walls</span>
                <span class="stat-val" id="p1-walls-count">10</span>
            </div>
            <div class="hud-stat">
                <span class="stat-label">Path</span>
                <span class="stat-val path-val" id="p1-path-len">8</span>
            </div>
        </div>
    </div>
    
    <div class="vs-divider">VS</div>
    
    <div class="player-hud-card p2-hud" id="p2-card">
        <div class="hud-player-info">
            <span class="player-dot p2-dot"></span>
            <span class="player-name">Player 2 (Amber)</span>
        </div>
        <div class="hud-stats">
            <div class="hud-stat">
                <span class="stat-label">Walls</span>
                <span class="stat-val" id="p2-walls-count">10</span>
            </div>
            <div class="hud-stat">
                <span class="stat-label">Path</span>
                <span class="stat-val path-val" id="p2-path-len">8</span>
            </div>
        </div>
    </div>
</div>

<!-- The Board Wrapper -->
<div class="board-wrapper">
    <div class="coord-label-x">
        <span>A</span><span>B</span><span>C</span><span>D</span><span>E</span><span>F</span><span>G</span><span>H</span><span>I</span>
    </div>
    <div class="board-inner-row">
        <!-- Vertical Evaluation Bar Wrapper on Left -->
        <div class="eval-bar-vertical-wrapper">
            <div class="eval-bar-label eval-bar-label-p2" id="eval-label-p2">P2</div>
            <div class="eval-bar-track" id="eval-bar-track">
                <div class="eval-bar-fill" id="eval-bar-fill"></div>
                <div class="eval-bar-center-line"></div>
            </div>
            <div class="eval-bar-label eval-bar-label-p1" id="eval-label-p1">P1</div>
            <div class="eval-score-container">
                <div class="eval-score-bubble" id="eval-score-bubble">
                    <span class="eval-score-value" id="eval-score-value">0.0</span>
                    <span class="eval-score-unit">pts</span>
                </div>
                <div class="eval-move-badge hidden" id="eval-move-badge">
                    <span id="eval-move-badge-text">Optimal</span>
                </div>
            </div>
        </div>

        <div class="coord-label-y">
            <span>9</span><span>8</span><span>7</span><span>6</span><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>
        </div>
        <div class="quoridor-board" id="board">
            <!-- Cells, horizontal tracks, vertical tracks, and intersections generated by JS -->
        </div>
        <div class="coord-label-y right-y">
            <span>9</span><span>8</span><span>7</span><span>6</span><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>
        </div>
    </div>
    <div class="coord-label-x bottom-x">
        <span>A</span><span>B</span><span>C</span><span>D</span><span>E</span><span>F</span><span>G</span><span>H</span><span>I</span>
    </div>
</div>

<!-- Quick Board Controls -->
<div class="board-quick-controls">
    <button class="btn btn-secondary btn-sm" id="btn-undo">Undo Move</button>
    <button class="btn btn-secondary btn-sm" id="btn-reset-board">Reset Game</button>
    <button class="btn btn-accent btn-sm" id="btn-hint">Get Hint</button>
    <div class="checkbox-wrapper">
        <input type="checkbox" id="chk-show-paths" checked>
        <label for="chk-show-paths">Show Shortest Paths</label>
    </div>
    <div class="checkbox-wrapper">
        <input type="checkbox" id="chk-sound" checked>
        <label for="chk-sound">Enable SFX</label>
    </div>
</div>
`,ie=`<div class="panel-header">
    <h2>Game & Analysis</h2>
</div>
<div class="panel-body">
    <!-- GAME MODE SELECTOR -->
    <div class="control-group">
        <h3>Game Mode</h3>
        <div class="mode-buttons">
            <button class="mode-btn active" id="mode-sandbox" data-mode="sandbox">Sandbox / Free Play</button>
            <button class="mode-btn" id="mode-pvp" data-mode="pvp">Pass & Play (Local)</button>
            <button class="mode-btn" id="mode-ai" data-mode="ai">Vs AI Opponent</button>
        </div>
    </div>

    <!-- AI SETTINGS (HIDDEN BY DEFAULT) -->
    <div class="control-group hidden" id="ai-settings">
        <h3>AI Settings</h3>
        <div class="ai-controls">
            <div class="difficulty-selector">
                <label for="ai-difficulty">Difficulty:</label>
                <select id="ai-difficulty">
                    <option value="easy">Easy (Pawn Focus)</option>
                    <option value="medium">Medium (Heuristic Defense)</option>
                    <option value="hard">Hard (Lookahead search)</option>
                </select>
            </div>
            <div class="ai-role-selector">
                <label for="ai-color">Play As:</label>
                <select id="ai-color">
                    <option value="p1">Player 1 (Blue) - Moves First</option>
                    <option value="p2" selected>Player 2 (Amber) - Moves Second</option>
                </select>
            </div>
        </div>
    </div>

    <!-- PERFORMANCE/DIAGNOSTICS ANALYZER -->
    <div class="control-group diagnostics-panel">
        <h3>Performance Diagnostics</h3>
        
        <div class="diagnostics-row">
            <div class="diag-metric">
                <span class="diag-label">P1 Distance</span>
                <span class="diag-val cyan-text" id="diag-p1-dist">8</span>
            </div>
            <div class="diag-metric">
                <span class="diag-label">P2 Distance</span>
                <span class="diag-val amber-text" id="diag-p2-dist">8</span>
            </div>
            <div class="diag-metric">
                <span class="diag-label">Tempo Diff</span>
                <span class="diag-val" id="diag-tempo-diff">0</span>
            </div>
        </div>

        <!-- WALL EFFICIENCY PANEL -->
        <div class="efficiency-analyzer hidden">
            <h4>Wall Placement Analyzer</h4>
            <div class="efficiency-content" id="efficiency-readout">
                <p class="muted">Hover a wall location on the board to analyze its blocking impact before placing.</p>
            </div>
        </div>
    </div>

    <!-- MOVES LOG -->
    <div class="control-group logs-group">
        <h3>Match History</h3>
        <div class="logs-container" id="game-logs">
            <!-- Populated dynamically -->
            <div class="log-entry system-log">Board initialized. Select Mode or Opening to begin.</div>
        </div>
    </div>
</div>
`,ce=`<p>Quoridor is a registered trademark of Gigamic. Created for performance improvement and opening analysis.</p>
`,re=`<div class="modal-card">
    <h3 id="modal-title">Game Over</h3>
    <p id="modal-message">Player 1 wins!</p>
    <div class="modal-buttons">
        <button class="btn btn-primary" id="modal-btn-restart">Play Again</button>
        <button class="btn btn-secondary" id="modal-btn-close">Close</button>
    </div>
</div>
`,e={p1Pos:{x:4,y:0},p2Pos:{x:4,y:8},p1Walls:10,p2Walls:10,hWalls:new Map,vWalls:new Map,turn:1,gameMode:"sandbox",aiSettings:{difficulty:"medium",color:"p2"},history:[],activePlaybook:null,playbookStep:0,playbookPracticeMode:!1,playbookAutoplayTimer:null,showPaths:!0,soundEnabled:!0};let E=null;function $(t){if(e.soundEnabled)try{E||(E=new(window.AudioContext||window.webkitAudioContext)),E.state==="suspended"&&E.resume();const n=E.createOscillator(),a=E.createGain();n.connect(a),a.connect(E.destination);const o=E.currentTime;t==="move"?(n.type="triangle",n.frequency.setValueAtTime(150,o),n.frequency.exponentialRampToValueAtTime(600,o+.05),a.gain.setValueAtTime(.3,o),a.gain.exponentialRampToValueAtTime(.01,o+.05),n.start(o),n.stop(o+.05)):t==="wall"?(n.type="sine",n.frequency.setValueAtTime(250,o),n.frequency.exponentialRampToValueAtTime(70,o+.1),a.gain.setValueAtTime(.4,o),a.gain.exponentialRampToValueAtTime(.01,o+.1),n.start(o),n.stop(o+.1)):t==="error"?(n.type="sawtooth",n.frequency.setValueAtTime(120,o),a.gain.setValueAtTime(.2,o),a.gain.linearRampToValueAtTime(.01,o+.15),n.start(o),n.stop(o+.15)):t==="win"&&[261.63,329.63,392,523.25].forEach((i,l)=>{const d=E.createOscillator(),c=E.createGain();d.connect(c),c.connect(E.destination),d.type="sine",d.frequency.setValueAtTime(i,o+l*.08),c.gain.setValueAtTime(.2,o+l*.08),c.gain.exponentialRampToValueAtTime(.01,o+l*.08+.3),d.start(o+l*.08),d.stop(o+l*.08+.3)})}catch(n){console.error("Audio error: ",n)}}function M(t,n,a,o,s,i){if(t===a){const l=Math.min(n,o);if(Math.abs(n-o)===1)return s.has(`${t},${l}`)||s.has(`${t-1},${l}`)}else if(n===o){const l=Math.min(t,a);if(Math.abs(t-a)===1)return i.has(`${l},${n}`)||i.has(`${l},${n-1}`)}return!0}function q(t,n,a,o,s,i){const l=[],d=[{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];for(const c of d){const p=t+c.dx,r=n+c.dy;if(!(p<0||p>8||r<0||r>8)&&!M(t,n,p,r,s,i))if(p===a&&r===o){const u=p+c.dx,y=r+c.dy;if(!(u<0||u>8||y<0||y>8||M(p,r,u,y,s,i)))l.push({x:u,y});else if(c.dx===0){const m=p-1,f=p+1;m>=0&&!M(p,r,m,r,s,i)&&l.push({x:m,y:r}),f<=8&&!M(p,r,f,r,s,i)&&l.push({x:f,y:r})}else{const m=r-1,f=r+1;m>=0&&!M(p,r,p,m,s,i)&&l.push({x:p,y:m}),f<=8&&!M(p,r,p,f,s,i)&&l.push({x:p,y:f})}}else l.push({x:p,y:r})}return l}function x(t,n,a,o,s){const i=[{x:t,y:n,path:[]}],l=new Set;for(l.add(`${t},${n}`);i.length>0;){const{x:d,y:c,path:p}=i.shift();if(c===a)return p.concat([{x:d,y:c}]);const r=[{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];for(const u of r){const y=d+u.dx,v=c+u.dy;if(y>=0&&y<9&&v>=0&&v<9){const m=`${y},${v}`;l.has(m)||M(d,c,y,v,o,s)||(l.add(m),i.push({x:y,y:v,path:p.concat([{x:d,y:c}])}))}}}return null}function de(t,n,a,o,s){if(t<0||t>7||n<0||n>7)return!0;if(a==="h"){if(o.has(`${t},${n}`)||o.has(`${t-1},${n}`)||o.has(`${t+1},${n}`)||s.has(`${t},${n}`))return!0}else if(a==="v"&&(s.has(`${t},${n}`)||s.has(`${t},${n-1}`)||s.has(`${t},${n+1}`)||o.has(`${t},${n}`)))return!0;return!1}function F(t,n,a,o,s,i,l){if(de(t,n,a,i,l))return!1;const d=`${t},${n}`;a==="h"?i.set(d,!0):l.set(d,!0);const c=x(o.x,o.y,8,i,l),p=x(s.x,s.y,0,i,l);return a==="h"?i.delete(d):l.delete(d),c!==null&&p!==null}function B(t,n,a,o,s,i,l,d,c,p){const r=x(s.x,s.y,8,l,d),u=x(i.x,i.y,0,l,d);if(!r||r.length===1)return{score:1/0};if(!u||u.length===1)return{score:-1/0};if(t===0)return{score:L(s,i,l,d,c,p,o)};if(o){let y=-1/0,v=null;const m=R(1,s,i,l,d,c,p);if(m.length===0)return{score:L(s,i,l,d,c,p,!0)};for(const f of m){let w={...s},P=c;const h=`${f.x},${f.y}`;f.type==="move"?w=f.to:(f.wallType==="h"?l.set(h,!0):d.set(h,!0),P--);const g=B(t-1,n,a,!1,w,i,l,d,P,p);if(f.type==="wall"&&(f.wallType==="h"?l.delete(h):d.delete(h)),g.score>y&&(y=g.score,v=f),n=Math.max(n,g.score),a<=n)break}return{score:y,move:v}}else{let y=1/0,v=null;const m=R(2,s,i,l,d,c,p);if(m.length===0)return{score:L(s,i,l,d,c,p,!1)};for(const f of m){let w={...i},P=p;const h=`${f.x},${f.y}`;f.type==="move"?w=f.to:(f.wallType==="h"?l.set(h,!0):d.set(h,!0),P--);const g=B(t-1,n,a,!0,s,w,l,d,c,P);if(f.type==="wall"&&(f.wallType==="h"?l.delete(h):d.delete(h)),g.score<y&&(y=g.score,v=f),a=Math.min(a,g.score),a<=n)break}return{score:y,move:v}}}function X(t,n){const a=e.aiSettings.color==="p1";if(a&&e.turn!==1||!a&&e.turn!==2)return;const o=document.getElementById("hud-turn");o&&(o.textContent="Thinking... (AI)"),setTimeout(()=>{let s=null;if(e.aiSettings.difficulty==="easy"){const i=a?e.p2Pos:e.p1Pos,l=a?e.p1Pos:e.p2Pos,d=q(l.x,l.y,i.x,i.y,e.hWalls,e.vWalls),c=a?8:0;let p=1/0;for(const r of d){const u=x(r.x,r.y,c,e.hWalls,e.vWalls);u&&u.length<p&&(p=u.length,s={type:"move",to:r})}!s&&d.length>0&&(s={type:"move",to:d[Math.floor(Math.random()*d.length)]})}else{const i=e.aiSettings.difficulty==="medium"?2:3;s=B(i,-1/0,1/0,a,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls).move}if(s)s.type==="move"?t(s.to.x,s.to.y):n(s.x,s.y,s.wallType);else{const i=a?e.p2Pos:e.p1Pos,l=a?e.p1Pos:e.p2Pos,d=q(l.x,l.y,i.x,i.y,e.hWalls,e.vWalls);d.length>0&&t(d[0].x,d[0].y)}},250)}function L(t,n,a,o,s,i,l){const d=x(t.x,t.y,8,a,o),c=x(n.x,n.y,0,a,o);if(!d)return-1/0;if(!c)return 1/0;const p=d.length-1,r=c.length-1;if(p===0)return 1/0;if(r===0)return-1/0;let u=(r-p)*15;return u+=(s-i)*2,u+=t.y*.8,u-=(8-n.y)*.8,l!==void 0&&(l?u+=7.5:u-=7.5),u}function R(t,n,a,o,s,i,l){const d=t===1?n:a,c=t===1?a:n,p=t===1?i:l,r=[],u=q(d.x,d.y,c.x,c.y,o,s);for(const y of u)r.push({type:"move",to:y});if(p>0){const y=new Set,v=t===1?0:8,m=x(c.x,c.y,v,o,s);if(m)for(let P=0;P<m.length-1;P++){const h=m[P],g=m[P+1];if(h.x===g.x){const I=Math.min(h.y,g.y);y.add(`${h.x},${I},h`),y.add(`${h.x-1},${I},h`)}else{const I=Math.min(h.x,g.x);y.add(`${I},${h.y},v`),y.add(`${I},${h.y-1},v`)}}const f=t===1?8:0;if(x(d.x,d.y,f,o,s))for(let h=Math.max(0,c.x-2);h<=Math.min(7,c.x+2);h++)for(let g=Math.max(0,c.y-2);g<=Math.min(7,c.y+2);g++)y.add(`${h},${g},h`),y.add(`${h},${g},v`);for(const P of y){const[h,g,I]=P.split(","),N=parseInt(h),O=parseInt(g);N>=0&&N<=7&&O>=0&&O<=7&&F(N,O,I,n,a,o,s)&&r.push({type:"wall",x:N,y:O,wallType:I})}}return r}function pe(t,n,a,o,s,i,l){const d=R(t,n,a,o,s,i,l);if(d.length===0)return[];const c=e.aiSettings.difficulty==="easy"?1:e.aiSettings.difficulty==="medium"?2:3,p=t===1,r=d.map(y=>{let v={...n},m={...a},f=i,w=l;const P=new Map(o),h=new Map(s),g=`${y.x},${y.y}`;y.type==="move"?p?v=y.to:m=y.to:(y.wallType==="h"?P.set(g,t):h.set(g,t),p?f--:w--);const I=B(c-1,-1/0,1/0,!p,v,m,P,h,f,w);return{move:y,score:I.score}});let u=p?-1/0:1/0;for(const y of r)p?y.score>u&&(u=y.score):y.score<u&&(u=y.score);return r.filter(y=>y.score===u).map(y=>y.move)}const U=["a","b","c","d","e","f","g","h","i"];function ue(t,n){return U[t]+(n+1)}function J(t,n,a){return U[t]+(n+1)+a}function Y(t){if(!t||t.length<2)return null;const n=t[0].toLowerCase(),a=U.indexOf(n),o=parseInt(t[1])-1;if(t.length===3){const s=t[2].toLowerCase();return{type:"wall",x:a,y:o,wallType:s}}return{type:"pawn",x:a,y:o}}const ye={reed:{title:"Dr. Reed's Opening (Double Wall)",description:"Places two horizontal walls early on at c3h and f3h. This creates a narrow bottleneck in the center, forcing the opponent to navigate through a controlled corridor while you advance your pawn.",moves:[{notation:"e2",desc:"Player 1 steps forward, claiming center presence."},{notation:"e8",desc:"Player 2 mirrors, moving forward to e8."},{notation:"e3",desc:"Player 1 advances to e3, expanding space."},{notation:"e7",desc:"Player 2 advances to e7, meeting Player 1."},{notation:"c3h",desc:"Player 1 places a horizontal wall at c3h. This closes off the left side of the third row."},{notation:"d7h",desc:"Player 2 places d7h to establish their own defensive block."},{notation:"f3h",desc:"Player 1 places the second horizontal wall at f3h. The Reed double-wall structure is complete!"},{notation:"f7h",desc:"Player 2 blocks the right side at f7h, neutralizing symmetry."},{notation:"e4",desc:"Player 1 steps into the bottleneck at e4, ready to break through."}]},shiller:{title:"Shiller Opening (Tempo Vertical)",description:"Named after Champion Larry Shiller. After three pawn moves, Player 1 places a vertical wall directly behind their pawn. This aligns Player 1's own path while adding complex routing decisions for the opponent.",moves:[{notation:"e2",desc:"Player 1 steps forward to e2."},{notation:"e8",desc:"Player 2 advances to e8."},{notation:"e3",desc:"Player 1 advances to e3."},{notation:"e7",desc:"Player 2 advances to e7."},{notation:"e4",desc:"Player 1 reaches the center line at e4."},{notation:"e6",desc:"Player 2 meets Player 1 face-to-face at e6."},{notation:"e2v",desc:"Player 1 places a vertical wall at e2v, directly behind their pawn to secure their alignment."},{notation:"d3h",desc:"Player 2 places a horizontal wall at d3h to defend the flank."},{notation:"d4",desc:"Player 1 sidesteps to d4, seeking a path around the center."}]},"center-rush":{title:"Standard Center Rush",description:"Focuses strictly on pawn movement speed. Players race to the center to force a pawn jump. Winning the jump grants a critical 1-tempo advantage.",moves:[{notation:"e2",desc:"Player 1 advances to e2."},{notation:"e8",desc:"Player 2 advances to e8."},{notation:"e3",desc:"Player 1 advances to e3."},{notation:"e7",desc:"Player 2 advances to e7."},{notation:"e4",desc:"Player 1 advances to e4."},{notation:"e6",desc:"Player 2 advances to e6, coming adjacent to Player 1."},{notation:"e5",desc:"Player 1 steps onto e5, occupying the center square."},{notation:"e4",desc:"Player 2 jumps directly over Player 1, landing at e4! Player 2 gains the lead."},{notation:"f5",desc:"Player 1 sidesteps to f5, adapting to the jump."}]},"mirror-defense":{title:"Mirror Defense",description:"Player 2 mirrors Player 1's movements and wall placements. This neutralizes early aggression and challenges Player 1 to break the symmetry creatively.",moves:[{notation:"e2",desc:"Player 1 starts e2."},{notation:"e8",desc:"Player 2 mirrors with e8."},{notation:"d1h",desc:"Player 1 places an early horizontal wall at d1h."},{notation:"d8h",desc:"Player 2 mirrors, placing a horizontal wall at d8h."},{notation:"e3",desc:"Player 1 advances to e3."},{notation:"e7",desc:"Player 2 mirrors with e7."},{notation:"f3v",desc:"Player 1 places a vertical wall at f3v."},{notation:"f6v",desc:"Player 2 mirrors with a vertical wall at f6v."}]}};let b=null;function me(t){b=t;const n=document.getElementById("playbook-select");n&&n.addEventListener("change",d=>{fe(d.target.value)});const a=document.getElementById("pb-prev");a&&a.addEventListener("click",Z);const o=document.getElementById("pb-next");o&&o.addEventListener("click",j);const s=document.getElementById("pb-reset");s&&s.addEventListener("click",he);const i=document.getElementById("pb-autoplay");i&&i.addEventListener("click",be);const l=document.getElementById("pb-practice");l&&l.addEventListener("click",ge)}function fe(t){if(e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const a=document.getElementById("pb-autoplay");a&&(a.textContent="Auto Play")}if(t==="none"){e.activePlaybook=null,document.getElementById("playbook-info").classList.add("hidden"),document.getElementById("playbook-empty").classList.remove("hidden");return}e.activePlaybook=ye[t],e.playbookStep=0,e.playbookPracticeMode=!1,document.getElementById("playbook-empty").classList.add("hidden"),document.getElementById("playbook-info").classList.remove("hidden"),document.getElementById("playbook-title").textContent=e.activePlaybook.title,document.getElementById("playbook-description").textContent=e.activePlaybook.description;const n=document.getElementById("playbook-moves-list");n.innerHTML="",e.activePlaybook.moves.forEach((a,o)=>{const s=document.createElement("div");s.className="pb-move-item",s.dataset.index=o,s.innerHTML=`
            <span>${o+1}. Player ${o%2===0?1:2} (${a.notation})</span>
            <span style="font-size:0.7rem; color:var(--color-text-muted)">Info</span>
        `,s.addEventListener("click",()=>_(o+1)),n.appendChild(s)}),b&&(b.setGameMode("sandbox"),b.resetBoardState()),S()}function S(){const t=e.activePlaybook;if(!t)return;const n=e.playbookStep;document.getElementById("pb-step-counter").textContent=`Step ${n} / ${t.moves.length}`,document.querySelectorAll(".pb-move-item").forEach(o=>{const s=parseInt(o.dataset.index);o.classList.remove("active"),s===n-1&&(o.classList.add("active"),o.scrollIntoView({block:"nearest"}))});const a=document.getElementById("pb-practice-status");if(e.playbookPracticeMode)if(n===t.moves.length)a.textContent="🏆 Playbook successfully completed! You nailed it!",a.className="playbook-status-msg success";else{const o=t.moves[n],s=n%2===0?1:2;a.textContent=`Practice: Player ${s}'s turn. Play move: ${o.notation.toUpperCase()}`,a.className="playbook-status-msg",ve(o.notation)}else n===0?a.textContent="Click 'Next' or 'Auto Play' to step through the sequence.":a.textContent=t.moves[n-1].desc,a.className="playbook-status-msg"}function ve(t){document.querySelectorAll(".board-cell").forEach(a=>{a.classList.remove("valid-move")});const n=Y(t);if(n&&n.type==="pawn"){const a=document.querySelector(`.board-cell[data-x="${n.x}"][data-y="${n.y}"]`);a&&a.classList.add("valid-move")}}function j(){const t=e.activePlaybook;if(!t||e.playbookStep>=t.moves.length)return;const n=t.moves[e.playbookStep],a=Y(n.notation);if(a.type==="pawn"){const o=e.turn;e.history.push({type:"move",player:o,from:o===1?{...e.p1Pos}:{...e.p2Pos},to:{x:a.x,y:a.y}}),o===1?e.p1Pos={x:a.x,y:a.y}:e.p2Pos={x:a.x,y:a.y},b&&b.logAction(`Playbook Step ${e.playbookStep+1} (P${o}): Pawn to ${n.notation}`,`p${o}`),$("move"),e.turn=e.turn===1?2:1,b&&b.updatePawnPositions()}else{const o=e.turn,s=`${a.x},${a.y}`;e.history.push({type:"wall",player:o,x:a.x,y:a.y,wallType:a.wallType}),a.wallType==="h"?e.hWalls.set(s,o):e.vWalls.set(s,o),o===1?e.p1Walls--:e.p2Walls--,b&&b.logAction(`Playbook Step ${e.playbookStep+1} (P${o}): Wall at ${n.notation}`,`p${o}`),$("wall"),e.turn=e.turn===1?2:1,b&&b.renderPlacedWalls()}e.playbookStep++,b&&b.updateUI(),S()}function Z(){!e.activePlaybook||e.playbookStep<=0||(b&&b.undoMove(),e.playbookStep--,S())}function _(t){if(e.activePlaybook){if(e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const n=document.getElementById("pb-autoplay");n&&(n.textContent="Auto Play")}if(t<e.playbookStep)for(;e.playbookStep>t;)Z();else for(;e.playbookStep<t;)j()}}function he(){_(0)}function be(){const t=document.getElementById("pb-autoplay");if(e.playbookAutoplayTimer)clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null,t.textContent="Auto Play",t.classList.remove("btn-secondary"),t.classList.add("btn-primary");else{e.playbookPracticeMode=!1;const n=document.getElementById("pb-practice");n&&(n.classList.remove("btn-accent"),n.classList.add("btn-secondary"),n.textContent="Practice Mode"),t.textContent="Pause",t.classList.remove("btn-primary"),t.classList.add("btn-secondary"),e.playbookAutoplayTimer=setInterval(()=>{e.playbookStep<e.activePlaybook.moves.length?j():(clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null,t.textContent="Auto Play",t.classList.remove("btn-secondary"),t.classList.add("btn-primary"))},1200)}S()}function ge(){e.playbookPracticeMode=!e.playbookPracticeMode;const t=document.getElementById("pb-practice");if(e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const n=document.getElementById("pb-autoplay");n&&(n.textContent="Auto Play")}e.playbookPracticeMode?(t.textContent="Exit Practice",t.classList.remove("btn-secondary"),t.classList.add("btn-accent"),b&&b.resetBoardState(),e.playbookStep=0):(t.textContent="Practice Mode",t.classList.remove("btn-accent"),t.classList.add("btn-secondary")),b&&b.updateUI(),S()}function Pe(){const t=e.activePlaybook;if(!t||!e.playbookPracticeMode||e.playbookStep>=t.moves.length)return;const n=t.moves[e.playbookStep],a=e.history[e.history.length-1];let o=!1;const s=Y(n.notation);s.type==="pawn"&&a.type==="move"?o=a.to.x===s.x&&a.to.y===s.y:s.type==="wall"&&a.type==="wall"&&(o=a.x===s.x&&a.y===s.y&&a.wallType===s.wallType);const i=document.getElementById("pb-practice-status");o?(e.playbookStep++,i.textContent=`Correct move! ${n.desc}`,i.className="playbook-status-msg success",$("win"),setTimeout(()=>{S()},1e3)):(i.textContent=`Incorrect move. Try again! Expected: ${n.notation.toUpperCase()}`,i.className="playbook-status-msg error",$("error"),setTimeout(()=>{b&&b.undoMove(),S()},800))}function xe(){e.activePlaybook=null,e.playbookStep=0,e.playbookPracticeMode=!1;const t=document.getElementById("playbook-select");if(t&&(t.value="none"),document.getElementById("playbook-info").classList.add("hidden"),document.getElementById("playbook-empty").classList.remove("hidden"),e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const n=document.getElementById("pb-autoplay");n&&(n.textContent="Auto Play")}}function A(){const t=document.getElementById("pawn-p1"),n=document.getElementById("pawn-p2"),a=document.querySelector(`.board-cell[data-x="${e.p1Pos.x}"][data-y="${e.p1Pos.y}"]`),o=document.querySelector(`.board-cell[data-x="${e.p2Pos.x}"][data-y="${e.p2Pos.y}"]`);a&&t&&a.appendChild(t),o&&n&&o.appendChild(n)}function H(){document.querySelectorAll(".placed-wall:not(.hint-wall)").forEach(n=>n.remove());const t=document.getElementById("board");e.hWalls.forEach((n,a)=>{const[o,s]=a.split(","),i=parseInt(o),l=parseInt(s),d=n===2?"p2-wall":"p1-wall",c=document.createElement("div");c.className=`placed-wall horizontal ${d}`,c.style.gridColumn=`${2*i+1} / span 3`,c.style.gridRow=`${16-2*l}`,t.appendChild(c)}),e.vWalls.forEach((n,a)=>{const[o,s]=a.split(","),i=parseInt(o),l=parseInt(s),d=n===2?"p2-wall":"p1-wall",c=document.createElement("div");c.className=`placed-wall vertical ${d}`,c.style.gridColumn=`${2*i+2}`,c.style.gridRow=`${15-2*l} / span 3`,t.appendChild(c)})}function we({onCellClick:t,onEdgeMouseMove:n,onEdgeMouseLeave:a,onEdgeClick:o}){const s=document.getElementById("board");s.innerHTML="";for(let c=8;c>=0;c--)for(let p=0;p<9;p++){const r=document.createElement("div");r.className="board-cell",r.dataset.x=p,r.dataset.y=c,r.style.gridColumn=`${2*p+1}`,r.style.gridRow=`${17-2*c}`,r.addEventListener("click",()=>t(p,c)),s.appendChild(r)}for(let c=7;c>=0;c--)for(let p=0;p<8;p++){const r=document.createElement("div");r.className="board-joint",r.dataset.x=p,r.dataset.y=c,r.style.gridColumn=`${2*p+2}`,r.style.gridRow=`${16-2*c}`,r.style.pointerEvents="none",s.appendChild(r)}for(let c=0;c<8;c++)for(let p=0;p<9;p++){const r=document.createElement("div");r.className="board-edge horizontal",r.dataset.x=p,r.dataset.y=c,r.style.gridColumn=`${2*p+1}`,r.style.gridRow=`${16-2*c}`,r.addEventListener("mousemove",u=>n(u,p,c,"h")),r.addEventListener("mouseleave",u=>a(u,p,c,"h")),r.addEventListener("click",u=>o(u,p,c,"h")),s.appendChild(r)}for(let c=0;c<9;c++)for(let p=0;p<8;p++){const r=document.createElement("div");r.className="board-edge vertical",r.dataset.x=p,r.dataset.y=c,r.style.gridColumn=`${2*p+2}`,r.style.gridRow=`${17-2*c}`,r.addEventListener("mousemove",u=>n(u,p,c,"v")),r.addEventListener("mouseleave",u=>a(u,p,c,"v")),r.addEventListener("click",u=>o(u,p,c,"v")),s.appendChild(r)}const i=document.createElement("div");i.className="preview-wall",i.id="preview-wall",s.appendChild(i);const l=document.createElement("div");l.className="pawn pawn-p1",l.id="pawn-p1",s.appendChild(l);const d=document.createElement("div");d.className="pawn pawn-p2",d.id="pawn-p2",s.appendChild(d),A()}function k(t,n){const a=document.getElementById("game-logs");if(!a)return;const o=document.createElement("div");o.className=`log-entry ${n}-log`,o.textContent=t,a.appendChild(o),a.scrollTop=a.scrollHeight}function Q(t,n){$("win"),k(t,"system");const a=document.getElementById("modal-container");document.getElementById("modal-title").textContent=t,document.getElementById("modal-message").textContent=n,a.classList.remove("hidden")}function Ee(t,n){t===0?Q("Player 1 Wins!","Player 1 (Blue) successfully navigated to the baseline row."):n===0&&Q("Player 2 Wins!","Player 2 (Amber) successfully navigated to the baseline row.")}function ke(){const t=e.aiSettings.difficulty==="easy"?1:e.aiSettings.difficulty==="medium"?2:3,n=e.turn===1;let o=B(t,-1/0,1/0,n,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls).score;o==null&&(o=L(e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls,n));const s=document.getElementById("eval-bar-fill"),i=document.getElementById("eval-score-value"),l=document.getElementById("eval-move-badge"),d=document.getElementById("eval-move-badge-text");if(!s||!i)return;let c;if(o===1/0)c=100,i.textContent="#1",i.style.color="var(--color-p1)";else if(o===-1/0)c=0,i.textContent="#2",i.style.color="var(--color-p2)";else{c=50+Math.max(-120,Math.min(120,o))/120*50;const u=o/10;u>0?(i.textContent=`+${u.toFixed(1)}`,i.style.color="var(--color-p1)"):u<0?(i.textContent=`${u.toFixed(1)}`,i.style.color="var(--color-p2)"):(i.textContent="0.0",i.style.color="var(--color-text-muted)")}s.style.height=`${c}%`,e.lastMoveQuality&&l&&d?(l.className=`eval-move-badge ${e.lastMoveQuality.classification}`,d.textContent=e.lastMoveQuality.text,l.classList.remove("hidden")):l&&l.classList.add("hidden")}function C(){const t=document.getElementById("hud-turn"),n=document.getElementById("p1-card"),a=document.getElementById("p2-card");n.classList.remove("active"),a.classList.remove("active"),e.turn===1?(t.textContent="Turn: Player 1 (Blue)",t.style.borderColor="var(--color-p1)",t.style.color="var(--color-p1)",n.classList.add("active")):(t.textContent="Turn: Player 2 (Amber)",t.style.borderColor="var(--color-p2)",t.style.color="var(--color-p2)",a.classList.add("active")),document.getElementById("p1-walls-count").textContent=e.p1Walls,document.getElementById("p2-walls-count").textContent=e.p2Walls;const o=x(e.p1Pos.x,e.p1Pos.y,8,e.hWalls,e.vWalls),s=x(e.p2Pos.x,e.p2Pos.y,0,e.hWalls,e.vWalls),i=o?o.length-1:1/0,l=s?s.length-1:1/0;document.getElementById("p1-path-len").textContent=i===1/0?"Blocked":i,document.getElementById("p2-path-len").textContent=l===1/0?"Blocked":l,document.getElementById("diag-p1-dist").textContent=i,document.getElementById("diag-p2-dist").textContent=l;const d=l-i,c=document.getElementById("diag-tempo-diff");if(c.textContent=d>0?`+${d} P1`:d<0?`${d} P2`:"0 (Equal)",c.style.color=d>0?"var(--color-p1)":d<0?"var(--color-p2)":"var(--color-text-muted)",document.querySelectorAll(".board-cell").forEach(r=>{r.classList.remove("valid-move","p1-path","p2-path")}),e.showPaths&&(o&&o.forEach(r=>{const u=document.querySelector(`.board-cell[data-x="${r.x}"][data-y="${r.y}"]`);u&&u.classList.add("p1-path")}),s&&s.forEach(r=>{const u=document.querySelector(`.board-cell[data-x="${r.x}"][data-y="${r.y}"]`);u&&u.classList.add("p2-path")})),!(e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2"))){const r=e.turn===1?e.p1Pos:e.p2Pos,u=e.turn===1?e.p2Pos:e.p1Pos;q(r.x,r.y,u.x,u.y,e.hWalls,e.vWalls).forEach(v=>{const m=document.querySelector(`.board-cell[data-x="${v.x}"][data-y="${v.y}"]`);m&&m.classList.add("valid-move")})}Ee(i,l),ke()}function Ie(t,n,a,o){const s=document.getElementById("efficiency-readout"),i=document.querySelector(".efficiency-analyzer");if(!s||!i)return;const l=`${t},${n}`;a==="h"?e.hWalls.delete(l):e.vWalls.delete(l);const d=x(e.p1Pos.x,e.p1Pos.y,8,e.hWalls,e.vWalls).length-1,c=x(e.p2Pos.x,e.p2Pos.y,0,e.hWalls,e.vWalls).length-1;a==="h"?e.hWalls.set(l,o):e.vWalls.set(l,o);const p=x(e.p1Pos.x,e.p1Pos.y,8,e.hWalls,e.vWalls).length-1,r=x(e.p2Pos.x,e.p2Pos.y,0,e.hWalls,e.vWalls).length-1,u=p-d,y=r-c,v=o===1?y-u:u-y;let m="Neutral impact. Conserves wall potential.";v>0?m=`Excellent Placement! Adds +${v} net moves to opponent's route.`:v<0?m=`Suboptimal: Adds +${Math.abs(v)} moves to your own path.`:u===0&&y===0&&(m="No direct impact on path lengths. Use for strategic trapping."),s.innerHTML=`
        <div class="efficiency-results">
            <span class="eff-title">WALL PLACED: ${J(t,n,a).toUpperCase()}</span>
            <div class="eff-impact-row">
                <span>P1 Path Impact:</span>
                <span class="${u>0?"eff-negative":"eff-neutral"}">${u>0?"+"+u:"0"}</span>
            </div>
            <div class="eff-impact-row">
                <span>P2 Path Impact:</span>
                <span class="${y>0?"eff-negative":"eff-neutral"}">${y>0?"+"+y:"0"}</span>
            </div>
            <div class="eff-impact-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.05)">
                <span style="font-weight:600">Advice:</span>
                <span style="font-weight:600; text-align:right" class="${v>0?"eff-positive":v<0?"eff-negative":"eff-neutral"}">${m}</span>
            </div>
        </div>
    `,i.classList.remove("hidden")}function K(){const t=document.querySelector(".efficiency-analyzer");t&&t.classList.add("hidden")}function $e(t){T();const n=document.getElementById("board");n&&t.forEach(a=>{if(a.type==="move"){const o=document.querySelector(`.board-cell[data-x="${a.to.x}"][data-y="${a.to.y}"]`);o&&o.classList.add("hint-cell")}else{const o=document.createElement("div"),s=e.turn===2?"p2-wall":"p1-wall";a.wallType==="h"?(o.className=`placed-wall horizontal hint-wall ${s}`,o.style.gridColumn=`${2*a.x+1} / span 3`,o.style.gridRow=`${16-2*a.y}`):(o.className=`placed-wall vertical hint-wall ${s}`,o.style.gridColumn=`${2*a.x+2}`,o.style.gridRow=`${15-2*a.y} / span 3`),n.appendChild(o)}})}function T(){document.querySelectorAll(".board-cell.hint-cell").forEach(t=>{t.classList.remove("hint-cell")}),document.querySelectorAll(".placed-wall.hint-wall").forEach(t=>{t.remove()})}function ee(t,n){const a=R(n,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls);if(a.length===0)return;const o=p=>{let r={...e.p1Pos},u={...e.p2Pos},y=e.p1Walls,v=e.p2Walls;const m=new Map(e.hWalls),f=new Map(e.vWalls);if(p.type==="move")n===1?r=p.to:u=p.to;else{const w=`${p.x},${p.y}`;p.wallType==="h"?m.set(w,n):f.set(w,n),n===1?y--:v--}return L(r,u,m,f,y,v)};let s=n===1?-1/0:1/0;for(const p of a){const r=o(p);n===1?r>s&&(s=r):r<s&&(s=r)}const i=o(t);let l=0;n===1?s===1/0?l=i===1/0?0:1/0:l=s-i:s===-1/0?l=i===-1/0?0:1/0:l=i-s;let d="optimal",c="Optimal";l===0?(d="optimal",c="Optimal"):l<=4?(d="good",c="Good Move"):l<=15?(d="inaccuracy",c="Inaccuracy"):(d="blunder",c="Blunder"),e.lastMoveQuality={classification:d,text:c,player:n,score:i}}function D(t,n){const a=e.turn,o=a===1?{...e.p1Pos}:{...e.p2Pos};ee({type:"move",to:{x:t,y:n}},a),e.history.push({type:"move",player:a,from:o,to:{x:t,y:n}}),a===1?e.p1Pos={x:t,y:n}:e.p2Pos={x:t,y:n},T(),K(),k(`Player ${a}: Pawn moved to ${ue(t,n)}`,`p${a}`),$("move"),e.turn=e.turn===1?2:1,A(),C(),te()}function V(t,n,a){const o=e.turn,s=`${t},${n}`;ee({type:"wall",x:t,y:n,wallType:a},o),e.history.push({type:"wall",player:o,x:t,y:n,wallType:a}),a==="h"?e.hWalls.set(s,o):e.vWalls.set(s,o),o===1?e.p1Walls--:e.p2Walls--,T(),k(`Player ${o}: Placed wall at ${J(t,n,a)}`,`p${o}`),$("wall"),Ie(t,n,a,o),e.turn=e.turn===1?2:1,H(),C(),te()}function te(){e.gameMode==="sandbox"&&e.activePlaybook&&e.playbookPracticeMode?Pe():e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")&&X(D,V)}function G(){if(e.history.length===0)return;e.lastMoveQuality=null,T(),K();const t=e.history.pop();if(t.type==="move")t.player===1?e.p1Pos=t.from:e.p2Pos=t.from;else{const n=`${t.x},${t.y}`;t.wallType==="h"?e.hWalls.delete(n):e.vWalls.delete(n),t.player===1?e.p1Walls++:e.p2Walls++}e.turn=t.player,k(`Undid last move: ${t.type==="move"?"Pawn move":"Wall placement"}`,"system"),$("move"),A(),H(),C(),e.gameMode==="ai"&&e.history.length>0&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")&&G()}function ne(){e.p1Pos={x:4,y:0},e.p2Pos={x:4,y:8},e.p1Walls=10,e.p2Walls=10,e.hWalls.clear(),e.vWalls.clear(),e.turn=1,e.history=[],e.lastMoveQuality=null,T(),K(),H(),A()}function W(){ne(),e.activePlaybook&&(e.playbookStep=0,S()),k("Game reset. Board initialized.","system"),C(),e.gameMode==="ai"&&e.aiSettings.color==="p1"&&X(D,V)}function z(t){e.gameMode=t;const n=document.getElementById("hud-mode");n&&(n.textContent=`Mode: ${t==="sandbox"?"Sandbox":t==="pvp"?"Pass & Play":"Vs AI"}`),document.querySelectorAll(".mode-btn").forEach(s=>{s.classList.remove("active")});const a=document.getElementById(`mode-${t}`);a&&a.classList.add("active");const o=document.getElementById("ai-settings");o&&(t==="ai"?o.classList.remove("hidden"):o.classList.add("hidden")),k(`Game mode changed to ${n?n.textContent.split(": ")[1]:t}.`,"system"),t!=="sandbox"&&xe(),W()}function ae(t,n,a,o){if(o==="h"){let s;if(n===0)s=0;else if(n===8)s=7;else{const i=t.currentTarget.getBoundingClientRect();s=t.clientX-i.left<i.width/2?n-1:n}return{wx:s,wy:a,type:"h"}}else{let s;if(a===0)s=0;else if(a===8)s=7;else{const i=t.currentTarget.getBoundingClientRect();s=t.clientY-i.top<i.height/2?a:a-1}return{wx:n,wy:s,type:"v"}}}function Se(t,n){const a=document.querySelector(`.board-cell[data-x="${t}"][data-y="${n}"]`);!a||!a.classList.contains("valid-move")||D(t,n)}function Me(t,n,a,o){if(e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")||(e.turn===1?e.p1Walls:e.p2Walls)<=0)return;const{wx:l,wy:d,type:c}=ae(t,n,a,o),p=F(l,d,c,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls),r=document.getElementById("preview-wall");r&&(r.className=`preview-wall visible ${c==="h"?"horizontal":"vertical"} ${e.turn===1?"p1-preview":"p2-preview"}`,p||r.classList.add("invalid"),c==="h"?(r.style.gridColumn=`${2*l+1} / span 3`,r.style.gridRow=`${16-2*d}`):(r.style.gridColumn=`${2*l+2}`,r.style.gridRow=`${15-2*d} / span 3`))}function Ce(t,n,a,o){const s=document.getElementById("preview-wall");s&&s.classList.remove("visible")}function Le(t,n,a,o){if(e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2"))return;if((e.turn===1?e.p1Walls:e.p2Walls)<=0){$("error"),k("Error: No walls left!","system");return}const{wx:l,wy:d,type:c}=ae(t,n,a,o);if(!F(l,d,c,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls)){$("error"),k("Error: Invalid wall placement (overlaps or blocks path)","system");return}V(l,d,c)}function Be(){const t=document.querySelector(".app-header");t&&(t.innerHTML=oe);const n=document.querySelector(".left-panel");n&&(n.innerHTML=se);const a=document.querySelector(".board-container");a&&(a.innerHTML=le);const o=document.querySelector(".right-panel");o&&(o.innerHTML=ie);const s=document.querySelector(".app-footer");s&&(s.innerHTML=ce);const i=document.getElementById("modal-container");i&&(i.innerHTML=re),we({onCellClick:Se,onEdgeMouseMove:Me,onEdgeMouseLeave:Ce,onEdgeClick:Le}),me({executePawnMove:D,executeWallPlacement:V,undoMove:G,updateUI:C,setGameMode:z,resetBoardState:ne,renderPlacedWalls:H,updatePawnPositions:A,logAction:k}),document.getElementById("btn-undo").addEventListener("click",G),document.getElementById("btn-reset-board").addEventListener("click",W),document.getElementById("btn-hint").addEventListener("click",()=>{const l=pe(e.turn,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls);$e(l),k(`Hint requested: found ${l.length} best move(s).`,"system")}),document.getElementById("chk-show-paths").addEventListener("change",l=>{e.showPaths=l.target.checked,C()}),document.getElementById("chk-sound").addEventListener("change",l=>{e.soundEnabled=l.target.checked}),document.querySelectorAll(".mode-btn").forEach(l=>{l.addEventListener("click",()=>z(l.dataset.mode))}),document.getElementById("ai-difficulty").addEventListener("change",l=>{e.aiSettings.difficulty=l.target.value,k(`AI difficulty set to ${l.target.value.toUpperCase()}.`,"system")}),document.getElementById("ai-color").addEventListener("change",l=>{e.aiSettings.color=l.target.value,W()}),document.getElementById("modal-btn-restart").addEventListener("click",()=>{document.getElementById("modal-container").classList.add("hidden"),W()}),document.getElementById("modal-btn-close").addEventListener("click",()=>{document.getElementById("modal-container").classList.add("hidden")}),z("sandbox")}window.addEventListener("DOMContentLoaded",Be);
