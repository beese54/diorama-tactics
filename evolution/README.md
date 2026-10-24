# Visual history

This folder shows how the game's look has improved over time, one version after another. Each part of the game has its own folder:

| Folder | What it covers | Status |
|---|---|---|
| [land/](#land) | The world map terrain | M0 to M2d done |
| [characters/](characters/README.md) | Unit sprites and animation | not started |
| [battles/](battles/README.md) | Battle scenes | not started |

**How the pictures are made.** Every version is rendered from its own git commit, using the same camera views each time, so the pictures can be compared side by side. The script is `scripts/snapshot.mjs`. Animated versions also get a GIF from `scripts/gif.mjs`.

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

### Before and after (M2 → M2d)
![River](land/comparisons/river-m2-vs-m2d.png)
![Forest](land/comparisons/forest-m2-vs-m2d.png)
![Mountain](land/comparisons/mountain-m2-vs-m2d.png)

---

### Adding a new version

1. Start the dev server (`npm run dev`).
2. Run `node scripts/snapshot.mjs evolution/land/<id-name>`.
3. If the version animates, add a GIF:

   ```
   node scripts/gif.mjs evolution/land/<id-name>/meadow-river.gif 40 58 2.6 21 10 4 12
   ```

4. Add a section above with what changed, the feedback behind it, and what was learned.
