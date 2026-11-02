import { describe, expect, it } from 'vitest';
import { FX_NAMES, parseFx } from './transitions';

describe('the transition switches', () => {
  it('are all on by default', () => {
    expect(Object.values(parseFx(null)).every(Boolean)).toBe(true);
  });

  it('turn on only those listed', () => {
    expect(parseFx('wipe, intro')).toEqual({ wipe: true, banners: false, cardfly: false, intro: true });
  });

  it('can all be off, and ignore names they do not know', () => {
    expect(Object.values(parseFx('none')).some(Boolean)).toBe(false);
    expect(Object.keys(parseFx('sparkle,wipe'))).toEqual([...FX_NAMES]);
  });
});
