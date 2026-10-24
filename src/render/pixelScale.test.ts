import { describe, expect, it } from 'vitest';
import { fitPixelScale } from './pixelScale';

describe('fitPixelScale', () => {
  it('1920x1080 at dpr 1 gives scale 4', () => {
    expect(fitPixelScale(1920, 1080, 1, 480, 270)).toEqual({ scale: 4, cssWidth: 1920, cssHeight: 1080 });
  });

  it('floors to the largest integer that fits', () => {
    expect(fitPixelScale(1366, 768, 1, 480, 270).scale).toBe(2);
  });

  it('works in device pixels for fractional dpr', () => {
    // 1536x864 CSS at 125% = 1920x1080 device px -> scale 4, CSS size 1536x864
    const fit = fitPixelScale(1536, 864, 1.25, 480, 270);
    expect(fit.scale).toBe(4);
    expect(fit.cssWidth * 1.25).toBe(480 * 4);
  });

  it('never goes below 1', () => {
    expect(fitPixelScale(200, 100, 1, 480, 270).scale).toBe(1);
  });
});
