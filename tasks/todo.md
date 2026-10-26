# Yggdra Union–style tactics game in three.js — Research & Plan

Status: **RESEARCH DONE — waiting for answers to the open questions (bottom of file) before any code.**

---

## 1. Reference game (what we are recreating)

*Yggdra Union* (Sting, GBA 2006; PSP remake *We'll Never Fight Alone*). Turn-based tactics on a grid, plus a real-time battle cut-scene that the player can influence.

### Map layer
- Grid battlefield with terrain (plains, forest, mountain, water, town, etc.); terrain gives defence ("Geo") bonuses and can be changed by some card skills.
- Small pixel-art unit sprites standing on tiles; cursor driven.
- **Turn flow:** player picks **one card** at the start of their turn → moves units → may start **one** attack (a Union battle) → ends turn → enemy does the same.
- **Card:** `POW` (damage the loser takes), `MOV` (one movement pool shared by *all* your units this turn), `ACE` (weapon type the Union leader needs to use the card skill; "All" = anyone), and a **skill**. Each card can be used only once per battlefield.
- **Union:** the attacker becomes the leader. Allies next to them join: **female leader = `+` shape, male leader = `x` shape**. Up to 5 units, so up to 5 sequential **clashes**. Enemies form Unions the same way.
- **Morale** works as HP. Losing a clash costs Morale; winning costs nothing.
- **Weapon triangle** (rock-paper-scissors between weapon types), plus unit-type matchups.
- Unit stats: Morale, GEN (defence in charge/counter), ATK, TEC (offence in charge/counter, skill), LUK (crits/flash attacks).

### Battle (clash) layer: the part you want to see
Side view, attacker on one side and defender on the other. Each unit is a **squad: 1 "head" (the named character) + up to 7 soldiers** (large units like knights: 4 bigger sprites). Up to 80 soldiers can appear across a whole Union battle.

A clash plays in three phases:
1. **Charge** (attacker TEC vs defender GEN): the attacking squad runs in and strikes. A LUK crit can knock off the enemy head and put them in **Panic** (a few seconds of free damage).
2. **Counterattack** (TEC vs GEN): the defender pushes back. Bow units, and units hit by bows, can't counter. A crit also cancels the counter.
3. **Attack phase** (ATK vs ATK): the main melee, one soldier against another, with "Flash Attacks" from LUK. It ends when one side has no fighters left.

During the clash:
- **Stance toggle (real-time input):** **Aggressive** uses up the skill gauge for +2 effectiveness. **Passive** fills the gauge at −2. Neutral sits between them. The music tempo changes with the stance.
- **Skill gauge** (player) / **Rage bar** (enemy). When the gauge is full and the card's conditions are met (ACE weapon, sometimes a specific character or time of day), the player can fire the **card skill**: a character cut-in plus a big effect.
- **Combat-effectiveness icon** at the bottom of the screen (weapon/attribute/type advantage).
- **Result:** the loser takes Morale damage based on the winner's card POW %, the surviving soldiers (8% per small, 16% per large), a Head-Alive bonus, crits, ATK − loser GEN, and finally the loser's Geo defence.

---

## 2. What has to be built in three.js

| # | System | three.js / tech approach |
|---|--------|--------------------------|
| 1 | **Pixel-perfect render pipeline** | Render into a low-res `WebGLRenderTarget` (e.g. 480×270), then draw it full screen with `NearestFilter` at an integer scale. `antialias:false`, `image-rendering: pixelated`, snap sprite positions to whole pixels. Without this the pixels shimmer. |
| 2 | **Cameras** | `OrthographicCamera` for both layers. Map: tilted down (~30–45°) over a 3D tile grid, so it is 2.5D. Battle: side-on, with parallax background layers. Camera tweens for shake, zoom-on-skill and pan. |
| 3 | **Sprite sheet animator** | Billboard quads (`THREE.Sprite` or a camera-facing `PlaneGeometry`). Animation is done by changing `texture.offset/repeat` (UVs) per frame, with clips (idle, run, attack, hit, die, cast), per-frame timing and events ("hit lands on frame 3"). Core reusable piece. |
| 4 | **Crowd rendering for squads** | Up to 16 soldiers on screen per clash. Plain sprites are fine for that, and `InstancedMesh` with a per-instance UV attribute is an option later if needed. Each soldier has a small state machine: run → engage target → swing → recoil/die. |
| 5 | **Tile map** | Grid data → instanced box/plane tiles with a terrain texture atlas, height for mountains, an animated water shader. Highlight overlays for move range, attack range and Union shapes. |
| 6 | **Map interaction** | Cursor (keyboard and mouse raycast onto the grid), unit select, BFS move range limited by the **shared MOV pool** plus terrain cost, path preview, move tween. |
| 7 | **Game rules core (pure TS, no three.js)** | Units, stats, weapon triangle, terrain, cards, Union formation detection (`+`/`x`), clash resolution formulas, Morale damage, turn manager, enemy AI. Kept separate from rendering so it can be unit-tested. |
| 8 | **Battle director** | Timeline/state machine that drives a clash: intro → charge → counter → melee → result → next clash in the Union. Reads input for the stance toggle and the skill trigger. |
| 9 | **Skill cut-ins and VFX** | Portrait slide-in, screen flash, particle sprites (slash, fire, light), screen shake, hit-stop (a freeze of a few frames). Done with sprite-sheet effects and simple shaders. |
| 10 | **UI / HUD** | Card selection hand, unit info panel, Morale bars, skill gauge, stance indicator, damage numbers. Recommendation: an HTML/CSS overlay with a pixel font (fast to build), with only the battle HUD drawn in-canvas. |
| 11 | **Scene / state manager** | Title → Map ⇄ Battle transitions (pixel wipe or mosaic), all in one renderer. |
| 12 | **Input** | GBA-style key map: arrows = D-pad, Z = A, X = B, A/S = L/R, Enter = Start. Mouse for the map. |
| 13 | **Assets (the main non-code work)** | Pixel sprite sheets for units, soldiers, terrain, portraits and effects. **The original Yggdra sprites are copyrighted and can't be redistributed**, so we start with procedurally generated placeholders, then move to free packs (OpenGameArt / itch.io), or art you draw in Aseprite (JSON sheet export). |
| 14 | **Audio** (later) | WebAudio, with stance-based tempo change like the original. |
| 15 | **Tooling** | Vite + TypeScript + three, Vitest for the rules core, git for atomic commits. |

---

## 3. ACTIVE PHASE: the world map (terrain only)

Focus decided 2026-10-24: build the terrain map first. Units, battles, unions and cards come later (section 4).

### 3a. One fictional continent where the terrain follows the land
Every tile comes from **elevation + moisture + water flow**, so the biomes join up naturally and don't look like random patches:

```
high + dry   → rocky peaks, scree, snowcaps          high + wet   → alpine pine forest, glacier
mid  + dry   → hills, badlands, canyon               mid  + wet   → dense forest, waterfalls
low  + dry   → plains, farmland, savanna/desert      low  + wet   → swamp, marsh, bog, lake
coast        → beach, cliffs, sea                    rivers       → run downhill from peaks to lake/sea
```

### 3b. Terrain catalogue
**Your asks:** mountains (with elevation), swamp, forest, rivers with flowing water, plains, rain.

**Suggested additions that fit the same land:**
| Group | Terrain / feature | Why it fits |
|-------|-------------------|-------------|
| Elevation | **Hills** (1–2 steps up), **cliffs** (sheer drops), **plateaus/mesas**, **canyon/ravine** cut by a river | Gives height variety between plains and peaks. In tactics games, high ground is the core of positioning. |
| Elevation | **Snowcaps** above a height line, **scree/rock fields** below the peaks | Shows how high a peak is at a glance. |
| Water | **Waterfalls** wherever a river drops a level, **rapids**, **lake**, **sea/coast** with foam, **shallow ford** (crossable) vs **deep water** | Rivers need somewhere to start and end. Fords and bridges create chokepoints. |
| Water | **Delta / estuary** where the river meets the sea, splitting into channels | Natural place for the river to end. Leads into marsh. |
| Wetland | **Swamp** (murky, dead trees), **marsh/reeds**, **bog** with low fog | Low and wet areas next to rivers and lakes. |
| Woodland | **Light woods** vs **dense forest**, **pine forest** at altitude, an **ancient/giant-tree grove** (fantasy landmark) | Different kinds of forest at different heights. |
| Open land | **Plains/grass**, **flower meadow**, **farmland/wheat fields**, **dirt roads** linking settlements | Roads and farms make the land look lived in. |
| Dry land | **Badlands / desert** with dunes, an **oasis** | Contrast to the green and wet regions. |
| Fantasy | **Ancient ruins**, **crystal field / ley-line glow**, **volcanic ridge with lava flow** (optional), **cursed wasteland** | Landmarks you can tie to the story and use as card skill terrain later. |
| Built | **Villages**, **castle/fort**, **watchtower**, **stone and wooden bridges**, **walls/gates**, **harbour/docks** | Strategic points and shelter (gameplay later). |
| Life | Swaying trees and grass tufts, birds, fireflies in the swamp at night, fish ripples, smoke from village chimneys | Small motion that makes the map feel alive. |

**Weather and atmosphere (map-wide layers):**
- **Rain:** falling streaks, splash ripples on water and ground, darker and cooler light, wet ground sheen.
- **Thunderstorm:** rain plus lightning flashes and screen tint.
- **Snow:** falling flakes, more snow on high ground.
- **Fog/mist:** thick over the swamp, morning mist in valleys.
- **Wind:** trees and grass sway harder, rain falls at an angle.
- **Day/night cycle:** dawn, day, dusk, night lighting, lit windows and lanterns at night. The original game had time of day affecting card skills, so this pays off later.
- **Cloud shadows** drifting across the land.
- Optional: heat haze over the desert, falling leaves in the forest.

**Gameplay hooks for later** (data only for now; each tile stores them): move cost per terrain, Geo/defence bonus, height advantage, and weather modifiers (e.g. rain floods fords, thick fog cuts sight range).

### 3c. Map roadmap (each step is small and visible on screen)
- [x] **M0: Scaffold.** Vite + TS + three, pixel-perfect low-res render pipeline, empty scene with a crisp test tile.
- [x] **M1: Flat grid.** A few terrain types with procedurally drawn pixel textures, tilted ortho camera, pan/zoom, tile cursor and info box (terrain name, move cost, defence).
- [x] **M2: Elevation.** Stepped tile columns with cliff-side textures, mouse picking that accounts for height, camera rotation in 90° steps so tall terrain doesn't hide tiles behind it.
- [x] **M2b: Rounded edges.** Column lips curve down and cliff feet curve up, so a one-step change is one smooth slope and taller cliffs get soft lips.
- [x] **M2c: Natural shaping.** Wider rounding that varies across the map, banks sloping to the waterline, and water painted map-wide by distance to shore.
- [x] **M2d: Living ground.** Every tile top painted map-wide per pixel (terrain borders wander and dither across tiles, light/dark patches from world noise, no per-tile seams); water loops through pre-painted frames; flowers and grass tufts sway in a travelling wind wave.
  - [x] `ground.ts`: map-wide land painter (warped terrain borders, noise patches, details masked to their terrain) + water frames → RGBA frames
  - [x] `water.ts`: depth once, then looping frames (contour drift on a circle, twinkling glints)
  - [x] MapMesh: tops sample the ground texture (own material group), sides keep the atlas; frame swap in `update()`
  - [x] `Flora.ts`: placement on grass pixels (clustered, meadow dense), billboard sprites with wind sway shader
  - [x] tests (ground blending, water loop, flora placement), check.mjs animation checks, GIF capture for review
- [x] **DOC1: Visual history and public repo.** Rendered every milestone commit from the same camera views into `evolution/land/` (timeline GIF, before/after pairs, notes per version); placeholders for characters and battles; root README with a clear fan-project disclaimer; neutral project name "Diorama Tactics"; published as a public GitHub repo.
- [x] **M2e: Theme kits + 6 showcase maps.** The 30 proposed variations were 2D sketches below M2d quality (see lessons.md), so each category gets one showcase built in the real engine first, and the user reviews quality before the other 24. Showcases: Alpine Pass (Wilds), Castle Courtyard (Kingdom), Fountain Plaza (Modern Town), Night Market Alley (Neon City), Jungle Temple (Ruins), Volcanic Caldera (Elemental).
  - [x] Built terrain: `shape: 'built'` keeps edges sharp and tops flat (walls, buildings, paving); new paving painters (flagstone, cobblestone, blocks, slabs, asphalt) that run seamlessly across tiles; new cliff faces (masonry, facade with windows, shopfront, basalt, temple stone)
  - [x] Liquids: the water painter generalised to lava (own ramp, slower drift); glowing pixels via emissive maps on the ground and cliff faces
  - [x] Props: generic billboard renderer (Flora reuses it); procedural pixel sprites (trees, crates, stalls, lamps, landmarks); contact shadows baked into the ground; glowing props add point lights
  - [x] Backdrop: per-theme panorama behind the board that scrolls with the camera's rotation, plus a time-scrolled overlay (clouds, embers, mist). Never drawn over tiles
  - [x] Theme registry (`?map=<id>`): map builder, lighting, backdrop; the current map becomes the `meadow` theme and stays the default
  - [x] Six 20×20 showcase maps
  - [x] Tests: built surfaces are flat and crack-free, lava loops and only lava glows, every theme map is valid and fully connected for walking units, props sit on legal tiles; check.mjs loads every theme without errors
  - [x] Stills and GIFs per showcase sent for review; add to evolution/
- [x] **M3: World generator.** Seeded noise for elevation and moisture, biome classification, one regenerate key. Saved as editable JSON. Decisions (2026-10-25): the shape varies by seed (valley, island, coast); terrain only, tall props wait for M5.
  - [x] L0 `map/generator.ts` (pure, no three.js): `generateMap(seed, size = 32)` → MapFile
    - elevation: warped fractal noise plus a ridge term, ranked per map so every seed spans lowland to peak
    - water: the lowest share becomes lakes (deep in the middle, shallows at the rim), never more than about 20% of the board
    - moisture: its own noise plus a bonus near water; stored on each tile
    - biomes: elevation band × moisture band → the 18 natural terrains of the original map (no roads, ruins, farms or built ground; those come in M6)
    - heights 0–8 from elevation, with the M2 terrain offsets (woods rise, swamps sit low); then `slopeToLiquids` for banks
    - clean-up: merge one-tile specks into their neighbours so regions read as clear shapes; carve a ford or pass wherever open ground would be cut off, so every walkable tile is reachable
  - [x] L1 `map/mapFile.ts`: `serializeMap` / `parseMap` with validation (version, size ≤ 64, known terrain ids, heights 0–8); rejects bad files with a reason
  - [x] L2 `themes/world.ts`: "Wild Lands" theme on `?map=world&seed=N` (`?seed=N` alone implies it), meadow lighting and scenery; meadow stays the default page
  - [x] L3 rebuild in place: main.ts loads a new map without a page reload (old meshes disposed); HUD shows the seed with **New map** (or `R`) and **Save JSON** (or `S`) buttons, and dropping a .json file on the page loads it
  - [x] L4 tests: same seed gives identical JSON; different seeds differ; over 50 seeds every one of the 18 terrains appears, every walkable tile is reachable, ≥ 65% of tiles are walkable, banks slope, no one-tile specks; JSON round trip and bad-file rejection. check.mjs: world loads, R changes the map, the same seed reproduces it, Save gives valid JSON
  - [x] Review: stills of 6 seeds plus a 12-seed contact sheet and one loop GIF sent; `evolution/land/m3-world-generator/`
- [x] **M4: Water.** Rivers carved downhill, flowing-water shader that scrolls along the flow direction, lakes, coast foam, waterfalls at drops, fords and bridges.
  - Decisions (2026-10-25): rivers are wadeable everywhere (shallow, slow to cross; bridges are the quick way over); 1–2 rivers per map by seed; rivers step down terraces with waterfalls; the themed maps get flowing water too.
  - Plan (2026-10-25, approved). The file format already has river/waterfall water kinds, a flow vector and bridge features, so saves stay version 1.
  - [x] L0 `map/rivers.ts` (pure): rivers for generated maps
    - sources on high ground (count by seed), traced downhill along the steepest descent with a little noise, ending in a lake, the sea or the front edge; rivers that meet merge
    - carved one step below their banks; the course only ever drops, and each drop is a waterfall tile; narrow in the hills, two tiles wide in the lowlands
    - every river tile gets a flow direction (toward the next tile); banks become damper, so marsh and reeds can follow the river
  - [x] L1 crossings: rivers are shallow everywhere, so units can always wade across slowly; each river gets one or two bridges (wood in the lowlands, stone in the hills) as the quick way over, walked at deck height. Every walkable tile stays reachable
  - [x] L2 flowing water (ground image, same 12-frame loop): river ripples and glints slide along the flow direction and loop seamlessly; lakes keep their gentle drift; the sea gets a foam line that washes in and out along the shore
  - [x] L3 waterfalls: an animated falling sheet on the cliff face where a river drops, with white foam where it lands
  - [x] L4 bridges: plank or stone decks with rails, spanning the river at bank height with water visible flowing beneath; the tile panel says "Bridge"
  - [x] L5 themed maps: Meadow's river and the Market canal get flow directions; Market's planks become real bridges
  - [x] L6 tests: rivers only run downhill, every river ends in water or at the edge, waterfalls only at drops, flow points to the next river tile, all walkable tiles reachable over bridges and fords, water loops seamlessly, JSON round trip. check.mjs: river pixels move along the flow, the waterfall animates, a bridge tile can be picked
  - [x] Review: a four-seed sheet, close-ups and four GIFs; `evolution/land/m4-water/`
- [x] **M5: Swamp, forest and mountain detail.** Tree, reed and rock billboard sprites, dead trees, snowcaps, swamp tint.
  - Decisions (2026-10-25): sparse pockets of cover (about 1 in 8 land tiles); trees and rocks are walkable cover with a defence bonus, never blocking.
  - Plan (2026-10-25). Generated maps only; the six themed maps are hand-built and stay as approved. Follows the jungle lesson: cover in pockets with open lanes, low decor for the feel.
  - [x] L0 `map/cover.ts` (pure): tall cover for generated maps, stored as tile props (saved in the JSON)
    - woods: broadleaf trees on light woods and forest, pines on pine forest, snowy pines high up; in clumps from smooth noise, thick at a clump's heart and thinning at its edge
    - rocks: boulders on hills, scree, mountain and badlands, few and far between; drowned dead trees in swamps and bogs
    - kept clear: water, bridges and the tiles at each end of a bridge, river banks (so rivers stay visible), and the front rows of the board are thinner
    - lanes: at least 80% of open tiles stay free of props, and every open tile stays reachable
  - [x] L1 low decor (not cover, on the flora layer): reeds along still water and in marsh, swamp and bog; undergrowth in woods; pebbles on scree
  - [x] L2 new sprites at the same quality as the jungle: a drowned dead tree, reeds, a second broadleaf tree shape, a mossy boulder variant
  - [x] L3 swamp tint: water beside marsh, swamp and bog turns murkier and greener
  - [x] L4 tests: deterministic; each prop only on the terrain it belongs to; 80% of open tiles prop-free; everything reachable; nothing on water, bridges, bridge ends or river banks; fewer tall props on the front rows; reeds only by water or in wet ground. check.mjs: props on a generated map, no errors
  - [x] Review: whole-board sheet of four seeds, close-ups of forest, swamp and mountain, a GIF of trees swaying; `evolution/land/m5-cover/`
- [x] **M6: Settlements and roads.** Villages, castle, roads connecting them, bridges where roads cross rivers, ruins and landmarks.
  - Before M6 (user request, 2026-10-25: "document how our progress looks at every stage in the github commit… how everything is slowly and iteratively improved"):
    - [x] `evolution/land/stages.json`: every visual stage in order, including review rounds and fixes, with its commit, date, one standard image and a one-line note. Backfill M0 to M5 r1.
    - [x] `scripts/timeline.mjs`: rebuilds `evolution/land/timeline.gif` from stages.json, one captioned frame per stage
    - [x] Never overwrite a shipped picture: review rounds go in `<milestone>/r<N>-<topic>/` with a before/after comparison. Restore M5's originals from 48e8318 and move the snowline fix into `m5-cover/r1-snowline/`.
    - [x] Every visual commit message gets a "Progress" section: the stage, what now looks different, and the pictures added
  - Decisions (2026-10-25): settlements mix by seed (a village, a small castle, or ruins only); house rooftops are walkable (FFT style); roads link settlements to each other and to the board edges, crossing rivers at bridges.
  - Plan (2026-10-25, generated maps only):
    - [x] L0 `map/settlements.ts` (pure): sites on flat, dry, reachable ground near water and away from the front rows; a village (houses, fields, a well), plus a landmark on high ground (ruins or a watchtower), or a castle, per the decisions below
    - [x] L1 roads: shortest gentle routes (A*, slopes cost more) between settlements and out to the board's edges; road tiles are fast (MOV 1); a road meets a river at an existing bridge or gets a new one
    - [x] L2 art: house blocks with roofs and walls in the built style, fields, a well, a watchtower, ruined walls; sprites at the jungle's quality
    - [x] L3 tests: deterministic; settlements on flat dry ground, never on water or cliffs; every settlement linked by road; roads walkable and continuous, crossing rivers only at bridges; everything still reachable; cover cleared off roads and settlements
    - [x] Review: four-seed sheet, village and landmark close-ups, a timeline frame; `evolution/land/m6-settlements/`
- [x] **M7: Weather.** Rain first (particles, splashes, darker lighting), then storm, snow, fog, wind.
  - Decisions (2026-10-25): all five (rain, storm, snow, fog, wind); weather by seed on Wild Lands plus a weather picker for every map; wet and snowy ground.
  - Plan (2026-10-25). All effects drawn in the 480x270 pixel buffer, so rain and snow are crisp pixels like everything else; every loop divides 4 s so recordings stay seamless.
  - [x] L0 `render/weather.ts`: a weather state (clear, rain, storm, snow, fog) with a wind strength; one `Weather` object owns the effects and eases between states instead of snapping
  - [x] L1 rain: pixel streaks falling at the wind's angle, splashes where they hit tile tops and water, rings on water; darker, cooler light and sky
  - [x] L2 storm: heavier, more slanted rain, stronger wind (trees and flowers lean further), lightning flashes that light the whole board for a frame or two
  - [x] L3 snow: flakes drifting and swirling, settling white on tile tops over time; cold, bright light
  - [x] L4 fog: low banks of mist drifting across the board, thicker further from the camera, softening the backdrop
  - [x] L5 choosing it: per the decisions below
  - [x] L6 tests: weather state and easing are pure and deterministic; particle counts stay within a budget; no state leaks when switching maps (GPU memory steady). check.mjs: each weather renders without errors and the frame differs from clear
  - [x] Review: one still and one GIF per weather on the same seed; a comparison sheet; `evolution/land/m7-weather/`
- [x] **M8: Day/night and ambience.** Light cycle, cloud shadows, swaying foliage, fireflies, chimney smoke.
  - Decisions (user, 2026-10-25): dawn and dusk as well as day and night; subtle shadows cast by higher ground and tall things (buildings, castle walls, mountains); an option to choose the time of day. My defaults, mirroring the weather picker: a time picker with the map's own time (Wild Lands: day; themed maps: their designed light), dawn, day, dusk, night, and a running cycle (a full day in 2 minutes), kept in the URL as `time=`.
  - [x] L0 `render/daytime.ts` (pure): sun and moon direction, colours and strengths for any hour from keyframes (night, dawn, morning, noon, afternoon, dusk), blended; a change of time eases forward through the hours between
  - [x] L1 `render/LightRig.ts`: one place that sets the lights, from the theme's own light × time of day × weather (the weather layer stops touching the lights); sun position from the hour; sky backdrop tinted, with stars at night under a clear sky
  - [x] L2 shadows: the sun casts real shadows from the terrain columns, buildings, walls and bridges onto the ground and sprites, kept subtle (partial strength) and crisp (no blur); long at dawn and dusk, short at noon, faint by moonlight, weak under cloud
  - [x] L3 night: cottage windows glow warm; themed lamps and lanterns keep their light; fireflies over meadows, woods and water
  - [x] L4 ambience: chimney smoke rising from cottages and drifting with the wind; soft cloud shadows sliding over the ground by day
  - [x] L5 time picker in the menu box; dev hooks to set the hour for captures
  - [x] L6 tests: hours loop and blend smoothly; sun up by day and down at night; dawn and dusk warm, night dark; shadows longest at dawn and dusk; easing goes forward in time. check.mjs: each time renders and differs, shadows are on, windows glow at night, fireflies at night only, no errors
  - [x] Review: the same map at dawn, day, dusk and night; a cycle GIF; shadow close-ups; `evolution/land/m8-day-night/`
- [x] **M9: Large-map performance.** Instancing/chunking and culling, holding 60 fps on the full map.
  - Decisions (user, 2026-10-26): boards up to 64×64; the RTX 4060 laptop sets the bar; no visible change. Baseline and attribution are in `tasks/perf_log.md`. Drawing already holds 60 fps at 64×64 (240 fps at the cap, 0 frames over 16.7 ms, about 15× headroom uncapped). The cost is board building: 2.4 s at 64 and 1.0 s at 32, against a 0.43 s floor.
  - Targets: 64×64 loads in ≤ 1.2 s and 32×32 in ≤ 0.6 s; still 0 frames over 16.7 ms; heap no higher than baseline; captures pixel-identical to the old build.
  - [x] L0 harness: `?size=N` for Wild Lands (16 to 128); `tasks/perf/` bench and profilers; `tasks/perf/identity.mjs` captures fixed poses with a frozen clock and pinned hour (32 and 64; clear, storm, snow; day and night) and compares them pixel for pixel with the baseline captures
  - [x] L1 surface (27% of load): one neighbour scan per sample instead of three; O(1) terrain flags instead of `Array.includes`; no `tileAt` in the inner loop
  - [x] L2 noise (9%): `valueNoise` hashes each lattice corner once (4 hashes, not 6)
  - [x] L3 re-profile, then the next hotspots in order: the liquid frame painter (17%), then the ground painter (13%). One change at a time, kept only if measured above noise and the captures still match
  - [x] L4 board size in the menu for Wild Lands: 32 (standard), 48, 64, kept in the URL as `size=`; R and map switches keep it. Check that 64×64 generates well (rivers, settlements, cover spread across the larger board)
  - [x] L5 tests: `sizeFromUrl`; the new surface code matches the old one exactly over many seeds and sizes; check.mjs loads a 64×64 board without errors; the bench meets the targets
  - [x] Review: before/after load table; 64×64 overview shots; `evolution/land/m9-performance/`
  - Not planned: chunking, instancing or culling of the drawing. The profile doesn't attribute any cost to it on the target machine (protocol: no optimisation without attribution). Logged under Deferred for weaker GPUs or boards past 64.

---

## 4. BACKLOG: later phases (parked)
- [ ] Sprite sheet animator (shared by units and the battle scene)
- [ ] Characters and units on the map: select, shared-MOV BFS range, move
- [ ] Cards and turn flow: pick a card, MOV pool, one attack per turn
- [ ] Battle scene v0: side view, 1 head + 7 soldiers per squad, charge, clash, fall (scripted)
- [ ] Battle scene v1: charge, counter and melee phases from stats; stance toggle; skill gauge; result
- [ ] Card skill cut-ins and VFX: portrait slide-in, flash, hit-stop, shake
- [ ] Unions: `+`/`x` detection and highlight, chained clashes
- [ ] Enemy AI, win/lose conditions
- [ ] Polish: transitions, audio, real art pass

Before M0: write `specification.json`, `definition_of_done.md` and `progress_tracking.json` (CLAUDE.md blueprint artifacts), scoped to the map phase, and get approval.

---

## 5. Decisions (map phase), 2026-10-24
- Elevation: **stepped block columns** (integer height per tile, pixel-textured cliff sides)
- Map size: **32×32 tiles**
- Source: **seeded procedural generator**, saved as editable JSON
- Camera: **free orbit** (orthographic, polar angle clamped, pixel pipeline kept)
- [ASSUMED, not objected to] 480×270 internal resolution, Vite + TypeScript + three, Vitest, git init, procedural placeholder art, project stays in OneDrive

## Review
_(filled in after each step)_

### M0 review (2026-10-24)
- Done: Vite 8 + TS 5.9 + three 0.186; 480x270 drawing buffer with integer CSS upscale computed in device pixels (handles 125%/150% Windows scaling); procedural 16px grass/earth textures; three test columns h1-h3 at isometric 45°/30°.
- Verified: 4/4 unit tests (scale fit), `npm run build` clean, headless Chrome screenshot at 1920x1080 shows scale 4 with hard texel edges, no console errors.
- Known, deferred to M2: the side texture repeats the grass lip on every height step; only the top step should carry it (fix when columns are rebuilt as merged/instanced geometry).

### M1 review (2026-10-24)
- Done: all 22 terrain types have data (name, move cost, defence) plus a procedural 16px painter (4 variants each) in one texture atlas. The whole map is one merged mesh, so it draws in a single call. Earth-strata diorama base. FFT cursor (flashing outline and bobbing pointer). Free-orbit ortho camera (polar 25–75°, zoom 0.5–3, WASD and right-drag pan clamped to the map). FFT-blue info panel with Silkscreen font, scaled by `--px`.
- Test layout (`testMap.ts`) is hand-placed so every style can be seen. It gets replaced by the generator in M3.
- Verified: 31 unit tests; `scripts/check.mjs` (puppeteer-core + installed Chrome) 13/13: 480×270 integer scale, hover on 5 known tiles matches panel + tile, polar/zoom/pan clamps, no console errors.
- Notes: texels shimmer at zoom 0.5 (minification without mipmaps). Accepted for now; revisit in M9 if it bothers you.

### M2 review (2026-10-24)
- Done, after the user said M1 looked too flat: heights follow terrain type. Water 0; swamp/marsh/bog and beach 1; plains 2 with rolling 3s; light woods 2 → forest 3 → pine 4; ruins mound 3; badlands mesas 3–5; dunes 2–3; mountain hills 3 → scree 4–5 → rock 6–7 → snowy peak 8. Bank pass: land is never higher than its distance to water, so banks step down to the river.
- Columns: only cliff faces exposed to a lower neighbour are built, one quad per step. The top step carries the terrain's lip (fixes the M0 repeated-grass-lip issue), lower steps use the material (soil/rock/sand/redrock), and anything below height 0 is earth bedrock. Vertex-colour depth shading on cliff faces. Still one mesh and one draw call; the base box was removed because edge columns run down to −4 steps.
- Picking returns the first column the ray hits (top or cliff face), i.e. the visible one.
- Verified: 34 unit tests (height rules, bank slope, mountain/forest ordering); check.mjs 16/16, including 3 camera poses (iso, low angle where the peak hides the target, top-down).

### M2b review (2026-10-24): rounded edges
- Requested: "edges of the terrain for each elevated grid look very sharp; make them smoother and rounded to a seamless transition".
- `surface.ts`: one height function per tile, built from distance to lower and higher neighbours (3×3). Lips drop 0.25 and feet rise 0.25 over a 0.25-tile rim with a sine profile. A one-step change between land tiles therefore becomes one C1-smooth S-slope with no face. Taller cliffs keep a vertical face between a soft lip and a shaded foot. Convex corners round in plan, water stays flat, and the map edge counts as a drop.
- The function depends only on position and the surrounding heights, so equal-height neighbours agree exactly along shared edges (no cracks). Unit tests check this over the test map and a stairs/pits grid.
- MapMesh: tiles touching a height change get a 9×9 grid at texel-spaced rim samples, with smooth finite-difference normals. Flat tiles keep one quad. Side faces fill whatever gap lies between two neighbouring edges, textured in step cells counted down from the lip.
- The cursor outline drapes over the rounded surface.
- Verified: 45 unit tests; check.mjs 16/16. Tunables: RIM_WIDTH / RIM_DROP / FOOT_RISE in surface.ts.
- Known look: staircase-shaped banks (diagonal river) read as a row of soft pillows, because every step corner is rounded.

### M2c review (2026-10-24): wider, varied rounding and natural water
- Requested: "make the rounding wider, tune the edges"; "river shades don't have to be one light and one dark per tile; tiles can have several colours so contours look natural"; "rounding doesn't have to be uniform; add variation like the real world".
- Rounding: the width now varies 0.22–0.46 tiles, and the lip/foot balance shifts ±40% (lip + foot always equal one step, so one-step slopes stay seamless). Both come from smooth world-space value noise (`util/noise.ts`). That keeps equal-height neighbours crack-free: they sample the same point.
- Banks: land curves a full step down to lower water (BANK_DROP), so riverbanks meet the waterline with no soil face. The test map's bank distance now counts diagonals, so a staircase bank is one connected strip. This removed the dark creases, which came from h2 tiles touching water at a single corner.
- Water: `water.ts` paints all water as one map-sized image in the atlas. Colour comes from per-pixel distance to the nearest land, plus noise wobble, a 6-shade ramp with Bayer dithering, and depth-tinted ripples and sparkles. Contours now cross tile borders, and most water tiles hold several shades (unit-tested).
- Verified: 51 unit tests; check.mjs 16/16; build clean.
- Note for M3/M4: the generator must also use diagonal-aware bank distance. The flowing-water shader in M4 should keep this depth map as its base colour.

### M2d review (2026-10-24): living ground
- Requested: "each grid doesn't have to follow a specific colour; make grass and rocks blend seamlessly like the river"; "make some elements move in a loop: water moving, small flowers swaying like when the wind blows".
- `ground.ts` paints every tile top into one 512×512 image. A pixel's terrain is looked up at a noise-warped position (up to 0.3 tiles, plus per-pixel jitter), so terrain borders fray and interlock across tiles. Tile centres always keep their own terrain, water keeps its exact shoreline, and land blends only across one-step height changes. Shades come from world-space noise patches plus speckle and dither, not per-tile variants. Details (tufts, stones, tree clumps, cracks) are masked to their own terrain. The per-tile seam lines are gone.
- Water: `water.ts` computes shore distance once and paints 12 frames. The contour noise drifts around a circle and glints twinkle in and out on their own phases, so the loop (2 s at 6 fps) has no jump. MapMesh swaps the ground texture's data per frame; land pixels are identical in every frame.
- Flora: about 1,000 flower (5 species, in drifts) and grass-tuft sprites, only on pixels painted as grass, dense in the meadow. They are upright billboards; a vertex shader leans them with a wind wave travelling across the field, slower gusts and a small per-plant flutter. All periods divide 4 s. One draw call.
- Mesh is now two draw calls: tops (ground texture) and sides (cliff atlas) as material groups. Picking is unchanged.
- Fixed a pre-existing M2b defect: flat tiles were single quads, so their edges had T-junctions against rounded neighbours, which rendered as background-coloured pinholes (about 15 per view). Flat tops are now fans with matching edge vertices: 0 pinholes.
- Verified: 62 unit tests; check.mjs 19/19 (new: flora placed, water frames advance and loop, scene moves); build clean; `scripts/gif.mjs` records a looping GIF for review.

### M2e review (2026-10-25): theme kits and six showcases
- Requested: map variations by category, with a clear split between movable tiles and background art and no clutter that hides the grid. Then, after the 2D sketches: "they do not look as refined as the very first one… I was looking for quality ones". So: one showcase per category, built in the real engine, for review before the other 24.
- **Built ground:** `shape: 'built'` gives flat tops and sharp edges, and natural ground no longer curves up into walls. 16 new terrains and 6 new paving painters run seamlessly across tiles, where paving meets paving in straight joints. There are 8 new cliff faces, including building fronts with windows, street-level shop windows and doors, and lit shopfronts with neon.
- **Liquids:** `liquid.ts` generalises the water painter. Lava has its own ramp, crust plates and an emissive glow; the ground gets a glow image and the cliff atlas a glow atlas.
- **Props:** 28 procedural pixel sprites with shading and selective outlines. `SpriteField` is a generic billboard renderer with wind sway, and Flora now uses it too. Contact shadows are baked into the ground, and glowing props add point lights (12 at most) on dusk and night themes.
- **Backdrop:** a painted panorama (sky bands, ridges with snow, skylines with windows and neon, castles, canopy, volcanoes, plumes) on a full-screen layer drawn before the map. It slides with the orbit and tilt, and an optional overlay drifts over time (clouds, mist, embers).
- **Themes:** chosen with `?map=<id>`; each sets the map builder, lighting, backdrop, focus tile and starting zoom. The default stays the original map (`meadow`), so the existing checks are unchanged. The bank rule (`slopeToLiquids`) moved to `map/build.ts`, works for liquids at any height, and the test map uses it too.
- **Verified:**
  - 108 unit tests. New ones cover every showcase: valid and deterministic, its landmark on the focus tile, every open tile reachable on foot, banks sloped, and tall built structures only on the back edges. Built ground is flat and doesn't make grass curve up into walls; only lava glows, and it animates.
  - check.mjs passes 25/25, with 6 new: each theme loads with props and motion and no errors.
  - Stills and loop GIFs are in `evolution/land/m2e-theme-showcases/`.
- **Waiting on:** the user's review of the six showcases, before the other 24 variations.
- Review round 1 (2026-10-25):
  - Jungle: trees placed by hand in cover pockets with open lanes. A new test checks that over 80% of open tiles on every showcase are free of props.
  - Animation: sprites now support animation frames (`SpriteField` shifts the UV per frame). Animated: brazier and altar flames, lantern candles, the vent, and fountain droplets and ripples. Firelit point lights flicker on periods that divide 4 s, and clouds drift at 2 px/s.
  - Verified: 115 unit tests; check.mjs 25/25.

### M3 review (2026-10-25): world generator
- Requested: "lets continue with M3". The shape varies by seed (valley, island or coast), and maps have terrain only (tall props wait for M5).
- `map/generator.ts` (pure): `generateMap(seed)` gives a 32×32 MapFile.
  - **Seed traits:** each seed picks a shape, a water share, a relief (tallest land 5–7), whether it has snowy peaks, and a drier or wetter climate.
  - **Elevation:** warped fractal noise with ridge crests, bent into the shape and leaning up toward the far corner of the opening view, so tall ground stands behind the board. It is ranked, so the shares hold on every seed.
  - **Water:** the lowest share floods. Lakes under 4 tiles dry out. Water two tiles from shore is deep, and water touching the edge is sea.
  - **Land:** heights 1–8. Lone pillars and pits are eased to one step, then `slopeToLiquids` slopes the banks. Moisture comes from noise, nearness to water and the climate. Cover is picked from height and moisture across the 18 natural terrains.
  - **Clean-up:** one-tile specks merge into their surroundings. Cut-off areas are joined to the main area by opening the shortest route: deep water becomes a ford, a peak becomes a pass.
- `map/mapFile.ts`: `serializeMap` writes one tile per line. `parseMap` checks everything (version, size up to 64, ids, ranges, row order) and throws a message naming the tile and field. Unknown fields are dropped.
- `themes/world.ts`: the Wild Lands theme on `?map=world` / `?seed=N`, with meadow light and scenery. Meadow stays the default.
- main.ts rebuilds the board in place: the old meshes and textures are freed (`render/dispose.ts`) and the camera's pan limit follows the board. `ui/Hud.ts` shows the name and seed, with New map (`R`), Save (`E`, since `S` pans) and Load buttons, plus drag and drop. Capture scripts hide the box.
- Fixed along the way:
  - dried-out puddles got NaN heights, which showed as holes;
  - a pre-existing slow test (water determinism compared 12 frames element by element and timed out) now compares in a loop, so it runs in 0.4 s.
- Follow-up (2026-10-25): the user asked for a map picker. The HUD now has a drop-down of every theme plus Wild Lands; picking one reloads the page on `?map=<id>`. check.mjs adds a test that the picker lists all 8 maps and switches to one, so it now passes 35/35.
- Verified:
  - 386 unit tests. New ones over 50 seeds: deterministic, valid, every natural terrain and shape used, ≥ 65% walkable and all of it reachable, banks sloped, no specks, no pillars, islands ringed by sea, tall ground at the back. Also JSON round trip, hand edits, and 11 kinds of bad file.
  - check.mjs passes 34/34. New: the seed shows and reproduces; R and the button grow new maps without GPU memory growing; edited JSON loads; a bad file is refused and the map kept; the Load picker works.
  - Build is clean.

### M4 review (2026-10-25): rivers, waterfalls and bridges
- Requested: "Okay" to drafting the M4 plan. Decisions: rivers wadeable everywhere, 1–2 per map, stepping down with waterfalls, and flowing water on the themed maps too.
- `map/rivers.ts` (pure):
  - **Drainage:** a priority flood from the outlets (lakes, sea, front edges) gives every tile its next tile downhill, so no river is trapped in a hollow.
  - **Springs:** high ground (heights 3–6), at least 3 tiles from the edge, with a course of at least 10 tiles. A second river starts at least 7 tiles from the first and may join it as a tributary.
  - **Heights:** each river tile sits a step below every bank around it and no higher than the tile upstream; a drop marks a waterfall. Water leaving the board falls off the diorama's side.
  - **Bridges:** one per river, two on rivers of 16+ tiles, at least 5 apart, on straight level stretches between walkable banks one step up. Wood at heights 0–1, stone higher.
- `build.ts` `slopeToLiquids`: a bank now stands one step above the *highest* liquid it touches (it was the lowest). Proven byte-identical for all six themes and the 50 pre-river seeds; with rivers it keeps falls between rocky sides.
- `liquid.ts`: a smoothed per-pixel flow field. Ripples are two copies of the pattern, half a loop apart, sliding downstream and cross-faded, so the loop is seamless. Sparkles ride the current as streaks. Foam churns below falls; surf washes sea shores.
- `waterfall.ts` + a third MapMesh layer: a 16×24 px falling pattern, world-anchored, sliding 2 px a frame.
- `bridges.ts`: textured boxes. Wood: plank deck, posts into the water, rails. Stone: masonry span with an arch and a parapet. Bridges sit in the MapMesh group, so picking hits the deck and disposal frees them.
- `terrain.ts` `tileStats`: a bridge is named, walked at deck height, MOV 1. The tile panel uses it.
- Themes: Meadow's river flows along its curve; the Market canal flows east under two real plank bridges.
- Tests: 543 pass. New:
  - over 50 seeds: rivers run downhill tile to tile and end in water or off a front edge; a waterfall exactly where a river drops; rivers are shallow; banks one step above the highest water; bridges sit on straight stretches between walkable banks; one or two rivers per map;
  - water: sparkles travel downstream in either direction; the loop closes; foam at the foot of a fall and not its top; surf on the sea and not on lakes; the falling pattern slides and wraps.
  - check.mjs passes 38/38. New: hovering a bridge picks it and names it (world and market); waterfalls exist. The memory check now compares the same seed before and after, since maps differ in bridge count.
- Note for M5: rivers sit in shallow gorges and can hide behind tall banks from some angles. Keep reeds and trees low near the water.

### M5 review (2026-10-25): trees, rocks and swamps
- Requested: "lets continue now". Decisions: sparse pockets of cover; trees and rocks are walkable cover with a defence bonus.
- `map/cover.ts` (pure, run last in `generateMap`): each natural ground has a cover kind and a density. Trees grow in clumps (stretched value noise, squared), rocks and snags are scattered. Exclusions: water, bridges and their neighbours, river banks. The 3 front rows are thinned to 35%. A cap of 12.5% of the land keeps the strongest spots. Pine forest at height 5+ gets snowy pines half the time.
- New props: `broadleaf` (oak, poplar, birch) and `snag` (drowned dead tree). New ids were added so the themed maps' variant picks are unchanged. `Gfx.clear` makes gaps in the birch's crown.
- `Flora.ts`: with `wild` (generated maps only), a second random stream adds reeds (wetland, or within 0.3 tiles of a water edge, never on sand), still pebbles (rocky ground) and bushes (light woods). The flowers stay exactly as before.
- `liquid.ts`: murk. Water within 0.6 tiles of marsh, swamp or bog uses a murky green ramp, dithering out by 1.1 tiles. Lakes and rivers only: a first version tinted the sea along marshy coasts and lost the surf line.
- `tileStats` adds the cover's defence and name; the tile panel shows the cover on its own line.
- Tests: 701 pass. New:
  - over 50 seeds: cover only on its own ground; at most 12.5% of the land, over 80% of open tiles clear; nothing on or beside water, bridges or river banks; never blocking; all five kinds appear and every map has at least 15; front rows under 60% of the density elsewhere; trees clump;
  - wild decor adds to the flowers without changing them; reeds, pebbles and bushes only where they belong;
  - murk beside a bog; none on the sea.
  - check.mjs passes 39/39. New: a generated map has cover, and hovering a tree names it in the panel.
- Fix (user feedback, 2026-10-25): snowy pines appeared on maps with no snow. Pines are now snowy only within 2 tiles of a snowfield or peak. A new test over 50 seeds failed with the old rule (seeds 2, 3, 5, 6, 7, 8, 9, 14 and more) and passes now. History images were re-shot.
- Fix after the first commit: the murk also tinted Meadow Vale's river beside its marsh (about five tiles). It is now generated-maps only (`paintGround(map, wild)`), like the reeds and pebbles, so the six themed maps are unchanged.

### M6 review (2026-10-25): villages, castles, ruins and roads
- Requested: "lets go with the next one", plus "document how our progress looks at every stage". Decisions: settlements mix by seed; rooftops walkable; roads to settlements and edges.
- Documentation first, as its own commit (1c2cbd2): `evolution/land/stages.json`, `scripts/timeline.mjs`, `scripts/compare.mjs`, and `r<N>-<topic>/` folders for review rounds. Restored the M5 originals the snowline fix had overwritten. Commit messages now carry a Progress section.
- `map/settlements.ts` (pure):
  - **Kinds:** village 45%, castle 30%, ruins 25%. Half the non-ruins maps add ruins.
  - **Site:** the best-scoring square footprint (6, 7 or 5 tiles) at least 2 from the edge and 4 from water (3, then 2, if nothing fits), with at most 3 steps of relief. Scores favour flat ground and the back of the view (castles most), villages near water and ruins up high. If the wanted kind fits nowhere, a smaller kind is built.
  - **Level:** the footprint is cut to its median height, and two rings around it are eased to within 1 and 2 steps, never touching ground beside water.
- `map/roads.ts`: Dijkstra from the main settlement's gates. Slopes cost 1.5 per step (no more than 2 a tile), rough ground costs more, existing roads 0.4. Roads never enter another footprint except at its gates. River crossings are only straight over one river tile between banks a step up, reusing a bridge (1.5) or building one (6). Roads link to a second settlement and out to the two cheapest board sides. Specks are merged again after roads.
- Art: thatch and clay-tile roof painters; a half-timbered `cottage` wall with a door at street level, windows and an eave in the roof's colours; ramparts and mossy ruined walls; a well sprite. Banners on towers and the keep.
- `generateWorld(seed)` returns the map and its settlements (for tests); `generateMap` is unchanged for callers.
- Tests: 859 pass. New:
  - every map has a settlement, and the wanted kind is built on at least 45 of 50 seeds, with all three kinds appearing;
  - footprints are level and dry, with buildings above the street;
  - rooftops and ramparts are walkable;
  - roads link the settlements, reach an edge, and are never in water;
  - cover is kept off roads and settlements;
  - castles lean to the back.
  - The terrain, speck and pillar tests now know the settled ground; the cover tests count only cover props.
  - check.mjs passes 40/40. New: hovering a village rooftop picks it and the panel names it.

### M7 review (2026-10-25): weather
- Requested: "let's continue on to the next step". Decisions: all five weathers; by seed plus a picker; wet and snowy ground.
- `render/weather.ts` (pure):
  - `LOOKS` per weather (rain, snow, mist, haze, wind, wet, snow cover, lightning, sky and sun multipliers, tint), with `blendLooks` and smoothstep easing (2.5 s; snow settles over 8 s);
  - `lightningAt` gives a double flash once per 4 s loop;
  - `weatherForMap`: snow only where there is snow, more rain on wet land, about half clear;
  - `loopSpeed` makes falls loop in 4 s.
- `render/WeatherLayer.ts`:
  - rain: line segments, density scaled to board area, slanted by wind;
  - snow: points, each flake in its own 5.5-unit band so it can fall slowly and still loop;
  - splashes and water rings: points at board surface spots, half-second cycle;
  - fog: three mist layers just above steps 1 to 3, tileable noise cross-faded for a seamless drift, in three flat steps of opacity, fading at the board edge;
  - light: hemisphere and sun dimmed and tinted, whitened and brightened by lightning; rain and snow dim on dusk and night themes.
- `Backdrop.setWeather`: tint, haze toward the fog colour, and lightning.
- `MapMesh.setWeather`:
  - liquid pixels carry alpha 250 (`LIQUID_ALPHA`) in the ground image as a mask;
  - wet land and cliff faces darken and cool;
  - snow settles per ground pixel (fine hash plus coarse drift hash against the cover) on upward-facing tops.
- `SpriteField`: `uWind` (sway strength) and `uBury` (snow hides flowers and grass by phase).
- HUD: a weather picker (the map's own, or any of the five), kept in the URL as `weather=`.
- Fixed before shipping:
  - a mist dot grid;
  - flowers showing through snow;
  - night rain too bright and too dense on the small market board;
  - lightning too weak;
  - snow falling too fast;
  - `Weather.ts` overwriting `weather.ts` (case clash; renamed to `WeatherLayer.ts`, lesson recorded).
- Tests: 865 pass. New: looks, blending, easing, lightning loop, loop speeds, and seed weather (deterministic, every kind appears, mostly clear, snow only with snow). The ground alpha test now checks the liquid mask.
- check.mjs passes 48/48. New:
  - each weather draws and changes the picture;
  - a storm flashes;
  - the weather picker switches and keeps the URL;
  - changing maps in the rain frees the old weather;
  - no console errors.
  - The map picker check now reads only the first picker.
- Round 1 (user review, 2026-10-25): "the water droplets… hinders the view", "no flat white grid everywhere… introduce variations in the snow", "introduce water puddles on some grids randomly".
  - Rain: drops halved (rain 0.28, storm 0.55), 0.38 long, 42% opaque; splashes 50% opaque.
  - Puddles in the ground shader: about a quarter of the flat, non-roof tiles each get a blob with its own centre, radius (0.16 to 0.42, growing with wetness) and noise-wobbled edge, with blue-grey water, glints and a far rim. Roof pixels are marked with `ROOF_ALPHA` 252 in the ground image.
  - Snow: two-octave drift noise against cover × 0.72, so there are bare patches and a dusted edge; three tones from finer noise for lumps; snow-mound sprites (lump, drift, heap) revealed as the cover deepens.
  - Tests: 865 pass (storm rain capped at 0.6; roof alpha in the ground test). check.mjs 48/48. Before/after pictures in `evolution/land/m7-weather/r1-subtle-rain-snow-puddles/`.
- Round 2 (user review, 2026-10-25): "puddles are too many, reduce them by about 30%", "trees… do not have snow on their roof… so that we can be consistent".
  - Puddle chance went from 0.25 to 0.175 per flat tile.
  - `SpriteField` snow caps: `uSnowCap` and `uTexel`. For each pixel the shader counts the opaque rows above it to the sprite's top edge; a cap fills rows up to a depth of floor(cover × (2.6 + 2 × wave)), where the wave rolls across columns. Bright top, plain middle, blue underside. `PropLayer.setSnow` is driven by the weather's snow cover.
  - Tests: 865 pass; check.mjs 48/48. Before/after pictures in `evolution/land/m7-weather/r2-fewer-puddles-snowy-trees/`.

### M8 review (2026-10-25): day and night
- Requested: after M7 round 2, "go with day and night now… introduce dawn and dusk as well… subtle shadow effects coming from higher elevation objects… allow the option to choose the day time".
- `render/daytime.ts` (pure):
  - `dayAt(hour)` blends keyframes (night, dawn 6.5, morning 9, noon 12.5, afternoon 16, dusk 18.4, twilight 19.8, full night from 22): sun and sky strength, sun colour, sky tint, scenery tint, night amount and shadow strength;
  - `lightDirection` moves the sun from the right of the view (sunrise 5.6) to the left (sunset 19.2), peaking at 62° and leaning left at noon; the moon hangs at 40° by night;
  - `easeHour` runs forward through the hours between;
  - `DayClock` handles fixed times, the cycle (24 h in 120 s), the map's own light, and a pinned hour for captures.
- `render/LightRig.ts`: one place sets the lights, theme × day × weather. It moves the sun, sets shadow strength (sun 0.85, sky 0.32, × day × weather sun), tints the backdrop, adds stars on clear nights, and returns night and fog colour. WeatherLayer no longer touches the lights; it exposes `look` and `flash` and takes `setLight` for rain, snow and mist colours.
- Shadows: `BasicShadowMap` (crisp), 2048 map fitted to the board. MapMesh and bridges cast and receive; sprites receive. `render/skyShadow.ts` lets the shadow dim the hemisphere light too (tops, sides, sprites), so low-sun shadows show.
- Night and ambience:
  - cottage windows have glow pixels in the side atlas (a `Put` can now glow a different colour from what it draws), scaled by `MapMesh.setNightGlow`;
  - `render/AmbienceLayer.ts`: fireflies (points, a blinking 2 s beat, hidden in rain, snow and fog), chimney stacks on 60% of cottages, and smoke puffs that rise, swell and drift in two flat alpha steps;
  - cloud shadows in the ground shader (slow drift, not looped).
- HUD: a third picker for the time, kept in the URL as `time=`; map switches keep the weather and time.
- Themed maps keep their designed light by default and now get subtle shadows from their own sun.
- Tests: 871 pass. New `daytime.test.ts`: loops and smooth blending, bright day and dark night, warm dawn and dusk (dusk warmer, moon cold), sun up by day and moon by night, long dawn and dusk shadows, forward easing, and the clock. The ground determinism test now compares in a loop (it timed out under a full run).
- check.mjs passes 56/56. New:
  - shadows on by day;
  - dawn, dusk and night draw and differ;
  - night is dark, with fainter shadows and fireflies;
  - the cycle moves the sun;
  - the time picker switches and keeps the URL;
  - no errors.

- Approved 2026-10-25 ("looks good"). Next: M9, performance on large maps.

### M9 review (2026-10-26): big boards and fast loading
- Decisions:
  - (user) Boards up to 64×64; the RTX 4060 laptop sets the bar; no visible change.
  - (user, after seeing a sparse 64×64 board) Scale settlements and rivers with the board.
- The baseline overturned the plan. Drawing was not the cost: 64×64 ran at 240 fps capped and about 3,000 uncapped, with 0 frames over 16.7 ms. Building the board took 2.3 s. Instancing, chunking and culling were not done, because nothing in the profile pointed at them.
- `surface.ts`: `tileSurface(map, tile)` scans the neighbours once per tile into foot/lip/bank masks, and liquid/built are Set lookups. `surfaceAt` is unchanged for callers. `surface.reference.test.ts` keeps the pre-M9 code and proves bit-identical output across 13 maps.
- `ground.ts`:
  - split into `paintLand`, `paintLiquids(map, wild, frames)` and `composeGround`;
  - `paintGround` is the three together, so its output is unchanged;
  - `TILE_PX` moved to `types.ts` (re-exported from textures), so workers don't load three.js.
- `GroundPainter` + `ground.worker.ts`:
  - one worker paints the land and 1–3 share the 12 liquid frames; `composeGround` joins the parts;
  - `ready` resolves once the workers have loaded;
  - falls back to the main thread when workers are missing or crash.
- `MapMesh`: `buildColumns(map)` builds the geometry without the ground image, so it runs while the workers paint; `new MapMesh(map, ground, shape)`.
- `main.ts`:
  - boards build asynchronously (`prepareBoard` → `buildBoard`);
  - when maps are asked for in quick succession, the latest wins and older ones are freed;
  - it awaits `painter.ready`, posts the jobs, yields once (Chrome holds the last job until then), then builds the columns;
  - `board-ready` performance mark.
- Size:
  - `?size=N` (16–64);
  - a Board picker (32/48/64) on Wild Lands that regrows the same seed in place;
  - R and map switches keep the size.
- Generator: rivers × width/32, plus round((size/32)²) − 1 extra settlements (village 50%, ruins 35%, castle 15%), each at least 0.2 × the width from the others. A 32×32 board is unchanged: a fingerprint of 60 seeds is pinned in `generatorScale.test.ts`.
- Results (interleaved A/B):
  - load 784 → 431 ms at 32×32, 2152 → 919 ms at 64×64;
  - heap at 64×64 down from about 210 to about 130 MB;
  - 0 frames over 16.7 ms;
  - 895 tests and check.mjs 62/62 pass.
  - Details are in `tasks/perf_log.md`.
- Known:
  - zoom stays 0.5–3, so a 64×64 board is explored by panning; further out, the pixel art would shimmer;
  - `?size` is capped at 64, the agreed size.
- Approved 2026-10-26. All land milestones (M0–M9) are done.

## Map phase, part 2 (decided 2026-10-26)
The user asked for the four deferred items before units and battles. Order: tech first, so the new themes benefit, then the themes.

- [x] **M10: Tech pass.** Each change is measured against a baseline and must keep today's captures pixel-identical, except where noted.
  - [x] M10a column build on a worker: a three.js-free atlas layout, so `buildColumns` can run off the main thread next to the ground workers. Target: 64×64 load ≤ 0.7 s (from 0.92 s); 32×32 doesn't regress.
  - [x] M10b zoom-out without shimmer: crisp pixel-art mipmaps (nearest level, box-filtered, padded atlases so cells don't bleed), used only below zoom ~0.7. The minimum zoom scales with the board, so a 64×64 board fits on screen. Views at zoom ≥ 0.7 stay pixel-identical, including every opening view.
    - Done with supersampling instead of mipmaps. Mipmaps change today's tilted views even at zoom 1, because the GPU picks the level from the foreshortened axis. Below zoom 0.5 the frame is drawn at up to 4×4 samples per pixel (half-float, linear light) and averaged; at 0.5 and above it is drawn as before. `pixelScale` keeps points and the backdrop the same size. Rain lines (1 px in WebGL) look fainter when supersampled; only 48/64 boards zoom out that far.
    - Cost: on the RTX, none (240 fps). On the Intel UHD at full zoom-out in a night storm, 61 fps against 149 without: that is for M10c to fix.
  - [x] M10c GPU headroom at 64×64 (user: "headroom at 64 only"; the cap stays 64). Target: double the Intel UHD frame rate at 64×64, measured uncapped by GPU time per frame. Candidates in profile order: re-render the shadow map only when the light moves, then chunked meshes with frustum culling.
  - Approved 2026-10-26 ("it looks good").
  - M10c done: the shadow map is redrawn only when the sun or board changes; one texture per water frame (no re-uploads); zoomed-out samples rounded (3×3 at 0.31). Intel GPU ms at 64×64: 5.6 → 2.4 at default zoom (2.4×), 14.4 → 7.2 fully zoomed out. Chunked culling not needed. Details are in perf_log.md.
- [ ] **M11–M16: 24 more themes**, one category per milestone, each 20×20 and handmade like the M2e showcases, reviewed with screenshots before the next batch. Battle-map rules apply (lessons.md): open lanes, cover in pockets, the grid readable, no clutter over tiles.
  - [x] M11 Wilds: Autumn Ridge, Desert Mesa Oasis, Frozen Lake, Highland Moor (approved 2026-10-26: "looks good, no changes")
  - [x] M12 Kingdom: Harbour Town, Royal Gardens, Bridge Gatehouse, Village Fair (approved 2026-10-26: "go with M13")
  - [x] M13 Modern Town: Station Square, Suburban Park, Canal Quarter, High Street (in review)
    - Station Square: rail tracks along the back, raised platforms, the station building, a taxi rank and bus shelter; landmark a preserved steam engine on a plinth in the square. New: `rail` terrain (ballast and sleepers), locomotive, bus_shelter, bike_rack, buffer_stop, station_clock.
    - Suburban Park: houses with gardens behind hedges, a cul-de-sac, a park with a pond and paths; landmark a playground (slide and swings). New: `house_brick` (red-brick `villa` walls, slate roof), `bark`, playground, picnic_table, washing_line, ducks.
    - Canal Quarter: a canal in two pounds joined by a lock, towpaths, brick warehouses and a footbridge; landmark a mill chimney. New: lock_gate (floats), bollard, mill_chimney (narrowboats removed in review).
    - High Street: shopfronts with awnings along the back, a crossing, a bus stop; landmark the town clock tower. New: `shop_building` and `shop_brick` (a `shop` face: fascia, striped awning, display window and door), `zebra` crossing, phone_box, post_box, belisha, cafe_table ×2, clock_tower.
  - [x] M14 Neon City: Highway Overpass, Rooftop Arcade, Container Port, Shrine Steps (in review; the user asked for M14-M16 back to back overnight, to vet in the morning)
    - Highway Overpass: a three-lane expressway on a concrete embankment across the board, a ramp and steps up to it, night streets either side; landmark a noodle-bar billboard. New: `highway` (lanes painter, `retaining` face), billboard, sign_gantry, jersey_barrier, traffic_cone, highway_lamp.
    - Rooftop Arcade: the board is a rooftop, with towers around it; arcade cabinets and a claw machine, a rooftop pool, a turf lounge under string lights, plant rooms; landmark a big neon ARCADE sign. New: `roof_deck`, `roof_plant`, `turf`, neon_sign, arcade_cabinet ×2, claw_machine, water_tank, ac_unit, string_lights.
    - Container Port: stacked shipping containers as walkable terrain, a quay, and a container ship along the back edge at full size, as terrain (no miniature vehicles; see lessons.md); a gangway tower aboard; landmark a ship-to-shore gantry crane. New: `container` (`containers` painter, `container` face), `ship_deck` (`deckplate` painter, `hull` face), gantry_crane, floodlight.
    - Shrine Steps: stone steps climbing to a shrine above the city, a run of vermilion torii gates, stone lanterns, cherry trees; landmark the shrine hall. New: `moss`, torii, stone_lantern, sakura ×2, shrine.
  - [ ] M15 Ruins: Desert Pyramid, Sunken Temple, Overgrown Colosseum, Stone Circle
  - [ ] M16 Elemental: Crystal Cavern, Glacier Rift, Sky Isles, Toxic Bog

## Deferred (map phase)
Not needed for the agreed bar; pick up if circumstances change.
- **Theme variations:** 24 of the 30 proposed map themes are not built (M2e built one showcase per category: Alpine Pass, Castle Courtyard, Fountain Plaza, Night Market Alley, Jungle Temple, Volcanic Caldera).
- **Drawing on weaker GPUs or boards past 64×64:** chunked meshes with frustum culling, and a cheaper shadow pass (the mesh is ~99% of triangles and is drawn twice). On the Intel UHD iGPU: 155 fps at 64, 69 at 128 (M9 baseline).
- **Texel shimmer when zoomed out** (no mipmaps, noted in M1). It is also why zoom stops at 0.5, so a 64×64 board can't be seen whole.
- **Load:** the column build is now the critical path (~370 ms at 64). It could move to a worker once the atlas layout is free of three.js.

### M11 review (2026-10-26): four Wilds maps
- Built one at a time; each was committed and pushed, and its pictures were sent:
  - Autumn Ridge (a2bcd49);
  - Desert Mesa Oasis (47641fc);
  - Frozen Lake (ec5f7ba);
  - Highland Moor (1927aff).
- New terrains: autumn_grass (`leaves` painter), red_rock, oasis_grass, ice (`ice` painter, `ice` cliff face), heather (`heather` painter), moor_grass, drystone (built, walkable).
- New props: autumn_tree ×3, great_maple, palm ×2, cactus ×2, stone_arch, ice_hut, snow_rock ×2, bothy, sheep ×2, gorse ×2.
- New backdrop shape: `Panorama.mesas`.
- Infrastructure:
  - the cliff atlas reserves 128 terrain and 32 material rows;
  - the sprite sheet is 512×1024, packed in PROP_IDS order, with 5 clear rows above each shelf;
  - adding art no longer moves existing texels.
- Bugs fixed:
  - cliff faces' v is clamped to their cell (columns.test.ts; strays existed on 9 of 11 maps);
  - snow caps no longer read the sprite above.
- Harness:
  - identity captures wait for `liquidReady`;
  - the 64×64 tests get 30 s;
  - check.mjs counts the themes.
- One check.mjs run had a single unexplained failure; the next five runs passed in full. Watch for it.
- Tests: 951; check.mjs 66/66; 30 captures in the identity set.

### M12 review (2026-10-26): four Kingdom maps
- Commits:
  - Harbour Town (d2626db);
  - Royal Gardens (13df780);
  - Bridge Gatehouse (04c058a);
  - Village Fair (83d3c51).
- New terrains: gravel (`gravel` painter), lawn (`lawn`, mown stripes), hedge (built, `hedge` painter and cliff face, moveCost 3, +20 defence), flowerbed.
- New props: boat ×2 (floats), lighthouse, net_rack, gazebo, topiary ×2, statue ×2, gatehouse (walkable cover), maypole, fair_tent ×3, bunting. PropDef.floats lets a prop sit on water; the theme test enforces it.
- Atlas: cliff cells are inset 0.02 texel at top and bottom, on top of the M11 clamp. Rows are now fully independent (proven by removing rows: 0 px change). A one-time shift of scattered single texels came with it, so the baseline was re-saved.
- check.mjs: the file-load check waits up to 20 s for the loaded board (async since M9). That was the intermittent failure seen in M11.
- Heavy tests in BoardWorkers.test.ts get 30 s.
- Tests: 983; check.mjs 70/70; 38 captures in the identity set.

### M13 review (2026-10-26): four Modern Town maps
- Commits:
  - Station Square (efe5091);
  - Suburban Park (31cfde0);
  - Canal Quarter (c25698d);
  - High Street (6c5c6ea).
- New terrains: rail (`rails` painter), house_brick (`villa` face), bark, shop_building and shop_brick (`shop` face), zebra (`zebra` painter).
- New props: locomotive, bus_shelter, bike_rack, buffer_stop, station_clock, playground, picnic_table, washing_line, ducks (floats), lock_gate (floats), bollard, mill_chimney, clock_tower, phone_box, post_box, belisha (glows), cafe_table ×2.
- Fix: `Panorama.rooftops` drew its gables upside down. Village Fair's backdrop band changed (rows 388-442 of the capture), nothing else.
- check.mjs: the size-picker and R checks wait up to 30 s for a 48×48 board (10 s timed out once on a busy machine).
- Tooling: tasks/perf/sheet.mjs builds the four-map sheet.
- Tests: 1017; check.mjs 74/74; 46 captures in the identity set.
- Round 1 (user: "remove the ships… ships are supposed to be way bigger"): the narrowboats are gone from Canal Quarter, and the sprite with them. Lesson in lessons.md. The clock tower's random brick courses changed slightly, because its sprite seed follows its place in PROP_IDS.

### M14 review (2026-10-27): four Neon City maps
- Commits:
  - Highway Overpass (7d37bba);
  - Rooftop Arcade (0d9fa41);
  - Container Port (9e48bc3);
  - Shrine Steps (72497ea).
- New terrains: highway (`lanes` painter, `retaining` face), roof_deck (`roofing` painter), roof_plant, turf, container (`containers` painter, `container` face), ship_deck (`deckplate` painter, `hull` face), moss.
- New props: billboard, sign_gantry, jersey_barrier, traffic_cone, highway_lamp, neon_sign, arcade_cabinet ×2, claw_machine, water_tank, ac_unit, string_lights, gantry_crane, floodlight, torii, stone_lantern, sakura ×2, shrine.
- Scale (lessons.md, after the Canal Quarter review): the container ship is terrain at full size, and the shrine hall was redrawn to dwarf the torii.
- Tests: 1052; check.mjs 78/78; 54 captures in the identity set.
