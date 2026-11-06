import type { ClashEvent, ClashSide, SkillId } from '../game/clash';
import type { Who } from './script';

/** A moment a fired skill acts, for its animation: which skill, whose it is, who acts and on whom. */
export interface SkillBlow {
  skill: SkillId;
  /** The side whose blow it is (for a turned blow, the striker's: the skill is its foe's). */
  by: ClashSide;
  /** When it lands, on the battle's clock. */
  at: number;
  fighter: Who;
  target: Who;
  hit: boolean;
}

const other = (s: ClashSide): ClashSide => (s === 'attacker' ? 'defender' : 'attacker');

/**
 * The skill moments in one event, landing at `at`: the blows a skill shaped (named by the rules on
 * each strike, duel and flash), the march that sets a Forced March side going at the charge, and
 * at the end the Rend that tears at the loser and the Hold Fast that shields it. `skillOf` is each
 * side's fired skill; `fighters` how many fighters it has.
 */
export function skillBlows(e: ClashEvent, at: number, skillOf: (side: ClashSide) => SkillId | null, fighters: (side: ClashSide) => number): SkillBlow[] {
  switch (e.kind) {
    case 'strike':
    case 'flash':
      return e.skill ? [{ skill: e.skill, by: e.by, at, fighter: { side: e.by, fighter: e.fighter }, target: { side: other(e.by), fighter: e.target }, hit: e.kind === 'flash' || e.hit }] : [];
    case 'duel': {
      if (!e.skill) return [];
      const [won, lost] = e.winner === 'attacker' ? [e.attacker, e.defender] : [e.defender, e.attacker];
      return [{ skill: e.skill, by: e.winner, at, fighter: { side: e.winner, fighter: won }, target: { side: other(e.winner), fighter: lost }, hit: true }];
    }
    case 'phase': {
      if (e.phase !== 'charge') return [];
      const marching = (['attacker', 'defender'] as const).filter((side) => skillOf(side) === 'forced-march');
      return marching.flatMap((side) =>
        Array.from({ length: fighters(side) }, (_, n): SkillBlow => ({ skill: 'forced-march', by: side, at, fighter: { side, fighter: n }, target: { side, fighter: n }, hit: true })),
      );
    }
    case 'end': {
      const loser = other(e.winner);
      const out: SkillBlow[] = [];
      if (skillOf(e.winner) === 'rend') out.push({ skill: 'rend', by: e.winner, at, fighter: { side: e.winner, fighter: 0 }, target: { side: loser, fighter: 0 }, hit: true });
      if (skillOf(loser) === 'hold-fast') out.push({ skill: 'hold-fast', by: loser, at, fighter: { side: loser, fighter: 0 }, target: { side: loser, fighter: 0 }, hit: true });
      return out;
    }
    default:
      return [];
  }
}
