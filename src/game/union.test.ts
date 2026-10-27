import { describe, expect, it } from 'vitest';
import { canAttack, unionOf } from './union';
import { applyDamage, CLASSES, isDefeated, makeUnit, triangleEdge, type Gender, type Side } from './units';

const unit = (x: number, y: number, side: Side = 'player', gender: Gender = 'female') =>
  makeUnit({ id: `${side}${x},${y}`, name: `${x},${y}`, side, cls: 'sword', gender, x, y });

/** Units on every tile of a 3×3 block around (1, 1), the centre one the leader. */
const block = (gender: Gender) => {
  const all = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) all.push(unit(x, y, 'player', x === 1 && y === 1 ? gender : 'male'));
  return all;
};

describe('unionOf', () => {
  it('draws a + for a woman, clockwise from the top', () => {
    const all = block('female');
    expect(unionOf(all[4], all).map((u) => [u.x, u.y])).toEqual([[1, 1], [1, 0], [2, 1], [1, 2], [0, 1]]);
  });

  it('draws an x for a man, clockwise from the top right', () => {
    const all = block('male');
    expect(unionOf(all[4], all).map((u) => [u.x, u.y])).toEqual([[1, 1], [2, 0], [2, 2], [0, 2], [0, 0]]);
  });

  it('takes only living allies, and never more than five', () => {
    const all = block('female');
    all[1].side = 'enemy';
    all[3].morale = 0;
    expect(unionOf(all[4], all).map((u) => [u.x, u.y])).toEqual([[1, 1], [2, 1], [1, 2]]);
    expect(unionOf(all[4], block('female')).length).toBe(5);
  });

  it('stands alone with nobody on its shape', () => {
    const lone = unit(1, 1, 'player', 'male');
    expect(unionOf(lone, [lone, unit(1, 0), unit(2, 1)])).toEqual([lone]);
  });
});

describe('canAttack', () => {
  it('reaches an enemy on an edge neighbour only', () => {
    const me = unit(1, 1);
    expect(canAttack(me, unit(1, 0, 'enemy'))).toBe(true);
    expect(canAttack(me, unit(2, 2, 'enemy'))).toBe(false);
    expect(canAttack(me, unit(1, 3, 'enemy'))).toBe(false);
    expect(canAttack(me, unit(1, 0))).toBe(false);
  });
});

describe('units', () => {
  it('runs the weapon triangle both ways, with bows and staves outside it', () => {
    expect(triangleEdge('sword', 'axe')).toBe(2);
    expect(triangleEdge('axe', 'sword')).toBe(-2);
    expect(triangleEdge('axe', 'spear')).toBe(2);
    expect(triangleEdge('spear', 'axe')).toBe(-2);
    expect(triangleEdge('spear', 'sword')).toBe(2);
    expect(triangleEdge('lance', 'sword')).toBe(2);
    expect(triangleEdge('sword', 'lance')).toBe(-2);
    expect(triangleEdge('sword', 'sword')).toBe(0);
    for (const w of ['sword', 'spear', 'axe', 'lance', 'bow', 'staff'] as const) {
      expect(triangleEdge('bow', w)).toBe(0);
      expect(triangleEdge(w, 'staff')).toBe(0);
    }
  });

  it('starts at full Morale and is defeated at zero, never below', () => {
    const u = makeUnit({ id: 'k', name: 'k', side: 'enemy', cls: 'knight', gender: 'male', x: 0, y: 0 });
    expect(u.morale).toBe(CLASSES.knight.morale);
    applyDamage(u, 150);
    expect(isDefeated(u)).toBe(false);
    applyDamage(u, 999);
    expect(u.morale).toBe(0);
    expect(isDefeated(u)).toBe(true);
  });
});
