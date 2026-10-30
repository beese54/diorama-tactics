import { describe, expect, it } from 'vitest';
import { ClashSim, type ClashEvent, type ClashSetup, type Stance } from './clash';
import { fill, gain, GAIN, GAUGE_MAX } from './gauge';
import { makeUnit, type ClassId } from './units';

const unit = (cls: ClassId, side: 'player' | 'enemy') => makeUnit({ id: `${side}-${cls}`, name: cls, side, cls, gender: 'female', x: 0, y: 0 });
const setup = (a: ClassId, d: ClassId, seed: number, more: Partial<ClashSetup> = {}): ClashSetup => ({
  attacker: unit(a, 'player'), defender: unit(d, 'enemy'), pow: 60, seed, ...more,
});
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

const strike = (by: 'attacker' | 'defender', hit: boolean): ClashEvent => ({ kind: 'strike', by, fighter: 1, target: 1, hit, crit: false, felled: hit });
const duel = (winner: 'attacker' | 'defender'): ClashEvent => ({ kind: 'duel', winner, attacker: 1, defender: 1, felled: true });

/** The attacker's gauge after a whole battle in `stance`, beat by beat as the scene plays it. */
function battle(seed: number, stance: Stance): number {
  const sim = new ClashSim(setup('sword', 'sword', seed, { attackerStance: stance }));
  let gauge = 0;
  while (sim.phase !== 'done') gauge = fill(gauge, sim.step(), 'attacker', sim.attacker.stance);
  return gauge;
}
const mean = (stance: Stance) => SEEDS.reduce((s, seed) => s + battle(seed, stance), 0) / SEEDS.length;

describe('skill gauge', () => {
  it('fills for the side that lands a blow or wins a duel, and for nothing else', () => {
    expect(gain(strike('attacker', true), 'attacker', 'neutral')).toBe(GAIN.hit);
    expect(gain(strike('attacker', false), 'attacker', 'neutral')).toBe(0);
    expect(gain(strike('attacker', true), 'defender', 'neutral')).toBe(0);
    expect(gain(duel('defender'), 'defender', 'neutral')).toBe(GAIN.duel);
    expect(gain(duel('defender'), 'attacker', 'neutral')).toBe(0);
    expect(gain({ kind: 'flash', by: 'attacker', fighter: 1, target: 2 }, 'attacker', 'neutral')).toBe(0);
    expect(gain({ kind: 'phase', phase: 'charge' }, 'attacker', 'aggressive')).toBe(0);
  });

  it('fills half again as fast when aggressive, and not at all when passive', () => {
    const beat = [strike('attacker', true), duel('attacker'), strike('defender', true)];
    expect(fill(0, beat, 'attacker', 'neutral')).toBe(GAIN.hit + GAIN.duel);
    expect(fill(0, beat, 'attacker', 'aggressive')).toBe(1.5 * (GAIN.hit + GAIN.duel));
    expect(fill(10, beat, 'attacker', 'passive')).toBe(10);
  });

  it('stops at full', () => {
    expect(fill(GAUGE_MAX - 3, [duel('attacker')], 'attacker', 'aggressive')).toBe(GAUGE_MAX);
  });

  it('over whole battles: aggressive fills more than neutral, passive none, and one battle on average leaves it short of full', () => {
    const [aggressive, neutral] = [mean('aggressive'), mean('neutral')];
    expect(aggressive).toBeGreaterThan(neutral * 1.4);
    expect(neutral).toBeGreaterThan(20);
    expect(aggressive).toBeLessThan(GAUGE_MAX);
    expect(SEEDS.every((seed) => battle(seed, 'passive') === 0)).toBe(true);
  });
});
