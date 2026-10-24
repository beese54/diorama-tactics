import { describe, expect, it } from 'vitest';
import { placeFlora } from './Flora';
import { paintGround } from './ground';
import { TERRAIN } from './terrain';
import { createTestMap } from './testMap';
import { TILE_PX } from './textures';
import { TERRAIN_IDS } from './types';

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
