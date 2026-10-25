import { describe, expect, it } from 'vitest';
import { CYCLE_SECONDS, dayAt, DayClock, easeHour, HOURS, lightDirection, SUNRISE, SUNSET, TIME_EASE_SECONDS } from './daytime';

const warmth = (c: number[]) => c[0] - c[2];

describe('time of day', () => {
  it('loops round the clock and changes smoothly from hour to hour', () => {
    expect(dayAt(0)).toEqual(dayAt(24));
    for (let h = 0; h < 24; h += 0.1) {
      const [a, b] = [dayAt(h), dayAt(h + 0.1)];
      expect(Math.abs(a.sun - b.sun)).toBeLessThan(0.1);
      expect(Math.abs(a.sky - b.sky)).toBeLessThan(0.1);
      expect(Math.abs(a.night - b.night)).toBeLessThan(0.1);
    }
  });

  it('is bright by day, dark at night, and warm at dawn and dusk', () => {
    expect(dayAt(HOURS.day)).toMatchObject({ sun: 1, sky: 1, night: 0 });
    expect(dayAt(HOURS.night).night).toBe(1);
    expect(dayAt(HOURS.night).sky).toBeLessThan(0.5);
    for (const h of [HOURS.dawn, HOURS.dusk]) {
      expect(warmth(dayAt(h).sunColor)).toBeGreaterThan(0.2);
      expect(dayAt(h).sun).toBeLessThan(1);
    }
    // Dusk is the warmer of the two; moonlight is cold.
    expect(warmth(dayAt(HOURS.dusk).sunColor)).toBeGreaterThan(warmth(dayAt(HOURS.dawn).sunColor));
    expect(warmth(dayAt(HOURS.night).sunColor)).toBeLessThan(0);
  });

  it('has the sun up by day and the moon by night, always above the horizon', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const { dir, sunUp } = lightDirection(h);
      expect(sunUp).toBe(h > SUNRISE && h < SUNSET);
      expect(dir[1]).toBeGreaterThan(0);
      expect(Math.hypot(...dir)).toBeCloseTo(1);
    }
  });

  it('casts long shadows at dawn and dusk and short ones at noon, rising on one side and setting on the other', () => {
    const height = (h: number) => lightDirection(h).dir[1];
    expect(height(HOURS.day)).toBeGreaterThan(height(HOURS.dawn) + 0.3);
    expect(height(HOURS.day)).toBeGreaterThan(height(HOURS.dusk) + 0.3);
    const [dawn, dusk] = [lightDirection(HOURS.dawn).dir, lightDirection(HOURS.dusk).dir];
    expect(dawn[0] * dusk[0] + dawn[2] * dusk[2]).toBeLessThan(0);
  });

  it('eases forward through the hours between: day to night passes through dusk', () => {
    expect(easeHour(12, 23, 0)).toBe(12);
    expect(easeHour(12, 23, TIME_EASE_SECONDS)).toBeCloseTo(23);
    const mid = easeHour(12, 23, TIME_EASE_SECONDS / 2);
    expect(mid).toBeGreaterThan(12);
    expect(mid).toBeLessThan(23);
    // From night to dawn it goes on past midnight rather than back through the day.
    const after = easeHour(23.5, 6.5, TIME_EASE_SECONDS / 2);
    expect(after < 6.5 || after > 23.5).toBe(true);
  });

  it('runs a clock: fixed times, the cycle, the map\'s own light, and a pinned hour', () => {
    const own = new DayClock('own');
    expect(own.hourAt(5)).toBeNull();
    const clock = new DayClock('dawn');
    expect(clock.hourAt(0)).toBe(HOURS.dawn);
    clock.set('dusk', 10);
    expect(clock.hourAt(10 + TIME_EASE_SECONDS)).toBeCloseTo(HOURS.dusk);
    clock.set('cycle', 20);
    expect(clock.hourAt(20 + CYCLE_SECONDS / 4)).toBeCloseTo((HOURS.dusk + 6) % 24);
    clock.pin(3);
    expect(clock.hourAt(99)).toBe(3);
    clock.set('day', 30, true);
    expect(clock.hourAt(30)).toBe(HOURS.day);
  });
});
