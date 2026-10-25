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
- [ ] **M6: Settlements and roads.** Villages, castle, roads connecting them, bridges where roads cross rivers, ruins and landmarks.
- [ ] **M7: Weather.** Rain first (particles, splashes, darker lighting), then storm, snow, fog, wind.
- [ ] **M8: Day/night and ambience.** Light cycle, cloud shadows, swaying foliage, fireflies, chimney smoke.
- [ ] **M9: Large-map performance.** Instancing/chunking and culling, holding 60 fps on the full map.

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

