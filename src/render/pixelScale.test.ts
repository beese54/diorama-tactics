import { describe, expect, it } from 'vitest';
import { fitPixelScale } from './pixelScale';

describe('fitPixelScale', () => {
  it('1920x1080 at dpr 1 is the base frame exactly, at scale 4', () => {
    expect(fitPixelScale(1920, 1080, 1, 480, 270)).toEqual({ scale: 4, width: 480, height: 270, cssWidth: 1920, cssHeight: 1080 });
  });

  it('fills a laptop window edge to edge at the nearest whole scale, seeing more or less of the world', () => {
    expect(fitPixelScale(1366, 768, 1, 480, 270)).toMatchObject({ scale: 3, width: 456, height: 256 });
    expect(fitPixelScale(1536, 864, 1, 480, 270)).toMatchObject({ scale: 3, width: 512, height: 288 });
    expect(fitPixelScale(1440, 900, 1, 480, 270)).toMatchObject({ scale: 3, width: 480, height: 300 });
  });

  it('covers the window, overshooting by less than one step', () => {
    for (const [w, h, dpr] of [[1366, 768, 1], [1536, 864, 1.25], [1280, 720, 1.5], [390, 844, 3], [3440, 1440, 1]]) {
      const fit = fitPixelScale(w, h, dpr, 480, 270);
      expect(fit.cssWidth).toBeGreaterThanOrEqual(w);
      expect(fit.cssHeight).toBeGreaterThanOrEqual(h);
      expect((fit.cssWidth - w) * dpr).toBeLessThan(fit.scale);
      expect((fit.cssHeight - h) * dpr).toBeLessThan(fit.scale);
    }
  });

  it('works in device pixels for fractional dpr', () => {
    // 1536x864 CSS at 125% = 1920x1080 device px -> scale 4, the base frame
    expect(fitPixelScale(1536, 864, 1.25, 480, 270)).toMatchObject({ scale: 4, width: 480, height: 270 });
    // 1280x720 at 150% = 1920x1080 too
    expect(fitPixelScale(1280, 720, 1.5, 480, 270)).toMatchObject({ scale: 4, width: 480, height: 270 });
  });

  it('a tall phone takes its scale from the width, so the board still fits across', () => {
    const fit = fitPixelScale(390, 844, 3, 480, 270);
    expect(fit.scale).toBe(2);
    expect(fit.width).toBeGreaterThanOrEqual(480);
  });

  it('never goes below 1', () => {
    expect(fitPixelScale(200, 100, 1, 480, 270).scale).toBe(1);
  });
});
