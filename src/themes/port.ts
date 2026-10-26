import { hash } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 193;
/** The landmark: a ship-to-shore gantry crane on the quay, its boom out over the ship. */
const CRANE: [number, number] = [10, 5];
/**
 * A container ship lies along the north edge at full scale, so only a slice of it fits on the
 * board: its deck five steps above the water, a tier of boxes on it, running off both sides.
 */
const SHIP_ROWS = 3;
const DECK = 5;
const BERTH = 3;
/** A timber gangway tower across the berth, a step below the deck: the way aboard. */
const GANGWAY_X = 16;
/** The quay and the container yard behind it stand two steps above the water. */
const GROUND = 2;
/** Container stacks in the yard, with lanes between for the straddle carriers. */
const STACK_X = [[3, 5], [8, 10], [13, 15]];
const STACK_Y = [[8, 9], [12, 13], [16, 17]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,5': 'gantry_crane',
  // Bollards along the berth, floodlight masts over the yard.
  '3,4': 'bollard', '7,4': 'bollard', '14,4': 'bollard', '18,4': 'bollard',
  '6,6': 'floodlight', '17,11': 'floodlight', '7,15': 'floodlight',
  // Lashing gear, cones and barriers in the lanes.
  '17,18': 'crate', '18,18': 'barrel', '11,15': 'traffic_cone', '16,7': 'jersey_barrier', '12,19': 'jersey_barrier', '2,11': 'crate',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (y < SHIP_ROWS) return y < SHIP_ROWS - 1 ? { terrain: 'container', height: DECK + 2 } : { terrain: 'ship_deck', height: DECK };
  if (y === BERTH && x === GANGWAY_X) return { terrain: 'boardwalk', height: DECK - 1 };
  if (y === BERTH) return { terrain: 'deep_water', height: 0, water: { kind: 'sea', flow: [0, 0] } };
  // A wall of stacked boxes along the west edge, behind the yard.
  if (x <= 1 && y > BERTH + 2) return { terrain: 'container', height: GROUND + 3 + (y % 3 === 0 ? 1 : 0) };
  if (y <= BERTH + 2) return { terrain: 'pavement', height: GROUND, prop };
  const sx = STACK_X.findIndex(([a, b]) => x >= a && x <= b);
  const sy = STACK_Y.findIndex(([a, b]) => y >= a && y <= b);
  if (sx >= 0 && sy >= 0) {
    // Each stack one to three boxes high, so the yard is a maze of heights.
    const tiers = 1 + Math.floor(hash(SEED, sx * 7 + x, sy * 5 + (y & 1)) * 3);
    return { terrain: 'container', height: GROUND + tiers };
  }
  return { terrain: 'asphalt', height: GROUND, prop };
}

export const port: Theme = {
  id: 'port',
  name: 'Container Port',
  category: 'Neon City',
  map: () => buildMap(SEED, SIZE, place),
  focus: CRANE,
  zoom: 0.85,
  light: {
    background: '#0c1220', sky: '#7a90c8', bounce: '#2a2a30', ambient: 1.15,
    sun: '#a8c0ff', sunIntensity: 0.7, sunFrom: [-5, 10, 4], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // Night over the docks: the sea out past the ship, the far shore's lights along it.
    far.sky([[0, '#070c1a'], [140, '#122038'], [200, '#22304a'], [269, '#2a3450']]);
    far.stars(rand, 120, 150);
    far.sun(700, 70, 7, '#eef2ff', 3.2);
    far.skyline({ rand, base: 214, minH: 8, maxH: 40, colors: ['#141c2c', '#18202e', '#121a28'], window: '#ffc070', lit: 0.35, neon: ['#ff5fa8', '#4fe3ff'] });
    far.ridge({ seed: 91, base: 216, amp: 1, period: 2, color: '#16243a', shade: '#16243a', jag: 0 });
    far.mist(208, 14, '#3a4a66', 0.35);
    far.ridge({ seed: 93, base: 248, amp: 1, period: 2, color: '#101c2e', shade: '#101c2e', jag: 0 });
    return { far: far.toCanvas() };
  },
};
