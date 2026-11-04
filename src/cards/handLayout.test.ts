import { describe, expect, it } from 'vitest';
import { layoutHand, reach, rowHeight, TUCK, visiblePoint } from './handLayout';

const SCREENS: [string, number, number][] = [
  ['phone', 390, 844],
  ['phone, sideways', 844, 390],
  ['laptop', 1366, 768],
  ['desktop', 1920, 1080],
];

describe('layoutHand', () => {
  for (const [name, w, h] of SCREENS) {
    describe(name, () => {
      for (const focused of [-1, 0, 3, 7]) {
        const focus = layoutHand(8, focused, w, h, 'focus');
        const tucked = layoutHand(8, focused, w, h, 'tucked');

        it(`in focus, keeps every card on screen (focus ${focused})`, () => {
          for (const s of focus.cards) {
            expect(s.x - s.w / 2).toBeGreaterThanOrEqual(-0.5);
            expect(s.x + s.w / 2).toBeLessThanOrEqual(w + 0.5);
            // Turned as the fan turns it, the card's lowest corner is still on screen.
            expect(s.y - reach(s.h, s.w, s.rot)).toBeGreaterThanOrEqual(0);
            expect(s.y + reach(s.h, s.w, s.rot)).toBeLessThanOrEqual(h + 0.5);
          }
        });

        it(`tucked, shows only the cards' tops, the bottom ${TUCK * 100}% of the screen (focus ${focused})`, () => {
          for (const s of tucked.cards) {
            expect(s.y - reach(s.h, s.w, s.rot)).toBeGreaterThanOrEqual(h * (1 - TUCK) - 0.5);
            expect(s.y - s.h / 2).toBeLessThan(h);
          }
        });

        it(`puts the fan in order, left to right, the same in both (focus ${focused})`, () => {
          for (const { slots } of [focus, tucked]) {
            for (let i = 1; i < slots.length; i++) expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
          }
          focus.slots.forEach((s, i) => expect(tucked.slots[i].x).toBe(s.x));
        });

        it(`leaves a point on screen to click on every card's slot (focus ${focused})`, () => {
          for (const { slots } of [focus, tucked]) {
            slots.forEach((_, i) => {
              const p = visiblePoint(slots, i, h);
              expect(p).not.toBeNull();
              expect(p!.y).toBeLessThanOrEqual(h);
            });
          }
        });

        it(`a card tucked under the pointer is still under it once the fan rises (focus ${focused})`, () => {
          tucked.slots.forEach((_, i) => {
            const p = visiblePoint(tucked.slots, i, h)!;
            const up = layoutHand(8, i, w, h, 'focus').slots;
            const hit = up.map((s, j) => [s, j] as const).filter(([s]) => Math.abs(p.x - s.x) <= s.w / 2 && Math.abs(p.y - s.y) <= s.h / 2).sort((a, b) => b[0].z - a[0].z)[0];
            expect(hit?.[1]).toBe(i);
          });
        });

        if (focused >= 0) {
          it(`in focus, lifts the focused card out, the largest, on top, upright and in the middle (focus ${focused})`, () => {
            const f = focus.cards[focused];
            for (const s of focus.cards) if (s !== f) {
              expect(f.h).toBeGreaterThan(s.h);
              expect(f.z).toBeGreaterThan(s.z);
            }
            expect(f.rot).toBe(0);
            expect(f.x).toBeCloseTo(w / 2);
            // Its slot stays in the fan, to take the pointer where it was, down to the bottom edge.
            expect(focus.slots[focused].x).toBe(tucked.slots[focused].x);
            expect(focus.slots[focused].y + focus.slots[focused].h / 2).toBeGreaterThanOrEqual(h);
          });

          it(`tucked, lifts no card (focus ${focused})`, () => {
            for (const s of tucked.cards) expect(s.h).toBe(rowHeight(8, w, h));
          });
        }
      }
    });
  }

  it('in focus on a wide screen, the card reads at 60% of the screen high, clear above the fan', () => {
    for (const [w, h] of [[1920, 1080], [1366, 768]]) {
      const { cards } = layoutHand(8, 3, w, h, 'focus');
      const f = cards[3];
      expect(f.h).toBeGreaterThanOrEqual(h * 0.55);
      expect(f.h).toBeLessThanOrEqual(h * 0.6 + 0.5);
      const fanTop = Math.min(...cards.filter((_, i) => i !== 3).map((s) => s.y - reach(s.h, s.w, s.rot)));
      expect(f.y + f.h / 2).toBeLessThanOrEqual(fanTop);
    }
  });

  it('grows the focused card on a phone until it reads (at least a quarter of the screen high)', () => {
    const f = layoutHand(8, 0, 390, 844, 'focus').cards[0];
    expect(f.h).toBeGreaterThan(844 * 0.25);
    expect(f.h).toBeGreaterThan(rowHeight(8, 390, 844) * 3);
  });
});
