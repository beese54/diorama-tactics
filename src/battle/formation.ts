/**
 * Where a squad's fighters stand in the battle scene, for the side on the left (the right
 * side mirrors it). Positions are in screen shares: x from the centre line outward (0 is the
 * middle, 0.5 the edge), y from the top. Three ranks, the back one higher and smaller; the
 * head stands at the front, nearest the foe. Riders take more room: a mounted squad stands in
 * two looser ranks.
 */
export interface Place {
  /** Index into the squad's fighters: 0 is the head. */
  fighter: number;
  x: number;
  y: number;
  scale: number;
}

const RANKS = [
  { y: 0.705, scale: 0.8, xs: [0.11, 0.23, 0.35] },
  { y: 0.79, scale: 0.9, xs: [0.16, 0.29, 0.42] },
  { y: 0.885, scale: 1, xs: [0.31] },
];
/** Three riders: two at the back, one in front beside the head. */
const MOUNTED_RANKS = [
  { y: 0.74, scale: 0.74, xs: [0.24, 0.39] },
  { y: 0.85, scale: 0.83, xs: [0.36] },
];
/** The head's place: front rank, ahead of everyone. */
const HEAD = { x: 0.13, y: 0.9, scale: 1.06 };
/** A mounted head: the whole mounted squad stands a little smaller than its riders' full size, so four horses fit a side. */
const MOUNTED_HEAD = { x: 0.19, y: 0.93, scale: 0.92 };

/** Places for a head and up to seven soldiers (three riders when `mounted`), back rank first (the order they are drawn in). */
export function formation(soldiers: number, mounted = false): Place[] {
  const ranks = mounted ? MOUNTED_RANKS : RANKS;
  const slots = ranks.flatMap((r) => r.xs.map((x) => ({ x, y: r.y, scale: r.scale })));
  // Fill from the front: the front rank, then the middle, then the back.
  const order = (mounted ? [2, 0, 1] : [6, 3, 4, 5, 0, 1, 2]).slice(0, soldiers);
  const places: Place[] = order.map((slot, i) => ({ fighter: i + 1, ...slots[slot] }));
  // A little stagger, so the ranks don't stand in ruled lines.
  for (const p of places) p.x += (((p.fighter * 37) % 7) - 3) * 0.004;
  places.push({ fighter: 0, ...(mounted ? MOUNTED_HEAD : HEAD) });
  return places.sort((a, b) => a.y - b.y);
}
