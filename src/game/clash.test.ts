import { describe, expect, it } from 'vitest';
import { applyResult, ClashSim, makeSquad, moraleDamage, resolveClash, standing, target, type ClashSetup } from './clash';
import { CLASS_IDS, makeUnit, type ClassId } from './units';

const unit = (cls: ClassId, side: 'player' | 'enemy') => makeUnit({ id: `${side}-${cls}`, name: cls, side, cls, gender: 'female', x: 0, y: 0 });
const setup = (a: ClassId, d: ClassId, seed: number, more: Partial<ClashSetup> = {}): ClashSetup => ({
  attacker: unit(a, 'player'), defender: unit(d, 'enemy'), pow: 60, seed, ...more,
});
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const winRate = (make: (seed: number) => ClashSetup) => SEEDS.filter((s) => resolveClash(make(s)).winner === 'attacker').length / SEEDS.length;

describe('resolveClash', () => {
  it('replays exactly from the same seed', () => {
    const a = resolveClash(setup('sword', 'axe', 7));
    expect(resolveClash(setup('sword', 'axe', 7))).toEqual(a);
    expect(new Set(SEEDS.slice(0, 20).map((s) => JSON.stringify(resolveClash(setup('sword', 'axe', s)).events))).size).toBeGreaterThan(15);
  });

  it.each(CLASS_IDS.flatMap((a) => CLASS_IDS.map((d) => [a, d] as const)))('%s against %s always ends, with one side wiped out', (a, d) => {
    for (const seed of SEEDS.slice(0, 15)) {
      const sim = new ClashSim(setup(a, d, seed));
      const events = sim.run();
      expect(events.filter((e) => e.kind === 'end').length).toBe(1);
      expect(events.at(-1)).toEqual({ kind: 'end', winner: sim.winner, damage: sim.damage });
      expect(standing(sim.squad(sim.winner!)).length).toBeGreaterThan(0);
      expect(standing(sim.squad(sim.winner === 'attacker' ? 'defender' : 'attacker')).length).toBe(0);
      expect(sim.damage).toBeGreaterThan(0);
      expect(sim.step()).toEqual([]);
    }
  });

  it('gives no counter when a bow is in the battle, either way', () => {
    for (const [a, d] of [['bow', 'sword'], ['sword', 'bow']] as const) {
      for (const seed of SEEDS.slice(0, 30)) {
        const { events } = resolveClash(setup(a, d, seed));
        expect(events.some((e) => e.kind === 'phase' && e.phase === 'counter')).toBe(false);
        expect(events.some((e) => e.kind === 'strike' && e.by === 'defender')).toBe(false);
      }
    }
  });

  it('gives no counter once the defenders panic', () => {
    let panics = 0;
    for (const seed of SEEDS) {
      const { events } = resolveClash(setup('sword', 'sword', seed));
      if (!events.some((e) => e.kind === 'panic')) continue;
      panics++;
      expect(events.some((e) => e.kind === 'phase' && e.phase === 'counter')).toBe(false);
    }
    expect(panics).toBeGreaterThan(10);
  });

  it('has a counter between charge and melee otherwise', () => {
    const { events } = resolveClash(setup('sword', 'sword', SEEDS.find((s) => !resolveClash(setup('sword', 'sword', s)).events.some((e) => e.kind === 'panic'))!));
    const phases = events.filter((e) => e.kind === 'phase').map((e) => e.kind === 'phase' && e.phase);
    expect(phases).toEqual(['charge', 'counter', 'melee']);
  });

  it('favours the side the weapon triangle favours, and the aggressive stance', () => {
    const even = winRate((s) => setup('sword', 'sword', s));
    expect(winRate((s) => setup('sword', 'axe', s))).toBeGreaterThan(even + 0.1);
    expect(winRate((s) => setup('axe', 'sword', s))).toBeLessThan(winRate((s) => setup('axe', 'spear', s)));
    expect(winRate((s) => setup('sword', 'sword', s, { attackerStance: 'aggressive' }))).toBeGreaterThan(even + 0.1);
    expect(winRate((s) => setup('sword', 'sword', s, { attackerStance: 'passive' }))).toBeLessThan(even - 0.1);
  });

  it('pits each fighter against its opposite number while it stands: head against head, soldier against soldier', () => {
    for (const [a, d] of [['sword', 'axe'], ['spear', 'knight'], ['knight', 'bow'], ['mage', 'sword']] as const) {
      for (const seed of SEEDS.slice(0, 40)) {
        const s = setup(a, d, seed);
        const sizes = { attacker: makeSquad(s.attacker).fighters.length, defender: makeSquad(s.defender).fighters.length };
        const down = { attacker: new Set<number>(), defender: new Set<number>() };
        for (const e of resolveClash(s).events) {
          if (e.kind === 'strike') {
            const them = e.by === 'attacker' ? 'defender' : 'attacker';
            const up = (i: number) => i < sizes[them] && !down[them].has(i);
            const soldiersUp = Array.from({ length: sizes[them] - 1 }, (_, i) => i + 1).some(up);
            if (up(e.fighter)) expect(e.target).toBe(e.fighter);
            // The head is struck by its own opposite, or once no soldier of its side stands.
            if (e.target === 0 && e.fighter !== 0) expect(soldiersUp).toBe(false);
            if (e.felled) down[them].add(e.target);
          }
          if (e.kind === 'duel' && e.felled) (e.winner === 'attacker' ? down.defender : down.attacker).add(e.winner === 'attacker' ? e.defender : e.attacker);
          if (e.kind === 'flash') (e.by === 'attacker' ? down.defender : down.attacker).add(e.target);
        }
      }
    }
  });

  it('turns a fighter whose opposite has fallen on the soldiers left, spread by number, and on the head last', () => {
    const them = makeSquad(unit('sword', 'enemy'));
    expect(target(3, them)).toBe(3);
    expect(target(0, them)).toBe(0);
    them.fighters[3].hp = 0;
    // Soldiers 1, 2, 4, 5, 6, 7 stand: soldier 3 takes the third of them.
    expect(target(3, them)).toBe(4);
    them.fighters[0].hp = 0;
    expect(target(0, them)).toBe(1);
    const knights = makeSquad(unit('knight', 'enemy'));
    // Seven soldiers against three riders: the four without an opposite spread over the riders.
    expect([4, 5, 6, 7].map((i) => target(i, knights))).toEqual([1, 2, 3, 1]);
    for (const i of [1, 2, 3]) knights.fighters[i].hp = 0;
    expect(target(5, knights)).toBe(0);
    expect(target(5, knights, 0)).toBeUndefined();
  });

  it('brings soldiers in proportion to Morale, at least one, and a wounded unit loses more often', () => {
    const at = (cls: ClassId, morale: number) => {
      const u = unit(cls, 'enemy');
      u.morale = morale;
      return makeSquad(u).fighters.length - 1;
    };
    expect(at('sword', 160)).toBe(7);
    expect(at('sword', 80)).toBe(4);
    expect(at('sword', 10)).toBe(1);
    expect(at('knight', 100)).toBe(2);
    const wounded = (seed: number) => {
      const s = setup('sword', 'sword', seed);
      s.defender.morale = 60;
      return s;
    };
    expect(winRate(wounded)).toBeGreaterThan(winRate((s) => setup('sword', 'sword', s)) + 0.1);
  });

  it('gives knights three large soldiers that take two blows each', () => {
    const squad = makeSquad(unit('knight', 'player'));
    expect(squad.fighters.length).toBe(4);
    expect(squad.fighters.slice(1).every((f) => f.large && f.hp === 2)).toBe(true);
  });

  it('replays exactly when the stance changes mid-battle at the same beats', () => {
    const play = () => {
      const sim = new ClashSim(setup('spear', 'axe', 11));
      const out = [...sim.step(), ...sim.step()];
      sim.attacker.stance = 'aggressive';
      while (sim.phase !== 'done') out.push(...sim.step());
      return out;
    };
    expect(play()).toEqual(play());
  });
});

describe('moraleDamage', () => {
  const won = () => makeSquad(unit('sword', 'player'));
  const lost = (defense: number) => makeSquad(unit('sword', 'enemy'), 'neutral', defense);

  it('drops as the loser stands on better ground, and grows on bad ground', () => {
    const seq = [-20, 0, 10, 20, 30, 50].map((d) => moraleDamage(60, won(), lost(d)));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThan(seq[i - 1]);
  });

  it('grows with the POW and with the soldiers the winner has left', () => {
    expect(moraleDamage(80, won(), lost(0))).toBeGreaterThan(moraleDamage(60, won(), lost(0)));
    const thinned = won();
    thinned.fighters[1].hp = 0;
    thinned.fighters[2].hp = 0;
    expect(moraleDamage(60, thinned, lost(0))).toBeLessThan(moraleDamage(60, won(), lost(0)));
  });

  it('is taken from the loser only', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const s = setup('axe', 'mage', seed);
      const result = resolveClash(s);
      applyResult(s, result);
      const [winner, loser] = result.winner === 'attacker' ? [s.attacker, s.defender] : [s.defender, s.attacker];
      expect(winner.morale).toBe(winner.maxMorale);
      expect(loser.morale).toBe(loser.maxMorale - result.damage);
    }
  });
});
