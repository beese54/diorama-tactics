import { describe, expect, it } from 'vitest';
import { fitZoom, ZOOM_RANGE } from './CameraRig';
import { samplesFor, SUPERSAMPLE_BELOW } from './PixelPipeline';

describe('zooming out', () => {
  it('draws straight to the screen from zoom 0.5 up, so those views are unchanged', () => {
    for (const zoom of [SUPERSAMPLE_BELOW, 0.6, 0.85, 1, 2, 3]) expect(samplesFor(zoom)).toBe(1);
  });

  it('supersamples further out, about one sample per texel (at least 2, at most 4)', () => {
    expect(samplesFor(0.49)).toBe(2);
    expect(samplesFor(0.42)).toBe(2);
    expect(samplesFor(0.34)).toBe(3);
    expect(samplesFor(0.31)).toBe(3);
    expect(samplesFor(0.1)).toBe(4);
    // A texel never spans more than 1.25 samples down to the widest board view.
    for (let zoom = 0.3; zoom < SUPERSAMPLE_BELOW; zoom += 0.01) expect(1 / (zoom * samplesFor(zoom))).toBeLessThan(1.25);
  });

  it('keeps the standard zoom limit for boards up to 32×32 and lets bigger boards fit', () => {
    for (const size of [16, 20, 32]) expect(fitZoom(size)).toBe(ZOOM_RANGE.min);
    expect(fitZoom(48)).toBeLessThan(ZOOM_RANGE.min);
    expect(fitZoom(64)).toBeLessThan(fitZoom(48));
    // A 64×64 board's diagonal (about 90.5 tiles) fits across the 30-tile-wide view at that zoom.
    expect((480 / 16 / fitZoom(64))).toBeGreaterThan(64 * Math.SQRT2);
  });
});
