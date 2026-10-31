import { describe, expect, it } from 'vitest';
import { moveRange } from './movement';
import { board } from './testBoard';
import { attackWith, canAttack, canMove, FIXED_POOL, moveUnit, nextTurn, startTurn } from './turn';
import { makeUnit } from './units';

const setup = () => {
  const map = board(['......', '.ff...', '......']);
  const a = makeUnit({ id: 'a', name: 'a', side: 'player', cls: 'sword', gender: 'female', x: 0, y: 0 });
  const b = makeUnit({ id: 'b', name: 'b', side: 'player', cls: 'bow', gender: 'female', x: 0, y: 2 });
  const foe = makeUnit({ id: 'f', name: 'f', side: 'enemy', cls: 'axe', gender: 'male', x: 5, y: 2 });
  return { map, a, b, foe, units: [a, b, foe] };
};

describe('turns', () => {
  it('spends the path cost from the shared pool and moves the unit', () => {
    const { map, a, units } = setup();
    const turn = startTurn('player', 1);
    const path = moveUnit(turn, map, units, a, 1 * 6 + 2);
    expect(path).toEqual([0, 1, 2, 8]);
    expect(turn.pool).toBe(FIXED_POOL - 4);
    expect([a.x, a.y]).toEqual([2, 1]);
  });

  it('lets a unit move only once a turn, and the pool is shared', () => {
    const { map, a, b, units } = setup();
    const turn = startTurn('player', 1, 6);
    expect(moveUnit(turn, map, units, a, 5)).not.toBeNull();
    expect(canMove(turn, a)).toBe(false);
    expect(moveUnit(turn, map, units, a, 4)).toBeNull();
    expect(turn.pool).toBe(1);
    expect(moveRange(map, units, b, turn.pool).has(2 * 6 + 2)).toBe(false);
    expect(moveUnit(turn, map, units, b, 2 * 6 + 1)).not.toBeNull();
    expect(turn.pool).toBe(0);
  });

  it('refuses moves out of range, onto units, on the other side\'s turn, or standing still', () => {
    const { map, a, b, foe, units } = setup();
    const turn = startTurn('player', 1, 3);
    expect(moveUnit(turn, map, units, a, 5)).toBeNull();
    expect(moveUnit(turn, map, units, a, 2 * 6)).toBeNull();
    expect(moveUnit(turn, map, units, a, 0)).toBeNull();
    expect(moveUnit(turn, map, units, foe, 2 * 6 + 4)).toBeNull();
    expect(turn.pool).toBe(3);
    expect([a.x, a.y, b.x, b.y]).toEqual([0, 0, 0, 2]);
  });

  it('hands over to the other side with a fresh pool, counting the player\'s turns', () => {
    const { map, a, units } = setup();
    const turn = startTurn('player', 1);
    moveUnit(turn, map, units, a, 1);
    const enemy = nextTurn(turn);
    expect([enemy.side, enemy.number, enemy.pool, enemy.moved.size]).toEqual(['enemy', 1, FIXED_POOL, 0]);
    const back = nextTurn(enemy);
    expect([back.side, back.number]).toEqual(['player', 2]);
    expect(canMove(back, a)).toBe(true);
  });

  it('lets a unit attack a foe on the next tile once a turn, after moving but not before', () => {
    const { map, a, b, foe, units } = setup();
    const turn = startTurn('player', 1);
    expect(canAttack(turn, b, foe)).toBe(false);
    // Up to the foe's side, then the attack.
    expect(moveUnit(turn, map, units, b, 2 * 6 + 4)).not.toBeNull();
    expect(canAttack(turn, b, foe)).toBe(true);
    expect(canAttack(turn, b, a)).toBe(false);
    expect(attackWith(turn, b, foe)).toBe(true);
    expect(attackWith(turn, b, foe)).toBe(false);
    expect(canMove(turn, b)).toBe(false);
    // An attack first spends the move as well.
    a.x = 5;
    a.y = 1;
    expect(attackWith(turn, a, foe)).toBe(true);
    expect(moveUnit(turn, map, units, a, 0)).toBeNull();
    // Not on the foe's turn, not diagonally, and nobody fallen.
    const next = nextTurn(turn);
    expect(canAttack(next, b, foe)).toBe(false);
    expect(canAttack(next, foe, b)).toBe(true);
    foe.x = 3;
    foe.y = 1;
    expect(canAttack(next, foe, b)).toBe(false);
    foe.x = 4;
    b.morale = 0;
    expect(canAttack(next, foe, b)).toBe(false);
  });
});
