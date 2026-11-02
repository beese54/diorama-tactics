import type { Unit } from './units';

/** How a skirmish has ended, from the player's side: every foe fallen, or every ally. */
export type Outcome = 'victory' | 'defeat';

/** The skirmish's result now: victory once every foe has fallen, defeat once every ally has, else null (it goes on). */
export function outcome(units: readonly Unit[]): Outcome | null {
  const standing = (side: Unit['side']) => units.some((u) => u.side === side && u.morale > 0);
  if (!standing('enemy')) return 'victory';
  if (!standing('player')) return 'defeat';
  return null;
}

/** What the result screen shows: the turns taken, the battles fought and how many the player's side won, and the fallen on each side. */
export interface Stats {
  turns: number;
  battles: number;
  won: number;
  foesFelled: number;
  alliesLost: number;
}

/** The stats for `units` at the end: the fallen counted from them; the turns and battles as the skirmish kept them. */
export function stats(units: readonly Unit[], turns: number, battles: number, won: number): Stats {
  const fallen = (side: Unit['side']) => units.filter((u) => u.side === side && u.morale <= 0).length;
  return { turns, battles, won, foesFelled: fallen('enemy'), alliesLost: fallen('player') };
}
