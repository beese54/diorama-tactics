# Visual history

This folder shows how the game's look has improved over time, one version after another. Each part of the game has its own folder:

| Folder | What it covers | Status |
|---|---|---|
| [land/](#land) | The world map terrain | M0 to M8 done |
| [characters/](characters/README.md) | Unit sprites and animation | not started |
| [battles/](battles/README.md) | Battle scenes | not started |

**How the pictures are made.** Every version is rendered from its own git commit, using the same camera views each time, so the pictures can be compared side by side. The script is `scripts/snapshot.mjs`. Animated versions also get a GIF from `scripts/gif.mjs`.

**Every stage is kept, not only the milestones.** Review rounds and fixes are stages too:
- [land/stages.json](land/stages.json) lists every stage in order, with its commit, date, picture and the feedback behind it.
- `scripts/timeline.mjs` turns that list into the timeline GIF below.
- A shipped picture is never overwritten. A review round goes in its milestone's `r<N>-<topic>/` folder, with a before/after picture from `scripts/compare.mjs`.
- Each visual commit's message has a **Progress** section that names the stage, what now looks different, and the pictures added. `git log` reads as a running diary.

Each version records three things: what changed, the feedback that caused the change, and what I learned. The rules I took from each correction are in [tasks/lessons.md](../tasks/lessons.md).

---

## Land

![Timeline of every land version](land/timeline.gif)

**From the first map to now**

![M1 vs M2d](land/comparisons/overview-m1-vs-m2d.png)

### M0: Scaffold
![M0](land/m0-scaffold/overview.png)

- **What changed:** an empty three.js scene that draws to a small 480×270 image and scales it up by a whole number. This gives crisp pixel art at any screen size. Three stepped test blocks are drawn with procedural grass and earth.
- **Learned:** settle the pixel pipeline first. Every later picture depends on 1 texture pixel = 1 screen pixel.

### M1: Flat terrain grid
![M1](land/m1-flat-grid/overview.png)

- **What changed:**
  - a 32×32 map with 22 terrain types, every texture painted in code;
  - a free orbit camera;
  - a tile cursor and info panel in the style of Final Fantasy Tactics.
- **Feedback:** *"It looks too flat, include some elevations based on the attributes of the terrain."*
- **Learned:** in a visual project, the first thing shown must already have the defining look. Here that was height. I had split the milestones by engineering layer, so elevation was pushed to the next milestone.

### M2: Stepped elevation
![M2](land/m2-elevation/overview.png)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2-elevation/close-river.png) | ![](land/m2-elevation/close-forest.png) | ![](land/m2-elevation/close-mountain.png) |

- **What changed:**
  - each terrain type sets the tile height, so mountains rise and river banks slope down to the water;
  - cliff faces show the right rock layers for the ground they belong to.
- **Feedback:** the edges were too sharp and should be rounded.
- **Learned:** blocky steps read as a toy. Real ground has soft shoulders.

### M2b: Rounded edges
![M2b](land/m2b-rounded-edges/overview.png)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2b-rounded-edges/close-river.png) | ![](land/m2b-rounded-edges/close-forest.png) | ![](land/m2b-rounded-edges/close-mountain.png) |

- **What changed:** cliff tops curve down and cliff bottoms curve up. A one-step drop becomes one smooth slope, and there are no cracks between tiles.
- **Feedback:**
  - *"Make the rounding wider. Tune the edges."*
  - The rounding should vary naturally instead of being the same everywhere.
  - The river was shaded per tile and looked unnatural.
- **Learned:** anything meant to look natural should vary smoothly across the world, not repeat tile by tile. The tile grid is for gameplay, not for how nature is drawn.

### M2c: Natural shapes and painted water
![M2c](land/m2c-natural-shapes-painted-water/overview.png)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2c-natural-shapes-painted-water/close-river.png) | ![](land/m2c-natural-shapes-painted-water/close-forest.png) | ![](land/m2c-natural-shapes-painted-water/close-mountain.png) |

- **What changed:**
  - the rounding is wider and changes smoothly across the map;
  - banks curve all the way down to the waterline;
  - water is painted pixel by pixel based on distance from the shore, so its shades flow across tile borders.
- **Feedback:** *"Make the grasses and rocks blend seamlessly, similar to how we did it for the river… make some elements movable in a loop."*
- **Learned:** when a correction applies to one feature (here, the water), apply it to every feature like it (the land too) in the same pass.

### M2d: Blended ground and motion
![M2d](land/m2d-blended-ground-and-motion/overview.png)

![Water ripples and flowers sway in a 4-second loop](land/m2d-blended-ground-and-motion/meadow-river.gif)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2d-blended-ground-and-motion/close-river.png) | ![](land/m2d-blended-ground-and-motion/close-forest.png) | ![](land/m2d-blended-ground-and-motion/close-mountain.png) |

- **What changed:**
  - the whole map's ground is painted as one image, so grass, rock and fields fray into each other across tiles;
  - the water loops every 2 seconds, with drifting shades and twinkling glints;
  - about 1,000 flowers and grass tufts sway in a wind that travels across the map;
  - fixed pinholes, single background pixels showing through where flat tiles met rounded ones.
- **Learned:** look closely at screenshots for background-coloured specks. Mesh pieces built at different detail levels must share their edge points.

### M2e: Theme showcases
Six new maps, one per category, rendered with the same engine as M2d. Each shows a still overview and a 4-second loop. The `m2e-theme-showcases/` folder also has a close-up of each map's landmark and a view from the far side.

| Alpine Pass (Wilds) | Castle Courtyard (Kingdom) |
|---|---|
| ![](land/m2e-theme-showcases/alpine/overview.png) | ![](land/m2e-theme-showcases/courtyard/overview.png) |
| ![](land/m2e-theme-showcases/alpine/loop.gif) | ![](land/m2e-theme-showcases/courtyard/loop.gif) |

| Fountain Plaza (Modern Town) | Night Market Alley (Neon City) |
|---|---|
| ![](land/m2e-theme-showcases/plaza/overview.png) | ![](land/m2e-theme-showcases/market/overview.png) |
| ![](land/m2e-theme-showcases/plaza/loop.gif) | ![](land/m2e-theme-showcases/market/loop.gif) |

| Jungle Temple (Ancient Ruins) | Volcanic Caldera (Elemental) |
|---|---|
| ![](land/m2e-theme-showcases/jungle/overview.png) | ![](land/m2e-theme-showcases/volcano/overview.png) |
| ![](land/m2e-theme-showcases/jungle/loop.gif) | ![](land/m2e-theme-showcases/volcano/loop.gif) |

- **What changed:**
  - **Built ground:** walls, buildings and paving keep sharp edges and flat tops, while natural ground stays rounded.
  - **New ground and wall textures:** flagstones, cobbles, temple blocks, paving slabs, asphalt and planks. Building fronts have windows and shop fronts at street level, with lit windows and neon at night.
  - **Lava:** a second animated liquid, which glows.
  - **Props:** pixel-art trees, crates, stalls, lamps and landmarks, each with a contact shadow. Lamps and fires light the ground around them.
  - **Painted backdrop:** scenery behind the board that turns with the camera.
- **Second pass, after review:**
  - *"For jungle there are too many trees… too many trees hinder the movement. Strategise where to place the trees sparingly."* About 70 random trees became 11 placed by hand: cover pockets on the back edges and beside the stream. The temple's stair lanes and the walkway around it stay open. The dense first version is kept in `jungle-v1-dense/`.
  - *"I want the flames to flicker, water fountain to move and clouds too, clouds can be slower."* Flames, lanterns and the vent now animate, and their light flickers with them. Droplets run down the fountain's arcs and ripples cross its basin. Clouds drift at half the speed. See `courtyard/wide-clouds.gif` and `plaza/fountain.gif`.
- **Feedback:** the first proposal was 30 ideas drawn as simple 2D sketches. *"They do not look as refined as the very first one we did… I was looking for quality ones just like the very first one."*
- **Learned:**
  - Never show a proposal below the quality already reached.
  - Render a few options in the real engine rather than many cheap mock-ups.
  - Keep tall things on the back edges and neon off the tiles, so the board stays readable in every theme.

### M3: World generator
![Twelve generated seeds](land/m3-world-generator/twelve-seeds.png)

| Valley (seed 7) | Island (seed 5) | Coast (seed 10) |
|---|---|---|
| ![](land/m3-world-generator/whole-valley-7.png) | ![](land/m3-world-generator/whole-island-5.png) | ![](land/m3-world-generator/whole-coast-10.png) |

![Seed 7 in motion](land/m3-world-generator/loop-7.gif)

- **What changed:**
  - Any seed grows a new 32×32 map, shaped as an inland valley, an island or a coast. The same seed always gives the same map.
  - Elevation is warped noise, ranked so every map has lowland, hills and ridges. Tall ground leans toward the back of the opening view, so it doesn't hide the board.
  - Land cover comes from height and moisture. Moisture is higher near water and shifts with each seed's climate.
  - Clean-up keeps the board readable and playable. One-tile specks merge into their surroundings, and lone pillars are eased. Cut-off ground is joined by a ford or a pass, so every open tile can be reached.
  - Maps save as JSON with one tile per line, ready to edit by hand, and load back with checks. **New map**, **Save** and **Load** buttons sit in a box in the top-left corner (`R`, `E`, or drop a file).

  ![The menu box](land/m3-world-generator/menu.png)
- **Round 1:** *"Is there any way for me to see other categories like the volcano, the cyberpunk…?"* A map picker in the menu box now switches between every map.

  ![Map picker](land/m3-world-generator/r1-map-picker/picker.png)
- **Decisions:** *"Mix by seed"* for the board's shape. *"Terrain only"* until M5 brings cover props, following the sparse cover rule from the jungle.
- **Learned:**
  - Ranking the noise turns every threshold into a share of the board, so no seed comes out all water or all mountain.
  - Clean-up passes matter as much as the noise does. A generator's rough edges (specks, pillars, cut-off pockets) are what make a map look machine-made or unplayable.

### M4: Rivers, waterfalls and bridges
![Four generated seeds with rivers](land/m4-water/four-seeds.png)

| A cascade (seed 7) | Off the board's edge (seed 14) |
|---|---|
| ![](land/m4-water/cascade-7.png) | ![](land/m4-water/edge-fall-14.png) |
| ![](land/m4-water/falls-7.gif) | ![](land/m4-water/edge-fall-14.gif) |

| Wooden bridge (seed 7) | Stone bridge (seed 39) |
|---|---|
| ![](land/m4-water/bridge-wood-7.png) | ![](land/m4-water/bridge-stone-39.png) |

| Surf on the coast (seed 9) | Meadow's river | Market canal |
|---|---|---|
| ![](land/m4-water/surf-9.gif) | ![](land/m4-water/river-meadow.gif) | ![](land/m4-water/canal-market.png) |

- **What changed:**
  - Every generated map gets one or two rivers. Each starts at a spring in the hills and follows the land down to a lake, the sea or the front edge of the board, where it pours over the side.
  - A river sits one step below its banks and only ever drops along its course. Each drop is a waterfall: a falling sheet on the cliff face with white foam where it lands.
  - River water runs: ripples and sparkles travel downstream, following the bends. Sea shores get a line of surf that washes in and out.
  - Bridges cross each river (two on long ones): wooden plank bridges on posts in the lowlands, stone arches in the hills. A unit on a bridge stands at deck height and moves at full speed.
  - Meadow Vale's river now flows, and the Night Market's plank walkways became real bridges over a running canal.
- **Decisions:** rivers are wadeable everywhere, so they slow units but never block them; one or two per map; they step down with waterfalls; the themed maps get flowing water too.
- **Learned:**
  - Draining the land from its outlets upward (lowest first) gives every spring a downhill route, so rivers never get stuck in a hollow.
  - Banks stand one step above the *highest* water they touch, so falls run between rocky sides instead of spilling over their banks.
  - A seamless flowing loop needs two copies of the pattern, half a loop apart, each fading out before it jumps back.

### M5: Trees, rocks and swamps
![Four generated seeds with cover](land/m5-cover/four-seeds.png)

| Woods (seed 7) | Swamp (seed 13) | Rocks (seed 9) |
|---|---|---|
| ![](land/m5-cover/forest-7.png) | ![](land/m5-cover/swamp-13.png) | ![](land/m5-cover/rocks-9.png) |

![Trees swaying (seed 7)](land/m5-cover/forest-7.gif)

![The tile panel names the cover and counts its defence](land/m5-cover/tile-panel.png)

- **What changed:**
  - Generated maps grow cover: broadleaf trees (oak, poplar and birch shapes) in the woods, pines in pine forest and snowy pines at the snowline, boulders on hills, scree, mountains and badlands, and drowned dead trees in swamps and bogs.
  - Trees grow in clumps with open ground between them. At most an eighth of the land carries cover, the front rows are thinner, and water, bridges, the tiles beside them and river banks stay clear.
  - Cover never blocks a tile. It adds its defence bonus, and the tile panel names it.
  - Low decor that is never cover: reeds in marshes and along the water's edge, pebbles on rocky ground, small bushes in light woods.
  - Lakes and rivers beside marsh, swamp and bog turn murky green; the open sea keeps its clean surf.
- **Decisions:** *"Sparse pockets"* of cover, and trees and rocks as *"Cover, walkable"*. The six themed maps stay as designed.
- **Learned:**
  - Capping cover by share of the land, and letting the strongest spots win, keeps every seed readable however the noise falls.
  - A tint that dithers over a wide band reads as grain. A short, sharp fade looks like a colour change in the water.
  - Snow on trees has to follow snow on the map, not height alone.
- **Round 1 (snowline):** *"Some trees have snow… it is not a snow environment."* Pine forest at height 5 or more got snow even on maps with no snowfield or peak. Now pines carry snow only within two tiles of snow. The after pictures are in `m5-cover/r1-snowline/`.

  ![Seed 9 before and after](land/m5-cover/r1-snowline/seed-9-before-after.png)

### M6: Villages, castles, ruins and roads
![Four generated seeds with settlements](land/m6-settlements/four-seeds.png)

![Seed 7, M5 and M6](land/m6-settlements/seed-7-m5-vs-m6.png)

| Village (seed 19) | Castle (seed 7) | Ruins (seed 9) |
|---|---|---|
| ![](land/m6-settlements/village-19.png) | ![](land/m6-settlements/castle-7.png) | ![](land/m6-settlements/ruins-9.png) |

![Banners on the castle (seed 7)](land/m6-settlements/castle-7.gif)

- **What changed:**
  - Each generated map is built around a settlement, picked by seed:
    - a **village:** half-timbered cottages with thatched or tiled roofs around two crossing streets, a well, gardens with haystacks, and fields outside;
    - a **castle:** a walled square with corner towers, banners, a gate facing the middle of the board, a keep at the back and a flagstone yard;
    - **ruins:** mossy wall stubs and broken pillars on high ground.
  - Half the maps that aren't ruins also have ruins nearby.
  - Sites are chosen on the flattest dry ground, away from water. Castles lean to the back of the view, where their walls hide the least. The footprint is cut level and the ground around it eased to meet it.
  - Roads follow the gentlest route between settlements and out to the two nearest board edges. They cross rivers straight over a bridge, reusing one if it's there.
  - Rooftops, ramparts and ruined walls can be stood on, FFT style. The tile panel names them.
- **Decisions:** *"Mix by seed"* for the settlement, *"Walkable rooftops"*, and roads to *"Settlements and edges"*.
- **Learned:**
  - Levelling ground for a building must leave anything touching water alone, or the banks stop meeting the waterline. A test caught a beach raised beside a castle.
  - A large footprint doesn't fit every map. A rugged island had no room for a castle, so the generator falls back to a smaller settlement.

### M7: Weather
![Seed 7 in each weather: clear, rain, storm; lightning, snow, fog](land/m7-weather/six-weathers.png)

| Rain | Storm |
|---|---|
| ![](land/m7-weather/rain-7.gif) | ![](land/m7-weather/storm-7.gif) |

| Snow | Fog |
|---|---|
| ![](land/m7-weather/snow-7.gif) | ![](land/m7-weather/fog-7.gif) |

| Rain on the Night Market | The weather picker |
|---|---|
| ![](land/m7-weather/market-rain.gif) | ![](land/m7-weather/menu.png) |

- **What changed:**
  - **Rain:** pixel streaks slanting with the wind, splashes on the ground and rings on the water. The ground and cliffs darken when wet, and the light turns grey-blue.
  - **Storm:** heavier, more slanted rain, a strong wind that bends trees, flowers and banners further, and a double lightning flash once every four seconds.
  - **Snow:** flakes drift and swirl. Snow settles on the tile tops pixel by pixel in drifts, never on water, and buries the flowers and grass.
  - **Fog:** soft banks of mist pool in the low ground, drift with the wind, and fade the scenery into haze.
  - Weather eases from one to the next over a couple of seconds; snow takes longer to settle.
  - Each Wild Lands map gets weather to suit it: snow only where there is snow, rain more often where the land is wet, clear skies most often.
  - A weather picker in the menu box sets any weather on any map. Every effect loops in four seconds, like the water and the wind.
- **Decisions:** *"All five"*, *"By seed + picker"*, *"Wet and snowy ground"*.
- **Learned (fixed before shipping):**
  - Ordered dithering at low strength made a regular dot grid that read as noise. Mist now uses a few flat steps of see-through fog, and only fog has mist.
  - Flowers poking through settled snow looked wrong. Snow now buries them as it deepens.
  - Rain bright enough for daylight glared on the night market. Rain and snow dim with the theme's light, and a smaller board gets fewer drops.
  - A lightning flash has to whiten the light as well as brighten it, or it reads as a slightly lighter storm.
  - Snow at snow speed couldn't fall the whole sky in four seconds. Each flake now falls through its own shorter band.
  - I made the same mistake twice: `Weather.ts` and `weather.ts` are one file on Windows. See `tasks/lessons.md`.
- **Round 1 (review):** *"The water droplets for rain and storm is too much, it hinders the view… For snow, instead of every grid being fully white… introduce some bumps and shapes… For rain and storm, introduce water puddles on some grids randomly."*
  - **Rain and storm:** about half as many drops, shorter and see-through, with fainter splashes.
  - **Puddles:** about a quarter of the flat tiles hold one. Each has its own size, place and wobbly edge, and they spread as the ground gets wetter. Blue-grey water with glints and a light far rim, never on roofs.
  - **Snow:** it lies in drifts, with bare grass and paths showing through and a dusting of flakes at the edges. Three tones (lit, plain and blue shadow) give it lumps, and small snow mounds stand on the ground as it deepens.

  ![Rain before and after](land/m7-weather/r1-subtle-rain-snow-puddles/rain-before-after.png)
  ![Snow before and after](land/m7-weather/r1-subtle-rain-snow-puddles/snow-before-after.png)

  | Puddles | Snow up close |
  |---|---|
  | ![](land/m7-weather/r1-subtle-rain-snow-puddles/puddles-close.png) | ![](land/m7-weather/r1-subtle-rain-snow-puddles/snow-close.png) |
  | ![](land/m7-weather/r1-subtle-rain-snow-puddles/rain-7.gif) | ![](land/m7-weather/r1-subtle-rain-snow-puddles/snow-7.gif) |
- **Round 2 (review):** *"The number of puddles are too many, reduce them by about 30%… when the weather is snow, the trees… do not have snow on their roof."*
  - Puddles: one flat tile in six, down from one in four.
  - Snow caps: every standing sprite (trees, pines, rocks, snags, the well, banners) takes snow along its top edges, 2 to 4 pixels deep in a soft wave, with a bright top and a blue underside. Pines catch it on each tier. It deepens with the snow on the ground.

  ![Trees before and after](land/m7-weather/r2-fewer-puddles-snowy-trees/trees-before-after.png)
  ![Puddles before and after](land/m7-weather/r2-fewer-puddles-snowy-trees/puddles-before-after.png)
  ![Snow on the trees](land/m7-weather/r2-fewer-puddles-snowy-trees/snow-trees.gif)

### M8: Day and night
![Seed 7 at dawn, day, dusk and night](land/m8-day-night/four-times.png)

![A whole day on seed 7](land/m8-day-night/cycle-7.gif)

| Dusk shadows across the castle | Cottage shadows and chimney smoke |
|---|---|
| ![](land/m8-day-night/shadows-dusk-castle.png) | ![](land/m8-day-night/village-shadows-smoke.png) |

| A village at night | Smoke by day |
|---|---|
| ![](land/m8-day-night/night-village-19.gif) | ![](land/m8-day-night/smoke-village-19.gif) |

![The time picker](land/m8-day-night/menu.png)

- **What changed:**
  - Four times of day and a running cycle. Dawn is pink-gold under a lavender sky, day is bright, dusk is deep orange under amber, and night is cold moonlight under stars. The light, the sky behind the board and the haze all follow the hour.
  - The sun moves. It rises on the right of the opening view and sets on the left, so morning and evening shadows stretch sideways where you can see them; at noon they are short.
  - **Shadows:** cliffs, columns, cottages, castle walls and bridges cast shadows on the ground, trees and flowers. They are crisp but subtle, fainter by moonlight and under cloud. Besides blocking the sun, a shadow dims the sky light a little, so long dawn and dusk shadows still show on flat ground.
  - **Night:** cottage windows glow warm, and fireflies blink over meadows, marsh and woods (but not in rain or snow).
  - **Ambience:** smoke rises from cottage chimneys and drifts downwind, and on bright days cloud shadows slide slowly over the ground.
  - A third picker in the menu box chooses the time; themed maps keep their own designed light unless you pick one.
- **Decisions:** *"Introduce dawn and dusk as well… subtle shadow effects coming from higher elevation objects… allow the option to choose the day time."*
- **Learned:**
  - A shadow only removes the sun, and a low sun barely lights flat ground, so long shadows were invisible. Letting shadows dim the sky light too made them show at every hour.
  - Which way the sun leans decides whether shadows can be seen at all. With the noon sun behind the camera, every shadow hid behind the thing casting it.
  - Pale smoke on pale ground disappears. It needed to be greyer, more solid, and bigger than first drawn.
  - All the lighting now goes through one place (`LightRig`): theme × time of day × weather. Weather no longer sets the lights itself.

### M9: Big boards and fast loading
![Seed 99 at 32×32 and at 64×64](land/m9-performance/seed99-32-vs-64.png)

![Time to load a board, before and after](land/m9-performance/load-times.png)

| Seed 4242 at 64×64 | A village on the 64×64 board |
|---|---|
| ![](land/m9-performance/whole-64-4242.png) | ![](land/m9-performance/snapshot/close-focus.png) |

![A 64×64 board before and after its rivers and settlements scaled with it](land/m9-performance/big-board-sparse-vs-scaled.png)

![The board size picker](land/m9-performance/menu.png)

- **What changed:**
  - Wild Lands come in 32×32 (standard), 48×48 and 64×64, from a fourth picker in the menu box or `&size=` in the URL.
  - Bigger boards keep the standard board's density. Rivers scale with the board's width and settlements with its area: a 64×64 board has two to four rivers and usually four or five villages, castles and ruins (three on a cramped one), spread apart and joined by roads. 32×32 boards are exactly as before.
  - Loading is faster: 0.79 s → 0.43 s on a 32×32 board, and 2.15 s → 0.92 s on a 64×64 one. Pressing R regrows just as fast.
  - The picture didn't change: 16 fixed captures (the themed maps and Wild Lands at 32×32, in clear, storm, snow, rain, day, night, dawn and dusk) match the old build pixel for pixel.
- **Decisions:** *boards up to 64×64; this laptop's RTX 4060 sets the bar; no visible change;* then, after seeing how bare a 64×64 board was with one village, *scale settlements and rivers with the board.*
- **Learned:**
  - Measure before optimising. The plan said instancing, chunking and culling. The profile showed drawing already ran at 240 fps (about 3,000 uncapped) on 64×64. The real cost was building the board when it loads, so that was the work.
  - The tile surface was sampled 720 times per rounded tile, each sample scanning the neighbours three times. Scanning once per tile removed a quarter of the load. A copy of the old code, kept in a test, proves the shapes are bit-for-bit the same.
  - Two tweaks that looked faster (fewer noise hashes, fewer allocations) were within measurement noise, so they were reverted.
  - Web Workers now paint the ground and the 12 water frames while the main thread builds the mesh. Two Chrome surprises: a worker can't start while the main thread is busy, and the last job sent to a worker waits until the main thread yields. So the board waits for the workers to start, sends the jobs, yields once, and only then builds the mesh.

### M10: Tech pass
![A 64×64 board zoomed all the way out, before and after supersampling](land/m10-tech/zoom-out-64-before-after.png)

![A slow pan across it: before shimmers, after holds steady](land/m10-tech/pan-64-before-after.gif)

- **What changed:**
  - **M10a:** boards load 16–20% faster. Worker threads build the terrain mesh as well as painting the ground. A board now appears as soon as its first water frame is painted, and the other eleven frames follow a moment later. Roads are found with a priority queue. Nothing looks different.
  - **M10b:** the camera can zoom out until the whole board fits, so 64×64 boards zoom to about 0.31; 32×32 boards keep their limit of 0.5. Below zoom 0.5 each screen pixel averages several samples (3×3 at the widest view). Distant ground, cliffs and trees blend into clean colours instead of shimmering as the camera moves. At zoom 0.5 and above nothing changes, pixel for pixel. Points (snow, fireflies, smoke, splashes) and the backdrop keep their size.
  - **M10c:** on this laptop's built-in Intel graphics, a 64×64 board now takes 2.4 ms of GPU time per frame instead of 5.6 (2.4× faster), and 7.2 ms fully zoomed out. The shadow map is redrawn only when the sun moves; each water frame stays on the GPU instead of being re-uploaded six times a second. Nothing looks different.
- **Decisions:** *"Let's do the remaining four first"*: faster loading, zoom-out without shimmer, GPU headroom, then the 24 themes.
- **Learned:**
  - Ordinary mipmaps would have softened today's views. With the camera tilted, the GPU already picks a smaller mip level at zoom 1 along the foreshortened axis. Supersampling only when zoomed out leaves every existing view untouched.
  - More threads isn't always faster. Past about six workers, this laptop throttled and its slower cores joined in, and loading got slower.
  - Background syncing (OneDrive) made timings drift by 50%. Alternating the old and new builds on every load cancels that out.
  - Measure what the GPU does, layer by layer, before optimising. The planned culling wasn't needed: 60% of the GPU time was the shadow map, redrawn every frame for a board that never moves.
  - Hitches that come at a steady rate point to something periodic. Here it was the water animation re-uploading a 4 MB texture.

### M11: Four more Wilds maps
![Autumn Ridge, Desert Mesa Oasis, Frozen Lake and Highland Moor](land/m11-wilds/four-wilds.png)

| Autumn Ridge: the old maple | Desert Mesa Oasis: the sandstone arch |
|---|---|
| ![](land/m11-wilds/autumn/close-focus.png) | ![](land/m11-wilds/desert/close-focus.png) |

| Frozen Lake: the fishing hut | Highland Moor: the shepherd's bothy |
|---|---|
| ![](land/m11-wilds/frozen/close-focus.png) | ![](land/m11-wilds/moor/close-focus.png) |

- **What changed:**
  - **Autumn Ridge** (`?map=autumn`): a ridge climbing to an old red maple. A stream tumbles down in waterfalls to a pond, crossed by a footbridge where two trails meet. Fallen leaves lie in drifts, and autumn woods stand in three pockets.
  - **Desert Mesa Oasis** (`?map=desert`): red-rock mesas with rock stairs, a lone butte, a sandy canyon floor, and a palm-ringed spring at the centre. The landmark is a sandstone arch. The backdrop has a new mesa skyline.
  - **Frozen Lake** (`?map=frozen`): walkable lake ice (no footing: −10 defence) with a few long cracks, snowy shores and pine stands. The landmark is a red fishing hut with its hole by the door. Light snow drifts across the sky.
  - **Highland Moor** (`?map=moor`): moor grass and purple heather at golden dusk, with peat pools, dry-stone walls with gateways, gorse and sheep. The landmark is a shepherd's bothy on a rise.
  - Under the hood: the cliff atlas and the sprite sheet have fixed sizes and append-only layouts, so new art never shifts old maps. Two bugs were fixed. Cliff faces could sample the next atlas row, and snow caps could read the sprite stacked above them.
- **Decisions:** the 24 new theme names were approved as listed; one category per milestone, each reviewed before the next.
- **Learned:**
  - Waterfalls need straight runs. Where a stream drops at a bend, a bank touching both pools ends up two steps above the lower one. Authoring the stream tile by tile, with each drop on a straight run, gives every pool its own banks.
  - Natural ground needs restraint. Leaves, cracks and heather looked busy at first, so they were thinned to drifts that come and go with broad noise.
  - Pixel-perfect checks catch more than regressions. A single changed pixel led to a real UV bug that had been there since M2b.

### M15: Four more Ruins maps
![Desert Pyramid, Sunken Temple, Overgrown Colosseum and Stone Circle](land/m15-ruins/four-ruins.png)

| Desert Pyramid: the obelisk | Sunken Temple: the stone face |
|---|---|
| ![](land/m15-ruins/pyramid/close-focus.png) | ![](land/m15-ruins/sunken/close-focus.png) |

| Overgrown Colosseum: the bronze gladiator | Stone Circle: the great trilithon |
|---|---|
| ![](land/m15-ruins/colosseum/close-focus.png) | ![](land/m15-ruins/henge/close-focus.png) |

- **What changed:**
  - **Desert Pyramid** (`?map=pyramid`): a pyramid bigger than the board, nine steps high in the back corner, whose two front faces are walkable steps. A causeway lined with ram sphinxes runs out to the front, with a granite obelisk at its head, dunes all round, and the half-buried head of a fallen colossus.
  - **Sunken Temple** (`?map=sunken`): a temple drowned in a jungle flood. Platforms of mossy stone stand out of wadeable shallows, a broken causeway leads in, columns and lilies dot the water, and a colossal stone face rises on the stepped sanctuary.
  - **Overgrown Colosseum** (`?map=colosseum`): the stands climb a step per tile round the back, every face an arch, with grass and trees taking them over. They have collapsed at the front. The hypogeum's passages lie open in the arena floor, with a bronze gladiator at its centre.
  - **Stone Circle** (`?map=henge`): a henge bank and ditch on chalk downs at dawn. Inside are a ring of sarsens and a horseshoe of trilithons with the great trilithon at its head; an avenue runs out to the heel stone, with barrows and sheep beyond.
- **Decisions:** scale first, as agreed after M13. The pyramid is terrain that overflows the board, and the stone face was scaled up to dwarf the columns. The stones are sized against a person.
- **Learned:**
  - A diagonal on the tile grid comes out as a zigzag. Run built features (causeways, walls) square to the grid, and leave diagonals to natural ground that frays anyway.
  - Radial heights give curved architecture for free. Measuring the distance from a centre gives the colosseum's tiers and the henge's ring and ditch.
  - Front-of-landmark clutter hides the landmark: a column on the sanctuary's front corner covered the face, so it went.
  - Heavy browser checks can be stopped when the machine runs short of memory. Run them one at a time, in the foreground.

### M14: Four more Neon City maps
![Highway Overpass, Rooftop Arcade, Container Port and Shrine Steps](land/m14-neon/four-neon.png)

| Highway Overpass: the billboard | Rooftop Arcade: the neon sign |
|---|---|
| ![](land/m14-neon/overpass/close-focus.png) | ![](land/m14-neon/rooftop/close-focus.png) |

| Container Port: the gantry crane | Shrine Steps: the torii |
|---|---|
| ![](land/m14-neon/port/close-focus.png) | ![](land/m14-neon/shrine/close-focus.png) |

- **What changed:** built overnight, back to back, as the user asked.
  - **Highway Overpass** (`?map=overpass`): a three-lane expressway on a concrete embankment five steps up. On the deck are lane lines, a sign gantry, lamps, and road works whose barriers and cones are cover on the high ground. A ramp at one end and steps on the south side lead up to it. Night streets lie below, with noodle stalls, and a giant glowing billboard is the landmark.
  - **Rooftop Arcade** (`?map=rooftop`): the board is a rooftop with lit facades for sides, among taller towers. It has a neon ARCADE sign on a scaffold, arcade cabinets and claw machines, a plant room with a water tank, air conditioners, a turf lounge under festoon lights, and a sunken pool.
  - **Container Port** (`?map=port`): stacked shipping containers, one to three boxes high, make a maze of walkable high ground. A container ship lies along the back edge at full scale as terrain: only a slice fits, and it runs off both sides. A gangway leads aboard, and a ship-to-shore gantry crane stands on the quay.
  - **Shrine Steps** (`?map=shrine`): stone steps climb a hill above the city through five torii, between stone lanterns and cherry trees in bloom, to a gravel precinct and the shrine hall.
- **Decisions:** after the Canal Quarter review ("ships are supposed to be way bigger"), vehicles and buildings are drawn at true scale or left out. The container ship became terrain, and the shrine hall was redrawn to dwarf the torii.
- **Learned:**
  - Terrain can carry things too big for a sprite. A ship, an embankment and a roof become walkable ground at their real size, which also gives the battle map its high ground.
  - The face-per-step variant that ruled out painted shopfronts in M13 suits containers exactly: every step is one box, so stacks come out mixed for free.
  - Night maps live on their light sources. Each needed its own: sodium lamps, neon, floodlights, lanterns.

### M13: Four more Modern Town maps
![Station Square, Suburban Park, Canal Quarter and High Street](land/m13-modern/four-modern.png)

| Station Square: the steam engine | Suburban Park: the playground |
|---|---|
| ![](land/m13-modern/station/close-focus.png) | ![](land/m13-modern/suburb/close-focus.png) |

| Canal Quarter: the mill chimney | High Street: the clock tower |
|---|---|
| ![](land/m13-modern/canal/close-focus.png) | ![](land/m13-modern/highstreet/close-focus.png) |

- **What changed:**
  - **Station Square** (`?map=station`): a terminus, with two tracks ending at buffer stops between raised platforms and a platform clock. In the forecourt are a taxi lane, a bus shelter, cycle racks and a preserved steam engine on a plinth. Rail is new ground: steel rails on sleepers in ballast, slow to cross.
  - **Suburban Park** (`?map=suburb`): red-brick houses with slate roofs and hedged front gardens, with washing out on the lines. A street bends round a park with a playground on bark chippings, a round duck pond, picnic tables and a small hill. The houses get a new wall: brick, white windows, a bay window and a front door in a different colour on each face.
  - **Canal Quarter** (`?map=canal`): a canal basin by the warehouses and a lock where the canal and the land step down a level. The lock has timber gates with balance beams and a towpath ramping down beside it. A stone bridge and a footbridge are the only crossings, and the mill chimney towers over the wharf. Narrowboats were moored on the water at first; review round 1 removed them, because a boat drawn on one tile looked like a toy beside the warehouses.
  - **High Street** (`?map=highstreet`): rows of shops, brick and cream in turn, each with a fascia, a striped awning and a display window. The town clock tower stands on a raised square. Around it are a red phone box and post boxes, café tables, a zebra crossing between Belisha beacons, a bus stop and market stalls.
- **Fixed:** the backdrop's gabled roofs were drawn upside down. Village Fair's distant village had them too; only that band of its backdrop changed.
- **Decisions:** none new; built as planned and reviewed one map at a time.
- **Learned:**
  - Wall colour can't vary per face. Each step of a wall picks its texture variant on its own, so a colour per variant would stripe a house floor by floor. Rows of different shops come from alternating two terrains instead.
  - A level change can carry a feature. Stepping the land down with the canal makes the lock read at a glance, and the natural towpath turns into a ramp by itself.
  - Scale matters as much as detail. A vehicle squeezed onto one tile reads as a toy next to buildings several storeys tall. Leave such things out and suggest them with scenery: bollards, the lock, the quay.
  - Pixel-checking every older map after each new one paid off again. It confirmed the roof fix touched only Village Fair's backdrop band, and that every other map stayed identical.

### M12: Four more Kingdom maps
![Harbour Town, Royal Gardens, Bridge Gatehouse and Village Fair](land/m12-kingdom/four-kingdom.png)

| Harbour Town: the lighthouse | Royal Gardens: the gazebo |
|---|---|
| ![](land/m12-kingdom/harbour/close-focus.png) | ![](land/m12-kingdom/gardens/close-focus.png) |

| Bridge Gatehouse: the gate over the bridge | Village Fair: the maypole |
|---|---|
| ![](land/m12-kingdom/bridge/close-focus.png) | ![](land/m12-kingdom/fair/close-focus.png) |

- **What changed:**
  - **Harbour Town** (`?map=harbour`): a stone quay above the water, timber piers with moored boats, and a stone mole out to a red-banded lighthouse. Behind is a market square with small cottages and warehouses. Props can now float, so boats sit on the water.
  - **Royal Gardens** (`?map=gardens`): a gazebo on the palace lawn, a fountain circle lined with topiary, a hedge maze with a statue at its heart, and flower parterres. Hedges are cover, not walls: slow to cross, +20 defence.
  - **Bridge Gatehouse** (`?map=bridge`): a river crossed by a stone bridge into a twin-towered gatehouse, with ramparts along the moat and open meadow and woods on the far bank. The gatehouse is walkable cover, so the bridge is a choke point.
  - **Village Fair** (`?map=fair`): a maypole on the village green, striped fair tents, bunting, stalls and a well, ringed by strip fields, thatched cottages and an orchard.
- **Decisions:** none new; built as planned and reviewed one map at a time.
- **Learned:**
  - Ambient effects scale per tile. The chimney rule gives every roof tile a stack, so big houses smoked like factories. Keeping houses one tile deep fixed it without touching generated villages.
  - The atlas fix needed both halves: the clamp keeps a face inside its cell, and a tiny inset keeps samples exactly on the edge from rounding into the next row. Each new map now leaves every older one pixel for pixel.
  - Since M9, boards load asynchronously, so a check that waits on a fixed short timeout will flake. Wait for the state you need, with a generous limit.

### Before and after (M2 → M2d)
![River](land/comparisons/river-m2-vs-m2d.png)
![Forest](land/comparisons/forest-m2-vs-m2d.png)
![Mountain](land/comparisons/mountain-m2-vs-m2d.png)

---

### Adding a new version

1. Start the dev server (`npm run dev`).
2. Run `node scripts/snapshot.mjs evolution/land/<id-name>`. For a theme, add its URL: `node scripts/snapshot.mjs <dir> "http://localhost:5173/?map=<id>"`.
3. If the version animates, add a GIF:

   ```
   node scripts/gif.mjs evolution/land/<id-name>/meadow-river.gif 40 58 2.6 21 10 4 12
   ```

4. Add a section above with what changed, the feedback behind it, and what was learned.
5. Add the stage to [land/stages.json](land/stages.json) and run `node scripts/timeline.mjs`.
6. For a review round or fix, keep the old pictures. Put the new ones in `<milestone>/r<N>-<topic>/`, with a comparison:

   ```
   node scripts/compare.mjs <dir>/before-after.png before.png after.png "Before: …" "After: …"
   ```

7. In the commit message, add a **Progress** section: the stage id, what now looks different, and the pictures added.
