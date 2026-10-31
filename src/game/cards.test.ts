import { describe, expect, it } from 'vitest';
import { CARDS, deal, HAND_SIZE, refill, unused } from './cards';
import { CLASSES } from './units';

const WEAPONS = new Set(Object.values(CLASSES).map((c) => c.weapon));

describe('cards', () => {
  it('are all different, in range, and trade POW against MOV', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map((c) => c.name)).size).toBe(CARDS.length);
    for (const c of CARDS) {
      expect(c.pow).toBeGreaterThanOrEqual(40);
      expect(c.pow).toBeLessThanOrEqual(90);
      expect(c.mov).toBeGreaterThanOrEqual(4);
      expect(c.mov).toBeLessThanOrEqual(15);
      expect(Math.abs(c.pow + 5 * c.mov - 115)).toBeLessThanOrEqual(5);
      expect(c.ace === 'all' || WEAPONS.has(c.ace)).toBe(true);
      expect(c.skill.name && c.skill.text).toBeTruthy();
    }
    // Every weapon is some card's ACE.
    for (const w of WEAPONS) expect(CARDS.some((c) => c.ace === w)).toBe(true);
  });

  it('deal each side a hand of different cards, the same for the same seed', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const side of ['player', 'enemy'] as const) {
        const hand = deal(seed, side);
        expect(hand.cards.length).toBe(HAND_SIZE);
        expect(new Set(hand.cards.map((c) => c.id)).size).toBe(HAND_SIZE);
        expect(hand.used.size).toBe(0);
        expect(deal(seed, side).cards).toEqual(hand.cards);
        // In catalogue order.
        const at = hand.cards.map((c) => CARDS.indexOf(c));
        expect(at).toEqual([...at].sort((a, b) => a - b));
      }
    }
    // Seeds and sides differ.
    const hands = new Set(Array.from({ length: 20 }, (_, s) => deal(s, 'player').cards.map((c) => c.id).join()));
    expect(hands.size).toBeGreaterThan(10);
    expect(deal(7, 'player').cards).not.toEqual(deal(7, 'enemy').cards);
  });

  it('come back once every card in the hand has been played', () => {
    const hand = deal(3, 'player');
    for (const c of hand.cards.slice(0, -1)) hand.used.add(c.id);
    refill(hand);
    expect(unused(hand)).toEqual([hand.cards.at(-1)]);
    hand.used.add(hand.cards.at(-1)!.id);
    refill(hand);
    expect(unused(hand)).toEqual(hand.cards);
  });
});
