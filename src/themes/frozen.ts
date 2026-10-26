import { hash, valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { scenery, speckLayer } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 131;
const LAKE: [number, number] = [10.5, 11.5];
/** The landmark: a fishing hut out on the ice, its fishing hole cut by the door. */
const HUT: [number, number] = [12, 12];

/** Snowy pines in three stands (back left, back right, front left), with open shore between. */
const PINES = new Set([
  '1,6', '2,8', '0,9', '3,7', '1,11',
  '15,1', '17,3', '16,5', '18,2', '19,5',
  '3,17', '5,18', '2,19',
]);
/** Snow-capped rocks along the shore, and two caught in the ice. */
const ROCKS = new Set(['6,3', '13,3', '18,9', '17,15', '8,18', '6,9', '15,14']);

/** How far a point lies inside the lake's wobbly oval: below 1 is ice. */
function lakeAt(x: number, y: number): number {
  const wobble = 0.22 * (valueNoise(SEED, x / 2.2, y / 2.2) - 0.5);
  return Math.hypot((x - LAKE[0]) / 7.2, (y - LAKE[1]) / 6.2) + wobble;
}

function place(x: number, y: number): Cell {
  const key = `${x},${y}`;
  const lake = lakeAt(x, y);
  if (lake < 1) {
    if (x === HUT[0] && y === HUT[1]) return { terrain: 'ice', height: 1, prop: 'ice_hut' };
    return { terrain: 'ice', height: 1, prop: ROCKS.has(key) ? 'snow_rock' : undefined };
  }

  // The shore climbs gently, then into rocky hills at the back corner.
  const rise = (2 * SIZE - 2 - x - y) / (2 * SIZE - 2);
  const wobble = valueNoise(SEED ^ 0x51, x / 3, y / 3) - 0.5;
  const height = Math.max(2, Math.min(6, 2 + Math.floor(rise * 4.2 + wobble * 1.4 - (lake < 1.25 ? 1 : 0))));
  const rocky = height >= 4 && hash(SEED, x, y) < 0.16;
  const prop = PINES.has(key) ? 'pine_snowy' : ROCKS.has(key) ? 'snow_rock' : undefined;
  return { terrain: rocky ? 'scree' : 'snowfield', height, prop };
}

export const frozen: Theme = {
  id: 'frozen',
  name: 'Frozen Lake',
  category: 'Wilds',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: HUT,
  zoom: 0.85,
  light: {
    background: '#d8e6f2', sky: '#e6f0ff', bounce: '#6a7a90', ambient: 1.4,
    sun: '#fff4e8', sunIntensity: 2.2, sunFrom: [-5, 8, 6], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4a78b0'], [120, '#a4c4e2'], [200, '#dce8f2'], [269, '#e8f0f6']]);
    far.sun(300, 120, 8, '#fffaf0', 3);
    far.ridge({ seed: 13, base: 204, amp: 120, period: 5, color: '#9aa8bc', shade: '#8494aa', snow: { color: '#f4f8fb', above: 150 }, jag: 0.16 });
    far.mist(176, 40, '#e4eef6', 0.5);
    far.ridge({ seed: 17, base: 230, amp: 52, period: 8, color: '#7a8ea4', shade: '#6a7e96', snow: { color: '#e8f0f6', above: 200 }, jag: 0.12 });
    far.treeline({ rand, base: 252, color: '#3e5a50', light: '#4e6c60', kind: 'pine', size: 8 });
    return { far: far.toCanvas(), overlay: speckLayer(SEED + 1, 14, ['#ffffff', '#e8f0f6'], [4, 16]) };
  },
};
