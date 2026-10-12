// Border Line — combat clash benchmark.
// Isolates each faction's fighting strength per ore: no economy, fight to the death.
// Each side spends the same ore budget at its own prices: half on riflemen, half on its
// signature units (tanks / pickups / drones+kamikazes). Every faction fights every other.
// Smugglers' +25% ore is economy, so it does not show here (see balance.js).
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
  const TRIALS = ${TRIALS}, BUDGET = 1200;
  const SIG = { mountain:['tank'], urban:['tank'], sky:['drone','kamikaze'], smugglers:['tank'], iron:['technical'], shadow:['tank'] };

  function armyFor(fac, team, cx, cy){
    FAC[team] = fac; COL[team] = FACTIONS[fac].col;
    const list = []; let inf = BUDGET/2, sig = BUDGET/2, k = 0;
    while(inf >= costOf(team,'soldier')){ list.push('soldier'); inf -= costOf(team,'soldier'); }
    sig += inf;
    for(;;){ const t = SIG[fac][k++ % SIG[fac].length]; if(sig < costOf(team,t)) break; list.push(t); sig -= costOf(team,t); }
    const dir = team ? 1 : -1;
    list.forEach((t,i)=>spawnUnit(t, team, cx + dir*Math.floor(i/6)*24, cy + (i%6)*24 - 60));
    return list.length;
  }

  function clash(facA, facB){
    facId = facA; newGame('normal','crossroads');
    G.ents.length = 0; G.nextId = 1; G.shells.length = 0; G.fx.length = 0; // clear the world, keep map/nav
    armyFor(facA, 0, 1080, 1200); armyFor(facB, 1, 1320, 1200);
    G.ents.forEach(u=>{ u.order = { type:'move', x: u.team ? 900 : 1500, y: u.y }; }); // advance; units fight what they meet
    const left = t => G.ents.filter(e=>e.kind==='unit'&&e.team===t&&!e.dead).length;
    for(let i=0;i<60*90;i++){ update(1/60); const a = left(0), b = left(1); if(a===0 || b===0) break; }
    const a = left(0), b = left(1);
    return a===b ? .5 : a>b ? 1 : 0;
  }

  const facs = Object.keys(FACTIONS), n = facs.length, S = {}, P = {}, M = {};
  facs.forEach(f=>{ S[f]=0; P[f]=0; M[f]={}; });
  console.log('Border Line clash — equal ' + BUDGET + ' ore armies, every faction vs every other, ' + TRIALS + ' trials per pairing (sides swapped)\\n');
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){ const a=facs[i], b=facs[j]; let sa=0;
    for(let t=0;t<TRIALS;t++){ sa += t%2 ? 1-clash(b,a) : clash(a,b); }
    S[a]+=sa; S[b]+=TRIALS-sa; P[a]+=TRIALS; P[b]+=TRIALS; M[a][b]=Math.round(sa/TRIALS*100); M[b][a]=100-M[a][b]; }
  const pad=(s,n)=>(s+'').padEnd(n), sh=f=>FACTIONS[f].name.split(' ')[0].slice(0,7);
  console.log(pad('Faction',16)+pad('Win%',7)+' win% vs: '+facs.map(f=>pad(sh(f),8)).join(''));
  console.log('-'.repeat(32+8*n));
  facs.slice().sort((x,y)=>S[y]/P[y]-S[x]/P[x]).forEach(f=>console.log(pad(FACTIONS[f].name,16)+pad(Math.round(S[f]/P[f]*100)+'%',7)+pad('',10)+facs.map(g=>pad(g===f?'-':M[f][g],8)).join('')));
  console.log('\\n50% = even fighting value per ore.');
})();
`;

eval(code + runner);
