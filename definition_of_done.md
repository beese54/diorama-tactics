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
