import { describe, expect, it } from 'vitest';
import { ClashSim, type ClashSetup, type Stance } from './clash';
import { charge, GAUGE_MAX, STANCE_CHARGE } from './gauge';
import { makeUnit, type ClassId } from './units';

const unit = (cls: ClassId, side: 'player' | 'enemy', gauge = 0) => {
  const u = makeUnit({ id: `${side}-${cls}`, name: cls, side, cls, gender: 'female', x: 0, y: 0 });
  u.gauge = gauge;
  return u;
};
const setup = (seed: number, more: Partial<ClashSetup> = {}, gauge = 0): ClashSetup => ({
  attacker: unit('sword', 'player', gauge), defender: unit('axe', 'enemy', gauge), pow: 60, seed, ...more,
});

describe('skill gauge (the stance drives it, 2026-11-08)', () => {
  it('charges fast when passive, at half that when neutral, and drains when aggressive', () => {
    expect(STANCE_CHARGE.passive).toBeGreaterThan(0);
    expect(STANCE_CHARGE.neutral).toBe(STANCE_CHARGE.passive / 2);
    expect(STANCE_CHARGE.aggressive).toBeLessThan(0);
    expect(charge(30, 'passive')).toBe(70);
    expect(charge(30, 'neutral')).toBe(50);
    expect(charge(30, 'aggressive')).toBe(10);
  });

  it('stops at full and at empty', () => {
    expect(charge(GAUGE_MAX - 5, 'passive')).toBe(GAUGE_MAX);
    expect(charge(5, 'aggressive')).toBe(0);
    expect(charge(0, 'aggressive')).toBe(0);
  });

  it('moves once a beat in a battle, by the stance each side fights that beat in, whatever lands', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = new ClashSim(setup(seed, { attackerStance: 'passive', defenderStance: 'aggressive' }, 50));
      const seen: [number, number][] = [];
      while (sim.phase !== 'done') {
        sim.step();
        seen.push([sim.gauge('attacker'), sim.gauge('defender')]);
      }
      seen.forEach(([a, d], i) => {
        expect(a).toBe(Math.min(GAUGE_MAX, 50 + 40 * (i + 1)));
        expect(d).toBe(Math.max(0, 50 - 20 * (i + 1)));
      });
    }
  });

  it('follows a stance changed between beats from the next beat', () => {
    const sim = new ClashSim(setup(9, {}, 50));
    sim.step();
    expect(sim.gauge('attacker')).toBe(70);
    sim.attacker.stance = 'aggressive';
    sim.step();
    expect(sim.gauge('attacker')).toBe(50);
  });

  it('over a whole battle from empty: passive usually fills it, neutral gets about half way, aggressive leaves it empty', () => {
    const after = (stance: Stance, seed: number) => {
      const sim = new ClashSim(setup(seed, { attackerStance: stance }));
      sim.run();
      return sim.gauge('attacker');
    };
    const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
    const mean = (stance: Stance) => seeds.reduce((s, seed) => s + after(stance, seed), 0) / seeds.length;
    expect(mean('passive')).toBeGreaterThan(90);
    expect(mean('neutral')).toBeGreaterThan(40);
    expect(mean('neutral')).toBeLessThan(90);
    expect(seeds.every((seed) => after('aggressive', seed) === 0)).toBe(true);
  });
});
