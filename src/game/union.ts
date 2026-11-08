import { GAUGE_MAX } from './gauge';
import { applyDamage, markFought, type Unit } from './units';

/**
 * A woman leads a + reaching two tiles along each edge, a man an x reaching two tiles along each
 * diagonal (2026-11-08: two tiles, for more battles; it was one). The near ring first, then the
 * far one, each clockwise from the top. An ally two tiles out joins whether or not the tile
 * between holds anyone.
 */
const PLUS = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, -2], [2, 0], [0, 2], [-2, 0]] as const;
const CROSS = [[1, -1], [1, 1], [-1, 1], [-1, -1], [2, -2], [2, 2], [-2, 2], [-2, -2]] as const;

/** The tiles a leader's Union draws on, as offsets. */
export const unionShape = (leader: Unit) => (leader.gender === 'female' ? PLUS : CROSS);

/**
 * The Union `leader` forms: the leader first, then every living ally standing on its shape, in
 * shape order (the near ring, then the far, clockwise from the top). At most nine units.
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

/** How one battle came out, as `fight` says: the winner, the Morale lost, and each side's skill gauge as it ended (if known). */
export interface UnionFight {
  winner: 'attacker' | 'defender';
  damage: number;
  gauges?: { attacker: number; defender: number };
}

/**
 * Hands the Union's skill gauge on from `from` (who fought last) to `to` (who fights next): `to`
 * starts with both added together (at most full), and `from`'s is spent on it.
 */
export function handOn(from: Unit, to: Unit): void {
  to.gauge = Math.min(GAUGE_MAX, to.gauge + from.gauge);
  from.gauge = 0;
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
 *
 * The skill gauge is handed down the chain (2026-11-08): each member starts its battle with the
 * gauge the one before ended on added to its own (`handOn`), and the foe's gauge is whatever its
 * battle ended on. So a Union builds one gauge between its members, and a later one can fire.
 */
export async function fightUnion(
  members: readonly Unit[],
  foe: Unit,
  fight: (attacker: Unit, index: number) => Promise<UnionFight> | UnionFight,
): Promise<UnionBattle[]> {
  const battles: UnionBattle[] = [];
  let last: Unit | null = null;
  for (const attacker of members) {
    if (foe.morale <= 0) break;
    if (attacker.morale <= 0) continue;
    if (last) handOn(last, attacker);
    const { winner, damage, gauges } = await fight(attacker, battles.length);
    if (gauges) [attacker.gauge, foe.gauge] = [gauges.attacker, gauges.defender];
    last = attacker;
    applyDamage(winner === 'attacker' ? foe : attacker, damage);
    // The foe fights the whole chain: each battle behind it costs it a soldier in the next.
    markFought(attacker, foe);
    battles.push({ attacker, winner, damage, attackerMorale: attacker.morale, foeMorale: foe.morale });
  }
  return battles;
}
