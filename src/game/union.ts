import { applyDamage, markFought, type Unit } from './units';

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

/** How one battle of a Union attack came out: who fought, who won, the Morale lost, and both Morales after it. */
export interface UnionBattle {
  attacker: Unit;
  winner: 'attacker' | 'defender';
  damage: number;
  attackerMorale: number;
  foeMorale: number;
}

/**
 * A Union attack: each of `members` (the leader first, as `unionOf` gives them) fights `foe` in
 * turn, one battle each, and the loser of each takes its Morale damage before the next begins, so
 * the foe carries its losses down the chain. The chain stops once the foe falls; a member that
 * has fallen by its turn is passed over. `fight` plays one battle (on screen, or the rules alone
 * in tests) and says how it came out; `index` counts the battles fought so far.
 */
export async function fightUnion(
  members: readonly Unit[],
  foe: Unit,
  fight: (attacker: Unit, index: number) => Promise<{ winner: 'attacker' | 'defender'; damage: number }> | { winner: 'attacker' | 'defender'; damage: number },
): Promise<UnionBattle[]> {
  const battles: UnionBattle[] = [];
  for (const attacker of members) {
    if (foe.morale <= 0) break;
    if (attacker.morale <= 0) continue;
    const { winner, damage } = await fight(attacker, battles.length);
    applyDamage(winner === 'attacker' ? foe : attacker, damage);
    // The foe fights the whole chain: each battle behind it costs it a soldier in the next.
    markFought(attacker, foe);
    battles.push({ attacker, winner, damage, attackerMorale: attacker.morale, foeMorale: foe.morale });
  }
  return battles;
}
