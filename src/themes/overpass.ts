import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 181;
/** The landmark: a giant noodle-bar billboard beside the expressway. */
const BILLBOARD: [number, number] = [11, 13];
/** The expressway: three lanes on a raised embankment, ramping down to the street at its west end. */
const LANES = [8, 9, 10];
const DECK = 5;
const RAMP_FROM = 2;
const RAMP_TO = 4;
/** Steps up to the deck from the south side. */
const STAIRS_X = 15;
/** A street along the front, with a crossing. */
const STREET = [15, 16];
const CROSSING = 8;
/** Shop-house heights along the two back edges. */
const ROOFLINE = [8, 8, 7, 7, 9, 9, 9, 6, 6, 8, 8, 8, 7, 7, 9, 9, 6, 6, 8, 8];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '11,13': 'billboard',
  // On the deck: the sign gantry, lamps, and road works with barriers and cones.
  '8,9': 'sign_gantry', '7,10': 'highway_lamp', '13,8': 'highway_lamp', '18,10': 'highway_lamp',
  '15,8': 'jersey_barrier', '16,8': 'jersey_barrier', '11,10': 'traffic_cone', '12,10': 'jersey_barrier',
  // Under the expressway's north side: noodle stalls, vending machines, lanterns.
  '4,3': 'stall', '7,3': 'stall', '12,3': 'stall', '2,5': 'vending', '16,2': 'vending', '18,4': 'crate', '18,5': 'barrel',
  '5,6': 'lantern_post', '10,6': 'lantern_post', '15,6': 'lantern_post',
  // The south side and the street.
  '3,13': 'lantern_post', '8,13': 'lantern_post', '18,13': 'lantern_post', '19,12': 'vending',
  '7,14': 'traffic_light', '9,17': 'traffic_light', '4,18': 'stall', '17,18': 'stall', '12,18': 'lantern_post',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (x <= 1 || y <= 1) return { terrain: 'neon_building', height: ROOFLINE[x <= 1 ? y : x] };
  if (LANES.includes(y)) {
    // The ramp climbs a step per tile from the street to the deck.
    const height = x >= RAMP_FROM && x <= RAMP_TO ? 2 + x - RAMP_FROM : x > RAMP_TO ? DECK : 1;
    return { terrain: height > 1 ? 'highway' : 'wet_street', height, prop };
  }
  // Concrete steps down from the deck on the south side.
  const below = y - LANES[2];
  if (x === STAIRS_X && below >= 1 && below <= 3) return { terrain: 'pavement', height: DECK - below, prop };
  if (STREET.includes(y)) return { terrain: x === CROSSING ? 'zebra' : 'asphalt', height: 1, prop };
  return { terrain: 'wet_street', height: 1, prop };
}

export const overpass: Theme = {
  id: 'overpass',
  name: 'Highway Overpass',
  category: 'Neon City',
  map: () => buildMap(SEED, SIZE, place),
  focus: BILLBOARD,
  zoom: 0.85,
  light: {
    background: '#0e1220', sky: '#7a8ad8', bounce: '#30242a', ambient: 1.1,
    sun: '#a0b4ff', sunIntensity: 0.65, sunFrom: [-4, 10, 3], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // Late at night: a deep blue sky with the city's glow along the horizon.
    far.sky([[0, '#080c1c'], [130, '#141c3a'], [220, '#2a2448'], [269, '#4a2a4a']]);
    far.stars(rand, 90, 120);
    far.sun(1400, 50, 6, '#f2eeff', 3);
    const neon = ['#ff5fa8', '#4fe3ff', '#ffd84a', '#9a6aff'];
    far.skyline({ rand, base: 240, minH: 90, maxH: 190, colors: ['#151a30', '#1a1e36', '#121628'], window: '#ffb060', lit: 0.14, neon });
    far.skyline({ rand, base: 268, minH: 50, maxH: 120, colors: ['#22203c', '#282444', '#1e1c34'], window: '#ffcf80', lit: 0.28, neon });
    return { far: far.toCanvas() };
  },
};
