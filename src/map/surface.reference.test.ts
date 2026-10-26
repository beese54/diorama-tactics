import { describe, expect, it } from 'vitest';
import { generateMap } from './generator';
import { BANK_DROP, SAMPLES, shapeAt, surfaceAt, tileSurface } from './surface';
import { LIQUID_STYLES, TERRAIN, type LiquidStyle } from './terrain';
import { createTestMap } from './testMap';
import { THEMES } from '../themes';
import { tileAt, type MapFile, type Tile } from './types';

// The surface as it was before M9 made it faster, kept verbatim: the faster code must give exactly the same shapes.
const isLiquid = (tile: Tile) => LIQUID_STYLES.includes(TERRAIN[tile.terrain].style as LiquidStyle);
const isBuilt = (tile: Tile) => TERRAIN[tile.terrain].shape === 'built';
const profile = (d: number, w: number) => (d >= w ? 0 : 1 - Math.sin((Math.PI / 2) * (d / w)));
function edgeDistance(map: MapFile, tile: Tile, u: number, v: number, w: number, outside: (t: Tile | undefined) => boolean): number {
  let alongX = Infinity;
  let alongZ = Infinity;
  let diagonal = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0 && dy === 0) || !outside(tileAt(map, tile.x + dx, tile.y + dy))) continue;
      const ex = dx < 0 ? u : dx > 0 ? 1 - u : 0;
      const ez = dy < 0 ? v : dy > 0 ? 1 - v : 0;
      if (dy === 0) alongX = Math.min(alongX, ex);
      else if (dx === 0) alongZ = Math.min(alongZ, ez);
      else diagonal = Math.min(diagonal, Math.hypot(ex, ez));
    }
  }
  const sides = alongX < w && alongZ < w ? Math.max(0, w - Math.hypot(w - alongX, w - alongZ)) : Math.min(alongX, alongZ);
  return Math.min(sides, diagonal);
}
function referenceSurfaceAt(map: MapFile, tile: Tile, u: number, v: number) {
  if (isLiquid(tile) || isBuilt(tile)) return { offset: 0, foot: 0 };
  const { width: w, lipDrop, footRise } = shapeAt(map.seed, tile.x + u, tile.y + v);
  const foot = profile(edgeDistance(map, tile, u, v, w, (t) => !!t && t.height > tile.height && !isBuilt(t)), w);
  const lip = profile(edgeDistance(map, tile, u, v, w, (t) => !t || (t.height < tile.height && !isLiquid(t))), w);
  const bank = profile(edgeDistance(map, tile, u, v, w, (t) => !!t && t.height < tile.height && isLiquid(t)), w);
  return { offset: footRise * foot - Math.max(lipDrop * lip, BANK_DROP * bank), foot };
}

/** Mesh sample points plus a few off-grid ones, as flora and props sample. */
const POINTS = [...SAMPLES, 0.03, 0.37, 0.5, 0.71, 0.995];

describe('surface matches the pre-M9 shapes exactly', () => {
  const maps: [string, MapFile][] = [
    ['test map', createTestMap()],
    ...THEMES.map((t) => [t.id, t.map()] as [string, MapFile]),
    ...[1, 7, 4242, 90210].map((seed) => [`world ${seed}`, generateMap(seed)] as [string, MapFile]),
    ['world 4242 at 48', generateMap(4242, 48)],
  ];
  it.each(maps)('%s', (_, map) => {
    let mismatches = 0;
    for (const tile of map.tiles) {
      const surface = tileSurface(map, tile);
      for (const v of POINTS) {
        for (const u of POINTS) {
          const want = referenceSurfaceAt(map, tile, u, v);
          const a = surface(u, v);
          const b = surfaceAt(map, tile, u, v);
          if (!Object.is(a.offset, want.offset) || !Object.is(a.foot, want.foot) || !Object.is(b.offset, want.offset) || !Object.is(b.foot, want.foot)) mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});
