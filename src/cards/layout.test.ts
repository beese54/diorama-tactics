import { describe, expect, it } from 'vitest';
import { CARDS } from '../game/cards';
import { ART, ART_UV, CARD_H, CARD_W, cardNumber, rarity } from './layout';
import { LOOKS } from './looks';

describe('card layout', () => {
  it('is a 5:7 card with a square art window inside it', () => {
    expect(CARD_W / CARD_H).toBeCloseTo(5 / 7);
    expect(ART.x * 2 + ART.size).toBe(CARD_W);
    expect(ART.y + ART.size).toBeLessThan(CARD_H);
    // The window is square on the card, so square in its UVs once scaled by the card's sides.
    expect((ART_UV.u1 - ART_UV.u0) * CARD_W).toBeCloseTo((ART_UV.v1 - ART_UV.v0) * CARD_H);
  });

  it('rates rarity by POW', () => {
    expect(CARDS.map((c) => rarity(c.pow))).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('numbers the cards in catalogue order', () => {
    expect(cardNumber(CARDS[0])).toBe('01 / 12');
    expect(cardNumber(CARDS[11])).toBe('12 / 12');
  });
});

describe('card looks', () => {
  it('gives every card its own look', () => {
    expect(Object.keys(LOOKS).sort()).toEqual(CARDS.map((c) => c.id).sort());
  });

  it('keeps the light source inside the art window', () => {
    for (const look of Object.values(LOOKS)) for (const v of look.source) expect(v >= 0 && v <= 1).toBe(true);
  });
});
