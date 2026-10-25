import { mulberry32 } from '../util/rng';
import type { MapFile } from '../map/types';

/** The weather over a map. */
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow' | 'fog';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'rain', 'storm', 'snow', 'fog'];
export const WEATHER_NAMES: Record<WeatherKind, string> = { clear: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog' };

/** Every weather effect's loop divides this, so recorded clips loop seamlessly (as the water and wind do). */
export const WEATHER_LOOP = 4;

/** How a weather looks, as amounts (0-1 unless noted) that blend smoothly from one weather to the next. */
export interface WeatherLook {
  /** Share of the rain drops falling, and of the snowflakes. */
  rain: number;
  snow: number;
  /** How thick the low mist lies, and how much the distance fades into haze. */
  mist: number;
  haze: number;
  /** Wind strength: 1 is a fair-weather breeze (multiplies how far plants and banners lean). */
  wind: number;
  /** How wet the ground looks, and how much snow has settled on it. */
  wet: number;
  snowCover: number;
  /** Lightning flashes (storms). */
  lightning: number;
  /** Multipliers on the sky light and the sun, and an [r, g, b] tint on both and on the scenery. */
  sky: number;
  sun: number;
  tint: [number, number, number];
}

export const LOOKS: Record<WeatherKind, WeatherLook> = {
  clear: { rain: 0, snow: 0, mist: 0, haze: 0, wind: 1, wet: 0, snowCover: 0, lightning: 0, sky: 1, sun: 1, tint: [1, 1, 1] },
  rain: { rain: 0.55, snow: 0, mist: 0, haze: 0.2, wind: 1.6, wet: 0.8, snowCover: 0, lightning: 0, sky: 0.8, sun: 0.35, tint: [0.78, 0.84, 0.95] },
  storm: { rain: 1, snow: 0, mist: 0, haze: 0.35, wind: 3, wet: 1, snowCover: 0, lightning: 1, sky: 0.62, sun: 0.15, tint: [0.62, 0.68, 0.82] },
  snow: { rain: 0, snow: 0.8, mist: 0, haze: 0.3, wind: 0.8, wet: 0, snowCover: 0.85, lightning: 0, sky: 1.05, sun: 0.55, tint: [0.92, 0.96, 1.05] },
  fog: { rain: 0, snow: 0, mist: 1, haze: 0.6, wind: 0.4, wet: 0.3, snowCover: 0, lightning: 0, sky: 0.95, sun: 0.4, tint: [0.9, 0.93, 0.96] },
};

/** Exactly `a` at t <= 0 and `b` at t >= 1, so a finished change lands on the weather itself. */
const mix = (a: number, b: number, t: number) => (t <= 0 ? a : t >= 1 ? b : a + (b - a) * t);

/** A look partway (t = 0-1) from one weather to another. */
export function blendLooks(a: WeatherLook, b: WeatherLook, t: number): WeatherLook {
  const out = {} as WeatherLook;
  for (const key of Object.keys(a) as (keyof WeatherLook)[]) {
    const [x, y] = [a[key], b[key]];
    (out as unknown as Record<string, unknown>)[key] = Array.isArray(x) ? x.map((v, i) => mix(v, (y as number[])[i], t)) : mix(x as number, y as number, t);
  }
  return out;
}

/** How long a change of weather takes to settle, in seconds; snow takes longer to settle on the ground. */
export const EASE_SECONDS = 2.5;
export const SNOW_SETTLE_SECONDS = 8;

/** Smoothstep from 0 to 1 over `seconds`. */
export function ease(elapsed: number, seconds: number): number {
  const t = Math.min(1, Math.max(0, elapsed / seconds));
  return t * t * (3 - 2 * t);
}

/**
 * Brightness of a storm's lightning at time `t` (0-1): a bright double flash once every
 * WEATHER_LOOP seconds, dark the rest of the time.
 */
export function lightningAt(t: number): number {
  const p = ((t % WEATHER_LOOP) + WEATHER_LOOP) % WEATHER_LOOP;
  if (p >= 1.1 && p < 1.18) return 1;
  if (p >= 1.3 && p < 1.36) return 0.6;
  return 0;
}

/**
 * The weather a generated map gets from its seed, to suit it: snow is likely where the
 * map has snowfields or peaks (and only there), rain and storms where the land is wet,
 * fog now and then; clear skies most often.
 */
export function weatherForMap(map: MapFile): WeatherKind {
  const rand = mulberry32(map.seed ^ 0x3ea7);
  const roll = rand();
  const snowy = map.tiles.some((t) => t.terrain === 'snowfield' || t.terrain === 'peak_snow');
  const land = map.tiles.filter((t) => !t.water);
  const moisture = land.reduce((sum, t) => sum + t.moisture, 0) / Math.max(1, land.length);
  if (snowy && roll < 0.35) return 'snow';
  if (moisture > 0.55 && roll < 0.3) return roll < 0.1 ? 'storm' : 'rain';
  if (roll < 0.15) return 'fog';
  if (roll < 0.27) return 'rain';
  if (roll < 0.3) return 'storm';
  return 'clear';
}

/**
 * A fall speed near `wanted` (units per second) that drops through `height` a whole number
 * of times per WEATHER_LOOP, so the rain or snow loops seamlessly.
 */
export function loopSpeed(wanted: number, height: number): number {
  return (Math.max(1, Math.round((wanted * WEATHER_LOOP) / height)) * height) / WEATHER_LOOP;
}
