import { describe, expect, it } from 'vitest';
import { ClashSim, type ClashSide, type SkillId } from '../game/clash';
import { makeUnit, type ClassId } from '../game/units';
import { skillBlows, type SkillBlow } from './skillBlows';

const unit = (cls: ClassId, side: 'player' | 'enemy') => makeUnit({ id: `${side}-${cls}`, name: cls, side, cls, gender: 'female', x: 0, y: 0 });

/** Every skill moment of a whole battle, the attacker (or the defender) having fired `skill`. */
function blowsOf(skill: SkillId, a: ClassId, d: ClassId, seed: number, side: ClashSide = 'attacker'): SkillBlow[] {
  const sim = new ClashSim({ attacker: unit(a, 'player'), defender: unit(d, 'enemy'), pow: 60, seed, fire: { [side]: skill } });
  const events = sim.run();
  return events.flatMap((e, i) => skillBlows(e, i, (s) => sim.squad(s).skill, (s) => sim.squad(s).fighters.length));
}

/** The first of seeds 1 to 40 whose battle has a moment of `skill`. */
const some = (skill: SkillId, a: ClassId, d: ClassId, side: ClashSide = 'attacker') => {
  for (let seed = 1; seed <= 40; seed++) {
    const blows = blowsOf(skill, a, d, seed, side).filter((b) => b.skill === skill);
    if (blows.length) return blows;
  }
  return [];
};

describe('skillBlows: where each skill acts, for its animation', () => {
  it('finds a moment for every battle skill, and only that skill', () => {
    const cases: [SkillId, ClassId, ClassId, ClashSide?][] = [
      ['forced-march', 'sword', 'axe'], ['lance-charge', 'knight', 'sword'], ['volley', 'bow', 'axe'], ['blade-dance', 'sword', 'axe'],
      ['pike-wall', 'sword', 'spear', 'defender'], ['firestorm', 'mage', 'sword'], ['hold-fast', 'sword', 'spear'], ['rend', 'axe', 'spear'],
      ['parry', 'sword', 'spear', 'defender'], ['trample', 'knight', 'sword'], ['executioner', 'axe', 'sword'],
    ];
    for (const [skill, a, d, side] of cases) {
      const blows = some(skill, a, d, side);
      expect(blows.length, skill).toBeGreaterThan(0);
      expect(blows.every((b) => b.skill === skill)).toBe(true);
    }
  });

  it('a Forced March sets every fighter of its side going at the charge', () => {
    const blows = blowsOf('forced-march', 'sword', 'axe', 1);
    expect(blows.map((b) => b.fighter.fighter)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(blows.every((b) => b.fighter.side === 'attacker' && b.target.side === 'attacker')).toBe(true);
  });

  it('a turned blow is drawn on the one who turned it', () => {
    for (const b of some('pike-wall', 'sword', 'spear', 'defender')) expect(b).toMatchObject({ by: 'attacker', target: { side: 'defender' }, hit: false });
    for (const b of some('parry', 'sword', 'spear', 'defender')) expect(b.target).toEqual({ side: 'defender', fighter: 0 });
  });

  it("Executioner falls on the foe's leader; Rend tears at the loser's; Hold Fast shields its own", () => {
    for (const b of some('executioner', 'axe', 'sword')) expect(b.target).toEqual({ side: 'defender', fighter: 0 });
    expect(some('rend', 'axe', 'spear')[0]).toMatchObject({ by: 'attacker', target: { side: 'defender', fighter: 0 } });
    expect(some('hold-fast', 'sword', 'spear')[0]).toMatchObject({ by: 'attacker', target: { side: 'attacker', fighter: 0 } });
  });
});
