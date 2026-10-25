# Lessons

## 2026-10-24: "It looks too flat"
- **What happened:** M1 shipped a flat grid because the roadmap put elevation in M2. The user judged it on looks and found it underwhelming.
- **Rule:** For visual milestones, ask "what is the defining visual quality the user pictured?" (here: elevation and terrain variety) and put it in the *first* thing they see. Split milestones by visual impact, not just by engineering layer.
- **Rule:** When placeholder data drives the visuals (test map), make it express the feature's attributes (terrain → height) instead of leaving it uniform.

## 2026-10-24: "rounding doesn't have to be uniform" / "river shades per tile look unnatural"
- **What happened:** I shipped rounding and water colours that were uniform per tile. The user wants the look of the real outdoors: varied shapes, and colours that ignore tile borders.
- **Rule:** For anything meant to look natural (terrain shape, water, foliage, weather), vary it with smooth world-space noise by default, and paint per pixel across tile borders when a feature spans tiles. The tile grid is for gameplay, not for how nature is drawn.
- **Rule:** Keep variation a pure function of world position, so neighbouring tiles agree and no cracks appear.


## 2026-10-24: "grass and rocks should blend like the river"
- **What happened:** In M2c I painted the water per pixel across tiles, but left the land on per-tile textures with grid seams. The user had to ask again for the same quality on land.
- **Rule:** When the user corrects one feature towards a quality ("blend across tiles", "vary naturally"), apply it to every analogous feature in the same pass, and say so. Don't fix only the example they named.
- **Rule:** Check rendered screenshots for background-coloured pixels inside the map (pinholes). Mixed mesh resolutions need matching edge vertices: no T-junctions.

## 2026-10-25: "They do not look as refined as the very first one"
- **What happened:** To propose 30 map themes, I drew quick concept sketches with a separate 2D canvas renderer: 10×10 flat blocks with simple props. The user compared them with the real M2d render and judged them as finished quality, so they looked like a step backwards.
- **Rule:** This user judges every image as finished quality. Never show visuals below the quality bar already reached. Render proposals with the real engine, or say clearly *before* showing them that they are low-fidelity and why.
- **Rule:** When a proposal covers many variations, render a few at full quality first instead of many at low quality.

## 2026-10-25: Windows file names ignore case
- **What happened:** I wrote `src/map/Props.ts` (a class) next to `src/map/props.ts` (data). On Windows, and in OneDrive, these are the same file, so the data file was silently overwritten.
- **Rule:** Never create two files whose names differ only in case. Give each module a distinct name, for example `props.ts` for the data and `PropLayer.ts` for the renderer.

## 2026-10-25: "Too many trees hinder the movement"
- **What happened:** I scattered jungle trees at random, thick at the back. The map looked lush, but units would have had to thread through a forest, and the trees hid where they could go.
- **Rule:** On a battle map, place cover deliberately: a few pockets of cover with open lanes between them (to the objective, around the landmark, across the board). Get the jungle or city feel from low decor (ferns, flowers) and from the backdrop, not from tall props on playable tiles.
- **Rule:** Guard it with a test: most open tiles stay free of props.

## 2026-10-25: "some trees have snow… it is not a snow environment"
- **What happened:** In M5 I gave pine forest at height 5 or more snowy pines half the time. Height alone isn't climate: on maps with no snowfield or peaks, green lowland-looking woods got snow-covered trees.
- **Rule:** Seasonal or climate dressing (snow, frost, autumn colour, ash) must follow the map's actual conditions next to it (a snowfield or peak within reach), never a fixed height or a coin flip. If the map shows no snow anywhere, nothing on it is snowy.
- **Rule:** Guard each such rule with a test that would fail on a map without the condition, and run it against the old code first to prove it catches the bug.

