import { describe, expect, it } from 'vitest';
import { generateMap } from './generator';
import { composeGround, paintGround, paintLand, paintLiquids } from './ground';
import { GroundPainter, shareFrames } from './GroundPainter';
import { ALL_FRAMES } from './liquid';
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

  it('paints on this thread where there are no workers', async () => {
    const painter = new GroundPainter();
    await painter.ready;
    const map = generateMap(7);
    const image = await painter.paint(map, true);
    const whole = paintGround(map, true);
    expect(same(image.frames[5], whole.frames[5])).toBe(true);
  });
});
