// Border Line — balance sweep.
// Self-contained: reads ./border-line-rts.html, runs the real game logic headlessly.
// The real AI plays BOTH sides (same 'balanced' strategy, normal difficulty), round robin:
// every faction meets every other faction on rotating maps, swapping sides each game.
// Games run on 4 parallel workers. Also reports what Hackers did (count, ore siphoned/stolen).
//   node balance.js              (2 games per pairing = 30 games)
//   node balance.js 5            (5 games per pairing = 75 games)
//   node balance.js 5 nohack     (same, but the AI never trains Hackers: A/B their impact)
// Win rate reflects faction strength, not tactics. Use `node -r ./seed.js balance.js` to compare before/after.

const fs = require('fs');
const GAMES = Math.max(1, parseInt(process.argv[2] || '2', 10));
const NOHACK = process.argv.includes('nohack');
const MAX_SECONDS = 1200, WORKERS = 4;
const SHARD = process.env.BL_SHARD; // set on worker processes: "i/n"

if (SHARD === undefined) {
  // ---- parent: fan out to workers, merge their JSON, print the tables ----
  const { spawn } = require('child_process');
  let done = 0; const all = [];
  for (let i = 0; i < WORKERS; i++) {
    const c = spawn(process.execPath, [...process.execArgv, __filename, ...process.argv.slice(2)], { env: { ...process.env, BL_SHARD: i + '/' + WORKERS } });
    let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => process.stderr.write(d));
    c.on('close', () => { all.push(...JSON.parse(out)); if (++done === WORKERS) report(all); });
  }
  function report(R) {
    const facs = [...new Set(R.flatMap(r => [r.a, r.b]))], name = JSON.parse(R[0].names);
    const W = {}, P = {}, M = {}, H = {};
    facs.forEach(f => { W[f] = 0; P[f] = 0; M[f] = {}; facs.forEach(g => M[f][g] = 0); H[f] = { n: 0, rig: 0, hack: 0, games: 0, mins: 0 }; });
    let timeouts = 0, tSum = 0;
    for (const r of R) { P[r.a]++; P[r.b]++; tSum += r.t;
      r.teams.forEach(tm => { const h = H[tm.fac]; h.games++; h.n += tm.hackers; h.rig += tm.rig; h.hack += tm.hack; h.mins += r.t / 60; });
      if (r.w === null) { timeouts++; continue; } W[r.w]++; M[r.w][r.w === r.a ? r.b : r.a]++; }
    const pad = (s, n) => (s + '').padEnd(n), sh = f => name[f].split(' ')[0].slice(0, 7);
    console.log('Border Line balance — AI vs AI round robin, ' + GAMES + ' game(s) per pairing, normal' + (NOHACK ? ', NO HACKERS' : '') + '\n');
    console.log(pad('Faction', 16) + pad('Win%', 6) + pad('W/Games', 9) + '  wins vs: ' + facs.map(f => pad(sh(f), 8)).join(''));
    console.log('-'.repeat(32 + 8 * facs.length));
    facs.slice().sort((x, y) => W[y] / P[y] - W[x] / P[x]).forEach(f =>
      console.log(pad(name[f], 16) + pad(Math.round(W[f] / P[f] * 100) + '%', 6) + pad(W[f] + '/' + P[f], 9) + '  ' + pad('', 9) + facs.map(g => pad(g === f ? '-' : M[f][g] + '/' + (M[f][g] + M[g][f]), 8)).join('')));
    const avg = Math.round(tSum / R.length);
    console.log('\n' + R.length + ' games, ' + timeouts + ' timeouts (' + MAX_SECONDS / 60 + ' min cap), average length ' + Math.floor(avg / 60) + ':' + String(avg % 60).padStart(2, '0'));
    console.log('50% is balanced. Consistently >60% or <40% means that faction needs tuning.\n');
    console.log('Hackers (per game)   trained   siphoned(rig)   stolen(hack)   ore/min');
    facs.filter(f => H[f].n).forEach(f => { const h = H[f];
      console.log(pad(name[f], 21) + pad((h.n / h.games).toFixed(2), 10) + pad(Math.round(h.rig / h.games), 16) + pad(Math.round(h.hack / h.games), 15) + ((h.rig + h.hack) / h.mins).toFixed(1)); });
    if (!facs.some(f => H[f].n)) console.log('  none trained');
  }
  return;
}

// ---- browser stub so the game script runs in Node ----
const noop = () => {};
const ctxP = new Proxy({}, { get: (t,k)=> (k==='createRadialGradient'||k==='createLinearGradient')?()=>({addColorStop:noop}):(t[k]!==undefined?t[k]:noop), set:(t,k,v)=>(t[k]=v,true) });
function el(){const o={style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},dataset:{},width:0,height:0,append:noop,appendChild:noop,insertAdjacentHTML:noop,setAttribute:noop,addEventListener:noop,querySelectorAll:()=>[],scrollIntoView:noop,childElementCount:0,focus:noop,innerHTML:''};
  return new Proxy(o,{get:(t,k)=>k in t?t[k]:(k==='getContext'?()=>ctxP:k==='querySelector'?()=>el():k==='querySelectorAll'?()=>[]:k==='getBoundingClientRect'?()=>({left:0,top:0,width:118,height:118}):noop),set:(t,k,v)=>(t[k]=v,true)});}
global.document={querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),addEventListener:noop,documentElement:el(),hidden:false};
global.window={devicePixelRatio:2}; global.innerWidth=400; global.innerHeight=800; global.addEventListener=noop;
global.navigator={}; global.performance={now:()=>Date.now()}; global.requestAnimationFrame=noop;
global.localStorage={getItem:()=>null,setItem:noop};

// ---- load the game, then run the sweep in the SAME scope (game consts don't leak out of eval) ----
const html = fs.readFileSync(__dirname + '/border-line-rts.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const runner = `
;(function(){
  const GAMES = ${GAMES}, MAX_SECONDS = ${MAX_SECONDS}, SHARD = '${SHARD}'.split('/').map(Number);
  const MAPS_LIST = ['crossroads','delta','highlands','saltflats','canyon'];
  if (${NOHACK}) TUNABLES.ai.hackers = 0;

  // measure Hackers: how many get trained, and the ore their two jobs bring in
  let HS = null;
  const _spawn = spawnUnit; spawnUnit = function(type, team, x, y){ const u = _spawn(type, team, x, y); if (type === 'hacker' && HS) HS[team].hackers++; return u; };
  const _hack = updHacker; updHacker = function(u, dt){ const c = G.credits[u.team]; _hack(u, dt); const g = G.credits[u.team] - c;
    if (g > 0 && u.order) HS[u.team][u.order.type === 'hack' ? 'hack' : 'rig'] += g; };

  // one AI-vs-AI match; returns 0 or 1 (winning team) or -1 on timeout
  function playOne(f0, f1, map){
    facId = f0; sandboxMode = true; newGame('normal', map);
    FAC[1] = f1; COL[1] = FACTIONS[f1].col;
    HS = [0,1].map(t => ({ fac: FAC[t], hackers: 0, rig: 0, hack: 0 }));
    for(let i=0;i<60*MAX_SECONDS && !G.over;i++) update(1/60);
    return G.over ? (G.win ? 0 : 1) : -1;
  }

  const facs = Object.keys(FACTIONS), n = facs.length, out = [];
  const names = JSON.stringify(Object.fromEntries(facs.map(f => [f, FACTIONS[f].name])));
  let k = 0;
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) for(let g=0;g<GAMES;g++, k++){
    if (k % SHARD[1] !== SHARD[0]) continue;
    const a = facs[i], b = facs[j], swap = (g + i + j) % 2, map = MAPS_LIST[k % MAPS_LIST.length];
    const f0 = swap ? b : a, f1 = swap ? a : b, r = playOne(f0, f1, map);
    out.push({ a, b, map, t: Math.round(G.t), w: r < 0 ? null : r === 0 ? f0 : f1, names, teams: HS.map(h => ({ fac: h.fac, hackers: h.hackers, rig: Math.round(h.rig), hack: Math.round(h.hack) })) });
  }
  console.log(JSON.stringify(out));
})();
`;

eval(code + runner);
