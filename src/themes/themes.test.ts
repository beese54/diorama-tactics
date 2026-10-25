import { describe, expect, it } from 'vitest';
import { PROPS } from '../map/props';
import { isBuilt, isLiquid } from '../map/surface';
import { IMPASSABLE, TERRAIN } from '../map/terrain';
import { PROP_IDS, TERRAIN_IDS, tileAt, type MapFile, type Tile } from '../map/types';
import { THEMES, themeFromUrl } from './index';

const showcases = THEMES.filter((t) => t.id !== 'meadow');
const walkable = (t: Tile) => TERRAIN[t.terrain].moveCost < IMPASSABLE && !(t.prop && PROPS[t.prop].blocks);

/** Walkable tiles reachable from the first walkable one, moving between edge neighbours. */
function reachable(map: MapFile): Set<Tile> {
  const start = map.tiles.find(walkable)!;
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = tileAt(map, queue[i].x + dx, queue[i].y + dy);
      if (n && walkable(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

describe('themes', () => {
  it('have unique ids, and the URL picks one (falling back to the first)', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(themeFromUrl('?map=volcano').id).toBe('volcano');
    expect(themeFromUrl('?map=nope').id).toBe(THEMES[0].id);
    expect(themeFromUrl('').id).toBe('meadow');
  });

  it.each(showcases.map((t) => [t.id, t] as const))('%s builds a valid, deterministic map', (_, theme) => {
    const map = theme.map();
    expect(map.tiles).toHaveLength(map.width * map.height);
    for (const t of map.tiles) {
      expect(tileAt(map, t.x, t.y)).toBe(t);
      expect(TERRAIN_IDS).toContain(t.terrain);
      expect(Number.isInteger(t.height) && t.height >= 0 && t.height <= 9).toBe(true);
      if (t.prop) {
        expect(PROP_IDS).toContain(t.prop);
        expect(isLiquid(t)).toBe(false);
      }
    }
    expect(JSON.stringify(theme.map())).toBe(JSON.stringify(map));
  });

  it.each(showcases.map((t) => [t.id, t] as const))('%s has its landmark on the focus tile', (_, theme) => {
    const map = theme.map();
    const focus = tileAt(map, ...theme.focus)!;
    expect(focus.prop).toBeDefined();
    expect(map.tiles.filter((t) => t.prop === focus.prop)).toHaveLength(1);
  });

  it.each(showcases.map((t) => [t.id, t] as const))('%s lets a walking unit reach every open tile', (_, theme) => {
    const map = theme.map();
    const open = map.tiles.filter(walkable);
    expect(open.length).toBeGreaterThan(map.tiles.length * 0.5);
    expect(reachable(map).size).toBe(open.length);
  });

  it.each(showcases.map((t) => [t.id, t] as const))('%s slopes natural banks down to its liquids', (_, theme) => {
    const map = theme.map();
    for (const t of map.tiles.filter(isLiquid)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(map, t.x + dx, t.y + dy);
        if (n && !isLiquid(n) && !isBuilt(n)) expect(n.height - t.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps tall built structures on the two back edges, so they never hide units', () => {
    for (const theme of showcases) {
      const map = theme.map();
      for (const t of map.tiles) {
        if (isBuilt(t) && TERRAIN[t.terrain].moveCost === IMPASSABLE) expect(Math.min(t.x, t.y), `${theme.id} (${t.x},${t.y})`).toBeLessThanOrEqual(1);
      }
    }
  });
});
