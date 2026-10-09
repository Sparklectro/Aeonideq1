// Headless test harness for Border Line.
// It stubs the browser so Node can run the game's update() loop with no canvas.
// Usage:
//   node -e "const fs=require('fs');const s=fs.readFileSync('border-line-rts.html','utf8');fs.writeFileSync('/tmp/g.js',s.match(/<script>([\\s\\S]*)<\\/script>/)[1])"
//   node test-sim.js
// Catches runtime errors, checks the AI builds/mines/attacks, and verifies resources.

const noop = () => {};
const ctxP = new Proxy({}, {
  get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient')
    ? () => ({ addColorStop: noop })
    : (t[k] !== undefined ? t[k] : noop),
  set: (t, k, v) => (t[k] = v, true)
});
function el() {
  return new Proxy({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    dataset: {}, width: 0, height: 0, append: noop, insertAdjacentHTML: noop,
    setAttribute: noop, querySelectorAll: () => [], scrollIntoView: noop
  }, {
    get: (t, k) => k in t ? t[k]
      : k === 'getContext' ? () => ctxP
      : k === 'querySelector' ? () => el()
      : k === 'querySelectorAll' ? () => []
      : k === 'getBoundingClientRect' ? () => ({ left: 0, top: 0, width: 118, height: 118 })
      : noop,
    set: (t, k, v) => (t[k] = v, true)
  });
}
global.document = { querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(), addEventListener: noop, documentElement: el(), hidden: false };
global.window = { devicePixelRatio: 2 };
global.innerWidth = 400; global.innerHeight = 800; global.addEventListener = noop;
global.navigator = {}; global.performance = { now: () => Date.now() };
global.requestAnimationFrame = noop;
global.localStorage = { getItem: () => null, setItem: noop };

const fs = require('fs');
eval(fs.readFileSync('/tmp/g.js', 'utf8') + `

// ---- checks ----
for (const M of ['crossroads','delta','highlands','saltflats','canyon']) {
  facId = 'smugglers';
  newGame('normal', M);
  const oil = G.ents.filter(e => e.rtype === 'oil').length;
  const rel = G.ents.filter(e => e.rtype === 'relic').length;
  let picked = false;
  for (let i = 0; i < 60 * 40 && !G.over; i++) {
    update(1/60);
    if (i === 120) { const h = G.relicHomes[0], sol = G.ents.find(e => e.team===0 && e.type==='soldier' && !e.dead); if (sol && h && h.live) { sol.x = h.live.x; sol.y = h.live.y; } }
    if (i === 130) picked = !G.relicHomes[0].live;
  }
  console.log(M, 'oil', oil, 'relics', rel, 'relicPickedOnContact', picked, G.over ? 'ended' : 'ok');
}

facId = 'urban'; newGame('easy', 'crossroads');
G.sel = G.ents.filter(e => e.team===0 && e.type==='soldier');
G.groups[0] = G.sel.map(u => u.id); G.sel = [];
console.log('group saved', G.groups[0].length, 'recall', grpLive(0).length);
console.log('icons defined', Object.keys(ICON).length);

// relics: random spot each match, roughly equidistant from both HQs
for (const M of ['crossroads','delta','highlands','saltflats','canyon']) {
  const offs = [];
  for (let k = 0; k < 3; k++) { newGame('normal', M); const r = G.relicHomes[0].live;
    offs.push(Math.round(Math.abs(dist(r,PHQ) - dist(r,EHQ)) / dist(PHQ,EHQ) * 100) + '%@' + Math.round(r.x) + ',' + Math.round(r.y)); }
  console.log('relic', M, offs.join(' '));
}

// engineer repairs a damaged HQ; hacker needs worker + engineer; rig + hack both pay
facId = 'shadow'; newGame('normal', 'crossroads'); G.ai.t = -1e9;   // freeze the enemy AI
const hq0 = G.ents.find(e => e.team===0 && e.type==='hq'); hq0.hp -= 500;
G.credits[0] = 5000;
console.log('hacker before engineer:', train(hq0, 'hacker'));
const eng = spawnUnit('engineer', 0, hq0.x + 60, hq0.y); const hp0 = hq0.hp;
for (let i = 0; i < 60*8; i++) update(1/60);
console.log('engineer repaired HQ +' + Math.round(hq0.hp - hp0), 'order', eng.order && eng.order.type);
console.log('hacker after engineer:', train(hq0, 'hacker') || 'queued');
G.ents.filter(e => isWorker(e)).forEach(e => e.dead = true); update(1/60); hq0.queue.length = 0;
const oil = G.ents.find(e => e.rtype === 'oil'), hk = spawnUnit('hacker', 0, oil.x + 30, oil.y);
hk.order = { type:'rig', res: oil }; const c0 = G.credits[0], a0 = oil.amount;
for (let i = 0; i < 60*10; i++) update(1/60);
console.log('rig 10s: +' + Math.round(G.credits[0] - c0) + ' ore, pool -' + Math.round(a0 - oil.amount));
hk.order = { type:'hack' }; G.credits[1] = 500; const c1 = G.credits[0];
for (let i = 0; i < 60*10; i++) update(1/60);
console.log('hack 10s: +' + Math.round(G.credits[0] - c1) + ' ore, enemy left ' + Math.round(G.credits[1]));
console.log('hacker for iron?', trainsFor(0,'hq').join(',') , '| iron:', (FAC[0]='iron', trainsFor(0,'hq').join(',')));

// late-war tier: level III locked before lateTier, open after
G.up[0].infWeap = 2; G.t = 100; const early = upsFor(0,'barracks').includes('infWeap'); G.t = 500; const late = upsFor(0,'barracks').includes('infWeap');
console.log('lvl III infWeap early', early, 'late', late);

// sandbox: AI plays both sides
facId = 'urban'; sandboxMode = true; newGame('normal', 'crossroads'); aiOf(0).strat = 'rush';
for (let i = 0; i < 60*150 && !G.over; i++) update(1/60);
const cnt = t => G.ents.filter(e => e.team===t && e.kind==='bld').length + ' blds ' + G.ents.filter(e => e.team===t && e.kind==='unit').length + ' units';
console.log('sandbox 150s you(rush):', cnt(0), '| enemy:', cnt(1), '| waves', G.ai0.wave, G.ai.wave);
sandboxMode = false;

// units dropped in the middle of ore and oil clusters must walk out (no wedging between nodes)
facId = 'urban'; newGame('normal', 'crossroads'); G.ai.t = -1e9;
{ const outs = [];
  for (const rt of ['ore','oil']) { const ns = G.ents.filter(e => e.kind==='res' && e.rtype===rt).slice(0, rt==='oil'?4:7);
    const cx = ns.reduce((a,e)=>a+e.x,0)/ns.length, cy = ns.reduce((a,e)=>a+e.y,0)/ns.length;
    for (const ut of ['soldier','tank','engineer']) { const u = spawnUnit(ut, 0, cx, cy); u.order = { type:'move', x:cx+260, y:cy-200 }; outs.push([rt+'/'+ut, u]); } }
  for (let i = 0; i < 60*12; i++) update(1/60);
  console.log('escaped clusters:', outs.map(([n,u]) => n + ' ' + (u.order ? 'STUCK' : 'ok')).join(', ')); }

// sound: fake WebAudio context, whole map on screen, count which sounds fire; then muted must stay silent
const deep = () => new Proxy(function(){}, { get:(t,k)=> k==='state' ? 'running' : k==='currentTime' ? G.t : deep(), apply:()=>deep(), set:()=>true });
facId = 'iron'; sandboxMode = true; newGame('normal', 'saltflats'); AC = sndOut = sndNoise = sndBrown = sndRev = sndDist = deep(); cam.x = 0; cam.y = 0; cam.z = .1;
for (let i = 0; i < 60*240 && !G.over; i++) update(1/60);
console.log('sounds played', JSON.stringify(sfxN));
setMute(true); const nb = JSON.stringify(sfxN); for (let i = 0; i < 60*20 && !G.over; i++) update(1/60);
console.log('muted stays silent', nb === JSON.stringify(sfxN)); setMute(false); AC = null; sandboxMode = false;
`);
