import { mulberry32 } from '../util/rng';
import { applyDamage, CLASSES, triangleEdge, type Unit } from './units';

/** The stance a side fights in, toggled during the battle: aggressive presses harder, passive holds back. */
export type Stance = 'aggressive' | 'neutral' | 'passive';
export const STANCE_EDGE: Record<Stance, number> = { aggressive: 2, neutral: 0, passive: -2 };

export type ClashSide = 'attacker' | 'defender';
export type Phase = 'charge' | 'counter' | 'melee' | 'done';

/** One body in a squad: the head (the named unit) or a soldier. Large soldiers take two blows. */
export interface Fighter {
  head: boolean;
  hp: number;
  large: boolean;
}

export interface Squad {
  unit: Unit;
  /** The head first, then the soldiers. */
  fighters: Fighter[];
  stance: Stance;
  /** Defence (percent) of the tile the unit fights from, off the Morale it loses if it loses. */
  defense: number;
  /** Extra edge from cards and skills. */
  bonus: number;
}

/** What happened, in order, for the battle scene to play back. Fighter numbers index `Squad.fighters`. */
export type ClashEvent =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'strike'; by: ClashSide; fighter: number; target: number; hit: boolean; crit: boolean; felled: boolean }
  | { kind: 'panic'; side: ClashSide }
  | { kind: 'duel'; winner: ClashSide; attacker: number; defender: number; felled: boolean }
  | { kind: 'flash'; by: ClashSide; fighter: number; target: number }
  | { kind: 'end'; winner: ClashSide; damage: number };

export interface ClashSetup {
  attacker: Unit;
  defender: Unit;
  /** The attacker's card POW: the base of the Morale the loser loses. */
  pow: number;
  seed: number;
  /** Tile defence (percent) under each unit. */
  attackerDefense?: number;
  defenderDefense?: number;
  attackerStance?: Stance;
  defenderStance?: Stance;
  attackerBonus?: number;
  defenderBonus?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const other = (side: ClashSide): ClashSide => (side === 'attacker' ? 'defender' : 'attacker');

export function makeSquad(unit: Unit, stance: Stance = 'neutral', defense = 0, bonus = 0): Squad {
  const def = CLASSES[unit.cls];
  const soldiers = Array.from({ length: def.soldiers }, () => ({ head: false, hp: def.large ? 2 : 1, large: def.large }));
  return { unit, fighters: [{ head: true, hp: 1, large: false }, ...soldiers], stance, defense, bonus };
}

/** The fighters still standing, soldiers first and the head last: the head is reached only once its soldiers thin out. */
export function standing(squad: Squad): number[] {
  const alive = squad.fighters.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
  return [...alive.filter((i) => i > 0), ...alive.filter((i) => i === 0)];
}

/**
 * The Morale the loser loses: the winner's card POW, scaled up by the soldiers the winner has
 * left (8% each, 16% for a large one) plus 10 if its head still stands and the winner's ATK over
 * the loser's GEN, then cut by the defence of the loser's tile (a swamp's negative defence adds).
 */
export function moraleDamage(pow: number, winner: Squad, loser: Squad): number {
  const left = winner.fighters.filter((f) => !f.head && f.hp > 0);
  const scale = 0.5 + left.reduce((s, f) => s + (f.large ? 0.16 : 0.08), 0);
  const head = winner.fighters[0].hp > 0 ? 10 : 0;
  const push = Math.max(0, winner.unit.stats.atk - loser.unit.stats.gen);
  return Math.max(1, Math.round((pow * scale + head + push) * (1 - clamp(loser.defense, -50, 80) / 100)));
}

/**
 * One battle between two squads, played a beat at a time so the stances can change between
 * beats: the charge, the counter, then rounds of one-on-one duels until a side has nobody
 * left standing. Seeded, so the same setup and the same stance changes replay exactly.
 */
export class ClashSim {
  readonly attacker: Squad;
  readonly defender: Squad;
  readonly pow: number;
  phase: Phase = 'charge';
  winner: ClashSide | null = null;
  damage = 0;
  private panic = false;
  private meleeBegun = false;
  private readonly rand: () => number;

  constructor(s: ClashSetup) {
    this.attacker = makeSquad(s.attacker, s.attackerStance, s.attackerDefense, s.attackerBonus);
    this.defender = makeSquad(s.defender, s.defenderStance, s.defenderDefense, s.defenderBonus);
    this.pow = s.pow;
    this.rand = mulberry32(s.seed);
  }

  squad(side: ClashSide): Squad {
    return side === 'attacker' ? this.attacker : this.defender;
  }

  /** The side's effectiveness: the weapon triangle, its stance and any card bonus. */
  edge(side: ClashSide): number {
    const [me, them] = [this.squad(side), this.squad(other(side))];
    return triangleEdge(CLASSES[me.unit.cls].weapon, CLASSES[them.unit.cls].weapon) + STANCE_EDGE[me.stance] + me.bonus;
  }

  /** Plays the next beat and returns what happened in it; [] once the battle is over. */
  step(): ClashEvent[] {
    const events: ClashEvent[] = [];
    switch (this.phase) {
      case 'charge':
        events.push({ kind: 'phase', phase: 'charge' });
        this.volley('attacker', events);
        this.phase = 'counter';
        break;
      case 'counter': {
        this.phase = 'melee';
        // Bows shoot from afar: an archer can't counter, nor can anyone an archer attacks. Panic stops it too.
        const bow = CLASSES[this.attacker.unit.cls].weapon === 'bow' || CLASSES[this.defender.unit.cls].weapon === 'bow';
        if (bow || this.panic) return this.step();
        events.push({ kind: 'phase', phase: 'counter' });
        this.volley('defender', events);
        break;
      }
      case 'melee':
        if (!this.meleeBegun) events.push({ kind: 'phase', phase: 'melee' });
        this.meleeBegun = true;
        this.round(events);
        break;
      case 'done':
        return [];
    }
    this.finishIfOver(events);
    return events;
  }

  /** Plays the battle to its end with the current stances. */
  run(): ClashEvent[] {
    const all: ClashEvent[] = [];
    while (this.phase !== 'done') all.push(...this.step());
    return all;
  }

  /** A charge or counter: each fighter of `by` standing strikes once, TEC against the other side's GEN. */
  private volley(by: ClashSide, events: ClashEvent[]): void {
    const [me, them] = [this.squad(by), this.squad(other(by))];
    const p = clamp(0.3 + 0.015 * (me.unit.stats.tec - them.unit.stats.gen) + 0.02 * (this.edge(by) - this.edge(other(by))), 0.05, 0.9);
    for (const fighter of standing(me)) {
      const target = standing(them)[0];
      if (target === undefined) return;
      const hit = this.rand() < p;
      const crit = hit && this.rand() < me.unit.stats.luk / 100;
      const body = them.fighters[target];
      if (hit) body.hp = crit ? 0 : body.hp - 1;
      events.push({ kind: 'strike', by, fighter, target, hit, crit, felled: body.hp <= 0 });
      // A crit in the charge throws the defenders into panic: they won't counter.
      if (crit && by === 'attacker' && !this.panic) {
        this.panic = true;
        events.push({ kind: 'panic', side: 'defender' });
      }
    }
  }

  /** One round of the melee: fighters pair off front to back and duel, ATK against ATK; a lucky winner flashes and fells another. */
  private round(events: ClashEvent[]): void {
    const [a, d] = [standing(this.attacker), standing(this.defender)];
    const p = clamp(0.5 + 0.012 * (this.attacker.unit.stats.atk - this.defender.unit.stats.atk) + 0.02 * (this.edge('attacker') - this.edge('defender')), 0.1, 0.9);
    for (let i = 0; i < Math.min(a.length, d.length); i++) {
      if (this.attacker.fighters[a[i]].hp <= 0 || this.defender.fighters[d[i]].hp <= 0) continue;
      const winner: ClashSide = this.rand() < p ? 'attacker' : 'defender';
      const loser = this.squad(other(winner));
      const body = loser.fighters[winner === 'attacker' ? d[i] : a[i]];
      body.hp -= 1;
      events.push({ kind: 'duel', winner, attacker: a[i], defender: d[i], felled: body.hp <= 0 });
      if (this.rand() < this.squad(winner).unit.stats.luk / 200) {
        const target = standing(loser)[0];
        if (target !== undefined) {
          loser.fighters[target].hp = 0;
          events.push({ kind: 'flash', by: winner, fighter: winner === 'attacker' ? a[i] : d[i], target });
        }
      }
      if (!standing(loser).length) return;
    }
  }

  private finishIfOver(events: ClashEvent[]): void {
    const out = (['attacker', 'defender'] as const).find((side) => !standing(this.squad(side)).length);
    if (!out) return;
    this.winner = other(out);
    this.damage = moraleDamage(this.pow, this.squad(this.winner), this.squad(out));
    this.phase = 'done';
    events.push({ kind: 'end', winner: this.winner, damage: this.damage });
  }
}

export interface ClashResult {
  winner: ClashSide;
  /** Morale the loser loses; the winner loses none. */
  damage: number;
  events: ClashEvent[];
}

/** Plays a whole battle with fixed stances. */
export function resolveClash(setup: ClashSetup): ClashResult {
  const sim = new ClashSim(setup);
  const events = sim.run();
  return { winner: sim.winner!, damage: sim.damage, events };
}

/** Takes the Morale off the battle's loser; the winner loses none. */
export function applyResult(setup: ClashSetup, result: ClashResult): void {
  applyDamage(result.winner === 'attacker' ? setup.defender : setup.attacker, result.damage);
}
