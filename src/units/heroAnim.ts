/**
 * Motion for a hand-drawn hero grid (facing right, '.' clear), worked from the drawing itself:
 *  - idle: two frames; on the second the body above the legs settles a pixel (a breath);
 *  - walk: four frames; the legs stride, the back one back and the front one forward, the feet
 *    furthest (the sheet lifts the figure a pixel between steps).
 * The legs are the bottom `legRows` rows, split at the clear column between them; anything further
 * than `reach` columns from that split (a spear's shaft, a bow) stays put.
 */
export type HeroClip = 'idle' | 'walk';

const STRIDE = [0, 1, 0, -1];

/** The clear column between the legs: the one nearest the figure's middle that is clear in every leg row. */
export function legSplit(art: readonly string[], legRows: number): number | null {
  const rows = art.slice(art.length - legRows).filter((r) => /[^.]/.test(r));
  if (!rows.length) return null;
  const filled = rows.flatMap((r) => [...r].map((c, x) => (c === '.' ? -1 : x)).filter((x) => x >= 0));
  const [lo, hi] = [Math.min(...filled), Math.max(...filled)];
  const mid = (lo + hi) / 2;
  let best: number | null = null;
  for (let x = lo + 1; x < hi; x++) {
    if (rows.every((r) => r[x] === '.') && (best === null || Math.abs(x - mid) < Math.abs(best - mid))) best = x;
  }
  return best;
}

export function animateHero(art: readonly string[], clip: HeroClip, frame: number, { legRows = 7, reach = 4 } = {}): string[] {
  const h = art.length;
  const grid = art.map((r) => [...r]);
  const top = h - legRows;
  if (clip === 'idle') {
    if (frame % 2 === 0) return [...art];
    // The body above the legs settles a pixel; its top row clears.
    for (let y = top - 1; y > 0; y--) grid[y] = [...grid[y - 1]];
    grid[0] = grid[0].map(() => '.');
    return grid.map((r) => r.join(''));
  }
  const stride = STRIDE[frame % 4];
  const found = legSplit(art, legRows);
  if (stride && found !== null) {
    const split: number = found;
    for (let y = top; y < h; y++) {
      // The lower down, the further it swings: the feet take the whole stride.
      const lean = Math.round((stride * (y - top + 1)) / legRows);
      if (!lean) continue;
      const src = [...art[y]];
      const row = [...src];
      for (let x = split - reach; x <= split + reach; x++) if (x >= 0 && x < row.length) row[x] = '.';
      for (let x = split - reach; x <= split + reach; x++) {
        if (x < 0 || x >= src.length || src[x] === '.' || x === split) continue;
        const to = x + (x < split ? -lean : lean);
        if (to >= 0 && to < row.length) row[to] = src[x];
      }
      grid[y] = row;
    }
  }
  return grid.map((r) => r.join(''));
}
