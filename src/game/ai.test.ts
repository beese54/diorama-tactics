import { describe, expect, it } from 'vitest';
import { chooseCard, forecast, HARD_NERVE, newTrace, planTurn, type Difficulty, type Plan } from './ai';
import { CARDS, type Hand } from './cards';
import { outcome, stats } from './end';
import { board } from './testBoard';
import { canAttack, moveUnit, playCard, startTurn } from './turn';
import { unionShape } from './union';
import { makeUnit, type ClassId, type Gender, type Side, type Unit } from './units';

const OPEN = board(Array(7).fill('..............'));
const card = (id: string) => CARDS.find((c) => c.id === id)!;
const hand = (...ids: string[]): Hand => ({ cards: ids.map(card), used: new Set() });
let n = 0;
const unit = (side: Side, x: number, y: number, cls: ClassId = 'sword', gender: Gender = 'female', morale?: number): Unit => {
  const u = makeUnit({ id: `${side}-${n++}`, name: `${side}${n}`, side, cls, gender, x, y });
  if (morale !== undefined) u.morale = morale;
  return u;
};

/** Plays `plan` through the turn rules themselves: every move and the attack must be ones they accept. */
function replay(units: Unit[], plan: Plan, h: Hand): { moved: boolean[]; attack: boolean | null } {
  const turn = startTurn('enemy', 1);
  expect(playCard(turn, h, plan.card.id)).toBe(true);
  const moved = plan.moves.map((m) => moveUnit(turn, OPEN, units, m.unit, m.path.at(-1)!) !== null);
  return { moved, attack: plan.attack ? canAttack(turn, plan.attack.unit, plan.attack.target) : null };
}

describe('planTurn', () => {
  for (const difficulty of ['easy', 'hard'] as const satisfies readonly Difficulty[]) {
    it(`makes only moves and an attack the rules accept (${difficulty})`, () => {
      const units = [unit('player', 2, 3), unit('player', 2, 4, 'spear', 'male', 20), unit('enemy', 9, 3, 'axe', 'male'), unit('enemy', 10, 4)];
      const h = hand('long-road', 'kings-wager', 'thunder-hoof');
      const plan = planTurn(OPEN, units, h, 'enemy', difficulty);
      const result = replay(units, plan, { ...h, used: new Set() });
      expect(result.moved.every(Boolean)).toBe(true);
      if (result.attack !== null) expect(result.attack).toBe(true);
    });
  }

  it('closes in: Easy brings its foes nearer the allies', () => {
    const units = [unit('player', 1, 3), unit('enemy', 12, 3, 'axe', 'male')];
    const before = Math.abs(units[1].x - 1);
    const plan = planTurn(OPEN, units, hand('long-road'), 'enemy', 'easy');
    const to = plan.moves[0].path.at(-1)!;
    expect(Math.abs((to % OPEN.width) - 1)).toBeLessThan(before);
  });

  it('advances together: with no fight in reach, the shared pool moves more than one foe', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
      const units = [unit('player', 0, 3), unit('enemy', 13, 2, 'axe', 'male'), unit('enemy', 13, 4), unit('enemy', 12, 3, 'spear', 'male')];
      // King's Wager's 5 MOV can't bring any foe beside the ally, 12 tiles off.
      const plan = planTurn(OPEN, units, hand('kings-wager'), 'enemy', difficulty);
      expect(new Set(plan.moves.map((m) => m.unit.id)).size).toBeGreaterThan(1);
    }
  });

  it('Easy attacks an ally in reach', () => {
    const units = [unit('player', 5, 3), unit('enemy', 6, 3, 'axe', 'male')];
    expect(planTurn(OPEN, units, hand('cleavers-oath'), 'enemy', 'easy').attack?.target).toBe(units[0]);
  });

  it('Hard turns down a fight it forecasts to lose, where Easy takes it', () => {
    // A foe on its last Morale beside a full-strength ally.
    const make = () => [unit('player', 5, 3, 'spear', 'male'), unit('enemy', 6, 3, 'sword', 'female', 8)];
    const [hu, eu] = [make(), make()];
    expect(forecast(OPEN, hu, hu[1], hu[0], card('steady-line')).win).toBeLessThan(HARD_NERVE);
    expect(planTurn(OPEN, hu, hand('steady-line'), 'enemy', 'hard').attack).toBeNull();
    expect(planTurn(OPEN, eu, hand('steady-line'), 'enemy', 'easy').attack).not.toBeNull();
  });

  it('Hard lines up a Union behind its attacker when it can', () => {
    // A weak ally; a woman leads the foes (a + Union) and a second foe is near enough to join her.
    const units = [unit('player', 3, 3, 'bow', 'male', 30), unit('enemy', 6, 3, 'sword', 'female'), unit('enemy', 7, 2, 'axe', 'male')];
    const plan = planTurn(OPEN, units, hand('long-road'), 'enemy', 'hard');
    expect(plan.attack).not.toBeNull();
    const leader = plan.attack!.unit;
    const end = (u: Unit) => {
      const m = plan.moves.find((mv) => mv.unit === u);
      const i = m ? m.path.at(-1)! : u.y * OPEN.width + u.x;
      return { x: i % OPEN.width, y: Math.floor(i / OPEN.width) };
    };
    const at = end(leader);
    const shape = unionShape(leader).map(([dx, dy]) => `${at.x + dx},${at.y + dy}`);
    const helper = units.filter((u) => u.side === 'enemy' && u !== leader).some((u) => shape.includes(`${end(u).x},${end(u).y}`));
    expect(helper).toBe(true);
  });

  it('plans the same turn every time', () => {
    const make = () => [unit('player', 2, 2), unit('player', 3, 5, 'bow', 'male'), unit('enemy', 10, 2, 'axe', 'male'), unit('enemy', 11, 5)];
    const summary = (units: Unit[]) => {
      const p = planTurn(OPEN, units, hand('long-road', 'open-field', 'grave-toll'), 'enemy', 'hard');
      return JSON.stringify([p.card.id, p.moves.map((m) => [m.unit.name, m.path]), p.attack && [p.attack.unit.name, p.attack.target.name]]);
    };
    n = 100;
    const a = summary(make());
    n = 100;
    expect(summary(make())).toBe(a);
  });
});

describe('the trace (what the AI weighed)', () => {
  const make = () => [unit('player', 3, 3, 'bow', 'male', 30), unit('player', 2, 5, 'spear', 'male'), unit('enemy', 6, 3, 'knight', 'male'), unit('enemy', 7, 2, 'axe', 'male')];
  const summary = (p: Plan) => JSON.stringify([p.card.id, p.moves.map((m) => [m.unit.name, m.path]), p.attack && [p.attack.unit.name, p.attack.target.name]]);

  for (const difficulty of ['easy', 'hard'] as const) {
    it(`leaves the plan as it is (${difficulty})`, () => {
      n = 200;
      const plain = summary(planTurn(OPEN, make(), hand('long-road', 'thunder-hoof', 'kings-wager'), 'enemy', difficulty));
      n = 200;
      expect(summary(planTurn(OPEN, make(), hand('long-road', 'thunder-hoof', 'kings-wager'), 'enemy', difficulty, newTrace()))).toBe(plain);
    });
  }

  it("scores the cards as the pick does: Hard adds 30 for a skill a full gauge could fire, naming who", () => {
    const units = make();
    units[2].gauge = 100;
    const trace = newTrace();
    const plan = planTurn(OPEN, units, hand('long-road', 'thunder-hoof', 'kings-wager'), 'enemy', 'hard', trace);
    const hoof = trace.cards.find((c) => c.id === 'thunder-hoof')!;
    expect(hoof).toEqual({ id: 'thunder-hoof', pow: 80, score: 110, firer: units[2].id });
    expect(trace.cards.find((c) => c.id === 'kings-wager')!.score).toBe(90);
    expect(plan.card.id).toBe(trace.cards.reduce((a, c) => (c.score > a.score ? c : a)).id);
  });

  it('lists every fight it forecast; the attack is the best that passed the nerve', () => {
    const units = make();
    const trace = newTrace();
    const plan = planTurn(OPEN, units, hand('long-road'), 'enemy', 'hard', trace);
    expect(trace.setups.length).toBeGreaterThan(0);
    for (const s of [...trace.setups, ...trace.attacks]) expect(s.passed).toBe(s.forecast.win >= HARD_NERVE);
    const passed = trace.attacks.filter((a) => a.passed);
    if (!plan.attack) expect(passed).toHaveLength(0);
    else {
      const best = passed.reduce((a, b) => (b.forecast.dealt - b.forecast.taken > a.forecast.dealt - a.forecast.taken ? b : a));
      expect([plan.attack.unit.id, plan.attack.target.id]).toEqual([best.unit, best.target]);
    }
  });
});

describe('chooseCard', () => {
  it('plays the most MOV when no fight is in reach, and the most POW that reaches one when it is', () => {
    const far = [unit('player', 0, 3), unit('enemy', 13, 3, 'axe', 'male')];
    expect(chooseCard(OPEN, far, hand('long-road', 'kings-wager'), 'enemy', 'easy').id).toBe('long-road');
    const near = [unit('player', 5, 3), unit('enemy', 8, 3, 'axe', 'male')];
    expect(chooseCard(OPEN, near, hand('long-road', 'kings-wager'), 'enemy', 'easy').id).toBe('kings-wager');
  });
});

describe('the end', () => {
  it('is victory once every foe has fallen, defeat once every ally has, and goes on otherwise', () => {
    const [a, f] = [unit('player', 0, 0), unit('enemy', 1, 0)];
    expect(outcome([a, f])).toBeNull();
    f.morale = 0;
    expect(outcome([a, f])).toBe('victory');
    f.morale = 10;
    a.morale = 0;
    expect(outcome([a, f])).toBe('defeat');
  });

  it('counts the fallen on each side for the result screen', () => {
    const units = [unit('player', 0, 0, 'sword', 'female', 0), unit('player', 1, 0), unit('enemy', 2, 0, 'axe', 'male', 0), unit('enemy', 3, 0, 'axe', 'male', 0)];
    expect(stats(units, 5, 4, 3)).toEqual({ turns: 5, battles: 4, won: 3, foesFelled: 2, alliesLost: 1 });
  });
});
