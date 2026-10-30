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

/** Loads a set, scaled so its stance stands `height` design units tall. */
async function loadSet(view: BattleView, name: string, height = STAND_H): Promise<{ k: number; frames: Map<string, Frame> }> {
  const set = (await (await fetch(`${ART}${name}/frames.json`)).json()) as FrameSet;
  const frames = await Promise.all(set.frames.map(async (f) => ({ ...f, tex: await view.texture(`${ART}${name}/${f.file}`) })));
  return { k: height / set.stand, frames: new Map(frames.map((f) => [f.file.replace(/\.\w+$/, ''), f])) };
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
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(readonly k: number, private readonly height = STAND_H) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    this.mesh.renderOrder = 2;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthTest: false }),
    );
    this.shadow.scale.set(height * 0.85, height * 0.12, 1);
    this.shadow.renderOrder = 1;
    this.body.add(this.mesh);
    this.group.add(this.shadow, this.body);
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
    // The shadow keeps to the ground under her: it follows her along it, not up off it.
    this.shadow.position.set(s.x - this.height * 0.05, -this.height * 0.012, 0);
  }

  /** Lights the picture toward white (0 is its own colours), for the blink of a blow landing; `alpha` fades it. */
  tint(flash: number, alpha = 1): void {
    this.mesh.material.color.setScalar(1 + 2.5 * flash);
    this.mesh.material.opacity = alpha;
    this.shadow.material.opacity = alpha;
  }
}

/** A weapon's trail at the strike: drawn on the body, timed from the strike cue. */
interface Effect {
  readonly mesh: THREE.Object3D;
  /** Draws the effect `age` seconds after the strike; `follow` is when the follow-through begins. */
  update(age: number, follow: number): void;
}

/**
 * A sword smear, drawn in code: a crescent swept around a pivot from the blade's old place to
 * its new one, thick and bright at the blade, thin and fading at the tail. Angles are radians
 * (counter-clockwise from the right), lengths in the figure's pose pixels.
 */
class Smear implements Effect {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly polar: Record<'windUp' | 'slash' | 'follow', { a: number; r: number }>;
  readonly u = {
    uPivot: { value: new THREE.Vector2() },
    uA0: { value: 0 }, uA1: { value: 0 }, uR0: { value: 0 }, uR1: { value: 0 },
    uWidth: { value: 0 }, uTail: { value: 0 }, uFade: { value: 0 },
  };

  constructor(private readonly swing: Swing) {
    const polar = (tip: THREE.Vector2) => {
      const d = tip.clone().sub(swing.pivot);
      return { a: Math.atan2(d.y, d.x), r: d.length() };
    };
    this.polar = { windUp: polar(swing.windUp), slash: polar(swing.slash), follow: polar(swing.follow) };
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
    const { windUp, slash, follow: end } = this.polar;
    u.uPivot.value.copy(this.swing.pivot);
    u.uA0.value = windUp.a;
    u.uR0.value = windUp.r;
    u.uA1.value = THREE.MathUtils.lerp(slash.a, end.a, run);
    u.uR1.value = THREE.MathUtils.lerp(slash.r, end.r, run);
    u.uWidth.value = 170;
    u.uTail.value = Math.min(1, Math.max(0, after + 0.07) / 0.3);
    u.uFade.value = 1 - smooth(Math.min(1, Math.max(0, (after - 0.05) / 0.22)));
  }
}

/** A swing in pose pixels (y up, from the anchor): the pivot by the shoulders and the weapon's
 * outer edge in the wind-up, slash and follow-through, measured on the keyed poses. */
interface Swing {
  pivot: THREE.Vector2;
  windUp: THREE.Vector2;
  slash: THREE.Vector2;
  follow: THREE.Vector2;
}
const v = (x: number, y: number) => new THREE.Vector2(x, y);
/** Aria's sword: from over her right shoulder, down to the blade's tip low in front. */
const ARIA_SWING: Swing = { pivot: v(120, 560), windUp: v(-164, 792), slash: v(501, 185), follow: v(440, 4) };
/** Corin's great axe: an overhead chop, from the axe head behind his head down to it low in front. */
const CORIN_SWING: Swing = { pivot: v(80, 470), windUp: v(-202, 631), slash: v(386, 312), follow: v(391, 127) };

/**
 * A thrust's streak, drawn in code: a tapered white streak running back along the spear from its
 * tip, with two thin speed lines beside it. It flashes out with the thrust, holds through the
 * hit-stop, then its tail draws in toward the tip as it fades. Lengths in the figure's pose pixels.
 */
class Streak implements Effect {
  readonly mesh = new THREE.Group();
  private readonly u = { uTail: { value: 0 }, uFade: { value: 0 } };

  /** `tip`: the spear's tip in the thrust pose (y up, from the anchor); `dir`: the way the shaft points. */
  constructor(tip: THREE.Vector2, dir: THREE.Vector2) {
    const d = dir.clone().normalize();
    const n = new THREE.Vector2(-d.y, d.x);
    const material = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float t;
        attribute float side;
        varying float vT;
        varying float vSide;
        void main() {
          vT = t;
          vSide = side;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTail, uFade;
        varying float vT;
        varying float vSide;
        void main() {
          float core = 1.0 - pow(abs(vSide), 3.0);
          float alpha = smoothstep(uTail, uTail + 0.25, vT) * core * 0.95 * uFade;
          vec3 colour = mix(vec3(0.62, 0.84, 1.0), vec3(1.0), core);
          gl_FragColor = vec4(colour, alpha);
        }`,
    });
    // [offset from the shaft, width at the tip, length]: the streak, and a speed line either side.
    for (const [offset, width, length] of [[0, 40, 440], [52, 7, 300], [-46, 7, 260]]) {
      const SEG = 24;
      const position: number[] = [];
      const t: number[] = [];
      const side: number[] = [];
      const index: number[] = [];
      for (let i = 0; i <= SEG; i++) {
        const k = i / SEG;
        const half = (width / 2) * Math.pow(k, 0.6);
        const c = tip.clone().addScaledVector(d, -length * (1 - k)).addScaledVector(n, offset);
        for (const s of [-1, 1]) {
          position.push(c.x + n.x * half * s, c.y + n.y * half * s, 0);
          t.push(k);
          side.push(s);
        }
        if (i < SEG) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      g.setAttribute('t', new THREE.Float32BufferAttribute(t, 1));
      g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
      g.setIndex(index);
      const m = new THREE.Mesh(g, material);
      m.renderOrder = 3;
      m.frustumCulled = false;
      this.mesh.add(m);
    }
  }

  update(age: number, follow: number): void {
    const after = age - follow;
    this.mesh.visible = age >= 0 && after < 0.3;
    if (!this.mesh.visible) return;
    this.u.uTail.value = Math.min(1, Math.max(0, after / 0.25));
    this.u.uFade.value = 1 - smooth(Math.min(1, Math.max(0, (after - 0.04) / 0.2)));
  }
}

/** A soft round glow, white at the heart and violet at the rim, for magic. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.22, 'rgba(226, 204, 255, 1)');
  g.addColorStop(0.5, 'rgba(160, 100, 255, 0.75)');
  g.addColorStop(1, 'rgba(110, 60, 230, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A flat shape of triangles in one colour, from [x, y] corners in pose pixels. */
function shape(color: number, ...tris: [number, number][][]): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat().flatMap(([x, y]) => [x, y, 0]), 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, side: THREE.DoubleSide }));
  m.renderOrder = 3;
  m.frustumCulled = false;
  return m;
}

/**
 * An arrow loosed from the bow: drawn in code (shaft, steel head, white fletching) with a white
 * trail behind it, flying straight ahead from the bow until it leaves the screen.
 */
class Arrow implements Effect {
  readonly mesh = new THREE.Group();
  private readonly arrow = new THREE.Group();

  /** `from`: where the arrow's tip sits at full draw (pose pixels, y up, from the anchor). */
  constructor(private readonly from: THREE.Vector2) {
    const L = 300;
    const trail = new THREE.BufferGeometry();
    // A tapered trail behind the fletching, clear at its far end and white at the arrow.
    trail.setAttribute('position', new THREE.Float32BufferAttribute([-L - 320, 0, 0, -L, -7, 0, -L, 7, 0], 3));
    trail.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0, 1, 1, 1, 0.85, 1, 1, 1, 0.85], 4));
    const t = new THREE.Mesh(trail, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    t.renderOrder = 3;
    t.frustumCulled = false;
    this.arrow.add(
      t,
      shape(0x5a3a22, [[-L, -3], [-40, -3], [-40, 3]], [[-L, -3], [-40, 3], [-L, 3]]),
      shape(0xdfe4ec, [[-44, -13], [0, 0], [-44, 13]]),
      shape(0xf4f1e8, [[-L, 3], [-L + 56, 3], [-L - 10, 20]], [[-L, -3], [-L + 56, -3], [-L - 10, -20]]),
    );
    this.mesh.add(this.arrow);
  }

  update(age: number): void {
    this.mesh.visible = age >= 0 && age < 0.45;
    if (this.mesh.visible) this.arrow.position.set(this.from.x + 6500 * age, this.from.y, 0);
  }
}

/**
 * A magic bolt from the staff: a flash at the crystal, then a glowing orb with a trail of fading
 * sparks flying straight ahead until it leaves the screen.
 */
class Bolt implements Effect {
  readonly mesh = new THREE.Group();
  private readonly flash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly orbs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

  /** `from`: the crystal's tip in the cast pose (pose pixels, y up, from the anchor). */
  constructor(private readonly from: THREE.Vector2) {
    const tex = glowTexture();
    // The flash adds light; the orb and sparks are painted over the scene, so their violet holds
    // against a bright sky or meadow.
    const make = (size: number, blending: THREE.Blending = THREE.NormalBlending) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, blending }),
      );
      m.renderOrder = 4;
      m.frustumCulled = false;
      this.mesh.add(m);
      return m;
    };
    this.flash = make(1, THREE.AdditiveBlending);
    // The orb, then its trail: each spark smaller and further behind.
    for (const size of [230, 130, 100, 78, 60, 46]) this.orbs.push(make(size));
  }

  update(age: number): void {
    this.mesh.visible = age >= 0 && age < 0.55;
    if (!this.mesh.visible) return;
    const f = Math.min(1, age / 0.16);
    this.flash.position.set(this.from.x, this.from.y, 0);
    this.flash.scale.setScalar(120 + 260 * f);
    this.flash.material.opacity = 1 - f;
    const x = this.from.x + 40 + 4200 * age;
    this.orbs.forEach((o, i) => {
      // Sparks trail behind the orb with a little shimmer up and down.
      o.position.set(x - i * 70, this.from.y + (i ? Math.sin(age * 40 + i * 1.7) * 10 : 0), 0);
      o.material.opacity = i ? 0.75 - i * 0.1 : 1;
    });
  }
}

/** A run cycle: its poses in turn, seconds per pose, how high the body rides in each, and which poses land a foot (dust). */
interface RunCycle {
  poses: string[];
  stride: number;
  bob: number[];
  steps: number[];
}
const ON_FOOT: RunCycle = { poses: ['run', 'run-2'], stride: 0.1, bob: [10, 0], steps: [1] };

/** A character the test can play. */
interface Character {
  set: string;
  /** The trail its weapon leaves. */
  effect: () => Effect;
  /** How tall its stance stands, in design units: a rider stands far taller than a soldier on foot. */
  height: number;
  /** How far its moves carry: a horse's lunge covers more ground than a man's. */
  reach: number;
  /** Where its front foot (or hoof) lands ahead of the anchor, in design units, for the dust. */
  foot: number;
  run: RunCycle;
  /** Shoots from where it stands (bow, magic): no screen shake or stamp of dust at the release; the blow lands far away. */
  ranged?: boolean;
}

const CHARACTERS: Record<string, Character> = {
  aria: { set: 'aria-poses', effect: () => new Smear(ARIA_SWING), height: STAND_H, reach: 1, foot: 85, run: ON_FOOT },
  // The spear's tip in Bram's thrust pose, and the shaft pointing a little up from level.
  bram: { set: 'bram-poses', effect: () => new Streak(new THREE.Vector2(513, 436), new THREE.Vector2(1, 0.1)), height: STAND_H, reach: 1, foot: 85, run: ON_FOOT },
  corin: { set: 'corin-poses', effect: () => new Smear(CORIN_SWING), height: STAND_H, reach: 1, foot: 90, run: ON_FOOT },
  // The bow and the staff: a short step rather than a lunge, the arrow or the bolt does the travelling.
  dela: { set: 'dela-poses', effect: () => new Arrow(v(360, 564)), height: STAND_H, reach: 0.35, foot: 80, run: ON_FOOT, ranged: true },
  ilse: { set: 'ilse-poses', effect: () => new Bolt(v(551, 533)), height: STAND_H, reach: 0.6, foot: 80, run: ON_FOOT, ranged: true },
  // Horse and rider: the lance's tip in the thrust pose, the shaft angled up; a four-pose gallop,
  // riding high in the gathered pose, the hooves landing in the last two.
  edric: {
    set: 'edric-poses',
    effect: () => new Streak(new THREE.Vector2(543, 598), new THREE.Vector2(1, 0.3)),
    height: STAND_H * 1.7,
    reach: 2.2,
    foot: 190,
    run: { poses: ['gallop-1', 'gallop-2', 'gallop-3', 'gallop-4'], stride: 0.085, bob: [4, 16, 6, 0], steps: [2, 3] },
  },
};


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
const FOLLOW = { round2: 0.07, attack: 0.13 };

/** The win: a small hop into the victory pose, held breathing. */
const VICTORY: Beat[] = [
  { pose: 'victory', seconds: 0.12, body: { y: 16, squash: 1.03 } },
  { pose: 'victory', seconds: 0.14, body: { y: 0, squash: 0.97 } },
  { pose: 'victory', seconds: 1.5, body: { squash: 1 }, breathe: true },
];
/** The attack, then the win. */
const WIN: Beat[] = [...ATTACK, ...VICTORY, { pose: 'stance', seconds: 0.35 }];

/** How many run poses the charge plays, and how far back it starts (design units, before the character's reach). */
const STRIDES = 8;
const RUN_FROM = -640;
/**
 * The charge: the character runs in from the left on its run cycle at a steady speed, the body
 * bobbing, with dust at each footfall; it skids into its stance, attacks and wins. The loop fades
 * it out and back in at the start of the run.
 */
const charge = (run: RunCycle): Beat[] => [
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
const LOSE: Beat[] = [
  { pose: 'stance', seconds: 0.6, body: { x: 0, y: 0, squash: 1, lean: 0 }, breathe: true },
  { pose: 'hurt', seconds: 0.05, body: { x: -30, squash: 0.97, lean: -0.08 }, snap: true, cue: 'hit' },
  { pose: 'hurt', seconds: 0.08 },
  { pose: 'hurt', seconds: 0.38, body: { x: -52, squash: 1, lean: -0.04 } },
  { pose: 'fallen', seconds: 0.06, body: { x: -60, squash: 0.94, lean: 0 }, snap: true, cue: 'step' },
  { pose: 'fallen', seconds: 0.16, body: { squash: 1 } },
  { pose: 'fallen', seconds: 1.5 },
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
 * video). `?char=` picks who plays it (aria, bram, corin, dela, ilse or edric; the video is always Aria's). Everything loops.
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
