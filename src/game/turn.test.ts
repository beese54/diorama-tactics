import { describe, expect, it } from 'vitest';
import { CARDS, type Card, type Hand } from './cards';
import { moveRange } from './movement';
import { board } from './testBoard';
import { attackWith, canAttack, canMove, moveUnit, nextTurn, playCard, startTurn, takeBack, type TurnState } from './turn';
import { makeUnit } from './units';

const setup = () => {
  const map = board(['......', '.ff...', '......']);
  const a = makeUnit({ id: 'a', name: 'a', side: 'player', cls: 'sword', gender: 'female', x: 0, y: 0 });
  const b = makeUnit({ id: 'b', name: 'b', side: 'player', cls: 'bow', gender: 'female', x: 0, y: 2 });
  const foe = makeUnit({ id: 'f', name: 'f', side: 'enemy', cls: 'axe', gender: 'male', x: 5, y: 2 });
  return { map, a, b, foe, units: [a, b, foe] };
};

const card = (mov: number): Card => ({ ...CARDS[0], id: `mov-${mov}`, mov });
const handOf = (...movs: number[]): Hand => ({ cards: movs.map(card), used: new Set() });

/** A turn for `side` with a card of `mov` played. */
function played(side: 'player' | 'enemy', mov: number, number = 1): TurnState {
  const turn = startTurn(side, number);
  playCard(turn, handOf(mov), `mov-${mov}`);
  return turn;
}

describe('cards in a turn', () => {
  it('needs a card before anyone moves or attacks', () => {
    const { map, a, b, foe, units } = setup();
    const turn = startTurn('player', 1);
    expect([turn.card, turn.pool]).toEqual([null, 0]);
    expect(canMove(turn, a)).toBe(false);
    expect(moveUnit(turn, map, units, a, 1)).toBeNull();
    b.x = 4;
    expect(canAttack(turn, b, foe)).toBe(false);
  });

  it('sets the pool to the card\'s MOV and uses the card up', () => {
    const turn = startTurn('player', 1);
    const hand = handOf(12, 6);
    expect(playCard(turn, hand, 'mov-6')).toBe(true);
    expect([turn.card?.id, turn.pool, [...hand.used]]).toEqual(['mov-6', 6, ['mov-6']]);
  });

  it('refuses a used card, or one not in the hand', () => {
    const hand = handOf(12, 6);
    expect(playCard(startTurn('player', 1), hand, 'mov-6')).toBe(true);
    const next = startTurn('player', 2);
    expect(playCard(next, hand, 'mov-6')).toBe(false);
    expect(playCard(next, hand, 'mov-9')).toBe(false);
    expect([next.card, next.pool]).toEqual([null, 0]);
  });

  it('lets another card take the first one\'s place, or go back, until a unit moves', () => {
    const { map, a, units } = setup();
    const turn = startTurn('player', 1);
    const hand = handOf(12, 6, 4);
    playCard(turn, hand, 'mov-12');
    expect(playCard(turn, hand, 'mov-6')).toBe(true);
    expect([turn.pool, [...hand.used]]).toEqual([6, ['mov-6']]);
    expect(takeBack(turn, hand)).toBe(true);
    expect([turn.card, turn.pool, hand.used.size]).toEqual([null, 0, 0]);
    playCard(turn, hand, 'mov-6');
    expect(moveUnit(turn, map, units, a, 1)).not.toBeNull();
    expect(playCard(turn, hand, 'mov-12')).toBe(false);
    expect(takeBack(turn, hand)).toBe(false);
    expect([turn.card?.id, turn.pool]).toEqual(['mov-6', 5]);
  });
});

describe('turns', () => {
  it('spends the path cost from the shared pool and moves the unit', () => {
    const { map, a, units } = setup();
    const turn = played('player', 12);
    const path = moveUnit(turn, map, units, a, 1 * 6 + 2);
    expect(path).toEqual([0, 1, 2, 8]);
    expect(turn.pool).toBe(12 - 4);
    expect([a.x, a.y]).toEqual([2, 1]);
  });

  it('lets a unit move only once a turn, and the pool is shared', () => {
    const { map, a, b, units } = setup();
    const turn = played('player', 6);
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
    const turn = played('player', 3);
    expect(moveUnit(turn, map, units, a, 5)).toBeNull();
    expect(moveUnit(turn, map, units, a, 2 * 6)).toBeNull();
    expect(moveUnit(turn, map, units, a, 0)).toBeNull();
    expect(moveUnit(turn, map, units, foe, 2 * 6 + 4)).toBeNull();
    expect(turn.pool).toBe(3);
    expect([a.x, a.y, b.x, b.y]).toEqual([0, 0, 0, 2]);
  });

  it('hands over to the other side with no card yet, counting the player\'s turns', () => {
    const { map, a, units } = setup();
    const turn = played('player', 12);
    moveUnit(turn, map, units, a, 1);
    const enemy = nextTurn(turn);
    expect([enemy.side, enemy.number, enemy.card, enemy.pool, enemy.moved.size, enemy.attacked]).toEqual(['enemy', 1, null, 0, 0, false]);
    const back = nextTurn(enemy);
    expect([back.side, back.number]).toEqual(['player', 2]);
    playCard(back, handOf(5), 'mov-5');
    expect(canMove(back, a)).toBe(true);
  });

  it('lets a side fight one battle a turn, after moving, and the battle ends the turn', () => {
    const { map, a, b, foe, units } = setup();
    const turn = played('player', 12);
    expect(canAttack(turn, b, foe)).toBe(false);
    // Up to the foe's side, then the attack.
    expect(moveUnit(turn, map, units, b, 2 * 6 + 4)).not.toBeNull();
    expect(canAttack(turn, b, foe)).toBe(true);
    expect(canAttack(turn, b, a)).toBe(false);
    expect(attackWith(turn, b, foe)).toBe(true);
    expect(attackWith(turn, b, foe)).toBe(false);
    // Nobody else attacks or moves this turn, though the pool has MOV left.
    a.x = 5;
    a.y = 1;
    expect(canAttack(turn, a, foe)).toBe(false);
    expect(turn.pool).toBeGreaterThan(0);
    expect(canMove(turn, a)).toBe(false);
    expect(moveUnit(turn, map, units, a, 0)).toBeNull();
    // Not on the foe's turn, not diagonally, and nobody fallen.
    const next = played('enemy', 6);
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
