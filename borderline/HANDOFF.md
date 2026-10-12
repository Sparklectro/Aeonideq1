# Border Line — developer handoff

A single-file, touch-first RTS that runs in any mobile browser. This document is written so you (or Claude Code) can pick the project up cold and keep building. Everything lives in **`border-line-rts.html`** — no build step, no dependencies except one Google Font.

---

## Start here (status: 12 October 2026)

**Where the project lives**

- **Game (source of truth for a cloud/phone session):** the private artifact https://claude.ai/artifact/JQeTJgGfE7Es5cRPZPQDMS — the whole game is that one HTML page. Read it with the Artifact tool (`action: "read"`, then Read the saved file in full), edit that copy, and publish back to the **same URL** so the owner's phone link keeps working. The saved page has a publisher wrapper around the game: one extra first line (`<!doctype html><html><head>…<body>`) and a final `</body></html>`. Strip both to get the real `border-line-rts.html` (it starts with its own `<!doctype html>`), and publish that.
- **PC copy:** `D:\Stattic\border-line\` on the owner's Windows machine (`border-line-rts.html`, `HANDOFF.md`, `test-sim.js`, `clash.js`, `balance.js`, `console.js`, `seed.js`). A cloud session cannot reach it. If you change the game from the cloud, say so at the end, so the owner can pull the artifact back onto the PC later.
- **This handoff + the Node tools** are published together as the "Border Line Handoff" artifact, https://claude.ai/artifact/XKNng7qcAmhELD9h7ed3x1 ; the tools are its supporting files (`HANDOFF.md`, `test-sim.js`, `clash.js`, `balance.js`, `console.js`, `seed.js`). Put them in one folder next to `border-line-rts.html`.

**The owner's standing rules**

- Stay single-file: all markup, CSS and JS inside `border-line-rts.html`. No new runtime dependencies, no framework, no build step. It will be wrapped with Capacitor for Google Play and must run offline in an Android WebView (the font is embedded; keep it that way).
- Smallest change that fully works. Surgical edits; keep the flat `G.ents` array, the global `G`, the `loop()/update(dt)/draw()` structure and the function layout below. Do not reformat untouched code.
- Touch-first. Everything must work on a phone, inside the safe-area insets, with the existing HUD/minimap/panel layout. Check layouts at 375px wide.
- Do not regress the six factions or their balance; keep the fictional faction names.
- Before saying something works, run `test-sim.js` (see *Testing*) and report its real output. Add a check there for anything new.
- Ask first before: adding a dependency or build step, splitting the file, changing the data model shape, or anything that affects save-game compatibility.
- The owner tests on a phone through the artifact and gives feedback in plain language (sometimes Turkish; replies in English). They are not reading the code. Publish to the same game link after every change.
- The dev console must never appear in a normal match: only in *Battle with console* and *Sandbox*.
- Android packaging: the owner wants every step explained as it is reached (Capacitor setup, Android Studio, app ID, signing key, API 36, icon/splash, AAB, Play Console, closed testing 12 testers × 14 days, Data Safety, privacy policy page on e.g. GitHub Pages). Not started; the game is not finished.

**Done so far**

`TUNABLES` balance block · sandbox (AI plays both sides) with named AI strategies · game-speed button · level III upgrades after 8:00 · Engineer · Hacker · random relic spots · stuck-worker fix and tap-HQ-to-deliver · AI waves intercept passing armies · synthesized sound engine with mute · sticky Back button in the panel · target ring on attack/repair orders · units no longer collide with ore/oil.

**12 October 2026 session (cloud):**
- **Fog of war** for your side (see *Fog of war* below). Off in sandbox; console `fog on|off`.
- **Hacker made expensive, at the owner's request:** costs 550 ore and needs the new HQ research **Hacker cell** (250 ore, 45 s) first; *Exploit kit* / *Burner rigs* stay hidden until then. AI trains at most 1 (`TUNABLES.ai.hackers`).
- **Faction balance pass**, measured with the rewritten `balance.js` (real AI on both sides). Before → after, 120 games: Urban 73→48%, Smugglers 93→55%, Shadow 63→48%, Iron 27→55%, Mountain 27→45%, Sky 7→48%. Changes: Urban riflemen 42→54 ore (−10%); Smugglers ore bonus +25%→+10% and Cargo truck carry 20→12; Shadow speed +15%→+10%; Armed pickup hp 150→175, dmg 6→8; Sky drones 65→55 ore; Sky AI barracks mix 30% drones / 10% kamikaze / 60% riflemen.
- **AI wave cohesion** (the real Sky fix): a marching AI wave keeps its drones over its ground units (end of `aiTick`), so fast flyers no longer arrive alone and die one by one. Applies to every AI faction, so the enemy AI is slightly tougher too.
- **Second batch (owner decisions):** three start modes (*Start battle* without console, *Battle with console*, *Sandbox: AI vs AI*); Saira Condensed embedded as base64 woff2 (no network request at all); fullscreen button removed (Android handles it); Back button opens Pause (see *Back button*); **save/resume** (see *Save / resume*).
- **Tools:** `balance.js` now plays AI vs AI round robin on 4 parallel workers and reports Hacker stats, with a `nohack` A/B switch; `clash.js` now fights equal-ore armies, every faction vs every other.

**Open questions the owner has not answered yet**

- **Sounds:** every sound is synthesized and was tuned without anyone listening during development. The owner approved rifle fire, tank cannon, building-complete, upgrade-complete, relic and the siren. Still waiting for their verdict on the newest ones: infantry death cry (`die`, the least certain), vehicle explosion (`vboom`), drone pop (`dboom`), unit-ready (`ready`) and vehicle-ready (`vready`). If synthesis is still not good enough for gunfire/explosions, the agreed next step is real recorded samples embedded in the file — only with the owner's go-ahead (licensing, file size).
- **Balance:** whole-game win rates are now 45–55% for every faction (AI vs AI). Not yet felt by the owner on the phone. `clash.js` (pure equal-ore fights) still shows Armed pickups winning every head-to-head and Smugglers losing every one; that is a combat-only lens (Smugglers' edge is economy), but watch whether pickups feel too strong in play.
- **Hackers:** at 550 + Hacker cell they are a slow investment: one Hacker siphons ~1,000 ore over its life, and the `nohack` A/B shows they no longer swing games. Rig 3 ore/s and hack 1.2 ore/s unchanged. The AI only ever rigs oil, never uses Hack.
- **Fog of war:** the AI still sees everything (it never had vision rules). Fog edge softness and darkness (`TUNABLES.fog`) not yet seen by the owner.
- **Units walk over ore/oil** now (trade-off of the no-wedging fix). The owner has not commented on the look.

**Next on the backlog:** monetization decision, audio/haptics settings + tutorial, then Android packaging (see *Backlog* and *Packaging*).

---

## Run it

- **Play now:** open `border-line-rts.html` in any browser. On a phone, use "Add to Home screen" for a fullscreen, app-like launch.
- **Edit loop:** change the file, refresh. There is no bundler.
- **Headless test:** see *Testing* below — a Node harness runs the game logic with a stubbed canvas so you can catch crashes and check balance without a browser.

---

## Architecture

One HTML file with three parts: `<style>` (the first `<style>` block is the embedded Saira Condensed font, ~130 KB of base64; SIL Open Font License), a little static DOM (HUD, minimap, bottom panel, start/pause/end sheets), and one `<script>`. The file makes no network requests.

- **Rendering:** a full-screen `<canvas>`, redrawn every frame. World is drawn in world-space via a camera transform (`cam.x/y/z`); HUD and the selection box are drawn in screen-space. A second small canvas is the minimap.
- **Game loop:** `loop()` at the bottom. Fixed-ish timestep via `requestAnimationFrame`; `dt` is clamped to 50ms so a backgrounded tab can't explode the physics. `update(dt)` advances simulation, `draw()` renders, HUD/minimap refresh on throttled timers.
- **Entities:** one flat array `G.ents`, each tagged `kind:'unit' | 'bld' | 'res'`. Dead entities are flagged `dead=true` and swept at the end of `update()`. IDs come from `G.nextId`.
- **State:** the whole match lives in the global `G` object (built in `newGame`). Null when no match is running. There is no save/resume yet (see backlog).
- **Determinism:** terrain and resource placement use a seeded RNG (`srand`/`srng`, seeded from the map). Gameplay uses `Math.random()` and is not deterministic — fine for now, but note it if you ever add replays.

---

## Where things live (by function)

| System | Functions |
|---|---|
| Map data | `MAPS` array, `EXTRA` table (oil/relics), `mapObs` |
| Terrain paint | `genTerrain` (ground, roads, hills, water, rock) |
| Navigation | `buildNav`, `rebuildBlockers`, `segBlocked`, `freePoint`, `findPath` (A*), `navTo`, `spawnSpot` |
| Entity spawn | `spawnUnit`, `spawnBld`, `addRes`, `spawnRelic` |
| Economy | `updWorker`, `bestRes`, `nearestDrop`, `train`, `costOf` |
| Combat | `updCombat`, `updSaboteur`, `fire`, `blast`, `dealDmg`, `kill`, `findTarget`, `canHit` |
| Engineer / Hacker | `updEngineer` (auto/ordered repair), `updHacker` (`rig` / `hack` jobs), `hasUnit` (Hacker prerequisites) |
| Stealth (Mountain Cell) | `updStealth` |
| Buildings | `updBld` (construction, production, research, turret fire) |
| Upgrades | `UPG`, `DOCTRINE`, `research`, `lvl`, `unitMaxHp`, `unitSpd`, `dmgMult`, `rangeOf`, `trainTime`, `refreshUnits` |
| Physics | `separate` (unit/building/obstacle overlap resolution) |
| AI opponent | `aiTick(team)`, `aiBuild`, `playerTarget`, `aiOf`, `STRATS` (sandbox runs `aiTick(0)` too); wave cohesion for drones at the end of `aiTick` |
| Fog of war | `fogInit`, `updFog`, `vis0`, `seen0`, `sightOf`, `fogOn`, `fogCv` |
| Relic pickup | top of `update()`; random placement in `relicSpot` |
| Icons | `ICON`, `iconSVG`, `UPGICON`, `FEMB` |
| Drawing | `draw`, `drawBld`, `drawUnit`, `drawDrone`, `drawRes`, `drawMini`, `hpBar` |
| Input | `pointerdown/move/up` on canvas, `holdCheck` (long-press), `onTap`, `boxSelect`, `pick`, minimap handlers |
| Panel UI | `btn`, `panelKey`, `renderPanel`, `livePanel`, `grpBtns`, panel click handler |
| Menus/flow | `endGame`, `setPause`, `renderFacs`, `renderMaps`, `thumb`, start/pause/end wiring |
| Sound | `SND` (sounds as stacks of voices), `audioInit` (context, noise buffers, reverb, wind bed), `sndVoice`, `sfx(kind,x,y,pitch,length)`, `setMute`; counters in `sfxN` |
| Persistence | `loadKey`/`saveKey` (localStorage: last map, difficulty, faction, best times, mute); match save: `saveGame`, `loadSave`, `resumeGame`, `clearSave`, `renderResume` |
| Modes / console gate / Back | `startMode`, `devAllowed`, `devShowBtn`, `onBack`, `backArm` |

---

## Data model

**`TUNABLES`** (first thing in the script) holds every balance number: `diff` (AI difficulty: workers, wave size/growth, build timings), `unit`, `bld`, `popMax`, `eco` (start credits/units, queue size, oil value/nodes/amount, relic bonus/respawn), `combat` (tank-vs-building multiplier, under-attack alert cooldown), `ai` (turret/research timings, research chance per difficulty, home-threat radius, drone share, engineer/hacker counts), `hack` (rig/hack ore per second, alert cooldown), `strats` (AI personalities, aliased as `STRATS`), `eco.lateTier` (seconds until level III upgrades unlock). `DIFF`, `UNIT`, `BLD`, `POPMAX` are aliases of these same objects, so the dev console `set`/`reset` edit them live. Faction passives/doctrines keep their numbers inside the faction functions listed under *Factions*.

**`UNIT[type]`** — `hp, speed, cost, time` (train seconds), `r` (radius), `pop` (supply), plus role flags: `worker/carry/gatherTime`, `dmg/range/rate/sight`, `air/ground` (what it can hit), `fly`, `splash`, `blast`+`kamikaze`, `saboteur`, `engineer`+`repair` (hp/s), `hacker`, `needs` (unit types that must exist before training). Types: `worker, truck, soldier, drone, kamikaze, saboteur, tank, technical, engineer, hacker`.

**`BLD[type]`** — `hp, size, cost, time`, optional `trains`, `pop`, `req`, and turret `dmg/range/rate`. Types: `hq, barracks, factory, turret, depot`.

**`FACTIONS[id]`** — `name, tag, blurb, col` (main/dark/light/rgb). Six: `mountain, urban, sky, smugglers, iron, shadow`. `FAC = [playerFactionId, enemyFactionId]`; the enemy is randomized each match in `newGame`.

**`UPG[id]`** — `name, at` (which building researches it), `max`, `cost[]`/`time[]` per level, `desc`, optional `req`, optional `facs` (factions allowed to research it). Level III (index 2) of any upgrade is hidden until `TUNABLES.eco.lateTier` (8:00) via `upsFor`. `DOCTRINE[faction]` is the per-faction payload of the `faction` upgrade. Live levels are in `G.up[team][id]`.

**`MAPS[]`** — `id, name, blurb, w, h, p` (player HQ, enemy is mirrored), `seed`, colors, `res`/`mid` (ore clusters: `[x,y,count,amountEach]`), `obs`/`midObs` (`[x,y,radius,'rock'|'water']`). Player-side `res`/`obs` are point-mirrored for the enemy; `mid`/`midObs` are placed as-is.

**`EXTRA[mapId]`** — `oil:[[x,y],…]` (mirrored) and `relics:[[x,y],…]` (placed as-is). Kept separate from `MAPS` so resources are easy to tune without touching terrain.

**`G`** (match state) — `ents, fx, shells, pings, credits[2], up[2], sel` (selected units), `selBld`, `placing`, `buildMenu`, `box`, `groups[3]` (control groups, arrays of unit ids), `relicHomes` (`x0/y0` = the map's hand-placed fallback spot), `ai` (enemy AI: `wave, t, stage, strat`), `ai0` (your side's AI, used in sandbox), `sandbox`, `timeScale`, `late`, `stats`, timers.

---

## Factions

| Faction | Identity | Passive | Doctrine (HQ upgrade) |
|---|---|---|---|
| Mountain Cell | Ambush | Still 2s → invisible; first shot +50% | Hide after 1s; ambush shot ×2 |
| Urban Network | Swarm | Riflemen −10% (54 ore), build +40% faster, −20% HP structures | Barracks train 35% faster |
| Sky Brigade | Drones | Cheaper drones (55 ore) + Kamikaze unit | Drones +30% HP, bigger blasts |
| Smugglers | Economy | +10% ore, Cargo truck worker (carries 12), −20% HP combat | Every unit −15% cost |
| Iron Militia | Speed | Factory builds Armed pickups (hit air) not tanks | Pickups +40% HP, +10% speed |
| Shadow Cell | Sabotage | Saboteur disables buildings 12s; all units +10% speed | Sabotage 20s, recharge 2× faster |

**Engineer** (all factions, HQ): repairs any damaged friendly unit or finished building within its sight on its own; tap a damaged unit/building with engineers selected to send them. Upgrade: *Field tools* (+30% repair per level).

**Hacker** (Urban Network, Shadow Cell, Smugglers only; HQ; 550 ore): can only be trained after the HQ research **Hacker cell** (`hackNet`, 250 ore) and while the team has a worker **and** an engineer alive. `UNIT.hacker.res` names the research; `UPG.need` hides the hacker upgrades until it is done. Two exclusive jobs: tap an **oil pool** → it stands there and siphons it (`TUNABLES.hack.rigRate`, more ore, drains the pool); press **Hack** → from anywhere it drains the enemy's banked ore straight to you (`hackRate`, less ore). Moving it stops the job. The victim gets a toast + minimap ping. Upgrades: *Exploit kit* (+30% rate per level), *Burner rigs* (+25% hacker HP per level). The `HACKERS` list holds the allowed factions.

Faction effects are applied in `unitMaxHp`, `unitSpd`, `costOf`, `trainsFor`, `trainTime`, `fire` (ambush), `updStealth`, `updSaboteur`, `blast`. To rebalance, those are the only places to touch.

---

## Game modes and the console

Start screen: **Start battle** (normal match, no console), **Battle with console** (same match, `G.dev`/`devMode` = true, the `»_` button and F2 work), **Sandbox: AI vs AI** (`G.sandbox`, console too). `devAllowed()` is the single gate: `DEV && G && (G.sandbox || G.dev)` and not on the menu. `DEV=false` hides *Battle with console* and the console everywhere. Restart / Play again keep the current mode.

## Save / resume

The match is written to localStorage key `save` every 10 s of play, whenever the page is hidden (`visibilitychange`, `pagehide`, Capacitor `pause`) and when leaving to the menu; it is deleted when the match ends or a new battle starts. On launch, if a save exists, a **Resume match** button sits at the top of the start screen (map · time · faction · mode). `saveGame()` serializes `G` with a JSON replacer: entity links anywhere (orders, targets, shells, `G.sel`, `G.selBld`, `relic.home.live`) become `{$e:id}`, relic homes `{$h:index}`, fog grids base64 `{$u8}`; `resumeGame()` rebuilds them, drops orders whose target died, then rebuilds nav and the fog canvas. Also saved: map, difficulty, both factions, mode, camera. A mid-match save is ~75 KB. **Compatibility:** `SAVE_V` is checked on load; bump it whenever entity fields or `G` change shape, and old saves are ignored instead of breaking. The data model itself did not change (only `G.dev` was added).

## Back button

`onBack()`: console open → close it; match running → Pause menu; Pause menu → resume; end screen → main menu; main menu → leave. In the packaged app it is wired to the Capacitor App plugin (`Capacitor.Plugins.App` `backButton`, which needs `@capacitor/app` installed; on the main menu it saves and calls `exitApp()`). In a browser, starting or resuming a match pushes one history entry so Back lands on `popstate` instead of leaving the page.

## Fog of war

Your side (team 0) only sees what its units and buildings see: unit `sight` (150 if none), buildings `size*2+150`, turrets their range +25. Vision lives on a 20px grid in `G.fog` (`vis` = in sight now, `seen` = explored, `lit` = soft-edge strength), refreshed every 0.15 s by `updFog` and drawn as one small canvas (`fogCv`) stretched over the world and the minimap, with smoothing for soft edges. Darkness: `TUNABLES.fog.explored` / `.unexplored`. Enemy units are drawn, tappable and audible only while in sight (`seen0`/`vis0`); enemy buildings stay on the map once spotted (`e.seen0`). Resources are always drawn. Off in sandbox (`G.sandbox`); console `fog on|off`. The AI is not limited by fog.

## Resources

- **Ore** (teal crystals): the staple. Workers mine, carry `UNIT.worker.carry`, drop at HQ/Depot.
- **Oil** (dark pools): mined like ore but worth `TUNABLES.eco.oilVal` (2.2), so ~2.2× ore per trip. Placed via `EXTRA[map].oil`, mirrored. Contested positions.
- **Relics** (gold trophies): not mined — the first *unit* of either team to touch one grants that team an instant **+260 ore**, then it respawns after 70s. Each spawn picks a new random clear spot about equally far from both HQs (`relicSpot`); the `EXTRA` position is only the fallback. Logic at the top of `update()`; homes tracked in `G.relicHomes`. Tune the bonus and respawn in `TUNABLES.eco`.

Per-trip value flows through `u.loadVal` (set when a worker fills up, spent when it delivers), so adding a new resource type is just a new `rtype` + `val` in `addRes` and a branch in `drawRes`/`drawMini`.

---

## Controls (mobile-first)

- **Pan/zoom:** drag / pinch. Minimap tap jumps the camera.
- **Select:** tap a unit; double-tap selects all of that type on screen.
- **Group select:** hold a finger still ~1s (a ring fills, phone buzzes), then drag a box. Release selects.
- **Control groups:** with units selected, **Save 1/2/3**. With nothing selected, **Group 1/2/3** reselects; tap twice to jump the camera there. Stored in `G.groups` as id lists; recall filters out the dead.
- **Orders:** tap ground to move (units fight along the way), tap enemy to focus-fire, tap ore/oil to gather.
- **Buildings:** tap HQ/Barracks/Factory to train and to research upgrades; with a building selected, tapping the map sets its rally point.
- **Back button:** pinned (sticky) at the left of the panel button row, so a long HQ row can always be left. **Target ring:** selected units' attack target gets a rotating red ring, repair target a green one (in `draw`).
- **No resource collision:** units pass through ore/oil nodes (`separate` skips `res`), because pathfinding does not know about them.
- **Deliver now:** with loaded workers selected, tap your HQ or a Depot to send them to drop off. Workers pass through ore/oil nodes (see `separate`), so they cannot get wedged inside a cluster.
- **AI intercept:** marching waves turn toward enemy army units within `TUNABLES.ai.intercept` (end of `aiTick`), so two armies cannot slip past each other around an obstacle.
- **Engineers/Hackers:** engineers + tap a damaged friendly = repair. Hackers + tap oil = siphon; **Hack** button = drain enemy ore.
- **Speed:** the `×1` button in the top bar cycles ×1 / ×2 / ×4 / ×0.5.
- **Sandbox:** *Sandbox: watch AI vs AI* on the start screen. Your side is played by the AI too (`G.sandbox`); you can still tap and command, and steer everything from the console.

---

## Testing (headless harness)

`test-sim.js` (shipped alongside) stubs `document`/`canvas`/`window` so Node can `eval` the game script and run `update()` in a loop with no browser. Use it to catch runtime errors, verify the AI builds/mines/attacks, confirm resource placement, and sanity-check features. Extract the script and run:

```bash
# pull the <script> body out of the HTML, then run the sim
node -e "const fs=require('fs');const s=fs.readFileSync('border-line-rts.html','utf8');fs.writeFileSync('/tmp/g.js',s.match(/<script>([\s\S]*)<\/script>/)[1])"
node test-sim.js
```

Keep each map's run short (≈40 simulated seconds) — full-length games across all maps exceed a 2-minute wall-clock budget because of pathfinding cost.

`test-sim.js` reads the extracted script from `/tmp/g.js` (on Windows, Node resolves that to `\tmp\g.js` on the current drive — create the folder once). Besides the per-map crash run it checks: relic placement (random, near-equidistant), engineer repair, hacker prerequisites and both hacker jobs, level III lock, a sandbox match with the AI on both sides, units escaping ore/oil clusters, and which sounds fire (with a fake audio context) plus mute.

Also checked: console availability per mode, save → play another match → resume (identical state, no broken links, keeps running, save cleared at the end), fog of war (hidden at start, spotted by a scout, buildings remembered, units not, off in sandbox), Hacker cost + Hacker cell research gate, and AI wave cohesion (drones stay over their riflemen).

Other tools, all reading `./border-line-rts.html` directly: `node clash.js 20` (equal-ore armies, every faction vs every other: combat value per ore only, ~10 s), `node balance.js 8` (whole games, real AI on both sides, round robin on 4 workers: 120 games in ~3 min; the trusted balance number; prints a Hacker table; add `nohack` to A/B Hackers), `node console.js ...` (drives the in-game console headlessly). Use 8 games per pairing: below that, the noise between runs is ±20 points. `clash.js` and `balance.js` use `Math.random`, so two runs never match exactly; to compare before/after a change, preload a seeded `Math.random` with `node -r ./seed.js clash.js 50`.

In a browser, the audio engine can be measured without ears: swap `window.AudioContext` for an `OfflineAudioContext`, call `audioInit()`, schedule a sound's voices with `sndVoice`, render, and read peak level and audible duration.

---

## Packaging for Google Play

1. **Wrap with Capacitor.** `npm i @capacitor/core @capacitor/cli`, `npx cap init`, drop the HTML in `www/`, `npx cap add android`, `npx cap open android`. Capacitor gives you a real offline APK/AAB. (Avoid PWABuilder/Bubblewrap — its template has lagged the required target API.)
2. **Target Android 16 (API 36).** Since 31 Aug 2026 new apps and updates must target API 36+. Set `targetSdkVersion 36` in `android/app/build.gradle`.
3. **Developer account:** one-time $25, with identity verification.
4. **Closed testing (the long pole):** new personal accounts must keep **≥12 testers opted in for 14 continuous days**, and Google checks they actually used the app, before you can request production. Recruit ~15 to absorb dropouts; start early.
5. **Store paperwork:** privacy policy URL, content rating questionnaire, Data Safety form (this game collects nothing — easy), icon, feature graphic, screenshots.
6. **Money:** Google Play Billing is mandatory for in-app sales and Google is merchant of record — it collects and remits VAT (Türkiye included). You do **not** need Stripe/iyzico/PayTR/ruul for Play sales. On the Turkish side, the GVK mükerrer 20/B regime lets a mobile-app developer take revenue through a dedicated bank account with a final 15% withholding, under the annual threshold, usually without forming a company — confirm specifics with an SMMM.

---

## Backlog (suggested order)

1. ~~**Balance config block**~~ — done: see `TUNABLES` under *Data model*.
2. ~~**Sound**~~ — done: synthesized in `sfx` from the `SND` table: each sound is a stack of voices (filtered white/brown noise + oscillators) with an outdoor convolution reverb, a compressor and a quiet wind bed. Guns and explosions are noise-only through a distortion bus (a pitched thump under them sounds like a drum — avoid): fire = clipped crack + darkening report tail, shell = cannon roar. Deaths are chosen in `kill`: die = infantry cry (sawtooth through moving vowel formants, `bp`), vboom = vehicle (blast + cook-off + ringing metal), dboom = drone (pop + fizz), bboom = building collapse (three blasts + rubble); boom = generic blast (shell impact, kamikaze). ready = snare rat-tat-TAT + low brass stab, vready = same with an engine rev (vehicles), built = snare roll + four-note fanfare, upg = repeated note + fifth. alert = siren, relic = bell. Helpers: `brass`, `snare`, `sndBlast`, `debris`. Context starts on the first touch, suspends when the tab is hidden; world sounds only play when on screen. Mute: Pause menu button or console `mute` (saved in localStorage `mute`).
3. ~~**Fog of war**~~ — done: see *Fog of war*. Possible follow-up: make the AI obey vision too.
4. ~~**Save/resume**~~ — done: see *Save / resume*.
5. **Monetization hooks** — free base + unlockable factions/maps, or a one-time unlock. Decide before production; it shapes the store screen.
6. **Audio/haptics settings + a brief tutorial** for first launch.
7. **More content** — extra maps (just add to `MAPS`), a 5th building, per-faction unit skins.

### How to extend (quick recipes)

- **New unit:** add to `UNIT`, add to a building's `trains` (or `trainsFor` for faction-specific), add a branch in `drawUnit`/`drawDrone`, add an `ICON`. Combat is automatic from its stat flags.
- **New faction:** add to `FACTIONS`, `DOCTRINE`, and an `FEMB` icon; wire its passive into the handful of faction-check functions listed under *Factions*.
- **New map:** add to `MAPS` (+`EXTRA` for oil/relics). Thumbnails and the picker pick it up automatically.
- **New upgrade:** add to `UPG` with `at`/`cost`/`time`, an `UPGICON`, and apply its `lvl(team,id)` in the relevant stat function.

---

*Built as a browser artifact; this is the full source, yours to take into Claude Code and grow.*

---

## In-game dev console

The game ships with a developer console for scripting scenarios live — the same control surface as `test-sim.js`, but inside the running game. Toggle it with the **`»_`** button (top-left under the top bar, console modes only) or **F2** (also `` ` `` / `~` / `"` when you're not typing in it). It runs any JavaScript in game scope, plus these shortcuts:

```
help                       list commands
give <n> [team]            add ore (default: you)
spawn <type> [n] [team]    make units near an HQ
army / attack              send your army at the enemy HQ
research <id> [team]       grant an upgrade level
faction <id> / enemy <id>  swap a side live
map <id>                   restart on a map
fast <0.25-8>              time multiplier (also the ×1 button in the top bar)
mute                       toggle sound (also in the Pause menu)
fog [on|off]               fog of war on your side (always off in sandbox)
sandbox [on|off]           AI plays your side too, live
strat <name> [team]        AI strategy for a side (1 = enemy, default; 0 = you)
strats                     list strategies; mod your own: STRATS.mine={wave:4,first:90}
pause / resume
win / lose                 end the match
reveal                     print both sides' unit/building/ore counts
clear / dev off
```

Anything not matching a command runs as JS, e.g. `G.credits[0]=9999`, `spawnUnit('tank',0,PHQ.x,PHQ.y)`, `FAC[1]='iron'`. Arrow-up/down recalls history.

**Where it appears:** only in *Battle with console* and *Sandbox* (see *Game modes and the console*); never in a normal battle or on the menus. `DEV=false` near the top of the script removes the console modes entirely. The `fast` multiplier runs `update()` N times per frame via `G.timeScale`, applied in `loop()`.

### Live tuning + Claude Code review

The console now also retunes balance and inspects state — the same commands work in-game and headless:

```
set <type> <field> <v>   live-tune any unit/building number (set tank hp 320, set drone cost 70)
get <type> / dump        read one type, or dump all UNIT+BLD as JSON (paste the tuned numbers back)
reset                    restore tunables to defaults
state                    full JSON snapshot: time, factions, per-team ore/pop/units/buildings/upgrades
eco / step <sec>         economy summary, or fast-forward the sim N seconds
```

**`console.js`** drives the exact same engine from Claude Code, so it can inspect from every angle:
```
node console.js --you iron --enemy shadow --map delta "give 4000" "spawn technical 6" "step 25" "state"
node console.js "get tank" "set tank hp 320" "spawn tank 3" "step 8" "reveal" "dump"
```
Options: `--you <faction> --enemy <faction> --map <id> --diff <easy|normal|hard>`, then any console commands or raw JS. Output (including `state` JSON) prints to stdout for Claude Code to read. `logC` routes through a reassignable `devHook`, which is how the bridge captures output — the one engine serves both the browser and Node.
