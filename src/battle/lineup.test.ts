import { describe, expect, it } from 'vitest';
import { ROSTER } from '../game/deploy';
import { CLASS_IDS, CLASSES } from '../game/units';
import { LEADERS, lineup } from './lineup';

describe('lineup', () => {
  it("names every roster unit's leader after the unit", () => {
    for (const side of ['player', 'enemy'] as const) {
      for (const r of ROSTER[side]) expect(LEADERS[side][r.cls]).toBe(r.name.toLowerCase());
    }
  });

  it('gives each side six different leaders', () => {
    for (const side of ['player', 'enemy'] as const) expect(new Set(Object.values(LEADERS[side])).size).toBe(6);
  });

  it("fills a squad with the class's soldiers, man and woman in turn, red only for the enemy", () => {
    for (const cls of CLASS_IDS) {
      const { soldiers } = CLASSES[cls];
      const p = lineup('player', cls, soldiers);
      expect(p.soldiers).toHaveLength(soldiers);
      expect(p.soldiers[0]).toBe(`soldier-${cls}-m`);
      expect(p.soldiers[1]).toBe(`soldier-${cls}-f`);
      expect(p.red).toBe(false);
      expect(lineup('enemy', cls, soldiers).red).toBe(true);
    }
  });
});
