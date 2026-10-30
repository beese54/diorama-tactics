import { describe, expect, it } from 'vitest';
import { ClashSim, resolveClash, type ClashSetup, type ClashSide } from '../game/clash';
import { CLASS_IDS, makeUnit, type ClassId } from '../game/units';
import { actSeconds, BattleScript, STRIKE, type Act, type Take, type Who } from './script';

const unit = (cls: ClassId, side: 'player' | 'enemy') => makeUnit({ id: `${side}-${cls}`, name: cls, side, cls, gender: 'female', x: 0, y: 0 });
const setup = (a: ClassId, d: ClassId, seed: number): ClashSetup => ({ attacker: unit(a, 'player'), defender: unit(d, 'enemy'), pow: 60, seed });
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const PAIRS = CLASS_IDS.flatMap((a) => CLASS_IDS.map((d) => [a, d] as const));

/** Plays a battle beat by beat through the script, as the scene will. */
function play(a: ClassId, d: ClassId, seed: number): Take[] {
  const sim = new ClashSim(setup(a, d, seed));
  const script = new BattleScript({ attacker: a, defender: d });
  const takes: Take[] = [];
  while (sim.phase !== 'done') takes.push(script.beat(sim.step()));
  return takes;
}

const key = (w: Who) => `${w.side}:${w.fighter}`;
/** The fighter whose body an act moves (sides, banners, flashes of light and the result move nobody's). */
const body = (act: Act): Who | null => (act.kind === 'attack' || act.kind === 'hurt' || act.kind === 'fall' || act.kind === 'block' || act.kind === 'cheer' ? act.who : null);
const reaction = (act: Act) => act.kind === 'hurt' || act.kind === 'fall' || act.kind === 'block';

describe('BattleScript', () => {
  it.each(PAIRS)('%s against %s: the script shows the rules’ outcome over 50 seeds', (a, d) => {
    for (const seed of SEEDS) {
      const acts = play(a, d, seed).flatMap((t) => t.acts);
      const rules = resolveClash(setup(a, d, seed));
      const sim = new ClashSim(setup(a, d, seed));
      sim.run();
      const felled = (['attacker', 'defender'] as const).flatMap((side) =>
        sim.squad(side).fighters.flatMap((f, fighter) => (f.hp <= 0 ? [`${side}:${fighter}`] : [])),
      );
      const fell = acts.flatMap((x) => (x.kind === 'fall' ? [key(x.who)] : []));
      expect(new Set(fell).size).toBe(fell.length);
      expect(new Set(fell)).toEqual(new Set(felled));
      const results = acts.filter((x) => x.kind === 'result');
      expect(results).toEqual([expect.objectContaining({ winner: rules.winner, damage: rules.damage })]);
      // Everyone the winner has left cheers, and nobody else.
      const cheers = acts.flatMap((x) => (x.kind === 'cheer' ? [key(x.who)] : []));
      const left = sim.squad(rules.winner).fighters.flatMap((f, fighter) => (f.hp > 0 ? [`${rules.winner}:${fighter}`] : []));
      expect(new Set(cheers)).toEqual(new Set(left));
    }
  });

  it.each(PAIRS)('%s against %s: every blow meets its foe as it lands, and nobody moves after falling', (a, d) => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const take of play(a, d, seed)) {
        for (const x of take.acts) {
          expect(x.at).toBeGreaterThanOrEqual(0);
          expect(x.at + actSeconds(x)).toBeLessThanOrEqual(take.seconds);
          if (x.kind !== 'attack') continue;
          expect(x.lands).toBeGreaterThanOrEqual(x.at + STRIKE);
          expect(take.acts.some((y) => reaction(y) && y.at === x.lands && key(body(y)!) === key(x.foe))).toBe(true);
        }
        // Per fighter: a move (a swing, a cheer) waits for its last act to end; only a blow cuts in.
        const byFighter = new Map<string, Act[]>();
        for (const x of take.acts) {
          const who = body(x);
          if (who) byFighter.set(key(who), [...(byFighter.get(key(who)) ?? []), x]);
        }
        for (const list of byFighter.values()) {
          list.sort((x, y) => x.at - y.at);
          const fall = list.findIndex((x) => x.kind === 'fall');
          if (fall >= 0) expect(fall).toBe(list.length - 1);
          for (let i = 1; i < list.length; i++) {
            if (!reaction(list[i])) expect(list[i].at).toBeGreaterThanOrEqual(list[i - 1].at + actSeconds(list[i - 1]) - 1e-9);
          }
        }
        // A side's swings start once its run is over.
        for (const run of take.acts.filter((x) => x.kind === 'advance')) {
          for (const x of take.acts) if (x.kind === 'attack' && x.who.side === run.side) expect(x.at).toBeGreaterThanOrEqual(run.seconds);
        }
      }
    }
  });

  it('runs a melee squad in at the charge, while archers and mages shoot from their ranks', () => {
    const first = (a: ClassId, d: ClassId) => play(a, d, 3)[0].acts;
    expect(first('sword', 'axe')).toContainEqual(expect.objectContaining({ kind: 'advance', side: 'attacker', to: 'foe' }));
    for (const ranged of ['bow', 'mage'] as const) {
      const acts = first(ranged, 'sword');
      expect(acts.some((x) => x.kind === 'advance')).toBe(false);
      for (const x of acts) if (x.kind === 'attack') expect(x.ranged && x.lands > x.at + STRIKE).toBe(true);
    }
  });

  it('runs nobody once the lines have met, and both sides to the middle if neither came to the other', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const runs = (a: ClassId, d: ClassId) => play(a, d, seed).flatMap((t) => t.acts.filter((x) => x.kind === 'advance'));
      expect(runs('sword', 'axe').map((x) => x.side)).toEqual(['attacker']);
      const ranged = runs('bow', 'mage');
      // Unless the charge already ended it, both run in for the melee.
      if (ranged.length) expect(ranged.map((x) => [x.side, x.to])).toEqual([['attacker', 'middle'], ['defender', 'middle']]);
    }
  });

  it('gallops knights in faster than a squad runs on foot', () => {
    const run = (cls: ClassId) => play(cls, 'sword', 1)[0].acts.find((x) => x.kind === 'advance')!;
    expect(run('knight').seconds).toBeLessThan(run('spear').seconds);
  });

  it('turns a large soldier’s first blow into a stagger, not a fall', () => {
    const hurts = SEEDS.flatMap((s) => play('sword', 'knight', s).flatMap((t) => t.acts)).filter((x) => x.kind === 'hurt' && x.who.side === ('defender' as ClashSide));
    expect(hurts.length).toBeGreaterThan(0);
  });
});
