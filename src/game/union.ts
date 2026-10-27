import type { Unit } from './units';

/** A woman leads a + of her four edge neighbours, a man an x of his four corners; clockwise from the top. */
const PLUS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const CROSS = [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

/** The tiles a leader's Union draws on, as offsets. */
export const unionShape = (leader: Unit) => (leader.gender === 'female' ? PLUS : CROSS);

/**
 * The Union `leader` forms: the leader first, then every living ally standing on its shape, in
 * shape order (clockwise from the top). At most five units, as the shape has four places.
 */
export function unionOf(leader: Unit, units: readonly Unit[]): Unit[] {
  const members = unionShape(leader)
    .map(([dx, dy]) => units.find((u) => u.side === leader.side && u.morale > 0 && u.x === leader.x + dx && u.y === leader.y + dy))
    .filter((u): u is Unit => !!u);
  return [leader, ...members];
}

/** Whether `attacker` can start a battle against `target`: an enemy on one of its four edge neighbours. */
export function canAttack(attacker: Unit, target: Unit): boolean {
  return attacker.side !== target.side && attacker.morale > 0 && target.morale > 0 && Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y) === 1;
}
