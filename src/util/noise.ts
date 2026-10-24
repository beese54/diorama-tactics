/** Hash of an integer lattice point to [0, 1). */
export function hash(seed: number, ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Smooth 2D value noise in [0, 1), deterministic per seed. A pure function of position,
 * so neighbouring tiles that sample the same point always agree.
 */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const top = hash(seed, ix, iy) + (hash(seed, ix + 1, iy) - hash(seed, ix, iy)) * fx;
  const bottom = hash(seed, ix, iy + 1) + (hash(seed, ix + 1, iy + 1) - hash(seed, ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
}
