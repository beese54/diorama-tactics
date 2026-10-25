import { describe, expect, it } from 'vitest';
import { placeFlora, plantKind } from './Flora';
import { generateMap } from './generator';
import { isLiquid } from './surface';
import { paintGround } from './ground';
import { TERRAIN } from './terrain';
import { createTestMap } from './testMap';
import { TILE_PX } from './textures';
import { TERRAIN_IDS, tileAt } from './types';

describe('flora placement', () => {
  const map = createTestMap();
  const ground = paintGround(map);
  const plants = placeFlora(map, ground);

  it('grows only on pixels painted as grass', () => {
    expect(plants.length).toBeGreaterThan(100);
    for (const p of plants) {
      const gx = Math.floor((p.tile.x + p.u) * TILE_PX);
      const gy = Math.floor((p.tile.y + p.v) * TILE_PX);
      const style = TERRAIN[TERRAIN_IDS[ground.material[gy * ground.width + gx]]].style;
      expect(['grass', 'flowers']).toContain(style);
    }
  });

  it('is deterministic', () => {
    expect(placeFlora(map, ground)).toEqual(plants);
  });

  it('is densest in meadows', () => {
    const perTile = (terrain: string) => {
      const tiles = map.tiles.filter((t) => t.terrain === terrain).length;
      return plants.filter((p) => p.tile.terrain === terrain).length / tiles;
    };
    expect(perTile('meadow')).toBeGreaterThan(perTile('plains') * 1.5);
  });
});

describe('wild decor on generated maps', () => {
  const maps = [7, 13, 21].map((seed) => generateMap(seed));
  const decor = maps.map((map) => {
    const ground = paintGround(map);
    return { map, plain: placeFlora(map, ground), wild: placeFlora(map, ground, true) };
  });

  it('leaves the flowers exactly as they were, and only adds to them', () => {
    for (const { plain, wild } of decor) expect(wild.slice(0, plain.length)).toEqual(plain);
  });

  it('grows reeds in wetland or right at the water, never on sand; pebbles on rocky ground, lying still; bushes in light woods', () => {
    const kinds = new Set<string>();
    for (const { map, plain, wild } of decor) {
      for (const p of wild.slice(plain.length)) {
        const kind = plantKind(p);
        kinds.add(kind);
        if (kind === 'reed') {
          const wet = ['marsh', 'swamp', 'bog'].includes(p.tile.terrain);
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .filter(([dx, dy]) => { const n = tileAt(map, p.tile.x + dx, p.tile.y + dy); return !!n && isLiquid(n); })
            .map(([dx, dy]) => (dx > 0 ? 1 - p.u : dx < 0 ? p.u : dy > 0 ? 1 - p.v : p.v));
          expect(wet || (TERRAIN[p.tile.terrain].style !== 'sand' && Math.min(...edge) < 0.3), `${p.tile.terrain} ${p.u},${p.v}`).toBe(true);
        }
        if (kind === 'pebble') {
          expect(['scree', 'mountain', 'badlands', 'hills']).toContain(p.tile.terrain);
          expect(p.still).toBe(true);
        }
        if (kind === 'bush') expect(p.tile.terrain).toBe('light_woods');
      }
    }
    expect([...kinds].sort()).toEqual(['bush', 'pebble', 'reed']);
  });
});
