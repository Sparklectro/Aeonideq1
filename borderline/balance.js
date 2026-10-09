// Border Line — balance sweep.
// Self-contained: reads ./border-line-rts.html, runs the real game logic headlessly,
// pits each faction against the enemy AI over many games, prints a win-rate table.
//   node balance.js            (defaults: 8 games per faction)
//   node balance.js 20         (20 games per faction)
// Both sides use the same strategy, so win rate reflects faction strength, not tactics.

const fs = require('fs');
const GAMES = Math.max(2, parseInt(process.argv[2] || '8', 10));
const MAX_SECONDS = 180;

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
  const GAMES = ${GAMES}, MAX_SECONDS = ${MAX_SECONDS};
  const MAPS_LIST = ['crossroads','delta','highlands','saltflats','canyon'];

  function playerBot(){
    const mine = G.ents.filter(e=>e.team===0 && !e.dead && e.kind!=='res');
    const hq = mine.find(e=>e.type==='hq'); if(!hq) return;
    const blds = mine.filter(e=>e.kind==='bld'), cnt = t=>blds.filter(b=>b.type===t).length;
    const units = mine.filter(e=>e.kind==='unit'), workers = units.filter(isWorker), army = units.filter(u=>!isWorker(u));
    const cr = ()=>G.credits[0];
    workers.forEach(w=>{ if(!w.order) autoGather(w); });
    if(FAC[0]==='smugglers' && workers.length>=6 && units.filter(u=>u.type==='truck').length<3 && hq.queue.length<2 && cr()>=140) train(hq,'truck');
    if(workers.length + hq.queue.filter(q=>isWorker(q)).length < 11 && hq.queue.length<2) train(hq,'worker');
    const build0 = type=>{ for(let i=0;i<40;i++){ const a=rand(0,6.3), r=rand(110,260), x=hq.x+Math.cos(a)*r, y=hq.y+Math.sin(a)*r; if(canPlace(0,type,x,y)){ placeBld(0,type,x,y); return true; } } return false; };
    let built=false; const free = popCap(0)-popUsed(0);
    if(free<5 && popCap(0)<POPMAX && !blds.some(b=>b.type==='depot'&&!b.built) && cr()>=100) built=build0('depot');
    else if(cnt('barracks')<1 && cr()>=150) built=build0('barracks');
    else if(cnt('barracks')<2 && G.t>200 && cr()>=190) built=build0('barracks');
    else if(cnt('factory')<1 && hasBuilt(0,'barracks') && G.t>210 && cr()>=260) built=build0('factory');
    else if(cnt('turret')<2 && G.t>110 && cr()>=170) built=build0('turret');
    if(!built) blds.forEach(b=>{ if(!b.built || b.queue.length>=2) return; const tr=trainsFor(0,b.type); if(!tr) return;
      if(b.type==='barracks') train(b, Math.random()<0.33 ? tr[tr.length-1] : tr[0]);
      else if(b.type==='factory' && cr()>=costOf(0,tr[0])+20) train(b, tr[0]); });
    const enemyHQ = G.ents.find(e=>e.team===1 && e.type==='hq');
    if(enemyHQ && army.length>=12){ G._push0 = true; }
    if(G._push0 && enemyHQ) army.forEach(u=>{ if((!u.order || u.order.type!=='attack') && !u.target){ u.order={type:'attack',target:enemyHQ}; u.target=enemyHQ; } });
  }

  function playOne(pf, ef, map){
    facId = pf; newGame('normal', map);
    FAC[1] = ef; COL[1] = FACTIONS[ef].col;
    let botT = 0;
    for(let i=0;i<60*MAX_SECONDS && !G.over;i++){ update(1/60); botT += 1/60; if(botT>=1){ botT=0; playerBot(); } }
    if(G.over) return { win: !!G.win, draw:false, t: G.t };
    // timed out: score by who was ahead — damage dealt to the enemy HQ, then army size
    const myHQ = G.ents.find(e=>e.team===0&&e.type==='hq'), enHQ = G.ents.find(e=>e.team===1&&e.type==='hq');
    const myDmg = enHQ ? enHQ.max-enHQ.hp : 1e9, enDmg = myHQ ? myHQ.max-myHQ.hp : 1e9;
    const myArmy = G.ents.filter(e=>e.kind==='unit'&&e.team===0&&!isWorker(e)).length;
    const enArmy = G.ents.filter(e=>e.kind==='unit'&&e.team===1&&!isWorker(e)).length;
    const win = myDmg!==enDmg ? myDmg>enDmg : myArmy>enArmy;
    return { win, draw:false, t: G.t, timeout:true };
  }

  const facs = Object.keys(FACTIONS);
  console.log('Border Line balance — ' + GAMES + ' games/faction, both sides same strategy, normal difficulty\\n');
  const rows = [];
  for(const pf of facs){
    let wins=0, draws=0, timeSum=0, n=0;
    for(let g=0;g<GAMES;g++){
      let ef = facs[(facs.indexOf(pf)+1+g) % facs.length];
      if(ef===pf) ef = facs[(facs.indexOf(pf)+2) % facs.length];
      const map = MAPS_LIST[g % MAPS_LIST.length];
      const r = playOne(pf, ef, map);
      if(r.win) wins++; if(r.timeout) draws++; timeSum += r.t; n++;
    }
    rows.push({ fac: FACTIONS[pf].name, wr: Math.round(wins/GAMES*100), wins, decided: GAMES, draws, avg: n?Math.round(timeSum/n):0 });
  }
  rows.sort((a,b)=>b.wr-a.wr);
  const pad = (s,n)=>(s+'').padEnd(n);
  console.log(pad('Faction',16)+pad('Win%',6)+pad('W/Games',10)+pad('Timeouts',10)+'AvgGame');
  console.log('-'.repeat(48));
  for(const r of rows) console.log(pad(r.fac,16)+pad(r.wr+'%',6)+pad(r.wins+'/'+r.decided,10)+pad(''+r.draws,10)+(r.avg?(Math.floor(r.avg/60)+':'+String(r.avg%60).padStart(2,'0')):'—'));
  console.log('\\n50% is balanced. Consistently >60% or <40% means that faction needs tuning.');
})();
`;

eval(code + runner);
