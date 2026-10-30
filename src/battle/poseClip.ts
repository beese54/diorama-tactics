/**
 * Pose clips: a battle animation as a list of beats. Each beat shows one pose image for a
 * while, and moves the body (forward, up, squash, lean) from where the last beat left it to its
 * own key, eased, or at once for a snap. A beat can fire a cue as it starts (the strike, a
 * step), which the scene answers with effects: the smear, a hit-stop, a shake, dust.
 * Plain data and arithmetic, so the timing can be tested without a renderer.
 */

/** Where the body is: forward and up in design units, squash (below 1 squashes, above stretches), lean in radians (forward is positive). */
export interface Body {
  x: number;
  y: number;
  squash: number;
  lean: number;
}

/** strike: the blade lands (smear, hit-stop, shake, dust); hit: a blow lands on this fighter (flash, shake); step: a foot or a body meets the ground (dust). */
export type Cue = 'strike' | 'hit' | 'step';

export interface Beat {
  /** The pose to show; with a list, the first one the set has (a pose not drawn yet falls back). */
  pose: string | readonly string[];
  seconds: number;
  /** The body's place when the beat ends. Parts left out stay where they were. */
  body?: Partial<Body>;
  /** Jump to `body` at once instead of easing there. */
  snap?: boolean;
  /** Move to `body` at a steady speed (a run's stride) instead of easing in and out. */
  linear?: boolean;
  cue?: Cue;
  /** Breathe while the beat holds: a slow rise and fall, for poses held still. */
  breathe?: boolean;
}

export const REST: Body = { x: 0, y: 0, squash: 1, lean: 0 };

export interface Sample {
  pose: string;
  body: Body;
  /** Cues fired so far this loop: how long ago, and where the body stood then (x; for a snap, where it landed). */
  cues: { cue: Cue; age: number; x: number }[];
}

export const clipSeconds = (clip: readonly Beat[]): number => clip.reduce((s, b) => s + b.seconds, 0);

/** Slow at both ends: holds settle into place rather than stopping dead. */
const smooth = (k: number) => k * k * (3 - 2 * k);

/** The body's breath: about 1% up and down over 1.6 s. */
export const breath = (seconds: number): number => 1 + 0.008 * Math.sin((seconds * 2 * Math.PI) / 1.6);

/** The pose and body at `seconds` into a looping clip; `has` says which poses the set has. */
export function sample(clip: readonly Beat[], seconds: number, has: (pose: string) => boolean = () => true): Sample {
  const t = ((seconds % clipSeconds(clip)) + clipSeconds(clip)) % clipSeconds(clip);
  let start = 0;
  let from: Body = { ...REST };
  // A loop starts where it ends: the last beat's key is where the body comes from.
  for (const b of clip) from = { ...from, ...b.body };
  const cues: Sample['cues'] = [];
  for (const beat of clip) {
    const to: Body = { ...from, ...beat.body };
    if (beat.cue) cues.push({ cue: beat.cue, age: t - start, x: beat.snap ? to.x : from.x });
    if (t < start + beat.seconds) {
      const k = beat.snap ? 1 : beat.linear ? (t - start) / beat.seconds : smooth((t - start) / beat.seconds);
      const body = {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        squash: (from.squash + (to.squash - from.squash) * k) * (beat.breathe ? breath(seconds) : 1),
        lean: from.lean + (to.lean - from.lean) * k,
      };
      const names = typeof beat.pose === 'string' ? [beat.pose] : beat.pose;
      return { pose: names.find(has) ?? names[names.length - 1], body, cues };
    }
    start += beat.seconds;
    from = to;
  }
  throw new Error('unreachable: t is inside the clip');
}

/** Seconds into a clip when the beat with `cue` starts (the blow lands as it does). */
export function cueAt(clip: readonly Beat[], cue: Cue): number {
  let t = 0;
  for (const beat of clip) {
    if (beat.cue === cue) return t;
    t += beat.seconds;
  }
  throw new Error(`no ${cue} cue in the clip`);
}
