// Border Line — console bridge for Claude Code / Node.
// Drives the SAME in-game console commands headlessly and prints their output,
// so you can inspect the game from every angle without a browser.
//
//   node console.js "state"
//   node console.js --you sky --enemy iron --map delta "give 5000" "spawn kamikaze 8" "step 30" "state"
//   node console.js "set tank hp 320" "spawn tank 4" "spawn tank 4 1" "step 20" "reveal"
//
// Options (before the commands): --you <faction> --enemy <faction> --map <id> --diff <easy|normal|hard>
// Commands are the exact strings the in-game console accepts: help, give, spawn, research,
// faction, enemy, map, fast, step, state, eco, set, get, dump, reset, army, win, lose, reveal,
// or any raw JavaScript (e.g. "G.credits[0]=9999").

const fs = require('fs');

const noop = () => {};
const ctxP = new Proxy({}, { get:(t,k)=>(k==='createRadialGradient'||k==='createLinearGradient')?()=>({addColorStop:noop}):(t[k]!==undefined?t[k]:noop), set:(t,k,v)=>(t[k]=v,true) });
function el(){const o={style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},dataset:{},width:0,height:0,append:noop,appendChild:noop,insertAdjacentHTML:noop,setAttribute:noop,addEventListener:noop,querySelectorAll:()=>[],scrollIntoView:noop,childElementCount:0,focus:noop,innerHTML:''};
  return new Proxy(o,{get:(t,k)=>k in t?t[k]:(k==='getContext'?()=>ctxP:k==='querySelector'?()=>el():k==='querySelectorAll'?()=>[]:k==='getBoundingClientRect'?()=>({left:0,top:0,width:118,height:118}):noop),set:(t,k,v)=>(t[k]=v,true)});}
global.document={querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),addEventListener:noop,documentElement:el(),hidden:false};
global.window={devicePixelRatio:2}; global.innerWidth=400; global.innerHeight=800; global.addEventListener=noop;
global.navigator={}; global.performance={now:()=>Date.now()}; global.requestAnimationFrame=noop;
global.localStorage={getItem:()=>null,setItem:noop};

// parse --options and command strings
const argv = process.argv.slice(2);
const opt = { you:'urban', enemy:'', map:'crossroads', diff:'normal' };
const cmds = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--you' || a === '--enemy' || a === '--map' || a === '--diff') opt[a.slice(2)] = argv[++i];
  else cmds.push(a);
}
if (!cmds.length) cmds.push('state');

const html = fs.readFileSync(__dirname + '/border-line-rts.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const runner = `
;(function(){
  const OPT = ${JSON.stringify(opt)}, CMDS = ${JSON.stringify(cmds)};
  const out = [];
  devHook = (m, cls) => out.push((cls === 'err' ? '! ' : '') + String(m));
  facId = FACTIONS[OPT.you] ? OPT.you : 'urban';
  newGame(FACTIONS && DIFF[OPT.diff] ? OPT.diff : 'normal', MAPS.some(m=>m.id===OPT.map) ? OPT.map : 'crossroads');
  if (OPT.enemy && FACTIONS[OPT.enemy]) { FAC[1] = OPT.enemy; COL[1] = FACTIONS[OPT.enemy].col; }
  out.push('# ' + FACTIONS[FAC[0]].name + ' vs ' + FACTIONS[FAC[1]].name + ' on ' + mapId + ' (' + diff + ')');
  for (const c of CMDS) runCmd(c);
  console.log(out.join('\\n'));
})();
`;

eval(code + runner);
