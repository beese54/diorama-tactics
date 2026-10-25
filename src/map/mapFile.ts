import { FEATURE_IDS, PROP_IDS, TERRAIN_IDS, type MapFile, type Tile, type WaterInfo } from './types';

/** Largest board a file may describe, per side. */
export const MAX_SIDE = 64;
/** Tallest column a file may hold; taller ones would rise out of the camera's view. */
export const MAX_HEIGHT = 12;

const WATER_KINDS: readonly WaterInfo['kind'][] = ['river', 'lake', 'sea', 'ford', 'waterfall'];

/** The map as JSON for editing by hand: the header on its own lines, then one tile per line. */
export function serializeMap(map: MapFile): string {
  const tiles = map.tiles.map((t) => '    ' + JSON.stringify(t)).join(',\n');
  return `{\n  "version": ${map.version},\n  "seed": ${map.seed},\n  "width": ${map.width},\n  "height": ${map.height},\n  "tiles": [\n${tiles}\n  ]\n}\n`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isUnit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * Reads a map file, typically one saved from the page and edited by hand. Everything is
 * checked, because the file comes from outside: a bad file throws an Error whose message
 * says what is wrong and where. Unknown fields are dropped.
 */
export function parseMap(text: string): MapFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isObject(data)) throw new Error('The file should hold one map object.');
  if (data.version !== 1) throw new Error('Only version 1 map files can be read.');
  if (!isInt(data.seed, 0, 2 ** 32 - 1)) throw new Error('"seed" must be a whole number from 0 to 4294967295.');
  const { width, height } = data;
  if (!isInt(width, 1, MAX_SIDE) || !isInt(height, 1, MAX_SIDE)) throw new Error(`"width" and "height" must be whole numbers from 1 to ${MAX_SIDE}.`);
  if (!Array.isArray(data.tiles) || data.tiles.length !== width * height) throw new Error(`"tiles" must list ${width * height} tiles (width × height).`);

  const tiles = data.tiles.map((raw: unknown, i): Tile => {
    const x = i % width;
    const y = Math.floor(i / width);
    const fail = (what: string): never => {
      throw new Error(`Tile ${i} (x ${x}, y ${y}): ${what}`);
    };
    if (!isObject(raw)) return fail('should be an object.');
    if (raw.x !== x || raw.y !== y) fail(`"x" and "y" should be ${x} and ${y}: tiles go row by row.`);
    if (!isInt(raw.height, 0, MAX_HEIGHT)) fail(`"height" must be a whole number from 0 to ${MAX_HEIGHT}.`);
    if (!isOneOf(TERRAIN_IDS, raw.terrain)) fail(`unknown terrain ${JSON.stringify(raw.terrain)}.`);
    if (!isUnit(raw.moisture)) fail('"moisture" must be a number from 0 to 1.');
    if (!isUnit(raw.seedRand) || raw.seedRand === 1) fail('"seedRand" must be a number from 0 up to (not including) 1.');
    if (raw.feature !== null && !isOneOf(FEATURE_IDS, raw.feature)) fail(`unknown feature ${JSON.stringify(raw.feature)}.`);
    if (raw.prop !== undefined && !isOneOf(PROP_IDS, raw.prop)) fail(`unknown prop ${JSON.stringify(raw.prop)}.`);
    let water: WaterInfo | null = null;
    if (raw.water !== null) {
      const w = raw.water;
      const flowOk = isObject(w) && Array.isArray(w.flow) && w.flow.length === 2 && w.flow.every((f) => typeof f === 'number' && Number.isFinite(f));
      if (!isObject(w) || !isOneOf(WATER_KINDS, w.kind) || !flowOk) fail(`"water" must be null or { "kind": one of ${WATER_KINDS.join(', ')}, "flow": [dx, dy] }.`);
      const { kind, flow } = w as { kind: WaterInfo['kind']; flow: [number, number] };
      water = { kind, flow: [flow[0], flow[1]] };
    }
    const tile: Tile = {
      x, y,
      height: raw.height as number,
      terrain: raw.terrain as Tile['terrain'],
      moisture: raw.moisture as number,
      water,
      feature: raw.feature as Tile['feature'],
      seedRand: raw.seedRand as number,
    };
    if (raw.prop !== undefined) tile.prop = raw.prop as Tile['prop'];
    return tile;
  });
  return { version: 1, seed: data.seed, width, height, tiles };
}
