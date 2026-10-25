import { describe, expect, it } from 'vitest';
import { generateMap } from '../map/generator';
import { blendLooks, ease, lightningAt, LOOKS, loopSpeed, WEATHER_KINDS, WEATHER_LOOP, weatherForMap } from './weather';

const maps = Array.from({ length: 50 }, (_, i) => generateMap(i + 1));

describe('weather', () => {
  it('looks like itself: clear is still, rain wets, storms blow and flash, snow settles, fog lies low', () => {
    expect(LOOKS.clear).toMatchObject({ rain: 0, snow: 0, mist: 0, wet: 0, snowCover: 0, lightning: 0, wind: 1 });
    expect(LOOKS.storm.rain).toBeGreaterThan(LOOKS.rain.rain);
    // Rain stays light enough to see the board through (round 1: "it hinders the view").
    expect(LOOKS.storm.rain).toBeLessThanOrEqual(0.6);
    expect(LOOKS.storm.wind).toBeGreaterThan(LOOKS.rain.wind);
    expect(LOOKS.storm.sky).toBeLessThan(LOOKS.rain.sky);
    expect(LOOKS.rain.wet).toBeGreaterThan(0.5);
    expect(LOOKS.storm.lightning).toBe(1);
    expect(LOOKS.snow.snowCover).toBeGreaterThan(0.5);
    expect(LOOKS.snow.wet).toBe(0);
    expect(LOOKS.fog.mist).toBe(1);
    // Only fog lies as mist: a light mist under rain read as a dot grid.
    for (const kind of WEATHER_KINDS) if (kind !== 'fog') expect(LOOKS[kind].mist).toBe(0);
  });

  it('blends from one weather to another', () => {
    expect(blendLooks(LOOKS.clear, LOOKS.storm, 0)).toEqual(LOOKS.clear);
    expect(blendLooks(LOOKS.clear, LOOKS.storm, 1)).toEqual(LOOKS.storm);
    const half = blendLooks(LOOKS.clear, LOOKS.storm, 0.5);
    expect(half.rain).toBeCloseTo(LOOKS.storm.rain / 2);
    expect(half.tint[0]).toBeCloseTo((1 + LOOKS.storm.tint[0]) / 2);
  });

  it('eases in smoothly and settles', () => {
    expect(ease(0, 2)).toBe(0);
    expect(ease(1, 2)).toBeCloseTo(0.5);
    expect(ease(2, 2)).toBe(1);
    expect(ease(9, 2)).toBe(1);
    for (let t = 0; t < 2; t += 0.1) expect(ease(t + 0.1, 2)).toBeGreaterThanOrEqual(ease(t, 2));
  });

  it('flashes lightning briefly, once a loop, and repeats exactly', () => {
    let lit = 0;
    for (let t = 0; t < WEATHER_LOOP; t += 0.01) {
      expect(lightningAt(t + WEATHER_LOOP)).toBe(lightningAt(t));
      if (lightningAt(t) > 0) lit++;
    }
    expect(lit).toBeGreaterThan(0);
    expect(lit / (WEATHER_LOOP / 0.01)).toBeLessThan(0.05);
  });

  it('falls a whole number of times per loop, so rain and snow loop seamlessly', () => {
    for (const [wanted, height] of [[14, 11.5], [1.6, 5.5], [3, 7]]) {
      const speed = loopSpeed(wanted, height);
      const laps = (speed * WEATHER_LOOP) / height;
      expect(laps).toBeCloseTo(Math.round(laps));
      expect(Math.abs(speed - wanted) / wanted).toBeLessThan(0.5);
    }
  });

  it('gives Wild Lands weather that suits them: mostly clear, snow only where there is snow', () => {
    const kinds = maps.map(weatherForMap);
    expect(maps.map(weatherForMap)).toEqual(kinds);
    expect(new Set(kinds)).toEqual(new Set(WEATHER_KINDS));
    expect(kinds.filter((k) => k === 'clear').length).toBeGreaterThanOrEqual(20);
    maps.forEach((map, i) => {
      if (kinds[i] === 'snow') expect(map.tiles.some((t) => t.terrain === 'snowfield' || t.terrain === 'peak_snow')).toBe(true);
    });
  });
});
