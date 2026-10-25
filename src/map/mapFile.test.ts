import { describe, expect, it } from 'vitest';
import { THEMES } from '../themes';
import { MAX_HEIGHT, parseMap, serializeMap } from './mapFile';
import type { MapFile } from './types';

const courtyard = THEMES.find((t) => t.id === 'courtyard')!.map();

/** A saved courtyard with one change made to its data, as if edited by hand. */
function edited(change: (data: MapFile & Record<string, unknown>) => void): string {
  const data = JSON.parse(serializeMap(courtyard));
  change(data);
  return JSON.stringify(data);
}

describe('map files', () => {
  it('round-trip, props and all', () => {
    expect(courtyard.tiles.some((t) => t.prop)).toBe(true);
    expect(parseMap(serializeMap(courtyard))).toEqual(courtyard);
  });

  it('put one tile on each line, for editing by hand', () => {
    const lines = serializeMap(courtyard).trimEnd().split('\n');
    expect(lines).toHaveLength(courtyard.tiles.length + 8);
    expect(JSON.parse(lines[6].replace(/,$/, ''))).toEqual(courtyard.tiles[0]);
  });

  it('accept a hand edit', () => {
    const map = parseMap(edited((d) => Object.assign(d.tiles[25], { terrain: 'forest', height: 4 })));
    expect(map.tiles[25]).toMatchObject({ terrain: 'forest', height: 4 });
  });

  it('drop fields they do not know', () => {
    const map = parseMap(edited((d) => Object.assign(d.tiles[0], { note: 'hello' })));
    expect(map.tiles[0]).not.toHaveProperty('note');
  });

  it.each([
    ['not JSON', '{ nope', /not valid JSON/],
    ['an array', '[]', /one map object/],
    ['another version', edited((d) => Object.assign(d, { version: 2 })), /version 1/],
    ['a missing tile', edited((d) => d.tiles.pop()), /must list 400 tiles/],
    ['an oversized board', edited((d) => Object.assign(d, { width: 65 })), /from 1 to 64/],
    ['an unknown terrain', edited((d) => Object.assign(d.tiles[37], { terrain: 'lavaa' })), /Tile 37 \(x 17, y 1\): unknown terrain "lavaa"/],
    ['a column too tall', edited((d) => Object.assign(d.tiles[3], { height: MAX_HEIGHT + 1 })), /Tile 3 .*"height"/],
    ['a fractional height', edited((d) => Object.assign(d.tiles[3], { height: 2.5 })), /Tile 3 .*"height"/],
    ['tiles out of order', edited((d) => ([d.tiles[0], d.tiles[1]] = [d.tiles[1], d.tiles[0]])), /Tile 0 .*row by row/],
    ['bad water', edited((d) => Object.assign(d.tiles[5], { water: { kind: 'puddle', flow: [0, 0] } })), /Tile 5 .*"water"/],
    ['an unknown prop', edited((d) => Object.assign(d.tiles[5], { prop: 'dragon' })), /Tile 5 .*unknown prop "dragon"/],
  ])('reject %s, saying what is wrong', (_, text, message) => {
    expect(() => parseMap(text)).toThrow(message);
  });
});
