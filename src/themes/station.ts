import { buildMap, type Cell } from '../map/build';
import type { PropId, TerrainId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 163;
/** The landmark: a preserved steam engine on its plinth in the middle of the forecourt. */
const LOCOMOTIVE: [number, number] = [10, 12];
/** A terminus: two tracks end at buffer stops on the west side, with a platform either side. */
const PLATFORMS = [2, 5];
const TRACKS = [3, 4];
/** The taxi lane in front of the station, and the avenue out to the front edge. */
const LANE = 7;
const AVENUE = [17, 18];

/** The station along the north edge, its booking hall tallest; hotel and offices on the west. [from, to, terrain, height] */
const NORTH: [number, number, TerrainId, number][] = [[0, 3, 'brick_building', 7], [4, 7, 'brick_building', 8], [8, 11, 'plaster_building', 9], [12, 15, 'brick_building', 8], [16, 19, 'brick_building', 7]];
const WEST: [number, number, TerrainId, number][] = [[2, 6, 'brick_building', 7], [7, 12, 'plaster_building', 6], [13, 19, 'brick_building', 7]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,12': 'locomotive',
  // The end of the line, and the platforms.
  '2,3': 'buffer_stop', '2,4': 'buffer_stop',
  '6,2': 'bench', '10,2': 'station_clock', '14,2': 'bench', '4,5': 'lamp_post', '9,5': 'bench', '15,5': 'lamp_post',
  // The forecourt: cycle racks, the bus stop on the avenue, trees and lamps.
  '4,9': 'bike_rack', '5,9': 'bike_rack', '16,10': 'bus_shelter', '16,7': 'traffic_light',
  '7,9': 'planter', '13,9': 'planter', '7,15': 'lamp_post', '13,15': 'lamp_post',
  '3,14': 'tree', '4,16': 'tree', '6,17': 'bench', '12,18': 'tree', '15,16': 'tree', '10,17': 'bench',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  const block = (blocks: typeof NORTH, v: number) => blocks.find(([a, b]) => v >= a && v <= b)!;
  if (y <= 1) {
    const [, , terrain, height] = block(NORTH, x);
    return { terrain, height };
  }
  if (x <= 1) {
    const [, , terrain, height] = block(WEST, y);
    return { terrain, height };
  }
  // Platforms stand a step above the tracks and the forecourt.
  if (PLATFORMS.includes(y)) return { terrain: 'pavement', height: 3, prop };
  if (TRACKS.includes(y)) return { terrain: 'rail', height: 2, prop };
  if (y === LANE || (AVENUE.includes(x) && y > LANE)) return { terrain: 'asphalt', height: 2, prop };
  // A raised lawn round the engine's plinth.
  const dx = Math.abs(x - LOCOMOTIVE[0]);
  const dy = Math.abs(y - LOCOMOTIVE[1]);
  if (dx === 0 && dy === 0) return { terrain: 'flagstone', height: 3, prop };
  if (dx <= 2 && dy <= 2) return { terrain: dx === 2 && dy === 2 ? 'flowerbed' : 'lawn', height: 3, prop };
  // A small garden in the west corner, raised behind a kerb.
  if (x >= 3 && x <= 5 && y >= 13 && y <= 17) return { terrain: (x + y) % 4 === 0 ? 'flowerbed' : 'lawn', height: 3, prop };
  return { terrain: 'pavement', height: 2, prop };
}

export const station: Theme = {
  id: 'station',
  name: 'Station Square',
  category: 'Modern Town',
  map: () => buildMap(SEED, SIZE, place),
  focus: LOCOMOTIVE,
  zoom: 0.85,
  light: {
    background: '#e4d8c8', sky: '#fff0d8', bounce: '#5a4c40', ambient: 1.3,
    sun: '#ffe2b0', sunIntensity: 2.5, sunFrom: [-7, 7, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // Late afternoon: a warm sky over the town, the sun getting low.
    far.sky([[0, '#5a86b8'], [130, '#b4c4d4'], [210, '#ecd8bc'], [269, '#f2e2c8']]);
    far.sun(1500, 150, 10, '#fff0c8', 3);
    far.skyline({ rand, base: 250, minH: 40, maxH: 110, colors: ['#a49c9c', '#ada4a0', '#b4aca4'], window: '#d8d0c4', lit: 0.25, roofline: '#bcb4aa' });
    far.mist(196, 40, '#f0e2cc', 0.4);
    far.rooftops({ rand, base: 262, walls: ['#a4553c', '#b8735a', '#c8b498'], roofs: ['#4e5664', '#5a6270'], window: '#3c4c60' });
    far.birds(rand, 7, '#3a4048', 90);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 9, 16, 110) };
  },
};
