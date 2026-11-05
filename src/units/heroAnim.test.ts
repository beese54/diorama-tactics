import { describe, expect, it } from 'vitest';
import { animateHero, legSplit } from './heroAnim';

// A tiny figure: a head, a body, two legs with a gap, and a shaft at the right that must not move.
const ART = [
  '....hh....s',
  '...hhhh...s',
  '...bbbb...s',
  '...bbbb...s',
  '...l..l...s',
  '...l..l...s',
  '..ff..ff..s',
];

const count = (g: readonly string[]) => g.join('').replace(/\./g, '').length;

describe('heroAnim', () => {
  it('finds the clear column between the legs', () => {
    expect([4, 5]).toContain(legSplit(ART, 3));
  });

  it('leaves the first idle and walk frames as drawn', () => {
    expect(animateHero(ART, 'idle', 0, { legRows: 3 })).toEqual(ART);
    expect(animateHero(ART, 'walk', 0, { legRows: 3 })).toEqual(ART);
  });

  it('breathes: the body above the legs settles a pixel, the legs stay', () => {
    const f = animateHero(ART, 'idle', 1, { legRows: 3 });
    expect(f[0]).toBe('...........');
    expect(f[1]).toBe(ART[0]);
    expect(f.slice(4)).toEqual(ART.slice(4));
  });

  it('strides: the legs part at the feet, the body and the shaft stay put', () => {
    const f = animateHero(ART, 'walk', 1, { legRows: 3, reach: 4 });
    expect(f.slice(0, 4)).toEqual(ART.slice(0, 4));
    expect(f.every((r) => r[10] === 's')).toBe(true);
    expect(f[6]).not.toBe(ART[6]);
    expect(f[6].indexOf('f')).toBeLessThan(ART[6].indexOf('f'));
    expect(f[6].lastIndexOf('f')).toBeGreaterThan(ART[6].lastIndexOf('f'));
  });

  it('keeps every frame the same size', () => {
    for (const clip of ['idle', 'walk'] as const) for (let i = 0; i < 4; i++) {
      const f = animateHero(ART, clip, i, { legRows: 3 });
      expect(f.length).toBe(ART.length);
      expect(f.every((r) => r.length === ART[0].length)).toBe(true);
      expect(count(f)).toBeLessThanOrEqual(count(ART));
    }
  });
});
