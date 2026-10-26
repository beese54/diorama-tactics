import { describe, expect, it } from 'vitest';
import { generateMap } from './generator';
import { composeGround, paintGround, paintLand, paintLiquids } from './ground';
import { BoardWorkers, shareFrames, shareRuns, weightedRuns } from './BoardWorkers';
import { ALL_FRAMES } from './liquid';
import { buildColumnRange, joinColumns } from './columns';
import { THEMES } from '../themes';

/** Byte-for-byte equality of two images, quicker than a deep comparison. */
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('ground painted in parts', () => {
  it('shares every frame once, in loop order, as evenly as it goes', () => {
    for (let n = 1; n <= 6; n++) {
      const shares = shareFrames(n);
      expect(shares).toHaveLength(n);
      expect(shares.flat()).toEqual(ALL_FRAMES);
      const sizes = shares.map((s) => s.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  // What the workers do: land on one, the frames split between the others, joined in order.
  it.each([
    ['world 4242 (water, murk)', generateMap(4242), true],
    ['volcano (lava glows)', THEMES.find((t) => t.id === 'volcano')!.map(), false],
  ] as const)('gives the same pixels as painting it whole: %s', (_, map, wild) => {
    const whole = paintGround(map, wild);
    const parts = shareFrames(3).map((frames) => paintLiquids(map, wild, frames));
    const joined = composeGround(paintLand(map), parts[0].map((layer, l) => ({ ...layer, frames: parts.flatMap((p) => p[l].frames) })));
    expect(joined.material).toEqual(whole.material);
    expect(joined.frames.length).toBe(whole.frames.length);
    joined.frames.forEach((frame, f) => expect(same(frame, whole.frames[f])).toBe(true));
    expect(joined.glow?.length ?? 0).toBe(whole.glow?.length ?? 0);
    joined.glow?.forEach((frame, f) => expect(same(frame, whole.glow![f])).toBe(true));
  });

  // What the workers do since M10: frame 0 first, the other frames later, laid into the same image.
  it.each([
    ['world 4242 (water, murk)', generateMap(4242), true],
    ['volcano (lava glows)', THEMES.find((t) => t.id === 'volcano')!.map(), false],
  ] as const)('gives the same pixels when the first frame comes before the rest: %s', (_, map, wild) => {
    const whole = paintGround(map, wild);
    const land = paintLand(map);
    const image = composeGround(land, paintLiquids(map, wild, [0]), [0]);
    expect(image.frames[1]).toBeUndefined();
    for (const which of [[1, 2, 3, 4], [5, 6, 7], [8, 9, 10, 11]]) composeGround(land, paintLiquids(map, wild, which), which, image);
    whole.frames.forEach((frame, f) => expect(same(image.frames[f], frame), `frame ${f}`).toBe(true));
    whole.glow?.forEach((frame, f) => expect(same(image.glow![f], frame), `glow ${f}`).toBe(true));
  });

  it('paints on this thread where there are no workers', async () => {
    const workers = new BoardWorkers();
    await workers.ready;
    const map = generateMap(7);
    const { ground: image } = await workers.paintGround(map, true);
    const whole = paintGround(map, true);
    expect(same(image.frames[5], whole.frames[5])).toBe(true);
  });
});

describe('columns built in runs', () => {
  const equal = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (v: number, i: number) => Object.is(v, b[i]));

  it('splits tiles into even runs that cover them all once', () => {
    for (const [n, parts] of [[1024, 2], [4096, 3], [400, 7], [5, 6]]) {
      const runs = shareRuns(n, parts);
      expect(runs[0][0]).toBe(0);
      expect(runs[runs.length - 1][1]).toBe(n);
      runs.slice(1).forEach(([from], k) => expect(from).toBe(runs[k][1]));
    }
  });

  it('splits weighted items into runs of about equal weight', () => {
    const weights = [1, 1, 6, 6, 1, 1, 1, 6, 1, 1, 6, 1];
    for (const parts of [1, 2, 3, 4]) {
      const runs = weightedRuns(weights, parts);
      expect(runs).toHaveLength(parts);
      expect(runs[0][0]).toBe(0);
      expect(runs[parts - 1][1]).toBe(weights.length);
      runs.slice(1).forEach(([from], k) => expect(from).toBe(runs[k][1]));
      const sums = runs.map(([a, b]) => weights.slice(a, b).reduce((x, y) => x + y, 0));
      expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(7);
    }
    expect(weightedRuns([1, 1], 4)).toEqual([[0, 1], [1, 2], [2, 2], [2, 2]]);
  });

  // What the workers do: runs of tiles built apart, joined in order.
  it.each([
    ['world 4242', generateMap(4242)],
    ['world 99 at 48', generateMap(99, 48)],
    ['market (built ground)', THEMES.find((t) => t.id === 'market')!.map()],
  ] as const)('give the same geometry as building them all at once: %s', (_, map) => {
    const whole = buildColumnRange(map);
    for (const parts of [2, 3, 5]) {
      const joined = joinColumns(shareRuns(map.tiles.length, parts).map(([from, to]) => buildColumnRange(map, from, to)));
      for (const key of ['positions', 'normals', 'uvs', 'colors'] as const) expect(equal(joined[key], whole[key]), `${key} in ${parts} runs`).toBe(true);
      joined.indices.forEach((layer, l) => expect(equal(layer, whole.indices[l]), `layer ${l} in ${parts} runs`).toBe(true));
      joined.tiles.forEach((layer, l) => expect(equal(layer, whole.tiles[l])).toBe(true));
    }
  });

  it('builds on this thread where there are no workers', async () => {
    const map = generateMap(3);
    const built = await new BoardWorkers().buildColumns(map);
    expect(equal(built.positions, buildColumnRange(map).positions)).toBe(true);
  });
});
