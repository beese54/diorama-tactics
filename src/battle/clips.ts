import type { Beat } from './poseClip';

/**
 * The battle's clips as plain data: the run cycles, the attack, the win and the defeat. No three.js,
 * so the battle script can time itself from them.
 */

/** A run cycle: its poses in turn, seconds per pose, how high the body rides in each, and which poses land a foot (dust). */
export interface RunCycle {
  poses: string[];
  stride: number;
  bob: number[];
  steps: number[];
}
export const ON_FOOT: RunCycle = { poses: ['run', 'run-2'], stride: 0.1, bob: [10, 0], steps: [1] };
/** A horse's gallop: four poses, riding high in the gathered one, the hooves landing in the last two. */
export const GALLOP: RunCycle = { poses: ['gallop-1', 'gallop-2', 'gallop-3', 'gallop-4'], stride: 0.085, bob: [4, 16, 6, 0], steps: [2, 3] };

/** Round 2's attack: the pose images held in turn, each lunge a jump. Its holds are timed to
 * strike and loop with ATTACK, so the two play side by side in step. */
export const ROUND2: Beat[] = [
  { pose: 'stance', seconds: 0.69, body: { x: 0 }, snap: true },
  { pose: 'wind-up', seconds: 0.3, body: { x: -8 }, snap: true },
  { pose: 'slash', seconds: 0.07, body: { x: 30 }, snap: true, cue: 'strike' },
  { pose: 'follow', seconds: 0.45, body: { x: 40 }, snap: true },
  { pose: 'stance', seconds: 0.53, body: { x: 0 } },
];

/**
 * The attack with motion between the poses: breathing in the stance, a dip to gather strength,
 * the body easing back into the wind-up, the snap into the slash (stretched and leaning in), a
 * hit-stop, the follow-through settling, the recovery and the step back. Poses not drawn yet
 * fall back to their neighbours.
 */
export const ATTACK: Beat[] = [
  { pose: 'stance', seconds: 0.55, body: { x: 0, y: 0, squash: 1, lean: 0 }, breathe: true },
  // The ready pose is a crouch of its own, so the body only shifts back here.
  { pose: ['ready', 'stance'], seconds: 0.22, body: { x: -12, squash: 1, lean: -0.02 } },
  { pose: 'wind-up', seconds: 0.24, body: { x: -18, squash: 1, lean: -0.05 } },
  { pose: 'slash', seconds: 0.05, body: { x: 38, squash: 1.03, lean: 0.06 }, snap: true, cue: 'strike' },
  // Hit-stop: the blow lands and everything holds for a moment.
  { pose: 'slash', seconds: 0.08 },
  { pose: 'follow', seconds: 0.34, body: { x: 46, squash: 0.98, lean: 0.03 } },
  { pose: ['recover', 'follow'], seconds: 0.18, body: { x: 30, squash: 1, lean: 0 } },
  { pose: 'stance', seconds: 0.4, body: { x: 0 } },
];
/** When the smear runs on into the follow-through, seconds after the strike. */
export const FOLLOW = { round2: 0.07, attack: 0.13 };

/** The win: a small hop into the victory pose, held breathing. */
export const VICTORY: Beat[] = [
  { pose: 'victory', seconds: 0.12, body: { y: 16, squash: 1.03 } },
  { pose: 'victory', seconds: 0.14, body: { y: 0, squash: 0.97 } },
  { pose: 'victory', seconds: 1.5, body: { squash: 1 }, breathe: true },
];
/** The attack, then the win. */
export const WIN: Beat[] = [...ATTACK, ...VICTORY, { pose: 'stance', seconds: 0.35 }];

/** How many run poses the charge plays, and how far back it starts (design units, before the character's reach). */
export const STRIDES = 8;
export const RUN_FROM = -640;
/**
 * The charge: the character runs in from the left on its run cycle at a steady speed, the body
 * bobbing, with dust at each footfall; it skids into its stance, attacks and wins. The loop fades
 * it out and back in at the start of the run.
 */
export const charge = (run: RunCycle): Beat[] => [
  { pose: run.poses[0], seconds: 0.01, body: { x: RUN_FROM, y: 0, squash: 1, lean: 0.05 }, snap: true },
  ...Array.from({ length: STRIDES }, (_, i): Beat => {
    const n = i % run.poses.length;
    return {
      pose: run.poses[n],
      seconds: run.stride,
      linear: true,
      body: { x: RUN_FROM * (1 - (i + 1) / STRIDES), y: run.bob[n] },
      ...(run.steps.includes(n) ? { cue: 'step' as const } : {}),
    };
  }),
  { pose: 'stance', seconds: 0.2, body: { x: 0, y: 0, squash: 0.96, lean: -0.03 }, cue: 'step' },
  { pose: 'stance', seconds: 0.3, body: { squash: 1, lean: 0 }, breathe: true },
  ...ATTACK.slice(1),
  ...VICTORY,
];

/**
 * Defeat: a blow lands (a white flash, the shake, a hit-stop), she staggers back in the hurt
 * pose, drops into the fallen pose with dust, and stays down. The loop fades her out and in.
 */
export const LOSE: Beat[] = [
  { pose: 'stance', seconds: 0.6, body: { x: 0, y: 0, squash: 1, lean: 0 }, breathe: true },
  { pose: 'hurt', seconds: 0.05, body: { x: -30, squash: 0.97, lean: -0.08 }, snap: true, cue: 'hit' },
  { pose: 'hurt', seconds: 0.08 },
  { pose: 'hurt', seconds: 0.38, body: { x: -52, squash: 1, lean: -0.04 } },
  { pose: 'fallen', seconds: 0.06, body: { x: -60, squash: 0.94, lean: 0 }, snap: true, cue: 'step' },
  { pose: 'fallen', seconds: 0.16, body: { squash: 1 } },
  { pose: 'fallen', seconds: 1.5 },
];

/** The attack as a fighter plays it in battle: straight from the ready pose, no breath held first. */
export const SWING: Beat[] = ATTACK.slice(1);
/** A blow lands but doesn't fell: the stagger back in the hurt pose, then a step back into the stance. */
export const HURT: Beat[] = [...LOSE.slice(1, 4), { pose: 'stance', seconds: 0.3, body: { x: 0, squash: 1, lean: 0 } }];
/** A blow fells: the stagger, the drop with dust, and down for good (the last beat holds). */
export const FALL: Beat[] = LOSE.slice(1);
/** A blow turned aside: a quick lean back, then the stance again. */
export const BLOCK: Beat[] = [
  { pose: 'stance', seconds: 0.08, body: { x: -14, lean: -0.05 } },
  { pose: 'stance', seconds: 0.22, body: { x: 0, lean: 0 } },
];
