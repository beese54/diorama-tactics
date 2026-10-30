import type { ClashEvent, ClashSide, Stance } from './clash';

/** A full skill gauge: what a card's skill will cost (B6). */
export const GAUGE_MAX = 100;
/** What a side earns from fighting: a blow landed in the charge or the counter, and a duel won. */
export const GAIN = { hit: 4, duel: 6 };
/** How the side's stance scales what it earns: pressing hard fills the gauge faster, holding back fills none. */
export const GAUGE_RATE: Record<Stance, number> = { aggressive: 1.5, neutral: 1, passive: 0 };

/** The gauge `side` earns from one event of a battle, fighting in `stance`. */
export function gain(e: ClashEvent, side: ClashSide, stance: Stance): number {
  const base = e.kind === 'strike' && e.by === side && e.hit ? GAIN.hit : e.kind === 'duel' && e.winner === side ? GAIN.duel : 0;
  return base * GAUGE_RATE[stance];
}

/** The gauge after a beat's events, played in `stance`; it stops at full. */
export function fill(gauge: number, events: readonly ClashEvent[], side: ClashSide, stance: Stance): number {
  return Math.min(GAUGE_MAX, events.reduce((g, e) => g + gain(e, side, stance), gauge));
}
