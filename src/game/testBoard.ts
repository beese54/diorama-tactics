import type { MapFile, PropId, TerrainId, Tile } from '../map/types';

/** Test boards drawn as text: `.` plains, `f` forest, `m` mountain, `s` swamp, `#` cliff, `o` plains under a fountain (blocks). */
const KEY: Record<string, [TerrainId, PropId?]> = {
  '.': ['plains'], f: ['forest'], m: ['mountain'], s: ['swamp'], '#': ['cliff'], o: ['plains', 'fountain'],
};

export function board(rows: string[]): MapFile {
  const tiles: Tile[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const [terrain, prop] = KEY[c];
      tiles.push({ x, y, height: 1, terrain, moisture: 0, water: null, feature: null, seedRand: 0, ...(prop ? { prop } : {}) });
    }),
  );
  return { version: 1, seed: 0, width: rows[0].length, height: rows.length, tiles };
}
