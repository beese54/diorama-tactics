/**
 * Picking a unit by its sprite, in screen space. A unit's sprite is a quad standing on its root,
 * spanning the camera's horizontal right and world up (as SpriteField's shader builds it); under
 * the orthographic camera its image on screen is an affine map of the quad, so the point under the
 * pointer can be found in the quad exactly, then looked up in the sheet so clear pixels don't count.
 */

export type Vec2 = readonly [number, number];

/**
 * Where `pointer` falls on a quad of `w` x `h` world units, as (u, v) in [0, 1] (v = 0 at the
 * feet), or null if outside. `origin` is the root on screen; `right` and `up` are the screen
 * offsets of one world unit along the quad's right and up.
 */
export function quadUV(pointer: Vec2, origin: Vec2, right: Vec2, up: Vec2, w: number, h: number): { u: number; v: number } | null {
  const det = right[0] * up[1] - right[1] * up[0];
  if (Math.abs(det) < 1e-12 || w <= 0 || h <= 0) return null;
  const [dx, dy] = [pointer[0] - origin[0], pointer[1] - origin[1]];
  const x = (dx * up[1] - dy * up[0]) / det;
  const y = (right[0] * dy - right[1] * dx) / det;
  const [u, v] = [x / w + 0.5, y / h];
  return u >= 0 && u < 1 && v >= 0 && v < 1 ? { u, v } : null;
}

/** A sprite's cell in the sheet, as SpriteField's rects give it (uv 0-1, v0 at the bottom). */
export interface CellUV {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  frames?: number;
  fps?: number;
  stride?: number;
}

/** The frame a sprite shows at `elapsed` seconds, as the shader steps it. */
export function frameAt(cell: CellUV, elapsed: number, phase: number): number {
  const frames = cell.frames ?? 1;
  return Math.floor((((elapsed * (cell.fps ?? 0) + phase * frames) % Math.max(frames, 1)) + Math.max(frames, 1)) % Math.max(frames, 1));
}

/** The sheet pixel (x right, y down) under (u, v) of a cell, at a frame, mirrored or not. */
export function sheetPixel(cell: CellUV, sheetW: number, sheetH: number, u: number, v: number, frame: number, mirrored: boolean): Vec2 {
  const uu = mirrored ? 1 - u : u;
  const left = (cell.u0 + frame * (cell.stride ?? 0)) * sheetW;
  const [right, top, bottom] = [left + (cell.u1 - cell.u0) * sheetW, (1 - cell.v1) * sheetH, (1 - cell.v0) * sheetH];
  // Kept inside the cell: an edge (u or v of exactly 0 or 1) belongs to the cell's last pixel, not its neighbour's.
  const x = Math.min(Math.round(right) - 1, Math.floor(left + uu * (right - left)));
  const y = Math.min(Math.round(bottom) - 1, Math.floor(bottom - v * (bottom - top)));
  return [x, y];
}

/** Of the hits, the one nearest the camera (smallest depth), or null. */
export function nearest<T>(hits: readonly { item: T; depth: number }[]): T | null {
  let best: { item: T; depth: number } | null = null;
  for (const h of hits) if (!best || h.depth < best.depth) best = h;
  return best?.item ?? null;
}
