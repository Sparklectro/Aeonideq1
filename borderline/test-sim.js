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
console.log('hacker after engineer, no research:', train(hq0, 'hacker'), '| research offered', upsFor(0,'hq').includes('hackNet'), 'kit hidden', !upsFor(0,'hq').includes('hackKit'));
G.up[0].hackNet = 1; const crH = G.credits[0];
console.log('hacker after Hacker cell:', train(hq0, 'hacker') || 'queued', 'cost', Math.round(crH - G.credits[0]), '| kit offered', upsFor(0,'hq').includes('hackKit'));
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

// fog of war: enemy hidden at start, spotted by a scout, buildings remembered, units not; off in sandbox
facId = 'urban'; sandboxMode = false; newGame('normal', 'crossroads'); G.ai.t = -1e9;
{ const ehq = G.ents.find(e => e.team===1 && e.type==='hq'), esol = G.ents.find(e => e.team===1 && e.type==='soldier');
  const before = [fogOn(), seen0(ehq), seen0(esol), vis0(PHQ)].join('/');
  const sc = spawnUnit("soldier", 0, ehq.x - 100, ehq.y + 100); sc.order = null; G.ai.t = -1e9;
  for (let i = 0; i < 30; i++) update(1/60);
  const near = [seen0(ehq), seen0(esol)].join('/');
  sc.dead = true; for (let i = 0; i < 30; i++) update(1/60);
  const seenPct = Math.round(G.fog.seen.reduce((a,v)=>a+(v>0),0) / G.fog.seen.length * 100), gone = [seen0(ehq), !seen0(esol)].join('/');
  sandboxMode = true; newGame('normal', 'crossroads'); const sb = fogOn(); sandboxMode = false;
  console.log('fog on/enemyHQ/enemyUnit/ownHQ at start', before, '| scout near', near, '| scout gone: HQ remembered/unit hidden', gone, '| explored', seenPct + '%', '| sandbox fog', sb); }

// AI wave cohesion: a marching wave's drones stay over its riflemen instead of racing ahead
facId = 'urban'; sandboxMode = false; newGame('normal', 'delta'); FAC[1] = 'sky';
{ const ehq = G.ents.find(e => e.team===1 && e.type==='hq'), ws = [];
  for (let i = 0; i < 6; i++) ws.push(spawnUnit('soldier', 1, ehq.x - 60 - i*12, ehq.y + 40));
  for (let i = 0; i < 3; i++) ws.push(spawnUnit('drone', 1, ehq.x - 60, ehq.y + 70 + i*12));
  ws.forEach(u => { u.wave = true; }); let ahead = 0;
  for (let i = 0; i < 60*25; i++) { update(1/60); const g = ws.filter(u => !u.dead && !isFly(u)), d = ws.filter(u => !u.dead && isFly(u) && !u.target);
    if (g.length < 3) break; const cx = g.reduce((a,u)=>a+u.x,0)/g.length, cy = g.reduce((a,u)=>a+u.y,0)/g.length, dc = Math.hypot(cx-ehq.x, cy-ehq.y);
    d.forEach(u => { ahead = Math.max(ahead, dist(u, ehq) - dc); }); }
  console.log('wave drones max lead over riflemen', Math.round(ahead), 'px (cohesive if < 250)', ahead < 250 ? 'ok' : 'SPREAD'); }

// modes: the console exists only in 'Battle with console' and Sandbox
{ const r = []; for (const [sb, dv] of [[false,false],[false,true],[true,false]]) { sandboxMode = sb; devMode = dv; newGame('normal','crossroads'); r.push(devAllowed()); }
  sandboxMode = false; devMode = false; console.log('console allowed in normal/console/sandbox match', r.join('/')); }

// save/resume: save mid-match, play a different match, resume: same state, links rebuilt, keeps running, cleared at the end
{ const store = {}; localStorage.getItem = k => k in store ? store[k] : null; localStorage.setItem = (k,v) => { store[k] = String(v); }; localStorage.removeItem = k => { delete store[k]; };
  facId = 'shadow'; newGame('normal', 'delta'); for (let i = 0; i < 60*120; i++) update(1/60);
  G.sel = G.ents.filter(e => e.team===0 && e.kind==='unit').slice(0, 3); G.selBld = G.ents.find(e => e.team===0 && e.type==='hq');
  const before = JSON.stringify(snapshot()), seenB = G.fog.seen.join(''), nB = G.ents.length, cam0 = cam.x;
  saveGame(); const kb = Math.round(store.save.length / 1024);
  facId = 'urban'; newGame('easy', 'canyon'); for (let i = 0; i < 60; i++) update(1/60);
  resumeGame(loadSave());
  const after = JSON.stringify(snapshot()), ids = new Set(G.ents); let broken = 0;
  for (const e of G.ents) { const o = e.order; if (o && o.target && !ids.has(o.target)) broken++; if (e.target && !ids.has(e.target)) broken++; if (e.kind==='res' && e.home && !G.relicHomes.includes(e.home)) broken++; }
  G.sel.forEach(u => { if (!ids.has(u)) broken++; }); if (!ids.has(G.selBld)) broken++;
  const same = before === after && seenB === G.fog.seen.join('') && nB === G.ents.length && cam.x === cam0 && mapId === 'delta' && FAC[0] === 'shadow';
  let err = 'ok'; try { for (let i = 0; i < 60*40 && !G.over; i++) update(1/60); } catch (e) { err = e.message; }
  const hq1 = G.ents.find(e => e.team===1 && e.type==='hq'); if (hq1) kill(hq1); for (let i = 0; i < 60*3; i++) update(1/60);
  console.log('save', kb + 'KB | resumed identical', same, '| broken links', broken, '| 40s after resume', err, '| save cleared at game end', !('save' in store)); }

// UPDATE SAFETY. Every file in ./saves is a real save written by an older build: each must still load and play.
// Never delete these files. When SAVE_V goes up, add a new fixture written by the build just before the change.
{ const store = {}; localStorage.getItem = k => k in store ? store[k] : null; localStorage.setItem = (k,v) => { store[k] = String(v); }; localStorage.removeItem = k => { delete store[k]; };
  const dir = __dirname + '/saves', out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    store.save = fs.readFileSync(dir + '/' + f, 'utf8'); const d = loadSave(); let r = 'NO SAVE';
    if (d) { try { resumeGame(d); for (let i = 0; i < 60*30 && !G.over; i++) update(1/60); r = 'ok ' + Math.floor(G.t) + 's'; } catch (e) { r = 'CRASH ' + e.message; } }
    out.push(f + ' ' + r); }
  console.log('old saves still play:', out.join(', '));

  // content changed by an update: unknown unit/upgrade/queue entries, missing fields, a balance patch
  const base = fs.readFileSync(dir + '/save-v1.json', 'utf8'), d = JSON.parse(base);
  const u0 = d.G.ents.find(e => e.kind==='unit' && e.team===0 && e.type==='soldier');
  d.G.ents.push({ id: 99999, kind: 'unit', type: 'zeppelin', team: 1, x: 500, y: 500, hp: 10, max: 10 }); u0.target = { $e: 99999 };
  d.G.up[0].laser = 2; d.G.up[0].infArm = 9;
  const hq = d.G.ents.find(e => e.kind==='bld' && e.team===0 && e.type==='hq'); hq.queue.push({ type: 'mech', t: 0, c: 100 });
  d.G.ents.forEach(e => { if (e.kind==='unit') { delete e.still; delete e.gt; } }); delete d.G.groups;
  const cr0 = d.G.credits[0]; store.save = JSON.stringify(d); UNIT.soldier.hp += 20;
  let ok = true; try { resumeGame(loadSave()); for (let i = 0; i < 60*20 && !G.over; i++) update(1/60); } catch (e) { ok = 'CRASH ' + e.message; }
  const sol = G.ents.find(e => e.type==='soldier' && e.team===0);
  console.log('tolerant load:', ok === true ? 'ok' : ok, '| unknown unit dropped', !G.ents.some(e => e.type==='zeppelin'),
    '| unknown upgrade dropped', !('laser' in G.up[0]), '| level capped', G.up[0].infArm, '| unknown queue refunded', Math.round(G.credits[0]) >= Math.round(cr0) ? 'yes' : 'no',
    '| missing fields filled', G.ents.every(e => e.kind!=='unit' || ('still' in e && 'gt' in e)) && Array.isArray(G.groups), '| balance patch applied', sol ? sol.max === unitMaxHp(0,'soldier') : 'n/a');
  UNIT.soldier.hp -= 20;

  // migration chain, a save from a newer build, and a broken save
  const m = JSON.parse(base); m.v = 0; MIGRATE[0] = x => { x.migrated = true; return x; }; store.save = JSON.stringify(m); const dm = loadSave(); delete MIGRATE[0];
  const n = JSON.parse(base); n.v = SAVE_V + 1; store.save = JSON.stringify(n); const newer = loadSave() === null && 'save' in store;
  const bad = JSON.parse(base); bad.G.ents = 'garbage'; store.save = JSON.stringify(bad);
  const ce = console.error; console.error = () => {}; try { resumeGame(loadSave()); } catch (e) { quarantineSave(e); } console.error = ce;
  console.log('migration v0->v1 ran', !!(dm && dm.migrated && dm.v === SAVE_V), '| newer-build save ignored and kept', newer, '| broken save set aside', 'save.bad' in store && !('save' in store) && G === null); }
`);
