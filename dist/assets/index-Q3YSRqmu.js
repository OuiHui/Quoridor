(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))o(s);new MutationObserver(s=>{for(const c of s)if(c.type==="childList")for(const i of c.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&o(i)}).observe(document,{childList:!0,subtree:!0});function a(s){const c={};return s.integrity&&(c.integrity=s.integrity),s.referrerPolicy&&(c.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?c.credentials="include":s.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function o(s){if(s.ep)return;s.ep=!0;const c=a(s);fetch(s.href,c)}})();const de=`<div class="header-left">
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
`,pe=`<div class="panel-header">
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
`,ue=`<!-- Players Overview HUD -->
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
    <button class="btn btn-secondary btn-sm" id="btn-hint">Hint: Off</button>
    <div class="checkbox-wrapper">
        <input type="checkbox" id="chk-show-paths" checked>
        <label for="chk-show-paths">Show Shortest Paths</label>
    </div>
    <div class="checkbox-wrapper">
        <input type="checkbox" id="chk-sound" checked>
        <label for="chk-sound">Enable SFX</label>
    </div>
</div>
`,ye=`<div class="panel-header">
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
</div>`,me=`<p>Quoridor is a registered trademark of Gigamic. Created for performance improvement and opening analysis.</p>
`,fe=`<div class="modal-card">
    <h3 id="modal-title">Game Over</h3>
    <p id="modal-message">Player 1 wins!</p>
    <div class="modal-buttons">
        <button class="btn btn-primary" id="modal-btn-restart">Play Again</button>
        <button class="btn btn-secondary" id="modal-btn-close">Close</button>
    </div>
</div>
`,e={p1Pos:{x:4,y:0},p2Pos:{x:4,y:8},p1Walls:10,p2Walls:10,hWalls:new Map,vWalls:new Map,turn:1,gameMode:"sandbox",aiSettings:{difficulty:"medium",color:"p2"},history:[],activePlaybook:null,playbookStep:0,playbookPracticeMode:!1,playbookAutoplayTimer:null,showPaths:!0,soundEnabled:!0,hintOn:!1};let M=null;function S(t){if(e.soundEnabled)try{M||(M=new(window.AudioContext||window.webkitAudioContext)),M.state==="suspended"&&M.resume();const n=M.createOscillator(),a=M.createGain();n.connect(a),a.connect(M.destination);const o=M.currentTime;t==="move"?(n.type="triangle",n.frequency.setValueAtTime(150,o),n.frequency.exponentialRampToValueAtTime(600,o+.05),a.gain.setValueAtTime(.3,o),a.gain.exponentialRampToValueAtTime(.01,o+.05),n.start(o),n.stop(o+.05)):t==="wall"?(n.type="sine",n.frequency.setValueAtTime(250,o),n.frequency.exponentialRampToValueAtTime(70,o+.1),a.gain.setValueAtTime(.4,o),a.gain.exponentialRampToValueAtTime(.01,o+.1),n.start(o),n.stop(o+.1)):t==="error"?(n.type="sawtooth",n.frequency.setValueAtTime(120,o),a.gain.setValueAtTime(.2,o),a.gain.linearRampToValueAtTime(.01,o+.15),n.start(o),n.stop(o+.15)):t==="win"&&[261.63,329.63,392,523.25].forEach((c,i)=>{const d=M.createOscillator(),l=M.createGain();d.connect(l),l.connect(M.destination),d.type="sine",d.frequency.setValueAtTime(c,o+i*.08),l.gain.setValueAtTime(.2,o+i*.08),l.gain.exponentialRampToValueAtTime(.01,o+i*.08+.3),d.start(o+i*.08),d.stop(o+i*.08+.3)})}catch(n){console.error("Audio error: ",n)}}function T(t,n,a,o,s,c){if(t===a){const i=Math.min(n,o);if(Math.abs(n-o)===1)return s.has(`${t},${i}`)||s.has(`${t-1},${i}`)}else if(n===o){const i=Math.min(t,a);if(Math.abs(t-a)===1)return c.has(`${i},${n}`)||c.has(`${i},${n-1}`)}return!0}function z(t,n,a,o,s,c){const i=[],d=[{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];for(const l of d){const p=t+l.dx,r=n+l.dy;if(!(p<0||p>8||r<0||r>8)&&!T(t,n,p,r,s,c))if(p===a&&r===o){const u=p+l.dx,y=r+l.dy;if(!(u<0||u>8||y<0||y>8||T(p,r,u,y,s,c)))i.push({x:u,y});else if(l.dx===0){const m=p-1,f=p+1;m>=0&&!T(p,r,m,r,s,c)&&i.push({x:m,y:r}),f<=8&&!T(p,r,f,r,s,c)&&i.push({x:f,y:r})}else{const m=r-1,f=r+1;m>=0&&!T(p,r,p,m,s,c)&&i.push({x:p,y:m}),f<=8&&!T(p,r,p,f,s,c)&&i.push({x:p,y:f})}}else i.push({x:p,y:r})}return i}function E(t,n,a,o,s){const c=[{x:t,y:n,path:[]}],i=new Set;for(i.add(`${t},${n}`);c.length>0;){const{x:d,y:l,path:p}=c.shift();if(l===a)return p.concat([{x:d,y:l}]);const r=[{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];for(const u of r){const y=d+u.dx,h=l+u.dy;if(y>=0&&y<9&&h>=0&&h<9){const m=`${y},${h}`;i.has(m)||T(d,l,y,h,o,s)||(i.add(m),c.push({x:y,y:h,path:p.concat([{x:d,y:l}])}))}}}return null}function ve(t,n,a,o,s){if(t<0||t>7||n<0||n>7)return!0;if(a==="h"){if(o.has(`${t},${n}`)||o.has(`${t-1},${n}`)||o.has(`${t+1},${n}`)||s.has(`${t},${n}`))return!0}else if(a==="v"&&(s.has(`${t},${n}`)||s.has(`${t},${n-1}`)||s.has(`${t},${n+1}`)||o.has(`${t},${n}`)))return!0;return!1}function _(t,n,a,o,s,c,i){if(ve(t,n,a,c,i))return!1;const d=`${t},${n}`;a==="h"?c.set(d,!0):i.set(d,!0);const l=E(o.x,o.y,8,c,i),p=E(s.x,s.y,0,c,i);return a==="h"?c.delete(d):i.delete(d),l!==null&&p!==null}function W(t,n,a,o,s,c,i,d,l,p){const r=E(s.x,s.y,8,i,d),u=E(c.x,c.y,0,i,d);if(!r||r.length===1)return{score:1/0};if(!u||u.length===1)return{score:-1/0};if(t===0)return{score:D(s,c,i,d,l,p,o)};if(o){let y=-1/0,h=null;const m=G(1,s,c,i,d,l,p);if(m.length===0)return{score:D(s,c,i,d,l,p,!0)};for(const f of m){let P={...s},x=l;const w=`${f.x},${f.y}`;f.type==="move"?P=f.to:(f.wallType==="h"?i.set(w,!0):d.set(w,!0),x--);const v=W(t-1,n,a,!1,P,c,i,d,x,p);if(f.type==="wall"&&(f.wallType==="h"?i.delete(w):d.delete(w)),v.score>y&&(y=v.score,h=f),n=Math.max(n,v.score),a<=n)break}return{score:y,move:h}}else{let y=1/0,h=null;const m=G(2,s,c,i,d,l,p);if(m.length===0)return{score:D(s,c,i,d,l,p,!1)};for(const f of m){let P={...c},x=p;const w=`${f.x},${f.y}`;f.type==="move"?P=f.to:(f.wallType==="h"?i.set(w,!0):d.set(w,!0),x--);const v=W(t-1,n,a,!0,s,P,i,d,l,x);if(f.type==="wall"&&(f.wallType==="h"?i.delete(w):d.delete(w)),v.score<y&&(y=v.score,h=f),a=Math.min(a,v.score),a<=n)break}return{score:y,move:h}}}function ee(t,n){const a=e.aiSettings.color==="p1";if(a&&e.turn!==1||!a&&e.turn!==2)return;const o=document.getElementById("hud-turn");o&&(o.textContent="Thinking... (AI)"),setTimeout(()=>{let s=null;if(e.aiSettings.difficulty==="easy"){const c=a?e.p2Pos:e.p1Pos,i=a?e.p1Pos:e.p2Pos,d=z(i.x,i.y,c.x,c.y,e.hWalls,e.vWalls),l=a?8:0;let p=1/0;for(const r of d){const u=E(r.x,r.y,l,e.hWalls,e.vWalls);u&&u.length<p&&(p=u.length,s={type:"move",to:r})}!s&&d.length>0&&(s={type:"move",to:d[Math.floor(Math.random()*d.length)]})}else{const c=e.aiSettings.difficulty==="medium"?3:4;s=W(c,-1/0,1/0,a,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls).move}if(s)s.type==="move"?t(s.to.x,s.to.y):n(s.x,s.y,s.wallType);else{const c=a?e.p2Pos:e.p1Pos,i=a?e.p1Pos:e.p2Pos,d=z(i.x,i.y,c.x,c.y,e.hWalls,e.vWalls);d.length>0&&t(d[0].x,d[0].y)}},250)}function D(t,n,a,o,s,c,i){const d=E(t.x,t.y,8,a,o),l=E(n.x,n.y,0,a,o);if(!d)return-1/0;if(!l)return 1/0;const p=d.length-1,r=l.length-1;if(p===0)return 1/0;if(r===0)return-1/0;if(s===0&&p-r>=2)return-500;if(c===0&&r-p>=2)return 500;let u=(r-p)*15;return p<=3&&(u+=(4-p)*8),r<=3&&(u-=(4-r)*8),u+=(s-c)*3,u+=t.y*1,u-=(8-n.y)*1,i!==void 0&&(u+=i?7.5:-7.5),u}function G(t,n,a,o,s,c,i){const d=t===1?n:a,l=t===1?a:n,p=t===1?c:i,r=t===1?8:0,u=t===1?0:8,y=z(d.x,d.y,l.x,l.y,o,s),h=E(d.x,d.y,r,o,s),m=h?new Set(h.map(v=>`${v.x},${v.y}`)):new Set,f=y.map(v=>{const b=m.has(`${v.x},${v.y}`),k=t===1?v.y-d.y:d.y-v.y;return{type:"move",to:v,_s:(b?6:0)+k*3}});if(f.sort((v,b)=>b._s-v._s),p<=0)return f.map(({_s:v,...b})=>b);const P=new Map,x=E(l.x,l.y,u,o,s);if(x){const v=x.length;for(let b=0;b<v-1;b++){const k=x[b],C=x[b+1],A=(v-b)*2;if(k.x===C.x){const L=Math.min(k.y,C.y);for(const $ of[k.x,k.x-1])if($>=0&&$<=7){const q=`${$},${L},h`;P.set(q,Math.max(P.get(q)||0,A))}}else{const L=Math.min(k.x,C.x);for(const $ of[k.y,k.y-1])if($>=0&&$<=7){const q=`${L},${$},v`;P.set(q,Math.max(P.get(q)||0,A))}}}}for(const[v,b]of[[l,2],[d,1]])for(let k=Math.max(0,v.x-2);k<=Math.min(7,v.x+2);k++)for(let C=Math.max(0,v.y-2);C<=Math.min(7,v.y+2);C++)for(const A of["h","v"]){const L=`${k},${C},${A}`;P.has(L)||P.set(L,b)}const w=[];for(const[v,b]of P){const[k,C,A]=v.split(","),L=parseInt(k),$=parseInt(C);L>=0&&L<=7&&$>=0&&$<=7&&_(L,$,A,n,a,o,s)&&w.push({type:"wall",x:L,y:$,wallType:A,_s:b})}return w.sort((v,b)=>b._s-v._s),[...f.map(({_s:v,...b})=>b),...w.slice(0,14).map(({_s:v,...b})=>b)]}function te(t,n,a,o,s,c,i){const d=G(t,n,a,o,s,c,i);if(d.length===0)return[];const l=t===1,p=3,r=d.map(y=>{const h=new Map(o),m=new Map(s);let f={...n},P={...a},x=c,w=i;if(y.type==="move")l?f=y.to:P=y.to;else{const b=`${y.x},${y.y}`;y.wallType==="h"?h.set(b,t):m.set(b,t),l?x--:w--}const v=W(p-1,-1/0,1/0,!l,f,P,h,m,x,w);return{move:y,score:v.score}}),u=r.reduce((y,h)=>l?Math.max(y,h.score):Math.min(y,h.score),l?-1/0:1/0);return r.filter(y=>y.score===u).map(y=>y.move)}const Q=["a","b","c","d","e","f","g","h","i"];function he(t,n){return Q[t]+(n+1)}function ne(t,n,a){return Q[t]+(n+1)+a}function K(t){if(!t||t.length<2)return null;const n=t[0].toLowerCase(),a=Q.indexOf(n),o=parseInt(t[1])-1;if(t.length===3){const s=t[2].toLowerCase();return{type:"wall",x:a,y:o,wallType:s}}return{type:"pawn",x:a,y:o}}const be={reed:{title:"Dr. Reed's Opening (Double Wall)",description:"Places two horizontal walls early on at c3h and f3h. This creates a narrow bottleneck in the center, forcing the opponent to navigate through a controlled corridor while you advance your pawn.",moves:[{notation:"e2",desc:"Player 1 steps forward, claiming center presence."},{notation:"e8",desc:"Player 2 mirrors, moving forward to e8."},{notation:"e3",desc:"Player 1 advances to e3, expanding space."},{notation:"e7",desc:"Player 2 advances to e7, meeting Player 1."},{notation:"c3h",desc:"Player 1 places a horizontal wall at c3h. This closes off the left side of the third row."},{notation:"d7h",desc:"Player 2 places d7h to establish their own defensive block."},{notation:"f3h",desc:"Player 1 places the second horizontal wall at f3h. The Reed double-wall structure is complete!"},{notation:"f7h",desc:"Player 2 blocks the right side at f7h, neutralizing symmetry."},{notation:"e4",desc:"Player 1 steps into the bottleneck at e4, ready to break through."}]},shiller:{title:"Shiller Opening (Tempo Vertical)",description:"Named after Champion Larry Shiller. After three pawn moves, Player 1 places a vertical wall directly behind their pawn. This aligns Player 1's own path while adding complex routing decisions for the opponent.",moves:[{notation:"e2",desc:"Player 1 steps forward to e2."},{notation:"e8",desc:"Player 2 advances to e8."},{notation:"e3",desc:"Player 1 advances to e3."},{notation:"e7",desc:"Player 2 advances to e7."},{notation:"e4",desc:"Player 1 reaches the center line at e4."},{notation:"e6",desc:"Player 2 meets Player 1 face-to-face at e6."},{notation:"e2v",desc:"Player 1 places a vertical wall at e2v, directly behind their pawn to secure their alignment."},{notation:"d3h",desc:"Player 2 places a horizontal wall at d3h to defend the flank."},{notation:"d4",desc:"Player 1 sidesteps to d4, seeking a path around the center."}]},"center-rush":{title:"Standard Center Rush",description:"Focuses strictly on pawn movement speed. Players race to the center to force a pawn jump. Winning the jump grants a critical 1-tempo advantage.",moves:[{notation:"e2",desc:"Player 1 advances to e2."},{notation:"e8",desc:"Player 2 advances to e8."},{notation:"e3",desc:"Player 1 advances to e3."},{notation:"e7",desc:"Player 2 advances to e7."},{notation:"e4",desc:"Player 1 advances to e4."},{notation:"e6",desc:"Player 2 advances to e6, coming adjacent to Player 1."},{notation:"e5",desc:"Player 1 steps onto e5, occupying the center square."},{notation:"e4",desc:"Player 2 jumps directly over Player 1, landing at e4! Player 2 gains the lead."},{notation:"f5",desc:"Player 1 sidesteps to f5, adapting to the jump."}]},"mirror-defense":{title:"Mirror Defense",description:"Player 2 mirrors Player 1's movements and wall placements. This neutralizes early aggression and challenges Player 1 to break the symmetry creatively.",moves:[{notation:"e2",desc:"Player 1 starts e2."},{notation:"e8",desc:"Player 2 mirrors with e8."},{notation:"d1h",desc:"Player 1 places an early horizontal wall at d1h."},{notation:"d8h",desc:"Player 2 mirrors, placing a horizontal wall at d8h."},{notation:"e3",desc:"Player 1 advances to e3."},{notation:"e7",desc:"Player 2 mirrors with e7."},{notation:"f3v",desc:"Player 1 places a vertical wall at f3v."},{notation:"f6v",desc:"Player 2 mirrors with a vertical wall at f6v."}]}};let g=null;function ge(t){g=t;const n=document.getElementById("playbook-select");n&&n.addEventListener("change",d=>{Pe(d.target.value)});const a=document.getElementById("pb-prev");a&&a.addEventListener("click",ae);const o=document.getElementById("pb-next");o&&o.addEventListener("click",X);const s=document.getElementById("pb-reset");s&&s.addEventListener("click",xe);const c=document.getElementById("pb-autoplay");c&&c.addEventListener("click",ke);const i=document.getElementById("pb-practice");i&&i.addEventListener("click",Ee)}function Pe(t){if(e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const a=document.getElementById("pb-autoplay");a&&(a.textContent="Auto Play")}if(t==="none"){e.activePlaybook=null,document.getElementById("playbook-info").classList.add("hidden"),document.getElementById("playbook-empty").classList.remove("hidden");const a=document.getElementById("board");a&&a.classList.remove("playbook-locked");return}e.activePlaybook=be[t],e.playbookStep=0,e.playbookPracticeMode=!1,document.getElementById("playbook-empty").classList.add("hidden"),document.getElementById("playbook-info").classList.remove("hidden"),document.getElementById("playbook-title").textContent=e.activePlaybook.title,document.getElementById("playbook-description").textContent=e.activePlaybook.description;const n=document.getElementById("playbook-moves-list");n.innerHTML="",e.activePlaybook.moves.forEach((a,o)=>{const s=document.createElement("div");s.className="pb-move-item",s.dataset.index=o,s.innerHTML=`
            <span>${o+1}. Player ${o%2===0?1:2} (${a.notation})</span>
            <span style="font-size:0.7rem; color:var(--color-text-muted)">Info</span>
        `,s.addEventListener("click",()=>oe(o+1)),n.appendChild(s)}),g&&(g.setGameMode("sandbox"),g.resetBoardState()),B()}function B(){const t=e.activePlaybook;if(!t){const s=document.getElementById("board");s&&s.classList.remove("playbook-locked");return}const n=document.getElementById("board");n&&(e.playbookPracticeMode?n.classList.remove("playbook-locked"):n.classList.add("playbook-locked"));const a=e.playbookStep;document.getElementById("pb-step-counter").textContent=`Step ${a} / ${t.moves.length}`,document.querySelectorAll(".pb-move-item").forEach(s=>{const c=parseInt(s.dataset.index);s.classList.remove("active"),c===a-1&&(s.classList.add("active"),s.scrollIntoView({block:"nearest"}))});const o=document.getElementById("pb-practice-status");if(e.playbookPracticeMode)if(a===t.moves.length)o.textContent="🏆 Playbook successfully completed! You nailed it!",o.className="playbook-status-msg success";else{const s=t.moves[a],c=a%2===0?1:2;o.textContent=`Practice: Player ${c}'s turn. Play move: ${s.notation.toUpperCase()}`,o.className="playbook-status-msg",we(s.notation)}else a===0?o.textContent="Click 'Next' or 'Auto Play' to step through the sequence.":o.textContent=t.moves[a-1].desc,o.className="playbook-status-msg"}function we(t){document.querySelectorAll(".board-cell").forEach(a=>{a.classList.remove("valid-move")});const n=K(t);if(n&&n.type==="pawn"){const a=document.querySelector(`.board-cell[data-x="${n.x}"][data-y="${n.y}"]`);a&&a.classList.add("valid-move")}}function X(){const t=e.activePlaybook;if(!t||e.playbookStep>=t.moves.length)return;const n=t.moves[e.playbookStep],a=K(n.notation);if(a.type==="pawn"){const o=e.turn;e.history.push({type:"move",player:o,from:o===1?{...e.p1Pos}:{...e.p2Pos},to:{x:a.x,y:a.y}}),o===1?e.p1Pos={x:a.x,y:a.y}:e.p2Pos={x:a.x,y:a.y},g&&g.logAction(`Playbook Step ${e.playbookStep+1} (P${o}): Pawn to ${n.notation}`,`p${o}`),S("move"),e.turn=e.turn===1?2:1,g&&g.updatePawnPositions()}else{const o=e.turn,s=`${a.x},${a.y}`;e.history.push({type:"wall",player:o,x:a.x,y:a.y,wallType:a.wallType}),a.wallType==="h"?e.hWalls.set(s,o):e.vWalls.set(s,o),o===1?e.p1Walls--:e.p2Walls--,g&&g.logAction(`Playbook Step ${e.playbookStep+1} (P${o}): Wall at ${n.notation}`,`p${o}`),S("wall"),e.turn=e.turn===1?2:1,g&&g.renderPlacedWalls()}e.playbookStep++,g&&g.updateUI(),B()}function ae(){!e.activePlaybook||e.playbookStep<=0||(g&&g.undoMove(),e.playbookStep--,B())}function oe(t){if(e.activePlaybook){if(e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const n=document.getElementById("pb-autoplay");n&&(n.textContent="Auto Play")}if(t<e.playbookStep)for(;e.playbookStep>t;)ae();else for(;e.playbookStep<t;)X()}}function xe(){oe(0)}function ke(){const t=document.getElementById("pb-autoplay");if(e.playbookAutoplayTimer)clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null,t.textContent="Auto Play",t.classList.remove("btn-secondary"),t.classList.add("btn-primary");else{e.playbookPracticeMode=!1;const n=document.getElementById("pb-practice");n&&(n.classList.remove("btn-accent"),n.classList.add("btn-secondary"),n.textContent="Practice Mode"),t.textContent="Pause",t.classList.remove("btn-primary"),t.classList.add("btn-secondary"),e.playbookAutoplayTimer=setInterval(()=>{e.playbookStep<e.activePlaybook.moves.length?X():(clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null,t.textContent="Auto Play",t.classList.remove("btn-secondary"),t.classList.add("btn-primary"))},1200)}B()}function Ee(){e.playbookPracticeMode=!e.playbookPracticeMode;const t=document.getElementById("pb-practice");if(e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const n=document.getElementById("pb-autoplay");n&&(n.textContent="Auto Play")}e.playbookPracticeMode?(t.textContent="Exit Practice",t.classList.remove("btn-secondary"),t.classList.add("btn-accent"),g&&g.resetBoardState(),e.playbookStep=0):(t.textContent="Practice Mode",t.classList.remove("btn-accent"),t.classList.add("btn-secondary")),g&&g.updateUI(),B()}function Ie(){const t=e.activePlaybook;if(!t||!e.playbookPracticeMode||e.playbookStep>=t.moves.length)return;const n=t.moves[e.playbookStep],a=e.history[e.history.length-1];let o=!1;const s=K(n.notation);s.type==="pawn"&&a.type==="move"?o=a.to.x===s.x&&a.to.y===s.y:s.type==="wall"&&a.type==="wall"&&(o=a.x===s.x&&a.y===s.y&&a.wallType===s.wallType);const c=document.getElementById("pb-practice-status");o?(e.playbookStep++,c.textContent=`Correct move! ${n.desc}`,c.className="playbook-status-msg success",S("win"),setTimeout(()=>{B()},1e3)):(c.textContent=`Incorrect move. Try again! Expected: ${n.notation.toUpperCase()}`,c.className="playbook-status-msg error",S("error"),setTimeout(()=>{g&&g.undoMove(),B()},800))}function $e(){e.activePlaybook=null,e.playbookStep=0,e.playbookPracticeMode=!1;const t=document.getElementById("playbook-select");t&&(t.value="none"),document.getElementById("playbook-info").classList.add("hidden"),document.getElementById("playbook-empty").classList.remove("hidden");const n=document.getElementById("board");if(n&&n.classList.remove("playbook-locked"),e.playbookAutoplayTimer){clearInterval(e.playbookAutoplayTimer),e.playbookAutoplayTimer=null;const a=document.getElementById("pb-autoplay");a&&(a.textContent="Auto Play")}}function R(){const t=document.getElementById("pawn-p1"),n=document.getElementById("pawn-p2"),a=document.querySelector(`.board-cell[data-x="${e.p1Pos.x}"][data-y="${e.p1Pos.y}"]`),o=document.querySelector(`.board-cell[data-x="${e.p2Pos.x}"][data-y="${e.p2Pos.y}"]`);a&&t&&a.appendChild(t),o&&n&&o.appendChild(n)}function F(){document.querySelectorAll(".placed-wall:not(.hint-wall)").forEach(n=>n.remove());const t=document.getElementById("board");e.hWalls.forEach((n,a)=>{const[o,s]=a.split(","),c=parseInt(o),i=parseInt(s),d=n===2?"p2-wall":"p1-wall",l=document.createElement("div");l.className=`placed-wall horizontal ${d}`,l.style.gridColumn=`${2*c+1} / span 3`,l.style.gridRow=`${16-2*i}`,t.appendChild(l)}),e.vWalls.forEach((n,a)=>{const[o,s]=a.split(","),c=parseInt(o),i=parseInt(s),d=n===2?"p2-wall":"p1-wall",l=document.createElement("div");l.className=`placed-wall vertical ${d}`,l.style.gridColumn=`${2*c+2}`,l.style.gridRow=`${15-2*i} / span 3`,t.appendChild(l)})}function Le({onCellClick:t,onEdgeMouseMove:n,onEdgeMouseLeave:a,onEdgeClick:o}){const s=document.getElementById("board");s.innerHTML="";for(let l=8;l>=0;l--)for(let p=0;p<9;p++){const r=document.createElement("div");r.className="board-cell",r.dataset.x=p,r.dataset.y=l,r.style.gridColumn=`${2*p+1}`,r.style.gridRow=`${17-2*l}`,r.addEventListener("click",()=>t(p,l)),s.appendChild(r)}for(let l=7;l>=0;l--)for(let p=0;p<8;p++){const r=document.createElement("div");r.className="board-joint",r.dataset.x=p,r.dataset.y=l,r.style.gridColumn=`${2*p+2}`,r.style.gridRow=`${16-2*l}`,r.style.pointerEvents="none",s.appendChild(r)}for(let l=0;l<8;l++)for(let p=0;p<9;p++){const r=document.createElement("div");r.className="board-edge horizontal",r.dataset.x=p,r.dataset.y=l,r.style.gridColumn=`${2*p+1}`,r.style.gridRow=`${16-2*l}`,r.addEventListener("mousemove",u=>n(u,p,l,"h")),r.addEventListener("mouseleave",u=>a(u,p,l,"h")),r.addEventListener("click",u=>o(u,p,l,"h")),s.appendChild(r)}for(let l=0;l<9;l++)for(let p=0;p<8;p++){const r=document.createElement("div");r.className="board-edge vertical",r.dataset.x=p,r.dataset.y=l,r.style.gridColumn=`${2*p+2}`,r.style.gridRow=`${17-2*l}`,r.addEventListener("mousemove",u=>n(u,p,l,"v")),r.addEventListener("mouseleave",u=>a(u,p,l,"v")),r.addEventListener("click",u=>o(u,p,l,"v")),s.appendChild(r)}const c=document.createElement("div");c.className="preview-wall",c.id="preview-wall",s.appendChild(c);const i=document.createElement("div");i.className="pawn pawn-p1",i.id="pawn-p1",s.appendChild(i);const d=document.createElement("div");d.className="pawn pawn-p2",d.id="pawn-p2",s.appendChild(d),R()}function se(t){O();const n=document.getElementById("board");n&&t.forEach(a=>{if(a.type==="move"){const o=document.querySelector(`.board-cell[data-x="${a.to.x}"][data-y="${a.to.y}"]`);o&&o.classList.add("hint-cell")}else{const o=document.createElement("div"),s=e.turn===2?"p2-wall":"p1-wall";a.wallType==="h"?(o.className=`placed-wall horizontal hint-wall ${s}`,o.style.gridColumn=`${2*a.x+1} / span 3`,o.style.gridRow=`${16-2*a.y}`,o.dataset.type="h"):(o.className=`placed-wall vertical hint-wall ${s}`,o.style.gridColumn=`${2*a.x+2}`,o.style.gridRow=`${15-2*a.y} / span 3`,o.dataset.type="v"),o.dataset.x=a.x,o.dataset.y=a.y,n.appendChild(o)}})}function O(){document.querySelectorAll(".board-cell.hint-cell").forEach(t=>{t.classList.remove("hint-cell")}),document.querySelectorAll(".placed-wall.hint-wall").forEach(t=>{t.remove()})}function I(t,n){const a=document.getElementById("game-logs");if(!a)return;const o=document.createElement("div");o.className=`log-entry ${n}-log`,o.textContent=t,a.appendChild(o),a.scrollTop=a.scrollHeight}function Z(t,n){S("win"),I(t,"system");const a=document.getElementById("modal-container");document.getElementById("modal-title").textContent=t,document.getElementById("modal-message").textContent=n,a.classList.remove("hidden")}function Me(t,n){t===0?Z("Player 1 Wins!","Player 1 (Blue) successfully navigated to the baseline row."):n===0&&Z("Player 2 Wins!","Player 2 (Amber) successfully navigated to the baseline row.")}function Se(){const n=e.turn===1;let o=W(5,-1/0,1/0,n,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls).score;o==null&&(o=D(e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls,n));const s=document.getElementById("eval-bar-fill"),c=document.getElementById("eval-score-value"),i=document.getElementById("eval-move-badge"),d=document.getElementById("eval-move-badge-text");if(!s||!c)return;let l;if(o===1/0)l=100,c.textContent="#1",c.style.color="var(--color-p1)";else if(o===-1/0)l=0,c.textContent="#2",c.style.color="var(--color-p2)";else{l=50+Math.max(-120,Math.min(120,o))/120*50;const u=o/10;u>0?(c.textContent=`+${u.toFixed(1)}`,c.style.color="var(--color-p1)"):u<0?(c.textContent=`${u.toFixed(1)}`,c.style.color="var(--color-p2)"):(c.textContent="0.0",c.style.color="var(--color-text-muted)")}s.style.height=`${l}%`,e.lastMoveQuality&&i&&d?(i.className=`eval-move-badge ${e.lastMoveQuality.classification}`,d.textContent=e.lastMoveQuality.text,i.classList.remove("hidden")):i&&i.classList.add("hidden")}function N(){const t=document.getElementById("hud-turn"),n=document.getElementById("p1-card"),a=document.getElementById("p2-card");n.classList.remove("active"),a.classList.remove("active"),e.turn===1?(t.textContent="Turn: Player 1 (Blue)",t.style.borderColor="var(--color-p1)",t.style.color="var(--color-p1)",n.classList.add("active")):(t.textContent="Turn: Player 2 (Amber)",t.style.borderColor="var(--color-p2)",t.style.color="var(--color-p2)",a.classList.add("active")),document.getElementById("p1-walls-count").textContent=e.p1Walls,document.getElementById("p2-walls-count").textContent=e.p2Walls;const o=E(e.p1Pos.x,e.p1Pos.y,8,e.hWalls,e.vWalls),s=E(e.p2Pos.x,e.p2Pos.y,0,e.hWalls,e.vWalls),c=o?o.length-1:1/0,i=s?s.length-1:1/0;document.getElementById("p1-path-len").textContent=c===1/0?"Blocked":c,document.getElementById("p2-path-len").textContent=i===1/0?"Blocked":i,document.getElementById("diag-p1-dist").textContent=c,document.getElementById("diag-p2-dist").textContent=i;const d=i-c,l=document.getElementById("diag-tempo-diff");l.textContent=d>0?`+${d} P1`:d<0?`${d} P2`:"0 (Equal)",l.style.color=d>0?"var(--color-p1)":d<0?"var(--color-p2)":"var(--color-text-muted)",document.querySelectorAll(".board-cell").forEach(u=>{u.classList.remove("valid-move","p1-path","p2-path")}),e.showPaths&&(o&&o.forEach(u=>{const y=document.querySelector(`.board-cell[data-x="${u.x}"][data-y="${u.y}"]`);y&&y.classList.add("p1-path")}),s&&s.forEach(u=>{const y=document.querySelector(`.board-cell[data-x="${u.x}"][data-y="${u.y}"]`);y&&y.classList.add("p2-path")}));let p=e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2");const r=e.activePlaybook!==null&&!e.playbookPracticeMode;if(!p&&!r){const u=e.turn===1?e.p1Pos:e.p2Pos,y=e.turn===1?e.p2Pos:e.p1Pos;z(u.x,u.y,y.x,y.y,e.hWalls,e.vWalls).forEach(m=>{const f=document.querySelector(`.board-cell[data-x="${m.x}"][data-y="${m.y}"]`);f&&f.classList.add("valid-move")})}if(Me(c,i),Se(),e.hintOn&&!p&&!r){const u=te(e.turn,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls);se(u)}else O()}function Ce(t,n,a,o){const s=document.getElementById("efficiency-readout"),c=document.querySelector(".efficiency-analyzer");if(!s||!c)return;const i=`${t},${n}`;a==="h"?e.hWalls.delete(i):e.vWalls.delete(i);const d=E(e.p1Pos.x,e.p1Pos.y,8,e.hWalls,e.vWalls).length-1,l=E(e.p2Pos.x,e.p2Pos.y,0,e.hWalls,e.vWalls).length-1;a==="h"?e.hWalls.set(i,o):e.vWalls.set(i,o);const p=E(e.p1Pos.x,e.p1Pos.y,8,e.hWalls,e.vWalls).length-1,r=E(e.p2Pos.x,e.p2Pos.y,0,e.hWalls,e.vWalls).length-1,u=p-d,y=r-l,h=o===1?y-u:u-y;let m="Neutral impact. Conserves wall potential.";h>0?m=`Excellent Placement! Adds +${h} net moves to opponent's route.`:h<0?m=`Suboptimal: Adds +${Math.abs(h)} moves to your own path.`:u===0&&y===0&&(m="No direct impact on path lengths. Use for strategic trapping."),s.innerHTML=`
        <div class="efficiency-results">
            <span class="eff-title">WALL PLACED: ${ne(t,n,a).toUpperCase()}</span>
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
                <span style="font-weight:600; text-align:right" class="${h>0?"eff-positive":h<0?"eff-negative":"eff-neutral"}">${m}</span>
            </div>
        </div>
    `,c.classList.remove("hidden")}function J(){const t=document.querySelector(".efficiency-analyzer");t&&t.classList.add("hidden")}function Be(){const t=document.getElementById("game-logs");t&&(t.innerHTML="")}function le(t,n){const o=G(n,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls);if(o.length===0)return;const s=n===1,c=u=>{let y={...e.p1Pos},h={...e.p2Pos},m=e.p1Walls,f=e.p2Walls;const P=new Map(e.hWalls),x=new Map(e.vWalls);if(u.type==="move")s?y=u.to:h=u.to;else{const v=`${u.x},${u.y}`;u.wallType==="h"?P.set(v,n):x.set(v,n),s?m--:f--}return W(4,-1/0,1/0,!s,y,h,P,x,m,f).score};let i=s?-1/0:1/0;for(const u of o){const y=c(u);s?y>i&&(i=y):y<i&&(i=y)}const d=c(t);let l=0;n===1?i===1/0?l=d===1/0?0:1/0:l=i-d:i===-1/0?l=d===-1/0?0:1/0:l=d-i;let p="optimal",r="Optimal";l===0?(p="optimal",r="Optimal"):l<=4?(p="good",r="Good Move"):l<=15?(p="inaccuracy",r="Inaccuracy"):(p="blunder",r="Blunder"),e.lastMoveQuality={classification:p,text:r,player:n,score:d}}function U(t,n){const a=e.turn,o=a===1?{...e.p1Pos}:{...e.p2Pos};le({type:"move",to:{x:t,y:n}},a),e.history.push({type:"move",player:a,from:o,to:{x:t,y:n}}),a===1?e.p1Pos={x:t,y:n}:e.p2Pos={x:t,y:n},O(),J(),I(`Player ${a}: Pawn moved to ${he(t,n)}`,`p${a}`),S("move"),e.turn=e.turn===1?2:1,R(),N(),ie()}function H(t,n,a){const o=e.turn,s=`${t},${n}`;le({type:"wall",x:t,y:n,wallType:a},o),e.history.push({type:"wall",player:o,x:t,y:n,wallType:a}),a==="h"?e.hWalls.set(s,o):e.vWalls.set(s,o),o===1?e.p1Walls--:e.p2Walls--,O(),I(`Player ${o}: Placed wall at ${ne(t,n,a)}`,`p${o}`),S("wall"),Ce(t,n,a,o),e.turn=e.turn===1?2:1,F(),N(),ie()}function ie(){e.gameMode==="sandbox"&&e.activePlaybook&&e.playbookPracticeMode?Ie():e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")&&ee(U,H)}function j(){if(e.history.length===0)return;e.lastMoveQuality=null,O(),J();const t=e.history.pop();if(t.type==="move")t.player===1?e.p1Pos=t.from:e.p2Pos=t.from;else{const n=`${t.x},${t.y}`;t.wallType==="h"?e.hWalls.delete(n):e.vWalls.delete(n),t.player===1?e.p1Walls++:e.p2Walls++}e.turn=t.player,I(`Undid last move: ${t.type==="move"?"Pawn move":"Wall placement"}`,"system"),S("move"),R(),F(),N(),e.gameMode==="ai"&&e.history.length>0&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")&&j()}function ce(){e.p1Pos={x:4,y:0},e.p2Pos={x:4,y:8},e.p1Walls=10,e.p2Walls=10,e.hWalls.clear(),e.vWalls.clear(),e.turn=1,e.history=[],e.lastMoveQuality=null,O(),J(),F(),R()}function V(){Be(),ce(),e.activePlaybook&&(e.playbookStep=0,B()),I("Game reset. Board initialized.","system"),N(),e.gameMode==="ai"&&e.aiSettings.color==="p1"&&ee(U,H)}function Y(t){e.gameMode=t;const n=document.getElementById("hud-mode");n&&(n.textContent=`Mode: ${t==="sandbox"?"Sandbox":t==="pvp"?"Pass & Play":"Vs AI"}`),document.querySelectorAll(".mode-btn").forEach(s=>{s.classList.remove("active")});const a=document.getElementById(`mode-${t}`);a&&a.classList.add("active");const o=document.getElementById("ai-settings");o&&(t==="ai"?o.classList.remove("hidden"):o.classList.add("hidden")),I(`Game mode changed to ${n?n.textContent.split(": ")[1]:t}.`,"system"),t!=="sandbox"&&$e(),V()}function re(t,n,a,o){if(o==="h"){let s;if(n===0)s=0;else if(n===8)s=7;else{const c=t.currentTarget.getBoundingClientRect();s=t.clientX-c.left<c.width/2?n-1:n}return{wx:s,wy:a,type:"h"}}else{let s;if(a===0)s=0;else if(a===8)s=7;else{const c=t.currentTarget.getBoundingClientRect();s=t.clientY-c.top<c.height/2?a:a-1}return{wx:n,wy:s,type:"v"}}}function Ae(t,n){if(e.activePlaybook!==null&&!e.playbookPracticeMode)return;const a=document.querySelector(`.board-cell[data-x="${t}"][data-y="${n}"]`);!a||!a.classList.contains("valid-move")||U(t,n)}function Te(t,n,a,o){if(e.activePlaybook!==null&&!e.playbookPracticeMode||e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")||(e.turn===1?e.p1Walls:e.p2Walls)<=0)return;const{wx:i,wy:d,type:l}=re(t,n,a,o),p=_(i,d,l,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls),r=document.getElementById("preview-wall");r&&(r.className=`preview-wall visible ${l==="h"?"horizontal":"vertical"} ${e.turn===1?"p1-preview":"p2-preview"}`,p||r.classList.add("invalid"),l==="h"?(r.style.gridColumn=`${2*i+1} / span 3`,r.style.gridRow=`${16-2*d}`):(r.style.gridColumn=`${2*i+2}`,r.style.gridRow=`${15-2*d} / span 3`))}function Oe(t,n,a,o){const s=document.getElementById("preview-wall");s&&s.classList.remove("visible")}function We(t,n,a,o){if(e.activePlaybook!==null&&!e.playbookPracticeMode||e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2"))return;if((e.turn===1?e.p1Walls:e.p2Walls)<=0){S("error"),I("Error: No walls left!","system");return}const{wx:i,wy:d,type:l}=re(t,n,a,o);if(!_(i,d,l,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls)){S("error"),I("Error: Invalid wall placement (overlaps or blocks path)","system");return}H(i,d,l)}function Ne(){const t=document.querySelector(".app-header");t&&(t.innerHTML=de);const n=document.querySelector(".left-panel");n&&(n.innerHTML=pe);const a=document.querySelector(".board-container");a&&(a.innerHTML=ue);const o=document.querySelector(".right-panel");o&&(o.innerHTML=ye);const s=document.querySelector(".app-footer");s&&(s.innerHTML=me);const c=document.getElementById("modal-container");c&&(c.innerHTML=fe),Le({onCellClick:Ae,onEdgeMouseMove:Te,onEdgeMouseLeave:Oe,onEdgeClick:We}),ge({executePawnMove:U,executeWallPlacement:H,undoMove:j,updateUI:N,setGameMode:Y,resetBoardState:ce,renderPlacedWalls:F,updatePawnPositions:R,logAction:I}),document.getElementById("btn-undo").addEventListener("click",j),document.getElementById("btn-reset-board").addEventListener("click",V);const i=document.getElementById("btn-hint");i.addEventListener("click",()=>{if(e.hintOn=!e.hintOn,e.hintOn){i.textContent="Hint: On",i.classList.remove("btn-secondary"),i.classList.add("btn-accent");const l=te(e.turn,e.p1Pos,e.p2Pos,e.hWalls,e.vWalls,e.p1Walls,e.p2Walls);se(l),I("Auto hints enabled.","system")}else i.textContent="Hint: Off",i.classList.remove("btn-accent"),i.classList.add("btn-secondary"),O(),I("Auto hints disabled.","system")});const d=document.getElementById("board");d.addEventListener("mousemove",l=>{if(l.target.classList.contains("hint-wall")){if(e.activePlaybook!==null&&!e.playbookPracticeMode)return;const p=parseInt(l.target.dataset.x),r=parseInt(l.target.dataset.y),u=l.target.dataset.type;if(e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2")||(e.turn===1?e.p1Walls:e.p2Walls)<=0)return;const m=document.getElementById("preview-wall");m&&(m.className=`preview-wall visible ${u==="h"?"horizontal":"vertical"} ${e.turn===1?"p1-preview":"p2-preview"}`,u==="h"?(m.style.gridColumn=`${2*p+1} / span 3`,m.style.gridRow=`${16-2*r}`):(m.style.gridColumn=`${2*p+2}`,m.style.gridRow=`${15-2*r} / span 3`))}}),d.addEventListener("mouseout",l=>{if(l.target.classList.contains("hint-wall")){if(e.activePlaybook!==null&&!e.playbookPracticeMode)return;const p=document.getElementById("preview-wall");p&&p.classList.remove("visible")}}),d.addEventListener("click",l=>{if(l.target.classList.contains("hint-wall")){if(e.activePlaybook!==null&&!e.playbookPracticeMode)return;const p=parseInt(l.target.dataset.x),r=parseInt(l.target.dataset.y),u=l.target.dataset.type;if(e.gameMode==="ai"&&(e.turn===1&&e.aiSettings.color==="p1"||e.turn===2&&e.aiSettings.color==="p2"))return;if((e.turn===1?e.p1Walls:e.p2Walls)<=0){S("error"),I("Error: No walls left!","system");return}H(p,r,u)}}),document.getElementById("chk-show-paths").addEventListener("change",l=>{e.showPaths=l.target.checked,N()}),document.getElementById("chk-sound").addEventListener("change",l=>{e.soundEnabled=l.target.checked}),document.querySelectorAll(".mode-btn").forEach(l=>{l.addEventListener("click",()=>Y(l.dataset.mode))}),document.getElementById("ai-difficulty").addEventListener("change",l=>{e.aiSettings.difficulty=l.target.value,I(`AI difficulty set to ${l.target.value.toUpperCase()}.`,"system")}),document.getElementById("ai-color").addEventListener("change",l=>{e.aiSettings.color=l.target.value,V()}),document.getElementById("modal-btn-restart").addEventListener("click",()=>{document.getElementById("modal-container").classList.add("hidden"),V()}),document.getElementById("modal-btn-close").addEventListener("click",()=>{document.getElementById("modal-container").classList.add("hidden")}),Y("sandbox")}window.addEventListener("DOMContentLoaded",Ne);
