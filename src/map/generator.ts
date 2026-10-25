import { valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import { slopeToLiquids } from './build';
import { IMPASSABLE, TERRAIN } from './terrain';
import { tileAt, type MapFile, type TerrainId, type Tile } from './types';

/** Inland valleys hold lakes; islands are ringed by sea; coasts meet the sea along one side. */
export type WorldShape = 'valley' | 'island' | 'coast';
export const WORLD_SHAPES: readonly WorldShape[] = ['valley', 'island', 'coast'];

/** The natural terrains a generated map uses. Roads, ruins, farms and built ground come with settlements (M6). */
export const WORLD_TERRAINS: readonly TerrainId[] = [
  'deep_water', 'shallow_water', 'beach', 'marsh', 'swamp', 'bog', 'desert', 'plains', 'meadow',
  'badlands', 'light_woods', 'forest', 'hills', 'pine_forest', 'scree', 'mountain', 'snowfield', 'peak_snow',
];

export const WORLD_SIZE = 32;

/** Size of the land's main features, in tiles. */
const FEATURE_SCALE = 10;
/** How far the coastline and ridges wander from straight noise blobs, in tiles. */
const WARP = 5;
/** Lakes smaller than this dry out into marsh: one-tile puddles read as mistakes. */
const MIN_LAKE = 4;
/** How far from water the ground stays damp, in tiles. */
const DAMP_REACH = 5;

const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [...EDGES, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Each seed's character: its shape, how much is water, how tall and how wet it is. */
export interface WorldTraits {
  shape: WorldShape;
  /** Share of the board under water. */
  water: number;
  /** Tallest land column below the peaks (5-7). */
  relief: number;
  /** Share of the land that rises to snowy peaks; 0 on maps without them. */
  peaks: number;
  /** Shifts the whole map drier (< 0) or wetter (> 0). */
  climate: number;
  /** Which side the sea lies on (coast only), in radians. */
  seaward: number;
}

export function worldTraits(seed: number): WorldTraits {
  const rand = mulberry32(seed ^ 0x5eed);
  const shape = WORLD_SHAPES[Math.floor(rand() * WORLD_SHAPES.length)];
  const water = { valley: 0.08 + rand() * 0.06, island: 0.3 + rand() * 0.06, coast: 0.22 + rand() * 0.08 }[shape];
  const relief = 5 + Math.floor(rand() * 3);
  const peaks = relief === 7 && rand() < 0.75 ? 0.015 + rand() * 0.02 : 0;
  return { shape, water, relief, peaks, climate: (rand() - 0.5) * 0.3, seaward: rand() * 2 * Math.PI };
}

/** Fractal value noise in [0, 1). */
function fbm(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0;
  let norm = 0;
  for (let o = 0, amp = 1, f = 1; o < octaves; o++, amp *= 0.5, f *= 2) {
    sum += amp * valueNoise(seed + o * 1013, x * f, y * f);
    norm += amp;
  }
  return sum / norm;
}

/** Each value's rank in [0, 1], so thresholds become shares of the board whatever the noise did. */
function ranks(values: number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const out = new Array<number>(values.length);
  order.forEach((i, r) => (out[i] = r / (values.length - 1)));
  return out;
}

/** Elevation before ranking: warped fractal noise with ridge crests, bent into the seed's shape. */
function rawElevation(seed: number, traits: WorldTraits, size: number, x: number, y: number): number {
  const wx = x + WARP * (fbm(seed + 1, x * 0.08, y * 0.08, 2) - 0.5);
  const wy = y + WARP * (fbm(seed + 2, x * 0.08, y * 0.08, 2) - 0.5);
  const base = fbm(seed + 3, wx / FEATURE_SCALE, wy / FEATURE_SCALE, 4);
  const crest = 1 - Math.abs(2 * fbm(seed + 4, wx / (FEATURE_SCALE * 1.3), wy / (FEATURE_SCALE * 1.3), 3) - 1);
  const e = 0.7 * base + 0.3 * crest * crest;
  // Board position in [-1, 1].
  const u = ((x + 0.5) / size) * 2 - 1;
  const v = ((y + 0.5) / size) * 2 - 1;
  // Ground leans up toward the far corner of the opening view (x and y small), so tall
  // columns stand behind the board instead of in front of the tiles they would hide.
  const back = 0.2 * (1 - (u + v) / 2);
  switch (traits.shape) {
    case 'valley': // a shallow bowl: hills near the rim, lakes in the low middle
      return e + 0.12 * (u * u + v * v) + back;
    case 'island':
      return 0.55 * e + 0.6 * (1 - Math.min(1, Math.hypot(u, v) / 1.15) ** 2) + back;
    case 'coast': {
      const inland = (u * Math.cos(traits.seaward) + v * Math.sin(traits.seaward) + 1.4) / 2.8;
      return 0.6 * e + 0.5 * inland + back;
    }
  }
}

/** 4-connected groups of tiles that pass `test`, as lists of indices. */
function regions(size: number, test: (i: number) => boolean): number[][] {
  const seen = new Uint8Array(size * size);
  const out: number[][] = [];
  for (let start = 0; start < size * size; start++) {
    if (seen[start] || !test(start)) continue;
    const group = [start];
    seen[start] = 1;
    for (let k = 0; k < group.length; k++) {
      const x = group[k] % size;
      const y = Math.floor(group[k] / size);
      for (const [dx, dy] of EDGES) {
        const nx = x + dx;
        const ny = y + dy;
        const n = ny * size + nx;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && !seen[n] && test(n)) {
          seen[n] = 1;
          group.push(n);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/** Distance in tiles (diagonals count as one) from every tile to the nearest tile passing `test`. */
function distanceTo(size: number, test: (i: number) => boolean): number[] {
  const dist = new Array<number>(size * size).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < size * size; i++) if (test(i)) (dist[i] = 0), queue.push(i);
  for (let k = 0; k < queue.length; k++) {
    const x = queue[k] % size;
    const y = Math.floor(queue[k] / size);
    for (const [dx, dy] of AROUND) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * size + nx;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && dist[n] === Infinity) {
        dist[n] = dist[queue[k]] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Land cover for a column of height `h` (1-8) and moisture `m` (0-1). */
function biome(h: number, m: number, shore: boolean): TerrainId {
  if (h >= 8) return 'peak_snow';
  if (shore) return m < 0.55 ? 'beach' : 'marsh';
  const pick = (bands: [number, TerrainId][], last: TerrainId) => bands.find(([limit]) => m < limit)?.[1] ?? last;
  switch (h) {
    case 1: return pick([[0.24, 'desert'], [0.5, 'plains'], [0.66, 'meadow'], [0.8, 'marsh'], [0.9, 'swamp']], 'bog');
    case 2: return pick([[0.2, 'desert'], [0.3, 'badlands'], [0.52, 'plains'], [0.64, 'meadow'], [0.78, 'light_woods']], 'forest');
    case 3: return pick([[0.3, 'badlands'], [0.5, 'plains'], [0.64, 'light_woods']], 'forest');
    case 4: return pick([[0.32, 'badlands'], [0.5, 'hills'], [0.66, 'forest']], 'pine_forest');
    case 5: return pick([[0.4, 'scree'], [0.6, 'hills']], 'pine_forest');
    case 6: return pick([[0.45, 'scree'], [0.8, 'mountain']], 'snowfield');
    default: return pick([[0.62, 'mountain']], 'snowfield');
  }
}

const walkable = (t: Tile) => TERRAIN[t.terrain].moveCost < IMPASSABLE;

/** The pass or ford that opens a blocked tile on the shortest route between two cut-off areas. */
const OPENED: Partial<Record<TerrainId, TerrainId>> = { deep_water: 'shallow_water', peak_snow: 'mountain' };

/**
 * Joins every walkable area to the largest one: from each cut-off area, the shortest route
 * across blocked tiles to the main area is opened (deep water becomes a ford, a peak a pass).
 */
function connect(map: MapFile): void {
  const size = map.width;
  for (;;) {
    const areas = regions(size, (i) => walkable(map.tiles[i])).sort((a, b) => b.length - a.length);
    if (areas.length <= 1) return;
    const main = new Set(areas[0]);
    // Breadth-first from the smallest cut-off area through any tile until the main area is reached.
    const from = new Map<number, number>(areas[areas.length - 1].map((i) => [i, -1]));
    const queue = [...from.keys()];
    let reached = -1;
    for (let k = 0; k < queue.length && reached < 0; k++) {
      const x = queue[k] % size;
      const y = Math.floor(queue[k] / size);
      for (const [dx, dy] of EDGES) {
        const nx = x + dx;
        const ny = y + dy;
        const n = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || from.has(n)) continue;
        from.set(n, queue[k]);
        if (main.has(n)) {
          reached = n;
          break;
        }
        queue.push(n);
      }
    }
    for (let i = from.get(reached)!; i >= 0; i = from.get(i)!) {
      const tile = map.tiles[i];
      const opened = OPENED[tile.terrain];
      if (!opened) continue;
      tile.terrain = opened;
      if (opened === 'shallow_water') tile.water = { kind: 'ford', flow: [0, 0] };
    }
  }
}

/**
 * Land tiles with no edge neighbour of their own kind take their neighbours' most common
 * cover, so regions read as clear shapes. Shore and water are left alone.
 */
function mergeSpecks(map: MapFile): void {
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const tile of map.tiles) {
      if (tile.water) continue;
      const near = EDGES.map(([dx, dy]) => tileAt(map, tile.x + dx, tile.y + dy)).filter((n): n is Tile => !!n && !n.water);
      if (near.length === 0 || near.some((n) => n.terrain === tile.terrain)) continue;
      const counts = new Map<TerrainId, number>();
      for (const n of near) counts.set(n.terrain, (counts.get(n.terrain) ?? 0) + 1);
      tile.terrain = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      changed = true;
    }
    if (!changed) return;
  }
}

/**
 * A seeded natural map: warped noise for elevation, shaped as a valley, island or coast;
 * the lowest share flooded into lakes or sea; moisture from its own noise and nearness to
 * water; land cover by height and moisture. Banks slope down to the water, one-tile specks
 * merge into their surroundings, and every walkable tile can be reached. Deterministic.
 */
export function generateMap(seed: number, size = WORLD_SIZE): MapFile {
  const traits = worldTraits(seed);
  const n = size * size;
  const xy = (i: number) => [i % size, Math.floor(i / size)] as const;

  const elevation = ranks(Array.from({ length: n }, (_, i) => rawElevation(seed, traits, size, ...xy(i))));
  const wet = elevation.map((e) => e < traits.water);
  for (const lake of regions(size, (i) => wet[i])) if (lake.length < MIN_LAKE) for (const i of lake) wet[i] = false;

  // Land rank to column height: most of the board low and rolling, a few tall ridges.
  const height = elevation.map((e, i) => {
    if (wet[i]) return 0;
    // Dried-out puddles sit below the waterline; they become the lowest land.
    const land = Math.max(0, (e - traits.water) / (1 - traits.water));
    if (land > 1 - traits.peaks) return 8;
    return 1 + Math.min(traits.relief - 1, Math.floor(land ** 1.5 * traits.relief));
  });

  // A column far above (or below) every neighbour reads as a pillar (or a pit): ease it to one step from them.
  for (let i = 0; i < n; i++) {
    if (wet[i]) continue;
    const [x, y] = xy(i);
    const near = EDGES.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < size && ny < size).map(([nx, ny]) => height[ny * size + nx]);
    height[i] = Math.min(Math.max(height[i], Math.min(...near) - 1), Math.max(...near) + 1);
  }

  const rand = mulberry32(seed);
  const onBorder = (i: number) => { const [x, y] = xy(i); return x === 0 || y === 0 || x === size - 1 || y === size - 1; };
  // Water that reaches the board's edge is open sea (on islands and coasts); the rest is lakes.
  const sea = new Set(traits.shape === 'valley' ? [] : regions(size, (i) => wet[i]).filter((r) => r.some(onBorder)).flat());
  const shoreDistance = distanceTo(size, (i) => !wet[i]);
  const tiles: Tile[] = Array.from({ length: n }, (_, i) => {
    const [x, y] = xy(i);
    const water = wet[i] ? { kind: sea.has(i) ? ('sea' as const) : ('lake' as const), flow: [0, 0] as [number, number] } : null;
    const terrain: TerrainId = !wet[i] ? 'plains' : shoreDistance[i] >= 2 ? 'deep_water' : 'shallow_water';
    return { x, y, height: height[i], terrain, moisture: 0, water, feature: null, seedRand: rand() };
  });
  const map: MapFile = { version: 1, seed, width: size, height: size, tiles };
  slopeToLiquids(map);

  const waterDistance = distanceTo(size, (i) => wet[i]);
  const moistureNoise = ranks(Array.from({ length: n }, (_, i) => fbm(seed + 5, xy(i)[0] / 9, xy(i)[1] / 9, 3)));
  for (const [i, tile] of tiles.entries()) {
    const damp = Math.max(0, 1 - waterDistance[i] / DAMP_REACH);
    const m = Math.min(1, Math.max(0, 0.1 + 0.7 * moistureNoise[i] + 0.25 * damp + traits.climate));
    tile.moisture = Math.round(m * 1000) / 1000;
    if (tile.water) continue;
    const shore = tile.height === 1 && EDGES.some(([dx, dy]) => tileAt(map, tile.x + dx, tile.y + dy)?.water);
    tile.terrain = biome(tile.height, m, shore);
  }
  mergeSpecks(map);
  connect(map);
  return map;
}
