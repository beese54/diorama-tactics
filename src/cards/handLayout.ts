import { CARD_H, CARD_W } from './layout';

/**
 * Where the hand's cards sit on screen (cards.md, Part 1: "In the hand"). Pure: screen pixels
 * in, screen pixels out, so the layout can be tested at phone and desktop sizes without WebGL.
 *
 * The cards fan along the bottom of the screen, overlapping when they must. The focused card
 * rises from its place, grows until it is readable (on a phone, several times its row size),
 * stands upright, and sits on top of the rest.
 */

/** One card's place: its centre and height in CSS pixels (from the top left), its turn, and its stacking order. */
export interface CardSpot {
  x: number;
  y: number;
  /** Height; the width follows from the card's shape. */
  h: number;
  w: number;
  /** Clockwise turn, in degrees. */
  rot: number;
  /** Stacking order: higher draws over lower. */
  z: number;
}

const ASPECT = CARD_W / CARD_H;
/** The fan: each step from the middle turns a card this far and drops it a little. */
const FAN_DEG = 2.4;
const FAN_DROP = 0.012;

/** The row's own card height, before any focus: a third of the screen's height, or what fits n across. */
export function rowHeight(n: number, viewW: number, viewH: number): number {
  return Math.min(viewH * 0.3, viewW / (n * 0.62));
}

/** The focused card's height: at least 1.3 times the row's, and about 36% of the screen's height on a short row. */
export function focusHeight(n: number, viewW: number, viewH: number): number {
  const h = rowHeight(n, viewW, viewH);
  const fit = Math.min(viewH * 0.36, (viewW - 2 * margin(viewW, viewH)) / ASPECT);
  return Math.max(h * 1.3, Math.min(fit, h * 4));
}

function margin(viewW: number, viewH: number): number {
  return Math.max(8, Math.min(viewW, viewH) * 0.02);
}

/** The places of `n` cards with card `focused` (or none, -1) lifted, on a `viewW` × `viewH` screen. */
export function layoutHand(n: number, focused: number, viewW: number, viewH: number): CardSpot[] {
  const m = margin(viewW, viewH);
  const h = rowHeight(n, viewW, viewH);
  const w = h * ASPECT;
  // Spaced a little apart if they fit; otherwise overlapping evenly across the screen.
  const step = n > 1 ? Math.min(w * 1.04, (viewW - 2 * m - w) / (n - 1)) : 0;
  const left = viewW / 2 - (step * (n - 1)) / 2;
  const mid = (n - 1) / 2;
  const fh = focusHeight(n, viewW, viewH);
  const fw = fh * ASPECT;
  // The fan drops and turns the outer cards: the row sits high enough that even the lowest
  // corner of the lowest card stays on screen.
  const below = Math.max(...Array.from({ length: n }, (_, i) => {
    const k = i - mid;
    return k * k * h * FAN_DROP + reach(h, w, k * FAN_DEG) - h / 2;
  }));
  const foot = viewH - m - Math.max(0, below);
  return Array.from({ length: n }, (_, i) => {
    const k = i - mid;
    if (i === focused) {
      // Upright, slid back on screen if it would hang off an edge. Grown a little (a wide
      // screen), it rises in its place; grown a lot (a phone), it lifts clear above the row, so
      // it covers none of the others and every card stays in reach of a finger.
      const x = Math.min(viewW - m - fw / 2, Math.max(m + fw / 2, left + step * i));
      const y = fh > h * 1.6 ? foot - m - h - fh / 2 : foot - fh / 2 - h * 0.08;
      return { x, y, h: fh, w: fw, rot: 0, z: n + 1 };
    }
    const drop = k * k * h * FAN_DROP;
    return { x: left + step * i, y: foot - h / 2 + drop, h, w, rot: k * FAN_DEG, z: n - Math.abs(i - (focused < 0 ? mid : focused)) };
  });
}

/** How far below its centre a card `h` × `w` turned `deg` degrees reaches. */
export function reach(h: number, w: number, deg: number): number {
  const r = (Math.abs(deg) * Math.PI) / 180;
  return (h * Math.cos(r) + w * Math.sin(r)) / 2;
}

/** Whether screen point (px, py) is on card spot `s` (its turn ignored: the fan's turns are small). */
export function inside(s: CardSpot, px: number, py: number): boolean {
  return Math.abs(px - s.x) <= s.w / 2 && Math.abs(py - s.y) <= s.h / 2;
}

/**
 * A point on card `i` that no card above it covers, for clicking it: sampled across its row
 * box, at mid height, nearest its centre. Null if it is covered everywhere.
 */
export function visiblePoint(spots: CardSpot[], i: number): { x: number; y: number } | null {
  const s = spots[i];
  const above = spots.filter((o, j) => j !== i && o.z > s.z);
  let best: { x: number; y: number } | null = null;
  // Inset from the edges, where the fan's small turn could move the card out from under the point.
  for (const fy of [0, 0.25, -0.25]) {
    for (let t = 0; t <= 20; t++) {
      const fx = (t / 20 - 0.5) * 0.8;
      const p = { x: s.x + fx * s.w, y: s.y + fy * s.h };
      if (above.some((o) => inside(o, p.x, p.y))) continue;
      if (!best || Math.abs(p.x - s.x) < Math.abs(best.x - s.x)) best = p;
    }
    if (best) return best;
  }
  return best;
}
