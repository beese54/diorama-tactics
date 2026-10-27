import * as THREE from 'three';
import { BattleView, DESIGN_H, HEAD_SCALE, SOLDIER_H, shadowTexture } from './BattleView';

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

/** A fighter whose picture changes from frame to frame, standing with its anchor on a point. */
class Figure {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly k: number) {
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
    this.group.add(shadow, this.mesh);
  }

  /** Shows `frame` with its anchor on the group's origin. */
  show(frame: Frame): void {
    const { k } = this;
    this.mesh.material.map = frame.tex;
    this.mesh.material.needsUpdate = true;
    this.mesh.scale.set(frame.w * k, frame.h * k, 1);
    this.mesh.position.set(-frame.ax * k, -(frame.h - frame.ay) * k, 0);
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
}

/** A step of a pose clip: which pose, for how long, and how far forward the body has lunged. */
interface Beat {
  pose: string;
  seconds: number;
  lunge: number;
}
/** The attack from pose images: held key poses with a snap between them, as hand-drawn battles do. */
const ATTACK: Beat[] = [
  { pose: 'stance', seconds: 0.7, lunge: 0 },
  { pose: 'wind-up', seconds: 0.3, lunge: -8 },
  { pose: 'slash', seconds: 0.07, lunge: 30 },
  { pose: 'follow', seconds: 0.45, lunge: 40 },
  { pose: 'stance', seconds: 0.35, lunge: 0 },
];
const ATTACK_SECONDS = ATTACK.reduce((s, b) => s + b.seconds, 0);
const STRIKE = ATTACK[0].seconds + ATTACK[1].seconds;

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

/** The video's frames, from scripts/art/anim.py: Veo's clip from frame 36 to 100. */
const VIDEO_FIRST = 36;
const VIDEO_LAST = 100;
const VIDEO_FPS = 24;
const VIDEO_SECONDS = (VIDEO_LAST - VIDEO_FIRST + 1) / VIDEO_FPS;

const ease = (x: number) => x * x * (3 - 2 * x);

/**
 * The round 2 animation test (`?mode=anim`): Aria's attack twice on the meadow, at her size in
 * battle. On the left, the pose images held in turn with a smear drawn between them; on the
 * right, the frames of Flow's video. Both loop.
 */
export async function animTest(): Promise<void> {
  document.title = 'Animation test · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  const view = new BattleView(document.body);
  const [poses, video] = await Promise.all([loadSet(view, 'aria-poses'), loadSet(view, 'aria-video'), view.setBackdrop(`${ART}../meadow.jpg`)]);

  const left = new Figure(poses.k);
  const right = new Figure(video.k);
  const smear = new Smear();
  left.group.add(smear.mesh);
  smear.mesh.scale.setScalar(poses.k);
  view.add(left.group, right.group);

  const hud = document.createElement('div');
  hud.id = 'battle-hud';
  for (const [text, x] of [['Pose images + smears', 30], ['Flow video (Veo 3.1)', 70]] as const) {
    const label = document.createElement('div');
    label.className = 'effect';
    label.textContent = text;
    label.style.left = `${x}%`;
    hud.appendChild(label);
  }
  document.body.appendChild(hud);

  const [a0, aS, aF] = [polar(SWING.windUp), polar(SWING.slash), polar(SWING.follow)];
  const draw = (seconds: number) => {
    const xs = [-0.2, 0.2].map((x) => x * view.width - STAND_H * 0.25);
    // Poses: find the beat, lunge toward its offset (easing back in the last beat).
    let t = seconds % ATTACK_SECONDS;
    let i = 0;
    while (t >= ATTACK[i].seconds) t -= ATTACK[i++].seconds;
    const beat = ATTACK[i];
    const lunge = i === ATTACK.length - 1 ? ATTACK[i - 1].lunge * (1 - ease(Math.min(1, t / 0.2))) : beat.lunge;
    left.show(poses.frames.get(beat.pose)!);
    left.group.position.set(xs[0] + lunge, FEET, 0);

    // The smear: out with the slash, the head running on into the follow-through, then gone.
    const s = (seconds % ATTACK_SECONDS) - STRIKE;
    const u = smear.u;
    smear.mesh.visible = s >= 0 && s < 0.4;
    if (smear.mesh.visible) {
      const run = Math.min(1, Math.max(0, (s - 0.07) / 0.08));
      u.uPivot.value.copy(SWING.pivot);
      u.uA0.value = a0.a;
      u.uR0.value = a0.r;
      u.uA1.value = THREE.MathUtils.lerp(aS.a, aF.a, run);
      u.uR1.value = THREE.MathUtils.lerp(aS.r, aF.r, run);
      u.uWidth.value = 170;
      u.uTail.value = Math.min(1, s / 0.3);
      u.uFade.value = 1 - ease(Math.min(1, Math.max(0, (s - 0.12) / 0.22)));
    }

    // Video: its frames in order at 24 a second.
    const n = Math.floor((seconds % VIDEO_SECONDS) * VIDEO_FPS);
    right.show(video.frames.get(`f${String(VIDEO_FIRST + n).padStart(3, '0')}`)!);
    right.group.position.set(xs[1], FEET, 0);
    view.render();
  };

  // Checks and captures fix the clock with __anim.at(seconds); otherwise it runs in real time.
  let fixed: number | null = null;
  const clock = new THREE.Clock();
  view.renderer.setAnimationLoop(() => fixed === null && draw(clock.getElapsedTime()));
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __anim: {
        ready: true,
        attackSeconds: ATTACK_SECONDS,
        videoSeconds: VIDEO_SECONDS,
        strike: STRIKE,
        at: (seconds: number) => draw((fixed = seconds)),
      },
    });
  }
}
