import * as THREE from 'three';
import { BattleView, DESIGN_H } from './BattleView';
import { ART, CHARACTERS, Dust, Figure, loadSet, STAND_H, type Character } from './cast';
import { ATTACK, charge, FOLLOW, LOSE, ROUND2, WIN } from './clips';
import { clipSeconds, sample, type Beat } from './poseClip';

/** Where both test figures stand: their feet, in design units from the screen's middle. */
const FEET = DESIGN_H / 2 - 0.86 * DESIGN_H;

/** The video's frames, from scripts/art/anim.py: Veo's clip from frame 36 to 100. */
const VIDEO_FIRST = 36;
const VIDEO_LAST = 100;
const VIDEO_FPS = 24;
const VIDEO_SECONDS = (VIDEO_LAST - VIDEO_FIRST + 1) / VIDEO_FPS;

/** A test figure: its clip (or the video), where it stands as a share of the screen, and its label. */
interface Actor {
  label: string;
  at: number;
  clip?: readonly Beat[];
  /** Effects at the strike: the hit-stop's shake and the dust. */
  effects?: boolean;
  follow?: number;
  /** Fade out at the end of the loop and back in at its start (for a clip that doesn't end where it began). */
  fade?: boolean;
}

/** The test's scenes, by `?scene=`, for a character: the default sets round 2 beside the attack with motion. */
const SCENES: Record<string, (c: Character) => Actor[]> = {
  motion: () => [
    { label: 'Round 2: poses only', at: -0.2, clip: ROUND2, follow: FOLLOW.round2 },
    { label: 'With motion + effects', at: 0.2, clip: ATTACK, effects: true, follow: FOLLOW.attack },
  ],
  win: () => [{ label: 'Attack, then victory', at: -0.05, clip: WIN, effects: true, follow: FOLLOW.attack }],
  lose: () => [{ label: 'Hit, then defeat', at: -0.05, clip: LOSE, effects: true, fade: true }],
  charge: (c) => [{ label: 'Charge, attack, victory', at: 0.05, clip: charge(c.run), effects: true, follow: FOLLOW.attack, fade: true }],
  video: () => [
    { label: 'Pose images + smears', at: -0.2, clip: ROUND2, follow: FOLLOW.round2 },
    { label: 'Flow video (Veo 3.1)', at: 0.2 },
  ],
};

/**
 * The animation test (`?mode=anim`): Aria's attack on the meadow at her size in battle, in the
 * scene `?scene=` names: `motion` (round 2's poses beside the same attack with motion between
 * the poses), `win` (the attack, then victory), `lose` (a hit, then defeat), `charge` (run in, attack, win) or `video` (round 2: pose images against Flow's
 * video). `?char=` picks who plays it (aria, bram, corin, dela, ilse, edric, a rival: sabine, gorran, petra, ulric, morwen, varek, or a soldier: soldier-<sword|spear|axe|bow|mage|knight>-<m|f>; the video is always Aria's). Everything loops.
 */
export async function animTest(): Promise<void> {
  document.title = 'Animation test · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  const view = new BattleView(document.body);
  const params = new URLSearchParams(location.search);
  const who = CHARACTERS[params.get('char') ?? 'aria'] ?? CHARACTERS.aria;
  const actors = (SCENES[params.get('scene') ?? 'motion'] ?? SCENES.motion)(who);
  const needsVideo = actors.some((a) => !a.clip);
  const [poses, video] = await Promise.all([
    loadSet(view, who.set, who.height),
    needsVideo ? loadSet(view, 'aria-video') : null,
    view.setBackdrop(`${ART}../meadow.jpg`),
  ]);
  const has = (pose: string) => poses.frames.has(pose);

  const figures = actors.map((a) => {
    const figure = new Figure(a.clip ? poses.k : video!.k, a.clip ? who.height : STAND_H);
    const smear = a.clip ? who.effect() : null;
    const dust = a.effects ? new Dust() : null;
    if (smear) {
      figure.body.add(smear.mesh);
      smear.mesh.scale.setScalar(poses.k);
    }
    if (dust) figure.group.add(dust.group);
    view.add(figure.group);
    return { a, figure, smear, dust };
  });

  const hud = document.createElement('div');
  hud.id = 'battle-hud';
  for (const a of actors) {
    const label = document.createElement('div');
    label.className = 'effect';
    label.textContent = a.label;
    label.style.left = `${50 + a.at * 100}%`;
    hud.appendChild(label);
  }
  document.body.appendChild(hud);

  const draw = (seconds: number) => {
    let shake = 0;
    for (const { a, figure, smear, dust } of figures) {
      figure.group.position.set(a.at * view.width - STAND_H * 0.25, FEET, 0);
      if (!a.clip) {
        // The video: its frames in order at 24 a second.
        const n = Math.floor((seconds % VIDEO_SECONDS) * VIDEO_FPS);
        figure.show(video!.frames.get(`f${String(VIDEO_FIRST + n).padStart(3, '0')}`)!);
        continue;
      }
      const s = sample(a.clip, seconds, has);
      // The character's reach stretches every move along the ground (a horse covers more of it).
      figure.show(poses.frames.get(s.pose)!, { ...s.body, x: s.body.x * who.reach });
      // The latest of each cue this loop (a run fires a step at every footfall).
      const cue = (name: string) => s.cues.filter((c) => c.cue === name).pop();
      const [strike, hit, step] = [cue('strike'), cue('hit'), cue('step')];
      smear!.update(strike?.age ?? -1, a.follow ?? 0);
      // Dust from the latest stamp: at the front foot for a strike, under the body for a step or a fall.
      const stamp = [who.ranged ? undefined : strike, step].filter((c) => c).sort((p, q) => p!.age - q!.age)[0];
      if (dust) dust.update(stamp?.age ?? -1, (stamp?.x ?? s.body.x) * who.reach + (stamp === strike ? who.foot : 0));
      // The shake: sharp at the blow, gone in a fifth of a second.
      const blow = (who.ranged ? undefined : strike) ?? hit;
      if (a.effects && blow && blow.age < 0.2) shake = Math.max(shake, 7 * (1 - blow.age / 0.2));
      const loop = clipSeconds(a.clip);
      const t = seconds % loop;
      const alpha = a.fade ? Math.min(1, t / 0.25, (loop - t) / 0.35) : 1;
      figure.tint(hit && hit.age < 0.12 ? 1 - hit.age / 0.12 : 0, alpha);
    }
    view.nudge(shake * Math.sin(seconds * 97), shake * 0.6 * Math.sin(seconds * 131));
    view.render();
  };

  // Checks and captures fix the clock with __anim.at(seconds); otherwise it runs in real time.
  let fixed: number | null = null;
  const clock = new THREE.Clock();
  view.renderer.setAnimationLoop(() => fixed === null && draw(clock.getElapsedTime()));
  const loops = actors.map((a) => (a.clip ? clipSeconds(a.clip) : VIDEO_SECONDS));
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __anim: {
        ready: true,
        /** The longest loop in the scene, and when the first clip strikes. */
        loopSeconds: Math.max(...loops),
        strike: (() => {
          const clip = actors.find((a) => a.clip)!.clip!;
          let t = 0;
          for (const b of clip) {
            if (b.cue === 'strike') return t;
            t += b.seconds;
          }
          return 0;
        })(),
        at: (seconds: number) => draw((fixed = seconds)),
      },
    });
  }
}
