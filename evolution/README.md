# Visual history

This folder shows how the game's look has improved over time, one version after another. Each part of the game has its own folder:

| Folder | What it covers | Status |
|---|---|---|
| [land/](#land) | The world map terrain | M0 to M7 done |
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
