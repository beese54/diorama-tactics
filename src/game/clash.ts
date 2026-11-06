import { mulberry32 } from '../util/rng';
import { fill } from './gauge';
import { applyDamage, CLASSES, markFought, triangleEdge, type Unit } from './units';

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
  /** The skill it has fired this battle, if any. */
  skill: SkillId | null;
  /** Its skill gauge: the unit's carried gauge at the start, filled by what it lands, emptied by firing. */
  gauge: number;
  /** Blows at its leader a Parry has turned aside so far. */
  parried: number;
}

/**
 * The card skills that act in a battle (src/game/skills.ts says which card has which, and when
 * one may fire). Each changes the battle from the moment it fires, before the charge.
 */
export type SkillId =
  | 'forced-march' | 'lance-charge' | 'volley' | 'blade-dance' | 'pike-wall' | 'firestorm'
  | 'hold-fast' | 'rend' | 'parry' | 'trample' | 'executioner';

/** What happened, in order, for the battle scene to play back. Fighter numbers index `Squad.fighters`. `skill` names the fired skill that caused it. */
export type ClashEvent =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'skill'; side: ClashSide; skill: SkillId }
  | { kind: 'strike'; by: ClashSide; fighter: number; target: number; hit: boolean; crit: boolean; felled: boolean; skill?: SkillId }
  | { kind: 'panic'; side: ClashSide }
  | { kind: 'duel'; winner: ClashSide; attacker: number; defender: number; felled: boolean; skill?: SkillId }
  | { kind: 'flash'; by: ClashSide; fighter: number; target: number; skill?: SkillId }
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
  /** Skills fired before the battle, by side: as if `fire` were called before the first beat. */
  fire?: Partial<Record<ClashSide, SkillId>>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const other = (side: ClashSide): ClashSide => (side === 'attacker' ? 'defender' : 'attacker');

/**
 * The soldiers a unit brings to a battle: its class's full count, whatever its Morale (the user's
 * rule, 2026-11-05), less one for each battle it has already fought this turn, at least one.
 */
export function soldiersFor(unit: Unit): number {
  return Math.max(1, CLASSES[unit.cls].soldiers - (unit.fought ?? 0));
}

export function makeSquad(unit: Unit, stance: Stance = 'neutral', defense = 0, bonus = 0): Squad {
  const def = CLASSES[unit.cls];
  const soldiers = Array.from({ length: soldiersFor(unit) }, () => ({ head: false, hp: def.large ? 2 : 1, large: def.large }));
  return { unit, fighters: [{ head: true, hp: 1, large: false }, ...soldiers], stance, defense, bonus, skill: null, gauge: unit.gauge ?? 0, parried: 0 };
}

/** The fighters still standing, soldiers first and the head last (the order a squad strikes in). */
export function standing(squad: Squad): number[] {
  const alive = squad.fighters.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
  return [...alive.filter((i) => i > 0), ...alive.filter((i) => i === 0)];
}

/**
 * Whom fighter `fighter` strikes in `them` (leaving out `except`): its opposite number, head
 * against head and soldier n against soldier n, while that one stands. Otherwise a soldier takes
 * on the soldiers still standing, spread over them by its number, and the head only once no
 * soldier is left; a head whose opposite has fallen goes for the soldiers first.
 */
export function target(fighter: number, them: Squad, except = -1): number | undefined {
  const up = (i: number) => i !== except && (them.fighters[i]?.hp ?? 0) > 0;
  if (up(fighter)) return fighter;
  const soldiers = them.fighters.map((_, i) => i).filter((i) => i > 0 && up(i));
  if (soldiers.length) return soldiers[fighter === 0 ? 0 : (fighter - 1) % soldiers.length];
  return up(0) ? 0 : undefined;
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
  private begun = false;
  /** Skills fired before the first beat, waiting to open its events. */
  private readonly fired: ClashEvent[] = [];
  private readonly rand: () => number;

  constructor(s: ClashSetup) {
    this.attacker = makeSquad(s.attacker, s.attackerStance, s.attackerDefense, s.attackerBonus);
    this.defender = makeSquad(s.defender, s.defenderStance, s.defenderDefense, s.defenderBonus);
    this.pow = s.pow;
    this.rand = mulberry32(s.seed);
    for (const side of ['attacker', 'defender'] as const) {
      const skill = s.fire?.[side];
      if (skill) this.fire(side, skill);
    }
  }

  squad(side: ClashSide): Squad {
    return side === 'attacker' ? this.attacker : this.defender;
  }

  /**
   * Fires `skill` for `side`: only before the first beat, once a side. Its gauge empties (and
   * fills again from what it lands), Forced March adds its edge at once, and the rest act as the
   * battle reaches them. Returns whether it fired. Whether the side may fire it (a full gauge, the
   * card's ACE) is the caller's to check: see `canFire` in skills.ts.
   */
  fire(side: ClashSide, skill: SkillId): boolean {
    const me = this.squad(side);
    if (this.begun || me.skill) return false;
    me.skill = skill;
    me.gauge = 0;
    if (skill === 'forced-march') me.bonus += 3;
    this.fired.push({ kind: 'skill', side, skill });
    return true;
  }

  /** The side's skill gauge now. */
  gauge(side: ClashSide): number {
    return this.squad(side).gauge;
  }

  /** The side's effectiveness: the weapon triangle, its stance and any card bonus. */
  edge(side: ClashSide): number {
    const [me, them] = [this.squad(side), this.squad(other(side))];
    return triangleEdge(CLASSES[me.unit.cls].weapon, CLASSES[them.unit.cls].weapon) + STANCE_EDGE[me.stance] + me.bonus;
  }

  /** Plays the next beat and returns what happened in it; [] once the battle is over. */
  step(): ClashEvent[] {
    const events: ClashEvent[] = this.phase === 'done' ? [] : this.fired.splice(0);
    this.begun = true;
    const before = events.length;
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
    // Each side's gauge fills from what it landed this beat, at the stance it fought in.
    for (const side of ['attacker', 'defender'] as const) {
      const me = this.squad(side);
      me.gauge = fill(me.gauge, events.slice(before), side, me.stance);
    }
    return events;
  }

  /** Plays the battle to its end with the current stances. */
  run(): ClashEvent[] {
    const all: ClashEvent[] = [];
    while (this.phase !== 'done') all.push(...this.step());
    return all;
  }

  /**
   * A charge or counter: each fighter of `by` standing strikes its target once, TEC against the
   * other side's GEN. The skills that act here: Firestorm blasts every foe first; Trample fells the
   * foe's front rank (up to three soldiers) outright; Lance Charge and Volley strike twice; the
   * foe's Pike Wall makes every blow miss; a Parry turns aside blows at its leader.
   */
  private volley(by: ClashSide, events: ClashEvent[]): void {
    const [me, them] = [this.squad(by), this.squad(other(by))];
    const p = clamp(0.3 + 0.015 * (me.unit.stats.tec - them.unit.stats.gen) + 0.02 * (this.edge(by) - this.edge(other(by))), 0.05, 0.9);
    // Firestorm: a blast strikes every foe once, surer than a blow (the volley's chance + 0.2).
    if (me.skill === 'firestorm') {
      for (const foe of standing(them)) {
        const hit = this.rand() < Math.min(0.9, p + 0.2);
        const body = them.fighters[foe];
        if (hit) body.hp -= 1;
        events.push({ kind: 'strike', by, fighter: 0, target: foe, hit, crit: false, felled: body.hp <= 0, skill: 'firestorm' });
      }
    }
    if (me.skill === 'trample') {
      for (const foe of standing(them).filter((i) => i > 0).slice(0, 3)) {
        them.fighters[foe].hp = 0;
        events.push({ kind: 'strike', by, fighter: 0, target: foe, hit: true, crit: true, felled: true, skill: 'trample' });
      }
    }
    const passes = me.skill === 'lance-charge' || me.skill === 'volley' ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      for (const fighter of standing(me)) {
        const foe = target(fighter, them);
        if (foe === undefined) return;
        let hit = this.rand() < p;
        const crit = hit && this.rand() < me.unit.stats.luk / 100;
        // The foe's Pike Wall, or its Parry while it lasts at its leader, turns the blow aside.
        const turned = them.skill === 'pike-wall' ? 'pike-wall' : foe === 0 && this.parries(them) ? 'parry' : null;
        if (turned) hit = false;
        // What a fired skill made of the blow: turned aside, or the second blow of a double pass.
        const skill = turned ?? (pass > 0 ? me.skill : null);
        const body = them.fighters[foe];
        if (hit) body.hp = crit ? 0 : body.hp - 1;
        events.push({ kind: 'strike', by, fighter, target: foe, hit, crit: hit && crit, felled: body.hp <= 0, ...(skill ? { skill } : {}) });
        // A crit in the charge throws the defenders into panic: they won't counter.
        if (hit && crit && by === 'attacker' && !this.panic) {
          this.panic = true;
          events.push({ kind: 'panic', side: 'defender' });
        }
      }
    }
  }

  /** Whether `squad`'s Parry turns aside one more blow at its leader (three in all), counting it. */
  private parries(squad: Squad): boolean {
    if (squad.skill !== 'parry' || squad.parried >= 3) return false;
    squad.parried++;
    return true;
  }

  /**
   * One round of the melee: every fighter standing duels its target, ATK against ATK. A pair
   * who face each other fight once; a fighter set on by more than one foe fights each of them.
   * A lucky winner flashes and fells another foe.
   */
  private round(events: ClashEvent[]): void {
    const p = clamp(0.5 + 0.012 * (this.attacker.unit.stats.atk - this.defender.unit.stats.atk) + 0.02 * (this.edge('attacker') - this.edge('defender')), 0.1, 0.9);
    // The pairs, [attacker's fighter, defender's fighter], as the round opens.
    const pairs = new Map<string, [number, number]>();
    for (const a of standing(this.attacker)) {
      const d = target(a, this.defender);
      if (d !== undefined) pairs.set(`${a}:${d}`, [a, d]);
    }
    for (const d of standing(this.defender)) {
      const a = target(d, this.attacker);
      if (a !== undefined) pairs.set(`${a}:${d}`, [a, d]);
    }
    for (const [a, d] of pairs.values()) {
      if (this.attacker.fighters[a].hp <= 0 || this.defender.fighters[d].hp <= 0) continue;
      let winner: ClashSide = this.rand() < p ? 'attacker' : 'defender';
      // Executioner: a duel against the foe's leader is won outright.
      const executed = (['attacker', 'defender'] as const).find((side) => this.squad(side).skill === 'executioner' && (side === 'attacker' ? d : a) === 0);
      if (executed) winner = executed;
      const loser = this.squad(other(winner));
      const [won, lost] = winner === 'attacker' ? [a, d] : [d, a];
      // Parry: a duel lost by its leader is a blow turned aside instead (three in all).
      if (lost === 0 && this.parries(loser)) {
        events.push({ kind: 'strike', by: winner, fighter: won, target: 0, hit: false, crit: false, felled: false, skill: 'parry' });
        continue;
      }
      const body = loser.fighters[lost];
      body.hp -= 1;
      events.push({ kind: 'duel', winner, attacker: a, defender: d, felled: body.hp <= 0, ...(executed ? { skill: 'executioner' as const } : {}) });
      // Blade Dance: each duel won fells a second foe.
      if (this.squad(winner).skill === 'blade-dance') {
        const foe = target(won, loser, lost);
        if (foe !== undefined) {
          loser.fighters[foe].hp = 0;
          events.push({ kind: 'flash', by: winner, fighter: won, target: foe, skill: 'blade-dance' });
        }
      } else if (this.rand() < this.squad(winner).unit.stats.luk / 200) {
        const foe = target(won, loser, lost);
        if (foe !== undefined) {
          loser.fighters[foe].hp = 0;
          events.push({ kind: 'flash', by: winner, fighter: won, target: foe });
        }
      }
      if (!standing(loser).length) return;
    }
  }

  private finishIfOver(events: ClashEvent[]): void {
    const out = (['attacker', 'defender'] as const).find((side) => !standing(this.squad(side)).length);
    if (!out) return;
    this.winner = other(out);
    let damage = moraleDamage(this.pow, this.squad(this.winner), this.squad(out));
    // Rend: +20 Morale damage on a win. Hold Fast: a lost battle costs only half.
    if (this.squad(this.winner).skill === 'rend') damage += 20;
    if (this.squad(out).skill === 'hold-fast') damage = Math.ceil(damage / 2);
    this.damage = damage;
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

/** Takes the Morale off the battle's loser (the winner loses none), and counts the battle for both. */
export function applyResult(setup: ClashSetup, result: ClashResult): void {
  applyDamage(result.winner === 'attacker' ? setup.defender : setup.attacker, result.damage);
  markFought(setup.attacker, setup.defender);
}
