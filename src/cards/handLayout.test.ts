import { describe, expect, it } from 'vitest';
import { layoutHand, reach, rowHeight, visiblePoint } from './handLayout';

const SCREENS: [string, number, number][] = [
  ['phone', 390, 844],
  ['phone, sideways', 844, 390],
  ['laptop', 1280, 720],
  ['desktop', 1920, 1080],
];

describe('layoutHand', () => {
  for (const [name, w, h] of SCREENS) {
    describe(name, () => {
      for (const focused of [-1, 0, 3, 7]) {
        const spots = layoutHand(8, focused, w, h);

        it(`keeps every card on screen (focus ${focused})`, () => {
          for (const s of spots) {
            expect(s.x - s.w / 2).toBeGreaterThanOrEqual(-0.5);
            expect(s.x + s.w / 2).toBeLessThanOrEqual(w + 0.5);
            // Turned as the fan turns it, the card's lowest corner is still on screen.
            expect(s.y - reach(s.h, s.w, s.rot)).toBeGreaterThanOrEqual(0);
            expect(s.y + reach(s.h, s.w, s.rot)).toBeLessThanOrEqual(h + 0.5);
          }
        });

        it(`puts the row in order, left to right (focus ${focused})`, () => {
          const row = spots.filter((_, i) => i !== focused);
          for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThan(row[i - 1].x);
        });

        it(`leaves a point to click on every card (focus ${focused})`, () => {
          spots.forEach((_, i) => expect(visiblePoint(spots, i)).not.toBeNull());
        });

        if (focused >= 0) {
          it(`makes the focused card the largest, on top, and upright (focus ${focused})`, () => {
            const f = spots[focused];
            for (const s of spots) if (s !== f) {
              expect(f.h).toBeGreaterThan(s.h);
              expect(f.z).toBeGreaterThan(s.z);
            }
            expect(f.rot).toBe(0);
          });
        }
      }
    });
  }

  it('grows the focused card on a phone until it reads (at least a quarter of the screen high)', () => {
    const [f] = layoutHand(8, 0, 390, 844);
    expect(f.h).toBeGreaterThan(844 * 0.25);
    expect(f.h).toBeGreaterThan(rowHeight(8, 390, 844) * 3);
  });
});
