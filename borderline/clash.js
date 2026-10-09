// Border Line — combat clash benchmark.
// Isolates each faction's fighting strength: equal armies, no economy, fight to the death.
// Each faction (12 riflemen + its signature unit) vs the Urban "vanilla" baseline.
// Resolves in seconds, so it runs fast anywhere.
//   node clash.js            (20 trials each)
//   node clash.js 50
const fs = require('fs');
const TRIALS = Math.max(4, parseInt(process.argv[2] || '20', 10));

const noop = () => {};
const ctxP = new Proxy({}, { get:(t,k)=>(k==='createRadialGradient'||k==='createLinearGradient')?()=>({addColorStop:noop}):(t[k]!==undefined?t[k]:noop), set:(t,k,v)=>(t[k]=v,true) });
function el(){const o={style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},dataset:{},width:0,height:0,append:noop,appendChild:noop,insertAdjacentHTML:noop,setAttribute:noop,addEventListener:noop,querySelectorAll:()=>[],scrollIntoView:noop,childElementCount:0,focus:noop,innerHTML:''};
  return new Proxy(o,{get:(t,k)=>k in t?t[k]:(k==='getContext'?()=>ctxP:k==='querySelector'?()=>el():k==='querySelectorAll'?()=>[]:k==='getBoundingClientRect'?()=>({left:0,top:0,width:118,height:118}):noop),set:(t,k,v)=>(t[k]=v,true)});}
global.document={querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),addEventListener:noop,documentElement:el(),hidden:false};
global.window={devicePixelRatio:2}; global.innerWidth=400; global.innerHeight=800; global.addEventListener=noop;
global.navigator={}; global.performance={now:()=>Date.now()}; global.requestAnimationFrame=noop;
global.localStorage={getItem:()=>null,setItem:noop};

const html = fs.readFileSync(__dirname + '/border-line-rts.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const runner = `
;(function(){
  const TRIALS = ${TRIALS};
  const SIG = { mountain:'soldier', urban:'soldier', sky:'drone', smugglers:'soldier', iron:'technical', shadow:'soldier' };

  function armyFor(fac, team, cx, cy){
    FAC[team] = fac; COL[team] = FACTIONS[fac].col;
    // 12 riflemen + 3 of the faction's signature unit, in a loose block
    const list = []; for(let i=0;i<12;i++) list.push('soldier'); for(let i=0;i<3;i++) list.push(SIG[fac]);
    list.forEach((t,i)=>{ const u = spawnUnit(t, team, cx + (i%4)*22 - 33, cy + Math.floor(i/4)*22 - 44); });
  }

  function clash(facA, facB){
    facId = facA; newGame('normal','crossroads');
    G.ents.length = 0; G.nextId = 1; G.shells.length = 0; G.fx.length = 0; // clear the world, keep map/nav
    armyFor(facA, 0, 700, 900);
    armyFor(facB, 1, 900, 900);
    for(let i=0;i<60*60;i++){
      update(1/60);
      const a = G.ents.filter(e=>e.kind==='unit'&&e.team===0&&!e.dead).length;
      const b = G.ents.filter(e=>e.kind==='unit'&&e.team===1&&!e.dead).length;
      if(a===0 || b===0) return { win: b===0 && a>0, aLeft:a, bLeft:b };
    }
    const a = G.ents.filter(e=>e.kind==='unit'&&e.team===0&&!e.dead).length;
    const b = G.ents.filter(e=>e.kind==='unit'&&e.team===1&&!e.dead).length;
    return { win: a>b, aLeft:a, bLeft:b };
  }

  const facs = Object.keys(FACTIONS);
  console.log('Border Line clash — each faction (12 riflemen + 3 signature) vs Urban baseline, ' + TRIALS + ' trials\\n');
  const rows = [];
  for(const f of facs){
    let wins=0, survSum=0;
    for(let i=0;i<TRIALS;i++){ const r = clash(f, 'urban'); if(r.win) wins++; survSum += r.aLeft; }
    rows.push({ fac: FACTIONS[f].name, wr: Math.round(wins/TRIALS*100), surv: (survSum/TRIALS).toFixed(1) });
  }
  rows.sort((a,b)=>b.wr-a.wr);
  const pad=(s,n)=>(s+'').padEnd(n);
  console.log(pad('Faction',16)+pad('Win% vs Urban',16)+'Avg survivors');
  console.log('-'.repeat(44));
  for(const r of rows) console.log(pad(r.fac,16)+pad(r.wr+'%',16)+r.surv+' / 15');
  console.log('\\nUrban is the baseline (~50%). Higher = stronger head-to-head fighters.');
})();
`;

eval(code + runner);
