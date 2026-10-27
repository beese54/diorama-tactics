# Definition of Done: Map Phase

**Global (applies to every milestone)**
- `npm run build` exits 0 with zero TypeScript errors.
- `npm test` exits 0.
- No console errors after 10 s idle plus orbit/pan/zoom in the dev server (checked via browser automation console read).
- One git commit per milestone; `progress_tracking.json` updated in the same change.
- A screenshot of the milestone is captured and shown to you for visual approval. **Visual approval is yours, not mine.**

| Milestone | Done when (each check can fail) | Verified by |
|---|---|---|
| **M0 Scaffold** | Canvas internal size is exactly 480×270; displayed size is an integer multiple; a 16×16 test texture shows hard pixel edges (no blur) at scale ≥2 | Unit test on scale calculation (window 1920×1080 → scale 4); screenshot pixel check |
| **M1 Flat grid** | 32×32 tiles rendered; ≥5 terrain types with distinct procedural textures; hovering a tile highlights exactly that tile and the panel shows its name/moveCost/defense; orbit, pan and zoom work and clamp to the specified limits | Vitest: terrain table complete for every TerrainId; manual hover check on 3 known tiles |
| **M2 Elevation** | Heights 0–8 render as stepped columns with side textures; picking selects the top face of the *nearest visible* column, even behind a taller one from that angle | Test: raycast helper returns the expected tile for 3 scripted camera poses |
| **M3 Generator** | Same seed → identical JSON (hash equal); different seed → different map; every TerrainId band reachable across 50 seeds; `R` regenerates; `?seed=N` reproduces | Vitest determinism + coverage tests |
| **M4 Water** | Every river tile's height ≤ its upstream neighbour; every river ends in sea/lake; water texture visibly scrolls along the `flow` direction; waterfall tile exists wherever the drop ≥2 | Vitest invariants over 50 seeds; screenshot pair 1 s apart shows water movement |
| **M5 Biome detail** | Forest/swamp/mountain tiles carry decor billboards; decor count is deterministic per seed; decor never sits on water tiles | Vitest; visual approval |
| **M6 Settlements** | 2–5 settlements per map on dry flat tiles; every pair is connected by road; every road–river crossing is a bridge | Vitest graph-connectivity test over 50 seeds |
| **M7 Weather** | Keys 1–5 switch clear/rain/storm/snow/fog; rain shows streaks plus splashes and darkens the light; storm flashes lightning; wind changes the rain angle | Manual check plus screenshot per state |
| **M8 Day/night** | Light colour/intensity changes across 0–24 h; village lights appear at night; cloud shadows move | Screenshots at 06/12/18/00 h |
| **M9 Performance** | ≥55 fps average over 20 s orbiting at 1920×1080 in Chrome with storm weather on; < 100 draw calls | `renderer.info.render.calls` logged; fps overlay |


# Definition of Done: Phase 2, units and battles

**Global (every milestone)**
- `npm run build` exits 0; `npm test` exits 0; `node scripts/check.mjs` passes, with no console errors.
- The map phase is untouched: `tasks/perf/identity.mjs` shows all 70 map captures identical when units are off (viewer mode).
- One commit per working step, pushed; `progress_tracking.json` updated; shots in `evolution/characters/` or `evolution/battles/` plus a stages entry and README section.
- Screenshots are sent for your approval. **Visual approval is yours.**

| Milestone | Done when (each check can fail) | Verified by |
|---|---|---|
| **B0 Rules core** | Move range never exceeds the pool, never enters impassable/blocked/enemy tiles, never ends on an ally; Union detection returns exactly the + or x neighbours (max 5); the weapon triangle gives +2/-2 both ways; a seeded clash replays identically; a bow attack has no counter; Morale damage drops with the loser's terrain defence; Morale 0 defeats the unit; `src/game/` imports nothing from three | Vitest (`src/game/*.test.ts`); a grep check in the test that no file in src/game imports 'three' |
| **B1 Units on the map** | 5 + 5 units deploy on walkable, prop-free, mutually reachable tiles on all 30 themes and 20 generated seeds; clicking a unit shows exactly the B0 move range; confirming moves it along the previewed path and spends the pool; a unit can't move twice | Vitest deployment test over all themes/seeds; check.mjs: select, range tile count matches rules, move, pool decreases |
| **B2 Battle scene v0** | Style frame approved by you first. During battle the canvas drawing buffer equals CSS size x devicePixelRatio (not 480x270); a full scripted battle plays: both squads run in, clash, soldiers fall, the winner cheers, and the map returns with the same camera | check.mjs reads canvas size during battle and the camera matrix before and after; shots + a GIF |
| **B3 Battle v1** | The scene's outcome equals the B0 rules' outcome for the same seed; stance keys change the edge shown and the gauge; Morale on the map drops by the computed amount | Vitest director-vs-rules test over 50 seeds; check.mjs stance key test |
| **B4 Cards and turns** | A card is required before moving; the pool equals its MOV; a used card can't be picked again; only one attack per turn; End turn passes control to the enemy and back | Vitest turn-manager tests; check.mjs flow test |
| **B5 Unions** | The highlighted Union equals the rules' Union; a Union battle plays one clash per member in order | Vitest; check.mjs |
| **B6 Card skills** | A skill fires only when the gauge is full and the ACE matches; the cut-in plays and the effect changes the outcome as specified | Vitest; shots + GIF |
| **B7 AI and win/lose** | The enemy takes a legal turn on every theme in < 100 ms; killing every enemy shows Victory, losing every unit shows Defeat; a full AI-vs-AI skirmish finishes on all 30 themes without errors | Vitest AI-vs-AI over themes; check.mjs |
| **B8 Polish** | Defined when we get there | — |
