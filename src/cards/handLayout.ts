import { CARD_H, CARD_W } from './layout';

/**
 * Where the hand's cards sit on screen (cards.md, Part 1: "In the hand"). Pure: screen pixels
 * in, screen pixels out, so the layout can be tested at phone and desktop sizes without WebGL.
 *
 * The cards fan along the bottom of the screen, overlapping when they must, in one of two ways:
 * - tucked, at rest: the fan sunk until only the cards' tops show, so the board stays in view;
 * - in focus, while the player chooses: the fan up on screen, and the focused card lifted out of
 *   it into the middle of the screen, large enough to read, over the dimmed board.
 * Each card also has a slot in the fan that takes the pointer, wherever it is drawn: the focused
 * card's slot stays put when the card lifts away, so the card under the pointer stays the same,
 * and each slot reaches down to the screen's bottom edge, so a pointer resting low on a tucked
 * card is still on it once the fan has risen.
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

/** Tucked, at rest, or in focus, while the player chooses. */
export type HandMode = 'tucked' | 'focus';

/** Where each card is drawn, and the slot in the fan where each takes the pointer. */
export interface HandLayout {
  cards: CardSpot[];
  slots: CardSpot[];
}

/** How much of the screen's height the tucked hand takes: the cards' tops. */
export const TUCK = 0.12;
/** The focused card's height in focus, as a share of the screen's, where it fits. */
const FOCUS = 0.6;

const ASPECT = CARD_W / CARD_H;
/** The fan: each step from the middle turns a card this far and drops it a little. */
const FAN_DEG = 2.4;
const FAN_DROP = 0.012;

/** The row's own card height: a third of the screen's height, or what fits n across. */
export function rowHeight(n: number, viewW: number, viewH: number): number {
  return Math.min(viewH * 0.3, viewW / (n * 0.62));
}

function margin(viewW: number, viewH: number): number {
  return Math.max(8, Math.min(viewW, viewH) * 0.02);
}

/** The fan up on screen: each card's spot (stacking left out), and how high its top reaches. */
function fan(n: number, viewW: number, viewH: number): { spots: CardSpot[]; top: number; mid: number; m: number } {
  const m = margin(viewW, viewH);
  const h = rowHeight(n, viewW, viewH);
  const w = h * ASPECT;
  // Spaced a little apart if they fit; otherwise overlapping evenly across the screen.
  const step = n > 1 ? Math.min(w * 1.04, (viewW - 2 * m - w) / (n - 1)) : 0;
  const left = viewW / 2 - (step * (n - 1)) / 2;
  const mid = (n - 1) / 2;
  // The fan drops and turns the outer cards: the row sits high enough that even the lowest
  // corner of the lowest card stays on screen.
  const below = Math.max(0, ...Array.from({ length: n }, (_, i) => {
    const k = i - mid;
    return k * k * h * FAN_DROP + reach(h, w, k * FAN_DEG) - h / 2;
  }));
  const foot = viewH - m - below;
  const spots = Array.from({ length: n }, (_, i) => {
    const k = i - mid;
    return { x: left + step * i, y: foot - h / 2 + k * k * h * FAN_DROP, h, w, rot: k * FAN_DEG, z: 0 };
  });
  return { spots, top: Math.min(viewH, ...spots.map((s) => s.y - reach(s.h, s.w, s.rot))), mid, m };
}

/**
 * The focused card's height in focus: 60% of the screen's height where that fits above the fan
 * and across the screen, and never less than 1.3 times the row's (on a phone, several times it).
 */
export function focusHeight(n: number, viewW: number, viewH: number): number {
  const { top, m } = fan(n, viewW, viewH);
  const fit = Math.min(viewH * FOCUS, top - 2 * m, (viewW - 2 * m) / ASPECT);
  return Math.max(rowHeight(n, viewW, viewH) * 1.3, fit);
}

/** The places of `n` cards, `mode` tucked or in focus, with card `focused` (or none, -1) the one up, on a `viewW` × `viewH` screen. */
export function layoutHand(n: number, focused: number, viewW: number, viewH: number, mode: HandMode): HandLayout {
  const { spots, top, mid, m } = fan(n, viewW, viewH);
  // Tucked, the fan sinks until its highest corner is TUCK of the screen above the bottom.
  const sink = mode === 'tucked' ? viewH * (1 - TUCK) - top : 0;
  const cards = spots.map((s, i) => ({ ...s, y: s.y + sink, z: i === focused ? n + 1 : n - Math.abs(i - (focused < 0 ? mid : focused)) }));
  const slots = cards.map((s) => {
    const [top, bottom] = [s.y - s.h / 2, Math.max(s.y + s.h / 2, viewH)];
    return { ...s, y: (top + bottom) / 2, h: bottom - top };
  });
  if (mode === 'focus' && focused >= 0 && focused < n) {
    // Upright in the middle of the screen, standing just above the fan where there is room.
    const h = focusHeight(n, viewW, viewH);
    cards[focused] = { x: viewW / 2, y: Math.max(m + h / 2, top - m - h / 2), h, w: h * ASPECT, rot: 0, z: n + 2 };
  }
  return { cards, slots };
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
 * A point on card `i` that no card above it covers, above the screen's bottom edge `bottom`, for
 * clicking it: sampled across its box, at mid height or nearer its top (a tucked card shows only
 * its top), nearest its centre. Null if it is covered everywhere.
 */
export function visiblePoint(spots: CardSpot[], i: number, bottom = Infinity): { x: number; y: number } | null {
  const s = spots[i];
  const above = spots.filter((o, j) => j !== i && o.z > s.z);
  let best: { x: number; y: number } | null = null;
  // Inset from the edges, where the fan's small turn could move the card out from under the point.
  for (const fy of [0, 0.25, -0.25, -0.4]) {
    for (let t = 0; t <= 20; t++) {
      const fx = (t / 20 - 0.5) * 0.8;
      const p = { x: s.x + fx * s.w, y: s.y + fy * s.h };
      if (p.y > bottom - 4 || above.some((o) => inside(o, p.x, p.y))) continue;
      if (!best || Math.abs(p.x - s.x) < Math.abs(best.x - s.x)) best = p;
    }
    if (best) return best;
  }
  return best;
}
