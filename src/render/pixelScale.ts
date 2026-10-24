export interface PixelFit {
  /** Device pixels per internal pixel (integer, >= 1). */
  scale: number;
  /** CSS size of the canvas so each internal pixel covers exactly `scale` device pixels. */
  cssWidth: number;
  cssHeight: number;
}

/**
 * Largest integer upscale of a baseW x baseH image that fits the window.
 * Computed in device pixels so fractional devicePixelRatio (e.g. 125% Windows scaling)
 * still maps every internal pixel to a whole number of physical pixels.
 */
export function fitPixelScale(
  windowW: number,
  windowH: number,
  dpr: number,
  baseW: number,
  baseH: number,
): PixelFit {
  const scale = Math.max(1, Math.floor(Math.min((windowW * dpr) / baseW, (windowH * dpr) / baseH)));
  return {
    scale,
    cssWidth: (baseW * scale) / dpr,
    cssHeight: (baseH * scale) / dpr,
  };
}
