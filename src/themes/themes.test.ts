import { describe, expect, it } from 'vitest';
import { PROPS } from '../map/props';
import { isBuilt, isLiquid } from '../map/surface';
import { IMPASSABLE, TERRAIN, tileStats } from '../map/terrain';
import { PROP_IDS, TERRAIN_IDS, tileAt, type MapFile, type Tile } from '../map/types';
import { THEMES, themeFromUrl } from './index';
import { BOARD_SIZES, MAX_SIZE, MIN_SIZE, sizeFromUrl } from './world';
import { WORLD_SIZE } from '../map/generator';

const showcases = THEMES.filter((t) => t.id !== 'meadow');
const walkable = (t: Tile) => tileStats(t).moveCost < IMPASSABLE && !(t.prop && PROPS[t.prop].blocks);

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
  it('grow a generated map from ?seed=N, or a random seed when it is missing or malformed', () => {
    const world = themeFromUrl('?seed=42');
    expect(world).toMatchObject({ id: 'world', seed: 42 });
    expect(world.map().seed).toBe(42);
    expect(themeFromUrl('?map=world&seed=42').map()).toEqual(world.map());
    for (const search of ['?map=world', '?seed=abc', '?seed=-1', '?seed=99999999999']) {
      const { id, seed } = themeFromUrl(search);
      expect(id).toBe('world');
      expect(Number.isInteger(seed) && seed! > 0).toBe(true);
    }
    expect(themeFromUrl('?map=plaza&seed=42').id).toBe('plaza');
  });

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
        // Only floating props (boats) sit on water.
        expect(isLiquid(t)).toBe(!!PROPS[t.prop].floats);
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
    // A sea of cloud lies far below its islands on purpose: it has no banks.
    for (const t of map.tiles.filter((t) => isLiquid(t) && TERRAIN[t.terrain].style !== 'cloud')) {
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

describe('room to move', () => {
  it.each(showcases.map((t) => [t.id, t] as const))('%s keeps most open tiles free of props', (_, theme) => {
    const open = theme.map().tiles.filter(walkable);
    expect(open.filter((t) => !t.prop).length / open.length).toBeGreaterThan(0.8);
  });

  it('jungle keeps its tall trees to a few deliberate spots', () => {
    const map = THEMES.find((t) => t.id === 'jungle')!.map();
    expect(map.tiles.filter((t) => t.prop === 'jungle_tree').length).toBeLessThanOrEqual(12);
  });
});

describe('board size', () => {
  it('reads ?size=N within the allowed range, else the standard size', () => {
    expect(sizeFromUrl('?size=64')).toBe(64);
    expect(sizeFromUrl('?size=48&seed=3')).toBe(48);
    expect(sizeFromUrl('')).toBe(WORLD_SIZE);
    expect(sizeFromUrl('?size=abc')).toBe(WORLD_SIZE);
    expect(sizeFromUrl('?size=-5')).toBe(WORLD_SIZE);
    expect(sizeFromUrl('?size=4')).toBe(MIN_SIZE);
    expect(sizeFromUrl('?size=500')).toBe(MAX_SIZE);
    expect(sizeFromUrl('?size=9999')).toBe(WORLD_SIZE);
  });

  it('grows Wild Lands at the asked size, centred on its focus', () => {
    const theme = themeFromUrl('?map=world&seed=5&size=48');
    const map = theme.map();
    expect([map.width, map.height]).toEqual([48, 48]);
    expect(theme.focus).toEqual([24, 24]);
  });

  it('offers only sizes the URL accepts, the standard one first', () => {
    expect(BOARD_SIZES[0]).toBe(WORLD_SIZE);
    for (const n of BOARD_SIZES) expect(sizeFromUrl(`?size=${n}`)).toBe(n);
  });
});
