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

## 2026-10-25: The same case clash, a second time
- **What happened:** In M7 I wrote `src/render/Weather.ts` (the renderer) next to `src/render/weather.ts` (the pure rules). On Windows they are one file, so the write overwrote the rules. This repeats the `Props.ts` / `props.ts` lesson, although the rule was already written down.
- **Rule:** Before creating any file, list its folder ignoring case (`ls <dir> | grep -i <name>`) and pick a name that differs by more than case. Name renderer classes `…Layer.ts` (`PropLayer.ts`, `WeatherLayer.ts`) so they can never clash with a lowercase data module.

## 2026-10-25: "The droplets hinder the view… the snow is too flat and monotone"
- **What happened:** M7's rain was dense and opaque enough to hide the board, and settled snow became a flat white sheet over every top. Both looked dramatic in a still, but on a battle map the player has to read the ground, and a sheet of one colour reads as flat.
- **Rule:** Effects drawn over the board (rain, snow, fog, particles) stay secondary to the board: sparse, part see-through, low contrast. Check a frame by asking whether you can still read every tile.
- **Rule:** Anything that covers ground (snow, puddles, moss, ash) must vary like the M2 lessons: patches and bare spots from noise at two scales, at least three tones, and some shapes standing up from it. Never one uniform fill.

## 2026-10-25: "Trees do not have snow… so that we can be consistent"
- **What happened:** Snow settled on the ground, the roofs and the mounds, but the trees and rocks stayed bare green. That contradicts the ground around them.
- **Rule:** A weather or season effect must reach everything exposed to it: ground, cliffs, roofs, trees, rocks and props. List every layer the scene draws (ground, sides, bridges, props, flora, backdrop) and decide for each one, before showing it.


## 2026-10-26: "Ships are supposed to be way bigger"
- **What happened:** In Canal Quarter I moored narrowboats in a canal two tiles wide. A tile-sized boat sprite next to warehouses six and seven steps tall looked like a toy, so the user had them removed.
- **Rule:** Before adding a prop, check its scale against the buildings and terrain around it: a tile is a few metres across, and a building column is a few storeys. Leave out anything that can't be drawn near its true size on one tile (vehicles, ships, large machines) rather than shrink it. Suggest the place with scenery (moorings, bollards, a lock) instead.
- **Rule:** Apply this to everything still to come in M14–M16 (container ships, cars, trains): no miniature vehicles.

## 2026-10-31: template strings lost to shell quoting (self-caught)
- **What happened:** Twice I edited TypeScript and check.mjs through `node -e "..."` in bash. Bash expanded the `${...}` inside JavaScript template strings, leaving `page.goto(, ...)` and `className = ;`. tsc caught one; `node --check` would have caught the other.
- **Rule:** Edit source with the Edit tool. Use `node -e` only for code without backticks or `${`. After any scripted edit, read the changed lines back before running anything.

## 2026-10-31: a stale vitest file cache (self-caught)
- **What happened:** After adding `src/game/cards.ts`, `purity.test.ts` failed with "unresolved import game/cards.ts", but only when its own text was unchanged. Vitest 5 keeps transformed modules in `node_modules/.vitest-cache`, and the purity test's `import.meta.glob` list was cached from before the file existed.
- **Rule:** When a test that globs the source tree can't see a new file, delete `node_modules/.vitest-cache` and run again before changing any code.

## 2026-10-31: a paused loop's clock kept running (self-caught)
- **What happened:** The board stops drawing while a battle has the screen, but its `THREE.Timer` still measured from the last frame. The first frame back carried the whole battle as one delta, so the foes' 1.5 s turn ended at once and the board's clock jumped. Only the new check.mjs flow test showed it: nothing earlier depended on `dt` across a battle.
- **Rule:** Whenever a render loop is paused or skipped (a battle, a hidden tab, a modal), reset or clamp the clock that feeds `dt` when it resumes. Anything timed in game seconds (turns, walks, cooldowns) must be tested across a pause.
- **Rule:** For videos of timed play, step the page's frames by hand (queue `requestAnimationFrame` in the capture script) so game time follows the video, not the wall clock, which slow screenshots stretch.

## 2026-10-31: "For cards, I dont want pixel art, I want animated cards that show motion"
- **What happened:** I built the B4 cards in the map's pixel menu style and then proposed animations snapped to the pixel grid, assuming every piece of map UI follows the map's pixel look.
- **Rule:** Only the map board is pixel art. Before giving any new visual element a style (cards, cut-ins, overlays), ask whether it belongs to the board or to the "showpiece" art like the battle scenes. Showpiece art is full resolution, smooth and animated. When unsure, ask before building it.

## 2026-11-01: check.mjs started twice in one command, again (self-caught)
- **What happened:** I ended a `check.mjs` command with a leftover `; node scripts/check.mjs ... | true`, so a second full run queued behind the first. The same thing happened in B4. On this machine a heavy check takes over ten minutes and must run alone.
- **Rule:** A heavy check gets a command of its own: exactly one `node scripts/check.mjs` (or identity, or capture) per Bash call, and nothing else chained after it. Read the command back before sending it.

## 2026-11-01: the full checks run twice to read one count (self-caught)
- **What happened:** I ran `check.mjs` once and read only the last lines, then ran it again in full just to count the FAILs.
- **Rule:** Run a heavy check once, with its output saved to a scratchpad file (`> out.txt`), then read that file as many ways as needed.

## 2026-11-01: model activation is not key permission (BytePlus ModelArk)
- **What happened:** After the user activated the Seedance 2.0 models, every call returned 403 AccessDenied. The API key itself had to be allowed to use those models, which took about 5 minutes to apply.
- **Rule:** Before any billed call to a newly enabled model, send a free probe: a request with empty `content`. 400 InvalidParameter means the key gets through, 403 means the key is blocked from that model, and ModelNotOpen means the model isn't activated. Tell the user which of these it is.

## 2026-11-02: a page loaded right after a source edit never goes "network idle" (self-caught)
- **What happened:** A headless load straight after I edited a source file timed out waiting for network idle, twice. Vite reloaded the page as it loaded, and puppeteer kept the first load's module requests as pending forever. It looked like a hanging app.
- **Rule:** After editing source, let the dev server settle before a headless load. If a load times out on network idle, log the navigations and pending requests before blaming the app: two navigations means it was Vite's reload.

## 2026-11-02: size GPU assets to how big they're drawn, before multiplying views (self-caught)
- **What happened:** The hand reused the showcase's CardView: 2000x2800 frame canvases and 1536 px art layers per card. Eight cards came to about a gigabyte of textures, and painting them stalled the page for seconds. The steady frame rate hid it; only the first seconds showed it.
- **Rule:** When one view becomes many, work out its memory (pixels x 4 bytes x 1.33 for mipmaps, for each texture) and paint and load at the size it's drawn. Measure the first seconds after it opens, not only the steady frame rate.

## 2026-11-02: test code through a shell heredoc, again (self-caught)
- **What happened:** I appended TypeScript tests through a bash heredoc into a Python string. The escaped apostrophes in three test names (`it('... Union\'s order')`) lost their backslashes, and the test file failed to parse.
- **Rule:** The standing rule covers quotes as well as backticks and `${`: any code with quotes goes in with Write or Edit, never through a shell heredoc. Name tests in double quotes when they contain an apostrophe.

## 2026-11-02: browser checks that only pass on a fast machine (self-caught)
- **What happened:** Four checks failed twice in a row with the same code. The machine was running 2-4x slower than earlier the same day (2.3 fps with the hand open, from 9.5). One check waited a fixed 30 frames and expected a 5-second clip still to be playing. Two others had to finish their steps, a screenshot included, inside the foes' 2.6-second turn. The slow run also showed up a real bug: a clip that had played to its end was never rewound.
- **Rule:** A check waits for the state it tests (`waitForFunction` on the condition, with a generous timeout), never for a fixed count of frames. A check that races a game timer watches from inside the page as the timer runs. When checks fail with no change in the code they cover, measure the machine's speed against an earlier figure before suspecting the code.

## 2026-11-03: an AI that obeys the rules can still play badly (self-caught)
- **What happened:** The first foe AI made only legal moves, but the nearest foe spent the whole shared MOV pool every turn, and the foes steered by straight-line distance into a corner a cliff cut off. The unit tests passed; watching a few turns in the real game showed both.
- **Rule:** An AI isn't done when its moves are legal. Watch several of its turns on a real map before trusting it, and turn what looks wrong into a test, as "advances together" now is.


## 2026-11-03: a shell heredoc broke JavaScript again, and an intro started too early (self-caught)
- **What happened:** A capture script written through a bash heredoc lost a `\n` inside a JS string, and the script failed to parse. This is the same mistake as the test file on 2026-11-02. Separately, the battle intro's classes were added when its HUD was built, at the start of loading. The intro then played under the wipe and was over before the battle could be seen. A probe showed the animation itself was fine; the screenshot had simply come too late.
- **Rule:** Code with escapes goes in through Write, Edit or a Python file in the scratchpad, never inline in a heredoc. Start an animation when its subject is on screen (here, once the battle is ready), not when its element is built. Capture an animation by waiting on its own `currentTime`, not on a guessed delay.

## 2026-11-05: picking units by their figures moved where every click lands (self-caught)
- **What happened:** Hover and click now pick the unit whose figure is under the pointer, before the tile. The check helpers still clicked tile centres. In a tight Union shape, an ally in front covers the leader's tile centre with its head, so the helper's click picked the ally. The Union fought with the wrong members, a battle hit an error, and a later wait timed out before any results were printed. Separately, I summed the spending ledger by hand and got $8.41 spent, where the guard's own summary said $10.46.
- **Rule:** When the way the pointer picks changes, the checks aim through the same pick path the game uses (`__map.aimAt`), never at a raw screen position worked out beside it. A crash that skips the results is debugged by printing the failures so far, not by guessing. Spending is read from the guard (a `--dry` run prints the round's total), never summed from the ledger file by hand.

## 2026-11-05: a check aimed at the edge of a figure that breathes (self-caught)
- **What happened:** `__map.aimAt` returned the first point up a unit's figure that picked it, which was the figure's very edge. Once the heroes breathed (the idle settles the body a pixel), that edge pixel was clear on every other frame. Pointing at Ilse then picked Aria, in front of her, and pointing at Varek picked Petra.
- **Rule:** When aiming at an animated target, aim at the middle of the stretch that hits it, not the first hit. A target that moves by a pixel must still be under the aim on every frame.
