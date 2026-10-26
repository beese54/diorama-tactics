# M9 performance log

## Phase 0: target (agreed 2026-10-26)
- **Board:** Wild Lands up to 64×64 (`?size=64`); 32×32 stays the standard board.
- **Machine:** this laptop's RTX 4060 (Chrome `--force_high_performance_gpu`), i9-14900HX.
- **Trade-offs:** no visible change. Captures at fixed poses and a frozen clock must match the old build.
- **Metrics:**
  1. Frame pacing: no frame slower than 16.7 ms (60 fps) across the bench cases at 32 and 64.
  2. Load: page open to board ready (`window.__map`), the same work as pressing R.
  3. JS heap after load.
- **Acceptance:** 64×64 loads in ≤ 1.2 s and 32×32 in ≤ 0.6 s; zero frames over 16.7 ms; heap no higher than baseline; pixel-identical captures.

## Phase 1: benchmarks (`tasks/perf/`)
- `bench.mjs`: 6 cases (32 and 64 × clear day, storm night, snow with the day cycle), seed 4242. 1.5 s warm-up, 10 × 1 s samples of rAF frame gaps. Capped (display rate) and `--uncapped`.
- `profile-load.mjs`: CDP CPU profile of one load, with the modules already warm, giving self time per function and per file.
- `profile-heap.mjs`: sampling heap profile after load.
- `stall.mjs`, `breakdown.mjs`, `gpu.mjs`: frame gaps (clock running and frozen), triangles per layer, which GPU Chrome picks.
- Headless Chrome defaults to the Intel UHD iGPU. `--force_high_performance_gpu` selects the RTX.

## Baseline (RTX 4060, 2026-10-26)
| Case | Load | fps (capped) | frames > 16.7 ms | worst frame | CPU/frame p99 | Triangles | Heap |
|---|---|---|---|---|---|---|---|
| 32 clear day | 0.97–1.20 s | 240 | 0 | 12.5 ms | 2.1 ms | 0.40 M | 90 MB |
| 32 storm night | 0.98 s | 240 | 0 | 4.5 ms | 2.1 ms | 0.40 M | 89 MB |
| 32 snow cycle | 0.97 s | 240 | 0 | 4.5 ms | 2.0 ms | 0.40 M | 71 MB |
| 64 clear day | 2.42 s | 240 | 0 | 8.3 ms | 1.7 ms | 1.52 M | 204 MB |
| 64 storm night | 2.36 s | 240 | 0 | 4.7 ms | 1.7 ms | 1.52 M | 206 MB |
| 64 snow cycle | 2.47 s | 240 | 0 | 4.8 ms | 1.9 ms | 1.52 M | 216 MB |

Uncapped, it runs at about 1,900–3,200 fps at both sizes. On the Intel iGPU, for reference: 235 fps at 32, 155 at 64, 103 at 96, and 69 at 128.
A 16×16 board loads in 0.43 s: that is the floor (page, three.js, shader compiles).

**Conclusion:** drawing is not the bottleneck on the target machine. The mesh is 99% of the triangles, drawn twice (the shadow pass and the main pass). Even so, 64×64 has about 15× headroom over 60 fps. Board building is the cost: about 2.0 s at 64.

## Phase 2: load attribution, 64×64 (self time, 2.53 s sampled)
| File | ms | % | Hot functions |
|---|---|---|---|
| surface.ts | 695 | 27.4 | edgeDistance 216, isLiquid 191, isBuilt 87, surfaceAt 63 |
| liquid.ts | 420 | 16.6 | frame painter loop (:152) 263, shoreDistance 62, flowField 28 |
| ground.ts | 323 | 12.8 | paintGround 149, pixel loop (:372) 101, write 40 |
| (native) | 303 | 12.0 | getProgramInfoLog 78, GC 72, program 59 |
| noise.ts | 234 | 9.2 | valueNoise 151, hash 77 |
| MapMesh.ts | 182 | 7.2 | vertex 57, buildTop 28 |
| types.ts | 158 | 6.2 | tileAt 158 (called from edgeDistance) |

Why the surface code is hot: a rounded tile has 12×12 vertices. Each vertex samples `surfaceAt` 5 times (once for the point, four times for the normal). Each sample scans the 8 neighbours 3 times (foot, lip, bank) through `tileAt`, and `isLiquid` runs `Array.includes` on every call.

## Phase 3: optimisation ledger
| # | Change | Predicted | Measured (64 load) | Kept? | Tests |
|---|---|---|---|---|---|
| 0 | Baseline, measured with `loadtime.mjs` (10 runs, modules warm) | | 16: 416 ms, 32: 831 ms (795–842), 64: 2281 ms (2165–2326) | | 871 |
| 1 | `surface.ts`: edge masks from one neighbour scan per tile (`tileSurface`), Set lookups for liquid/built | −500 ms (surface 695 → ~150 ms) | 32: 701 ms (−16%), 64: 1696 ms (−26%, −585 ms) | kept | 882 (+11 reference) |
| 2 | `valueNoise`: hash each lattice corner once (4 hashes, not 6) | −60 ms | 64: 1708 ms (1607–1992), within noise | reverted | 884 |
| 3 | Liquid loop: read flow directly, hoist the `ride` closure out of the pixel loop | −50 ms | 64: 1831 ms (1600–1915), no gain | reverted | 884 |
| 4 | Ground painted on workers (`GroundPainter`): 1 land and 3 liquid workers sharing the 12 frames; the columns are built on the main thread meanwhile (`buildColumns`); `composeGround` joins the parts | −600 ms (ground ≈ 60% of the load, per Node phase timing) | 32: 616 ms, 64: 1274 ms (−25%) | kept | 884 |
| 5 | Timeline showed (a) workers start only when the main thread is free, so they waited for the mesh build, and (b) Chrome sends the last job only after the main thread yields. Fix: `await painter.ready` before posting, and yield once after posting | −250 ms (main sat idle ~430 ms waiting) | 16: 291 ms, 32: 559 ms (−33% vs baseline), 64: 988 ms (−57% vs baseline, 881–1032) | kept | 884 |
| 6 | Not an optimisation: bigger boards get rivers by width and settlements by area (user decision). Roads now route to 4–5 settlements at 64 | +60 ms (roads.ts: route) | 64: 914 ms | kept | 895 |

Not tried, because the targets were met and they would trade readability for gains under the target: skipping `edgeDistance` on empty masks (~−50 ms), a heap in the road router (−50 ms at 64), and moving the column build to a worker (it needs a three.js-free atlas layout).

## Phase 4: verification (2026-10-26)
**Load time, interleaved A/B.** The pre-M9 code ran from a worktree on another port, with only the `size=` option added. Three rounds of 10 loads each, alternating.

| Board | Before (M8) | After (M9) | Change |
|---|---|---|---|
| 32×32 | 778 / 799 / 784 ms (median of medians 784) | 435 / 431 / 422 ms (431) | −45% |
| 64×64 | 2146 / 2152 / 2166 ms (2152) | 932 / 919 / 906 ms (919) | −57% |

The 64×64 "after" also generates more settlements and roads than "before".

**Frames on the RTX 4060 (bench.mjs `final`).**
- Capped: 240 fps; 0 frames over 16.7 ms in all 6 cases; worst frame 12.6 ms.
- Uncapped: 2,900–3,200 fps. Each 64×64 case had 1 frame of 18 ms out of about 30,000. The baseline had the same uncapped spikes (17.9 and 36.1 ms): without vsync, the GPU queue runs ahead and then blocks.

**Heap after load.**
- 32: 49–103 MB (baseline 71–90).
- 64: 114–143 MB (baseline 204–216).
- The ground is painted in workers, so the main heap no longer holds the liquid fields. The workers sit idle once painting is done.

**Pixel identity (`identity.mjs`).**
- 20 captures with a frozen clock: 4 themed maps, plus Wild Lands at 32 (four seed, weather and time combinations) and at 64 (two), each from 2 poses.
- 16/16 of the standard and themed captures are identical.
- The 4 captures at 64 changed only once settlements and rivers were scaled, as intended. Before that change, all 20/20 matched.

**Tests:** 895 pass (+24: the surface reference ×13, painting in parts ×4, board size ×3, bigger boards ×4). check.mjs: 62/62 (+6 big-board checks).

**Profile after (64×64 load, main thread).**
- surface 244 ms and MapMesh 129 ms: the column build, now the critical path.
- native 226 ms; ground composition 72 ms; noise 72 ms; roads 61 ms.
- The workers finish before the column build does.
