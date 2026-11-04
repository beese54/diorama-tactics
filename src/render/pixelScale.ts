export interface PixelFit {
  /** Device pixels per internal pixel (integer, >= 1). */
  scale: number;
  /** The internal drawing size, in internal pixels: the window's, divided by `scale` and rounded up. */
  width: number;
  height: number;
  /** CSS size of the canvas so each internal pixel covers exactly `scale` device pixels (at most one step over the window). */
  cssWidth: number;
  cssHeight: number;
}

/**
 * The pixel grid that fills the window: each internal pixel `scale` device pixels square, `scale`
 * the whole number nearest to how many times a `baseW` × `baseH` frame would fit (by the tighter
 * of width and height), and the internal size whatever then covers the window edge to edge. So a
 * pixel looks the same size as on the base frame's own screen, a 1920x1080 window is exactly the
 * base 480x270 at 4, and other windows see a little more or less of the world instead of black bars.
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
  const [deviceW, deviceH] = [Math.round(windowW * dpr), Math.round(windowH * dpr)];
  const scale = Math.max(1, Math.round(Math.min(deviceW / baseW, deviceH / baseH)));
  const [width, height] = [Math.max(1, Math.ceil(deviceW / scale)), Math.max(1, Math.ceil(deviceH / scale))];
  return { scale, width, height, cssWidth: (width * scale) / dpr, cssHeight: (height * scale) / dpr };
}
