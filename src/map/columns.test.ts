import { describe, expect, it } from 'vitest';
import { atlasLayout, STEP_PX } from './atlasLayout';
import { buildColumnRange } from './columns';
import { generateMap } from './generator';
import { THEMES } from '../themes';
import type { MapFile } from './types';

/** Layer of cliff faces in the column geometry (tops 0, sides 1, falls 2). */
const SIDES = 1;

describe('cliff faces', () => {
  const maps: [string, MapFile][] = [
    ...THEMES.map((t) => [t.id, t.map()] as [string, MapFile]),
    ['world 7', generateMap(7)],
    ['world 4242', generateMap(4242)],
  ];

  // A face that strays into the next row shows a speck of another terrain's cliff (or of
  // nothing), and changes whenever a terrain is added to the atlas.
  it.each(maps)('take their texture from one atlas cell each: %s', (_, map) => {
    const { height } = atlasLayout();
    const data = buildColumnRange(map);
    const row = (vertex: number) => ((1 - data.uvs[2 * vertex + 1]) * height) / STEP_PX;
    const indices = data.indices[SIDES];
    // UVs are stored as 32-bit floats, so a corner on a cell's edge may be off by ~1e-4 of a row.
    const slack = 1e-3;
    let strays = 0;
    for (let k = 0; k < indices.length; k += 3) {
      const rows = [indices[k], indices[k + 1], indices[k + 2]].map(row);
      const cell = Math.floor(Math.min(...rows) + slack);
      if (Math.max(...rows) > cell + 1 + slack) strays++;
    }
    expect(strays).toBe(0);
  });
});
