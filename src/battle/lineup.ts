import type { ClassId, Side } from '../game/units';

/** Each side's leader for a class, by the cast's character id: the roster's names, plus Edric and Morwen, who have art but no place on the map yet. */
export const LEADERS: Record<Side, Record<ClassId, string>> = {
  player: { sword: 'aria', spear: 'bram', axe: 'corin', bow: 'dela', mage: 'ilse', knight: 'edric' },
  enemy: { sword: 'sabine', spear: 'petra', axe: 'gorran', bow: 'ulric', mage: 'morwen', knight: 'varek' },
};

/** Who stands in a squad: its leader, the character each soldier is drawn as, and whether the soldiers wear the enemy's red. */
export interface Lineup {
  leader: string;
  /** One character id per soldier, in the rules' order (fighter 1 first). */
  soldiers: string[];
  red: boolean;
}

/**
 * A squad's lineup: the class's leader for its side, and its soldiers taking the man's and the
 * woman's design in turn. Both sides share the soldier designs; the enemy's are recoloured red.
 */
export function lineup(side: Side, cls: ClassId, soldiers: number): Lineup {
  return {
    leader: LEADERS[side][cls],
    soldiers: Array.from({ length: soldiers }, (_, i) => `soldier-${cls}-${i % 2 ? 'f' : 'm'}`),
    red: side === 'enemy',
  };
}
