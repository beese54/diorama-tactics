import { hash, valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { isLiquid } from '../map/surface';
import { tileAt, type WaterInfo } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 113;
/** The old maple's knoll, at the back corner. */
const MAPLE: [number, number] = [3, 3];
const POND: [number, number] = [16, 16];

/**
 * The stream, tile by tile from the back edge to the pond: [x, y, water level]. It runs
 * straight wherever it drops a step, so each waterfall sits between banks of its own.
 */
const STREAM: [number, number, number][] = [
  [10, 0, 4], [10, 1, 4], [10, 2, 4], [10, 3, 4], [10, 4, 4], [11, 4, 4], [12, 4, 4], [12, 5, 4],
  [12, 6, 3], [12, 7, 3], [12, 8, 3], [12, 9, 3],
  [12, 10, 2], [12, 11, 2], [13, 11, 2], [14, 11, 2],
  [14, 12, 1], [14, 13, 1], [14, 14, 1],
];
const STREAM_AT = new Map(STREAM.map(([x, y, level], i) => [`${x},${y}`, { level, next: STREAM[i + 1] }]));
/** Two trails meet below the maple: one up from the front-left corner, one in from the right over the footbridge. */
const TRAILS: [number, number][][] = [
  [[1, 19], [4, 14], [7, 10], [8, 7], [6, 6]],
  [[19, 10], [15, 9], [13, 8], [11, 8], [8, 6]],
];
const BRIDGE = '12,8';

/**
 * Autumn woods in three pockets (left flank, back right, by the pond) and a couple standing
 * alone, so there is cover without closing the lanes up the slope.
 */
const TREES = new Set([
  '1,9', '3,10', '2,12', '4,8', '0,11',
  '15,2', '17,4', '16,6', '18,2', '19,6',
  '11,16', '13,18', '10,18',
  '7,9', '17,10',
]);
const ROCKS = new Set(['6,2', '14,5', '8,16']);

/** Nearest point on a polyline: distance, which segment, and how far along it (0-1). */
function nearest(path: [number, number][], x: number, y: number): { d: number; segment: number; t: number } {
  let best = { d: Infinity, segment: 0, t: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    const d = Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
    if (d < best.d) best = { d, segment: i, t };
  }
  return best;
}

/** The slope: low at the front corner, climbing to the back, with a gentle wobble. */
function slope(x: number, y: number): number {
  const rise = (2 * SIZE - 2 - x - y) / (2 * SIZE - 2);
  const wobble = valueNoise(SEED, x / 3, y / 3) - 0.5;
  return Math.max(1, Math.min(6, 1 + Math.floor(rise * 5.4 + wobble * 1.3)));
}

function place(x: number, y: number, rand: () => number): Cell {
  // The knoll rises in two rounded steps to the maple.
  const knoll = Math.hypot(x - MAPLE[0], y - MAPLE[1]);
  if (knoll < 0.5) return { terrain: 'autumn_grass', height: 7, prop: 'great_maple' };
  if (knoll < 1.5) return { terrain: 'autumn_grass', height: 7 };
  if (knoll < 2.9) return { terrain: 'autumn_grass', height: 6 };

  const pond = Math.hypot(x - POND[0], y - POND[1]);
  if (pond < 1.5) return { terrain: 'deep_water', height: 0, water: { kind: 'lake', flow: [0, 0] } };
  if (pond < 2.6) return { terrain: 'shallow_water', height: 0, water: { kind: 'lake', flow: [0, 0] } };

  const reach = STREAM_AT.get(`${x},${y}`);
  if (reach) {
    // Flowing towards the next tile of the stream (the last one pours into the pond).
    const [nx, ny] = reach.next ?? [x, y + 1];
    const flow: WaterInfo['flow'] = [nx - x, ny - y];
    return { terrain: 'shallow_water', height: reach.level, water: { kind: 'river', flow }, feature: `${x},${y}` === BRIDGE ? 'bridge_wood' : undefined };
  }

  // The banks stand a step above the nearest stretch of stream wherever the slope would sink below it.
  const [, , level] = STREAM.reduce((a, b) => (Math.hypot(b[0] - x, b[1] - y) < Math.hypot(a[0] - x, a[1] - y) ? b : a));
  const close = STREAM.some(([sx, sy]) => Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= 2);
  const height = close ? Math.max(slope(x, y), level + 1) : slope(x, y);
  if (TRAILS.some((t) => nearest(t, x + 0.5, y + 0.5).d < 0.6)) return { terrain: 'road', height };
  if (TREES.has(`${x},${y}`)) return { terrain: 'autumn_grass', height, prop: 'autumn_tree' };
  if (ROCKS.has(`${x},${y}`)) return { terrain: 'autumn_grass', height, prop: 'boulder' };
  // Rocky ground breaks through on the steepest part of the slope.
  const rocky = height >= 4 && hash(SEED, x, y) < 0.18 && rand() < 0.8;
  return { terrain: rocky ? 'scree' : 'autumn_grass', height };
}

export const autumn: Theme = {
  id: 'autumn',
  name: 'Autumn Ridge',
  category: 'Wilds',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    // Beside a waterfall the bank keeps to the pool it borders, never a step above the one below.
    for (const t of map.tiles) {
      if (isLiquid(t)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(map, t.x + dx, t.y + dy);
        if (n && isLiquid(n)) t.height = Math.min(t.height, n.height + 1);
      }
    }
    return map;
  },
  focus: MAPLE,
  zoom: 0.85,
  light: {
    background: '#e8c9a0', sky: '#ffe8c8', bounce: '#5a4630', ambient: 1.25,
    sun: '#ffd8a0', sunIntensity: 2.3, sunFrom: [-6, 7, 3], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#5a86b8'], [120, '#a6bfd6'], [190, '#eed4ae'], [269, '#f4dcb8']]);
    far.sun(1500, 150, 9, '#fff2d0', 3);
    far.ridge({ seed: 3, base: 190, amp: 80, period: 6, color: '#9a94aa', shade: '#88829a', jag: 0.12 });
    far.mist(170, 40, '#f2dcc0', 0.5);
    far.ridge({ seed: 5, base: 214, amp: 50, period: 7, color: '#a0724e', shade: '#8a5e40', jag: 0.1 });
    far.treeline({ rand, base: 236, color: '#b47a52', light: '#c48c60', kind: 'round', size: 8 });
    far.mist(226, 30, '#f2dcc0', 0.45);
    far.treeline({ rand, base: 256, color: '#9a5634', light: '#b06c40', kind: 'round', size: 10 });
    far.birds(rand, 6, '#3a2a24', 90);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 8, 20, 110, '#fff6ea', '#ead4be') };
  },
};
