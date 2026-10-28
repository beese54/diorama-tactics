import * as THREE from 'three';
import { BattleView, DESIGN_H, HEAD_SCALE, SOLDIER_H, shadowTexture } from './BattleView';
import { clipSeconds, sample, type Beat, type Sample } from './poseClip';

/** Where the processed battle art is served from (public/battle). */
const ART = `${import.meta.env.BASE_URL}battle/anim/`;
/** A leader's standing height in design units, as in the style frame (front rank, scale 1.06). */
const STAND_H = SOLDIER_H * 1.06 * HEAD_SCALE;
/** Where both test figures stand: their feet, in design units from the screen's middle. */
const FEET = DESIGN_H / 2 - 0.86 * DESIGN_H;

/** One frame of a set from scripts/art/anim.py: its picture's size and where the anchor sits on it. */
interface FrameInfo {
  file: string;
  w: number;
  h: number;
  /** The anchor in the picture's pixels: the torso's middle (x) on the feet line (y, from the top). */
  ax: number;
  ay: number;
}
interface FrameSet {
  /** The standing figure's height in this set's pixels. */
  stand: number;
  frames: FrameInfo[];
}
interface Frame extends FrameInfo {
  tex: THREE.Texture;
}

async function loadSet(view: BattleView, name: string): Promise<{ k: number; frames: Map<string, Frame> }> {
  const set = (await (await fetch(`${ART}${name}/frames.json`)).json()) as FrameSet;
  const frames = await Promise.all(set.frames.map(async (f) => ({ ...f, tex: await view.texture(`${ART}${name}/${f.file}`) })));
  return { k: STAND_H / set.stand, frames: new Map(frames.map((f) => [f.file.replace(/\.\w+$/, ''), f])) };
}

/** A soft round puff for dust, pale and earthy. */
function dustTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(226, 212, 178, 0.9)');
  g.addColorStop(0.6, 'rgba(206, 190, 152, 0.45)');
  g.addColorStop(1, 'rgba(206, 190, 152, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A fighter whose picture changes from frame to frame. The group stands on the ground with its
 * shadow; the body inside it carries the picture (and the smear), and leans and squashes about
 * the feet.
 */
class Figure {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(readonly k: number) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    this.mesh.renderOrder = 2;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthTest: false }),
    );
    shadow.scale.set(STAND_H * 0.85, STAND_H * 0.12, 1);
    shadow.position.set(-STAND_H * 0.05, -STAND_H * 0.012, 0);
    shadow.renderOrder = 1;
    this.body.add(this.mesh);
    this.group.add(shadow, this.body);
  }

  /** Shows `frame` with its anchor on the body's origin, the body placed as `s` says. */
  show(frame: Frame, s: Sample['body'] = { x: 0, y: 0, squash: 1, lean: 0 }): void {
    const { k } = this;
    this.mesh.material.map = frame.tex;
    this.mesh.material.needsUpdate = true;
    this.mesh.scale.set(frame.w * k, frame.h * k, 1);
    this.mesh.position.set(-frame.ax * k, -(frame.h - frame.ay) * k, 0);
    this.body.position.set(s.x, s.y, 0);
    // Squash keeps the volume: shorter is wider. A forward lean tips the top to the right.
    this.body.scale.set(1 / Math.sqrt(s.squash), s.squash, 1);
    this.body.rotation.z = -s.lean;
  }
}

/**
 * A sword smear, drawn in code: a crescent swept around a pivot from the blade's old place to
 * its new one, thick and bright at the blade, thin and fading at the tail. Angles are radians
 * (counter-clockwise from the right), lengths in the figure's pose pixels.
 */
class Smear {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly u = {
    uPivot: { value: new THREE.Vector2() },
    uA0: { value: 0 }, uA1: { value: 0 }, uR0: { value: 0 }, uR1: { value: 0 },
    uWidth: { value: 0 }, uTail: { value: 0 }, uFade: { value: 0 },
  };

  constructor() {
    const SEG = 64;
    const t: number[] = [];
    const edge: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      t.push(i / SEG, i / SEG);
      edge.push(0, 1);
      if (i < SEG) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const geometry = new THREE.BufferGeometry();
    // three wants a position attribute to size the draw; the shader computes the real one.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(t.length * 3).fill(0), 3));
    geometry.setAttribute('t', new THREE.Float32BufferAttribute(t, 1));
    geometry.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthTest: false,
      // The swing runs clockwise, which turns the strip's triangles away from the camera.
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float t;
        attribute float edge;
        uniform vec2 uPivot;
        uniform float uA0, uA1, uR0, uR1, uWidth;
        varying float vT;
        varying float vEdge;
        void main() {
          float a = mix(uA0, uA1, t);
          float r = mix(uR0, uR1, t) * 1.03 - uWidth * pow(t, 0.7) * (1.0 - edge);
          vec2 p = uPivot + r * vec2(cos(a), sin(a));
          vT = t;
          vEdge = edge;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTail, uFade;
        varying float vT;
        varying float vEdge;
        void main() {
          // A crisp crescent: solid white along the blade's path, pale blue toward the inside.
          float body = smoothstep(0.0, 0.08, vEdge) * mix(0.6, 0.97, vEdge);
          float alpha = smoothstep(uTail, uTail + 0.15, vT) * body * uFade;
          vec3 colour = mix(vec3(0.62, 0.84, 1.0), vec3(1.0), smoothstep(0.45, 0.85, vEdge));
          gl_FragColor = vec4(colour, alpha);
        }`,
    }));
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
  }

  /**
   * Draws the smear `age` seconds after the strike: out at once from the wind-up's blade to the
   * slash's, held still until `follow` (through any hit-stop), then its head runs on to the
   * follow-through's blade while the tail catches up and the whole fades.
   */
  update(age: number, follow: number): void {
    const after = age - follow;
    this.mesh.visible = age >= 0 && after < 0.32;
    if (!this.mesh.visible) return;
    const run = Math.min(1, Math.max(0, after / 0.08));
    const u = this.u;
    u.uPivot.value.copy(SWING.pivot);
    u.uA0.value = SWING_POLAR.windUp.a;
    u.uR0.value = SWING_POLAR.windUp.r;
    u.uA1.value = THREE.MathUtils.lerp(SWING_POLAR.slash.a, SWING_POLAR.follow.a, run);
    u.uR1.value = THREE.MathUtils.lerp(SWING_POLAR.slash.r, SWING_POLAR.follow.r, run);
    u.uWidth.value = 170;
    u.uTail.value = Math.min(1, Math.max(0, after + 0.07) / 0.3);
    u.uFade.value = 1 - smooth(Math.min(1, Math.max(0, (after - 0.05) / 0.22)));
  }
}

/** The swing in pose pixels (y up, from the anchor): the pivot by the shoulders and the blade tip
 * in the wind-up, slash and follow-through, measured on the keyed poses. */
const SWING = {
  pivot: new THREE.Vector2(120, 560),
  windUp: new THREE.Vector2(-164, 792),
  slash: new THREE.Vector2(501, 185),
  follow: new THREE.Vector2(440, 4),
};
const polar = (tip: THREE.Vector2) => {
  const d = tip.clone().sub(SWING.pivot);
  return { a: Math.atan2(d.y, d.x), r: d.length() };
};
const SWING_POLAR = { windUp: polar(SWING.windUp), slash: polar(SWING.slash), follow: polar(SWING.follow) };

/** Where the front foot lands, ahead of the anchor, in design units (for the dust). */
const FRONT_FOOT = 85;

/** Dust kicked up by a stamp: a few puffs spreading low along the ground and fading. */
class Dust {
  readonly group = new THREE.Group();
  private readonly puffs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor() {
    const tex = dustTexture();
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
      m.renderOrder = 4;
      this.puffs.push(m);
      this.group.add(m);
    }
  }

  /** The puffs `age` seconds after a stamp at `x` on the ground. */
  update(age: number, x: number): void {
    const life = 0.55;
    for (const [i, m] of this.puffs.entries()) {
      m.visible = age >= 0 && age < life;
      if (!m.visible) continue;
      const k = age / life;
      // Fixed spreads per puff, mostly forward and back along the ground, a little up.
      const dir = ((i * 0.618) % 1) * 2 - 1;
      const spread = 70 + 40 * ((i * 0.37) % 1);
      const size = 26 + 54 * Math.sqrt(k) * (0.7 + 0.3 * ((i * 0.53) % 1));
      m.position.set(x + dir * spread * Math.sqrt(k), 6 + 26 * Math.sqrt(k) * ((i * 0.29) % 1), 0);
      m.scale.set(size * 1.4, size, 1);
      m.material.opacity = 0.8 * (1 - k) * (1 - k);
    }
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Round 2's attack: the pose images held in turn, each lunge a jump. Its holds are timed to
 * strike and loop with ATTACK, so the two play side by side in step. */
const ROUND2: Beat[] = [
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
const ATTACK: Beat[] = [
  { pose: 'stance', seconds: 0.55, body: { x: 0, y: 0, squash: 1, lean: 0 }, breathe: true },
  { pose: ['ready', 'stance'], seconds: 0.2, body: { x: -12, squash: 0.965, lean: -0.03 } },
  { pose: 'wind-up', seconds: 0.24, body: { x: -18, squash: 1, lean: -0.05 } },
  { pose: 'slash', seconds: 0.05, body: { x: 38, squash: 1.03, lean: 0.06 }, snap: true, cue: 'strike' },
  // Hit-stop: the blow lands and everything holds for a moment.
  { pose: 'slash', seconds: 0.08 },
  { pose: 'follow', seconds: 0.34, body: { x: 46, squash: 0.98, lean: 0.03 } },
  { pose: ['recover', 'follow'], seconds: 0.18, body: { x: 30, squash: 1, lean: 0 } },
  { pose: 'stance', seconds: 0.4, body: { x: 0 } },
];
/** When the smear runs on into the follow-through, seconds after the strike. */
const FOLLOW = { round2: 0.07, attack: 0.13 };

/** The attack, then the win: a small hop into the victory pose, held breathing. */
const WIN: Beat[] = [
  ...ATTACK,
  { pose: 'victory', seconds: 0.12, body: { y: 16, squash: 1.03 } },
  { pose: 'victory', seconds: 0.14, body: { y: 0, squash: 0.97 } },
  { pose: 'victory', seconds: 1.5, body: { squash: 1 }, breathe: true },
  { pose: 'stance', seconds: 0.35 },
];

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
}

/** The test's scenes, by `?scene=`: the default sets round 2 beside the attack with motion. */
const SCENES: Record<string, Actor[]> = {
  motion: [
    { label: 'Round 2: poses only', at: -0.2, clip: ROUND2, follow: FOLLOW.round2 },
    { label: 'With motion + effects', at: 0.2, clip: ATTACK, effects: true, follow: FOLLOW.attack },
  ],
  win: [{ label: 'Attack, then victory', at: -0.05, clip: WIN, effects: true, follow: FOLLOW.attack }],
  video: [
    { label: 'Pose images + smears', at: -0.2, clip: ROUND2, follow: FOLLOW.round2 },
    { label: 'Flow video (Veo 3.1)', at: 0.2 },
  ],
};

/**
 * The animation test (`?mode=anim`): Aria's attack on the meadow at her size in battle, in the
 * scene `?scene=` names: `motion` (round 2's poses beside the same attack with motion between
 * the poses), `win` (the attack, then victory) or `video` (round 2: pose images against Flow's
 * video). Everything loops.
 */
export async function animTest(): Promise<void> {
  document.title = 'Animation test · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  const view = new BattleView(document.body);
  const name = new URLSearchParams(location.search).get('scene') ?? 'motion';
  const actors = SCENES[name] ?? SCENES.motion;
  const needsVideo = actors.some((a) => !a.clip);
  const [poses, video] = await Promise.all([
    loadSet(view, 'aria-poses'),
    needsVideo ? loadSet(view, 'aria-video') : null,
    view.setBackdrop(`${ART}../meadow.jpg`),
  ]);
  const has = (pose: string) => poses.frames.has(pose);

  const figures = actors.map((a) => {
    const figure = new Figure(a.clip ? poses.k : video!.k);
    const smear = a.clip ? new Smear() : null;
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
      figure.show(poses.frames.get(s.pose)!, s.body);
      const strike = s.cues.find((c) => c.cue === 'strike');
      smear!.update(strike?.age ?? -1, a.follow ?? 0);
      if (dust) dust.update(strike?.age ?? -1, s.body.x + FRONT_FOOT);
      // The shake: sharp at the blow, gone in a fifth of a second.
      if (a.effects && strike && strike.age < 0.2) shake = Math.max(shake, 7 * (1 - strike.age / 0.2));
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
