/** A time the picker offers: four fixed times of day, or the full cycle running. */
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export const TIMES: readonly TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
export const TIME_NAMES: Record<TimeOfDay | 'cycle', string> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night', cycle: 'Day-night cycle' };
/** The hour each fixed time shows. */
export const HOURS: Record<TimeOfDay, number> = { dawn: 6.5, day: 12.5, dusk: 18.4, night: 23.5 };
/** How long a full day takes when the cycle runs, in seconds. */
export const CYCLE_SECONDS = 120;
/** How long a jump to another time takes, running forward through the hours between. */
export const TIME_EASE_SECONDS = 3;

/** How the light looks at an hour, as multipliers and tints on the theme's own light. */
export interface DayLook {
  hour: number;
  /** Unit vector toward the light: the sun by day, the moon by night. */
  lightDir: [number, number, number];
  /** Strength of the sun (or moon) and the sky light, and their colours. */
  sun: number;
  sky: number;
  sunColor: [number, number, number];
  skyTint: [number, number, number];
  /** Tint over the painted scenery. */
  backdrop: [number, number, number];
  /** 0 by day, 1 at full night: windows light, stars and fireflies come out. */
  night: number;
  /** How strongly the light casts shadows (0-1). */
  shadow: number;
}

/** Keyframes of the day, each [hour, sun, sky, sunColor, skyTint, backdrop, night, shadow]. */
type Key = [number, number, number, [number, number, number], [number, number, number], [number, number, number], number, number];
const KEYS: Key[] = [
  [0, 0.22, 0.36, [0.55, 0.65, 1.0], [0.45, 0.55, 0.9], [0.22, 0.26, 0.45], 1, 0.35],
  [4.8, 0.22, 0.36, [0.55, 0.65, 1.0], [0.45, 0.55, 0.9], [0.22, 0.26, 0.45], 1, 0.35],
  // Dawn: pink-gold sun, lavender sky.
  [6.5, 0.75, 0.82, [1.0, 0.74, 0.62], [0.9, 0.82, 0.98], [0.95, 0.78, 0.86], 0.15, 1],
  [9, 0.95, 0.95, [1.0, 0.94, 0.86], [0.98, 0.97, 1.0], [0.98, 0.96, 0.95], 0, 1],
  [12.5, 1, 1, [1, 1, 1], [1, 1, 1], [1, 1, 1], 0, 1],
  [16, 0.95, 0.95, [1.0, 0.92, 0.8], [1.0, 0.95, 0.92], [1.0, 0.95, 0.9], 0, 1],
  // Dusk: deep orange sun, warm amber sky.
  [18.4, 0.8, 0.74, [1.0, 0.52, 0.25], [1.0, 0.72, 0.58], [1.0, 0.62, 0.42], 0.25, 1],
  [19.8, 0.22, 0.4, [0.55, 0.65, 1.0], [0.55, 0.55, 0.85], [0.36, 0.32, 0.5], 0.9, 0.35],
  // Full night from ten until the small hours.
  [22, 0.22, 0.36, [0.55, 0.65, 1.0], [0.45, 0.55, 0.9], [0.22, 0.26, 0.45], 1, 0.35],
  [24, 0.22, 0.36, [0.55, 0.65, 1.0], [0.45, 0.55, 0.9], [0.22, 0.26, 0.45], 1, 0.35],
];

/** Sunrise and sunset; between them the sun lights the board, otherwise the moon. */
export const SUNRISE = 5.6;
export const SUNSET = 19.2;
/** Highest the sun climbs (noon) and where the moon hangs, above the horizon in degrees. */
const SUN_PEAK = 62;
const MOON_HEIGHT = 40;
/**
 * The sun rises on the right of the opening view and sets on the left, so morning and
 * evening shadows stretch sideways across the board where they can be seen; at noon it
 * stands high and a little to the left, so short shadows fall to the right of walls and
 * cliffs instead of hiding behind them.
 */
const EAST: [number, number] = [0.8, -0.6];
const SOUTH: [number, number] = [-0.6, 0.8];

const wrap = (hour: number) => ((hour % 24) + 24) % 24;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => lerp(v, b[i], t)) as [number, number, number];

/** Where the light comes from at an hour: the sun between sunrise and sunset, the moon otherwise. */
export function lightDirection(hour: number): { dir: [number, number, number]; sunUp: boolean } {
  const h = wrap(hour);
  const sunUp = h > SUNRISE && h < SUNSET;
  // 0 at sunrise, 1 at sunset (the sun), or across the night (the moon).
  const t = sunUp ? (h - SUNRISE) / (SUNSET - SUNRISE) : wrap(h - SUNSET) / (24 - (SUNSET - SUNRISE));
  const along = Math.cos(Math.PI * t); // +1 east, -1 west
  const height = Math.sin(Math.PI * t);
  const elevation = ((sunUp ? SUN_PEAK : MOON_HEIGHT) * Math.PI) / 180 * Math.max(0.12, height);
  // Across the sky from east to west, leaning toward the front as it climbs.
  const x = along * EAST[0] + 0.6 * height * SOUTH[0];
  const z = along * EAST[1] + 0.6 * height * SOUTH[1];
  const ground = Math.cos(elevation) / (Math.hypot(x, z) || 1);
  return { dir: [x * ground, Math.sin(elevation), z * ground], sunUp };
}

/** The light at an hour, blended between the keyframes either side of it. */
export function dayAt(hour: number): DayLook {
  const h = wrap(hour);
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1][0] <= h) k++;
  const [a, b] = [KEYS[k], KEYS[k + 1]];
  const t = (h - a[0]) / (b[0] - a[0]);
  return {
    hour: h,
    lightDir: lightDirection(h).dir,
    sun: lerp(a[1], b[1], t),
    sky: lerp(a[2], b[2], t),
    sunColor: lerp3(a[3], b[3], t),
    skyTint: lerp3(a[4], b[4], t),
    backdrop: lerp3(a[5], b[5], t),
    night: lerp(a[6], b[6], t),
    shadow: lerp(a[7], b[7], t),
  };
}

/**
 * The hour on screen `since` seconds after a change from `from` to `to`: it runs forward
 * through the hours between (day to night passes through dusk), eased in and out.
 */
export function easeHour(from: number, to: number, since: number): number {
  const span = wrap(to - from);
  const t = Math.min(1, Math.max(0, since / TIME_EASE_SECONDS));
  return wrap(from + span * t * t * (3 - 2 * t));
}

/** What the time picker can choose: a fixed time, the running cycle, or the map's own light. */
export type TimeChoice = TimeOfDay | 'cycle' | 'own';

/**
 * Keeps the hour on screen: none for a map keeping its own light; a fixed time eased to
 * from wherever the clock was; or the cycle, running on from the current hour. An hour can
 * also be pinned for captures.
 */
export class DayClock {
  private choice: TimeChoice;
  private fromHour: number;
  private changedAt = 0;
  private pinned: number | null = null;
  private last: number | null;

  constructor(choice: TimeChoice) {
    this.choice = choice;
    this.fromHour = choice === 'own' || choice === 'cycle' ? HOURS.day : HOURS[choice];
    this.last = choice === 'own' ? null : this.fromHour;
  }

  get current(): TimeChoice {
    return this.choice;
  }

  /** Switches the time, easing forward from the hour on screen (or jumping, if `instant`). */
  set(choice: TimeChoice, now: number, instant = false): void {
    const from = this.last ?? HOURS.day;
    this.choice = choice;
    this.changedAt = now;
    this.pinned = null;
    this.fromHour = instant && choice !== 'own' && choice !== 'cycle' ? HOURS[choice] : from;
  }

  /** Holds the clock at one hour (for screenshots), or lets it go with null. */
  pin(hour: number | null): void {
    this.pinned = hour;
  }

  /** The hour at `now`, or null when the map keeps its own light. */
  hourAt(now: number): number | null {
    let hour: number | null;
    if (this.pinned !== null) hour = this.pinned;
    else if (this.choice === 'own') hour = null;
    else if (this.choice === 'cycle') hour = (this.fromHour + ((now - this.changedAt) * 24) / CYCLE_SECONDS) % 24;
    else hour = easeHour(this.fromHour, HOURS[this.choice], now - this.changedAt);
    this.last = hour;
    return hour;
  }
}
