# Diorama Tactics

A personal learning project: a pixel-art tactics map built with three.js in a 2.5D "diorama" style. Terrain has steps and rounded edges, the water moves and flowers sway in the wind.

![The world map now](evolution/land/m2d-blended-ground-and-motion/meadow-river.gif)

> ## Disclaimer: fan-inspired, not affiliated
>
> This is an **independent, non-commercial hobby project made for learning**. Its gameplay ideas and art direction are **inspired by** *Yggdra Union* (Sting) and the *Final Fantasy Tactics* series (Square Enix).
>
> - It is **not affiliated with, endorsed by, or connected to** Sting, Atlus, Square Enix or any other rights holder.
> - It **does not include any assets from those games**: no sprites, artwork, music, sound, text, characters, story or code. Every texture, sprite and effect here is generated procedurally by the code in this repository.
> - *Yggdra Union*, *Final Fantasy* and *Final Fantasy Tactics* are trademarks of their respective owners. They are named only to say where the inspiration came from.
> - It is not meant to infringe any copyright or trademark. If you are a rights holder and have a concern, please open an issue and it will be addressed promptly.

## Visual history

The [evolution/](evolution/README.md) folder shows how the visuals improved, version by version. Each version is rendered from the same camera angles, with notes on what changed, the feedback that caused it and what was learned. Land is documented now; characters and battle scenes will be added as they are built.

![Timeline](evolution/land/timeline.gif)

## Status

The current phase is the **world map terrain**. Battles and units come later.

| Milestone | | Status |
|---|---|---|
| M0 | Pixel-perfect 480×270 render pipeline | done |
| M1 | 32×32 terrain grid, orbit camera, tile cursor and info panel | done |
| M2 | Stepped elevation driven by terrain type | done |
| M2b | Rounded edges, seamless one-step slopes | done |
| M2c | Naturally varied rounding, painted water | done |
| M2d | Blended ground across tiles, looping water, swaying flowers | done |
| M2e | Theme kits and six showcase maps (one per category) | done |
| M3 | Seeded world generator, maps saved and loaded as JSON | done |
| M4 | Rivers with waterfalls and bridges, flowing water, sea surf | done |
| M5 | Trees, rocks and swamp snags as sparse cover; reeds, pebbles, murky swamp water | done |
| M6 | A village, castle or ruins on level ground, roads out to the edges, walkable rooftops | done, in review |
| M7–M9 | Weather, day and night, performance | planned |

The full plan is in [tasks/todo.md](tasks/todo.md). The progress ledger is [progress_tracking.json](progress_tracking.json).

## Run it

Requires Node 20 or later.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # type-check and production build
```

**Controls:** drag to orbit, scroll to zoom, WASD to pan, and hover a tile to see its terrain.

**Maps:** add `?map=<id>` to the URL to load a showcase:

- `alpine`: Alpine Pass
- `courtyard`: Castle Courtyard
- `plaza`: Fountain Plaza
- `market`: Night Market Alley
- `jungle`: Jungle Temple
- `volcano`: Volcanic Caldera

**Generated maps:** `?map=world` grows a random 32×32 map, and `?seed=N` grows the same map for a seed every time. Each seed makes an inland valley, an island or a coast, with one or two rivers that step down the hills in waterfalls and are crossed by wooden or stone bridges. Woods grow in sparse clumps, with rocks on the slopes and drowned trees in the swamps; they give cover but never block a tile. Each map is built around a village, a small castle or old ruins, with roads out to the board's edges; rooftops and ramparts can be stood on. The box in the top-left corner has buttons:

- **Map picker** (the drop-down in the box) switches to any of the themed maps or to Wild Lands.
- **New map** (or `R`) grows another map and puts its seed in the URL.
- **Save** (or `E`) downloads the map as JSON, one tile per line, so you can edit it by hand.
- **Load** (or drop a file on the page) opens a saved map. A bad file is refused with a note saying what is wrong.

Without it, the original map (`meadow`) loads.

The headless checks need Chrome, and the GIF script also needs ffmpeg. All of them run against the dev server:

```sh
node scripts/check.mjs shots          # in-browser checks and screenshots
node scripts/snapshot.mjs out/dir     # the standard views used in evolution/
node scripts/gif.mjs out.gif 40 58 2.6 21 10 4 12   # looping review GIF
```

## Layout

```
src/render   pixel pipeline (480x270, integer upscale), orbit camera, sprites, backdrop
src/map      terrain types, rounded surface, mesh, ground painter, liquids, flora, props, cursor
src/themes   map themes: layout, lighting and painted backdrop per showcase
src/ui       tile info panel
scripts      headless checks, snapshots, GIF recorder
evolution    visual history
tasks        plan (todo.md) and lessons learned (lessons.md)
```

## Built with

- [three.js](https://threejs.org/)
- [Vite](https://vitejs.dev/)
- TypeScript
- [Vitest](https://vitest.dev/)
- [Puppeteer](https://pptr.dev/)
