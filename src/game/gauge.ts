import type { Stance } from './clash';

/** A full skill gauge: what a card's skill will cost (B6). */
export const GAUGE_MAX = 100;

/**
 * What a side's skill gauge does each beat of a battle, by the stance it fights the beat in (the
 * user's rule, 2026-11-08): holding back charges it fast, a steady neutral charges it at half the
 * pace, and pressing hard drains it. Only the stance moves it, not the blows.
 */
export const STANCE_CHARGE: Record<Stance, number> = { passive: 40, neutral: 20, aggressive: -20 };

/** The gauge after one beat fought in `stance`: never below empty nor above full. */
export function charge(gauge: number, stance: Stance): number {
  return Math.min(GAUGE_MAX, Math.max(0, gauge + STANCE_CHARGE[stance]));
}
