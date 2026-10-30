import type { ClashEvent, ClashSide, Phase } from '../game/clash';
import { CLASSES, type ClassId } from '../game/units';
import { BLOCK, charge, FALL, GALLOP, HURT, ON_FOOT, STRIDES, SWING, VICTORY, type RunCycle } from './clips';
import { clipSeconds, cueAt } from './poseClip';

/** One fighter: its side and its number in the rules' squad (0 is the head). */
export interface Who {
  side: ClashSide;
  fighter: number;
}

/** What one fighter (or a whole side) does, and when: seconds from the start of the beat. */
export type Act =
  | { kind: 'phase'; at: number; phase: Phase }
  /** The side's fighters still standing run to meet the foe: up to the foe's line, or to the middle when both sides run. */
  | { kind: 'advance'; at: number; side: ClashSide; to: 'foe' | 'middle'; seconds: number }
  /** A fighter strikes `foe`; the blow lands at `lands` (a shot's flight included). */
  | { kind: 'attack'; at: number; who: Who; foe: Who; lands: number; ranged: boolean; crit: boolean }
  /** A blow lands: the fighter staggers (hurt), goes down (fall) or turns it aside (block). */
  | { kind: 'hurt' | 'fall' | 'block'; at: number; who: Who }
  /** A lucky winner's flash: a burst of light that fells another foe. Light only; the winner's swing carries it. */
  | { kind: 'flash'; at: number; who: Who; foe: Who }
  | { kind: 'panic'; at: number; side: ClashSide }
  | { kind: 'cheer'; at: number; who: Who }
  | { kind: 'result'; at: number; winner: ClashSide; damage: number };

/** One beat of the battle as the scene plays it: its acts, and how long it runs before the next beat. */
export interface Take {
  acts: Act[];
  seconds: number;
}

/** Seconds from the start of a swing to its blow. */
export const STRIKE = cueAt(SWING, 'strike');
/** Seconds between one fighter's swing and the next in a volley. */
export const STAGGER = 0.12;
/** Seconds between one duel and the next in a melee round. */
export const DUEL_STAGGER = 0.3;
/** A shot's flight: across the field, or point-blank once the lines have met. */
export const FLIGHT = { far: 0.3, near: 0.12 };
/** A flash bursts this long after the winning blow, and fells its foe this long after that. */
export const FLASH = { delay: 0.15, hit: 0.2 };
/** The Morale loss shows this long over the loser. */
export const RESULT_SECONDS = 1.2;
/** A breath after the last act before the next beat. */
export const PAUSE = 0.3;

/** How long a run takes: the strides and the skid into the stance. */
const runSeconds = (run: RunCycle) => clipSeconds(charge(run).slice(0, STRIDES + 2));

/** How long an act keeps its fighter busy (a fall: until the fighter is down). */
export function actSeconds(act: Act): number {
  switch (act.kind) {
    case 'advance':
      return act.seconds;
    case 'attack':
      return clipSeconds(SWING);
    case 'hurt':
      return clipSeconds(HURT);
    case 'fall':
      return clipSeconds(FALL.slice(0, -1));
    case 'block':
      return clipSeconds(BLOCK);
    case 'flash':
      return FLASH.hit;
    case 'cheer':
      return clipSeconds(VICTORY);
    case 'result':
      return RESULT_SECONDS;
    case 'phase':
    case 'panic':
      return 0;
  }
}

const other = (side: ClashSide): ClashSide => (side === 'attacker' ? 'defender' : 'attacker');

/**
 * Turns the rules' battle into the scene's: each beat of `ClashSim` events becomes timed acts
 * (who runs, swings, is hurt, falls or cheers, and when). It only adds timing and movement; every
 * blow, fall and the result are the rules' own. Pure, so it is tested against the rules.
 *
 * - The charge: a melee attacker's squad runs at the defenders, then each fighter swings in
 *   turn; archers and mages shoot from their ranks and the shot flies.
 * - The counter: the defenders strike back the same way (running first only if nobody has come
 *   to them, against a mage's squad).
 * - The melee: whoever hasn't met the foe yet runs in, then the pairs duel one after another,
 *   each once both its fighters are free (a fighter set on by several foes takes them in turn):
 *   the loser swings first and is turned aside, then the winner's blow lands. A flash follows.
 * - The end: the winner's fighters still standing cheer, and the Morale loss shows.
 */
export class BattleScript {
  /** Whether the lines have met: nobody runs again once they have. */
  private met = false;
  private readonly down = new Set<string>();

  /** `sizes`: each squad's fighters, the head included (fewer soldiers come when Morale is low); full squads by default. */
  constructor(
    private readonly classes: Record<ClashSide, ClassId>,
    private readonly sizes: Record<ClashSide, number> = { attacker: CLASSES[classes.attacker].soldiers + 1, defender: CLASSES[classes.defender].soldiers + 1 },
  ) {}

  private ranged(side: ClashSide): boolean {
    const weapon = CLASSES[this.classes[side]].weapon;
    return weapon === 'bow' || weapon === 'staff';
  }

  private run(side: ClashSide): number {
    return runSeconds(this.classes[side] === 'knight' ? GALLOP : ON_FOOT);
  }

  /** The acts for one beat's events, in order; `seconds` runs until every act is done, plus a breath. */
  beat(events: readonly ClashEvent[]): Take {
    const acts: Act[] = [];
    // When the blows can start: after any run.
    let start = 0;
    let volley = 0;
    // Duels start in the rules' order, each once both its fighters are free.
    let lastDuel = -Infinity;
    const free = new Map<string, number>();
    const freeAt = (w: Who) => free.get(`${w.side}:${w.fighter}`) ?? 0;
    let lastBlow = 0;
    // The winning blow of the last duel, for a flash.
    let lastWin = 0;
    const flight = (side: ClashSide) => (this.ranged(side) ? (this.met ? FLIGHT.near : FLIGHT.far) : 0);
    const react = (who: Who, at: number, hit: boolean, felled: boolean) => {
      if (felled) this.down.add(`${who.side}:${who.fighter}`);
      acts.push({ kind: felled ? 'fall' : hit ? 'hurt' : 'block', at, who });
    };
    const advance = (side: ClashSide, to: 'foe' | 'middle') => {
      const seconds = this.run(side);
      acts.push({ kind: 'advance', at: 0, side, to, seconds });
      start = Math.max(start, seconds);
    };
    for (const e of events) {
      switch (e.kind) {
        case 'phase': {
          acts.push({ kind: 'phase', at: 0, phase: e.phase });
          if (this.met) break;
          const by: ClashSide = e.phase === 'counter' ? 'defender' : 'attacker';
          if (e.phase === 'melee') {
            advance('attacker', 'middle');
            advance('defender', 'middle');
          } else if (!this.ranged(by)) advance(by, 'foe');
          else break;
          this.met = true;
          break;
        }
        case 'strike': {
          const at = start + volley++ * STAGGER;
          const lands = at + STRIKE + flight(e.by);
          const foe = { side: other(e.by), fighter: e.target };
          acts.push({ kind: 'attack', at, who: { side: e.by, fighter: e.fighter }, foe, lands, ranged: this.ranged(e.by), crit: e.crit });
          react(foe, lands, e.hit, e.felled);
          lastBlow = lands;
          break;
        }
        case 'panic':
          acts.push({ kind: 'panic', at: lastBlow, side: e.side });
          break;
        case 'duel': {
          const a: Who = { side: 'attacker', fighter: e.attacker };
          const d: Who = { side: 'defender', fighter: e.defender };
          const [winner, loser] = e.winner === 'attacker' ? [a, d] : [d, a];
          const at = Math.max(start, lastDuel + DUEL_STAGGER, freeAt(a), freeAt(d));
          lastDuel = at;
          const parried = at + STRIKE + flight(loser.side);
          acts.push({ kind: 'attack', at, who: loser, foe: winner, lands: parried, ranged: this.ranged(loser.side), crit: false });
          react(winner, parried, false, false);
          const swing = parried + clipSeconds(BLOCK);
          const lands = swing + STRIKE + flight(winner.side);
          acts.push({ kind: 'attack', at: swing, who: winner, foe: loser, lands, ranged: this.ranged(winner.side), crit: false });
          react(loser, lands, true, e.felled);
          free.set(`${winner.side}:${winner.fighter}`, swing + clipSeconds(SWING));
          free.set(`${loser.side}:${loser.fighter}`, e.felled ? Infinity : lands + clipSeconds(HURT));
          lastWin = lands;
          break;
        }
        case 'flash': {
          const at = lastWin + FLASH.delay;
          const foe = { side: other(e.by), fighter: e.target };
          acts.push({ kind: 'flash', at, who: { side: e.by, fighter: e.fighter }, foe });
          react(foe, at + FLASH.hit, true, true);
          break;
        }
        case 'end': {
          const at = Math.max(...acts.map((x) => x.at + actSeconds(x)));
          for (let fighter = 0; fighter < this.sizes[e.winner]; fighter++) {
            if (!this.down.has(`${e.winner}:${fighter}`)) acts.push({ kind: 'cheer', at, who: { side: e.winner, fighter } });
          }
          acts.push({ kind: 'result', at, winner: e.winner, damage: e.damage });
          break;
        }
      }
    }
    const seconds = acts.length ? Math.max(...acts.map((x) => x.at + actSeconds(x))) + PAUSE : 0;
    return { acts, seconds };
  }
}
