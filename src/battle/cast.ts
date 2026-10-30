import * as THREE from 'three';
import { BattleView, HEAD_SCALE, SOLDIER_H, shadowTexture } from './BattleView';
import { GALLOP, ON_FOOT, type RunCycle } from './clips';
import { type Sample } from './poseClip';

/**
 * The battle's cast: every character's pose set and how it moves (height, reach, run cycle),
 * the figure that shows a set's poses, the weapon effects drawn in code and dust (the clips
 * they play are in clips.ts). Shared by the animation test and the battle scene.
 */

/** Where the processed battle art is served from (public/battle). */
export const ART = `${import.meta.env.BASE_URL}battle/anim/`;
/** A leader's standing height in design units, as in the style frame (front rank, scale 1.06). */
export const STAND_H = SOLDIER_H * 1.06 * HEAD_SCALE;
/** A soldier's standing height: the front rank's, without a leader's larger head. */
export const SOLDIER_STAND = SOLDIER_H * 1.06;


/** One frame of a set from scripts/art/anim.py: its picture's size and where the anchor sits on it. */
export interface FrameInfo {
  file: string;
  w: number;
  h: number;
  /** The anchor in the picture's pixels: the torso's middle (x) on the feet line (y, from the top). */
  ax: number;
  ay: number;
}
export interface FrameSet {
  /** The standing figure's height in this set's pixels. */
  stand: number;
  frames: FrameInfo[];
}
export interface Frame extends FrameInfo {
  tex: THREE.Texture;
}

/** Loads a set, scaled so its stance stands `height` design units tall. */
export async function loadSet(view: BattleView, name: string, height = STAND_H): Promise<{ k: number; frames: Map<string, Frame> }> {
  const set = (await (await fetch(`${ART}${name}/frames.json`)).json()) as FrameSet;
  const frames = await Promise.all(set.frames.map(async (f) => ({ ...f, tex: await view.texture(`${ART}${name}/${f.file}`) })));
  return { k: height / set.stand, frames: new Map(frames.map((f) => [f.file.replace(/\.\w+$/, ''), f])) };
}

/** A soft round puff for dust, pale and earthy. */
export function dustTexture(): THREE.CanvasTexture {
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
 * Turns a sprite material's blue cloth crimson, for the enemy's soldiers: the rule of `redden` in
 * scripts/art/key.py (hues from cyan to violet with real colour in them swing to red, a little
 * richer and darker), with soft edges so the change doesn't band. Steel, skin, hair and leather
 * keep their colours.
 */
export function redden(material: THREE.MeshBasicMaterial): void {
  material.customProgramCacheKey = () => 'redden';
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `
        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
        }
        vec3 hsv2rgb(vec3 c) {
          vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
          return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
        }
        void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          // The rule works on the picture's own (sRGB) colours.
          vec3 srgb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
          vec3 hsv = rgb2hsv(srgb);
          float blue = smoothstep(0.50, 0.54, hsv.x) * (1.0 - smoothstep(0.73, 0.77, hsv.x)) * smoothstep(0.22, 0.32, hsv.y);
          vec3 red = hsv2rgb(vec3(fract(hsv.x - 0.62 + 0.995), min(1.0, hsv.y * 1.05), hsv.z * 0.92));
          diffuseColor.rgb = pow(mix(srgb, red, blue), vec3(2.2));
        }`,
      );
  };
}

/**
 * A fighter whose picture changes from frame to frame. The group stands on the ground with its
 * shadow; the body inside it carries the picture (and the smear), and leans and squashes about
 * the feet.
 */
export class Figure {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  /** Its own colours' brightness: below 1 for the far ranks, which take a touch of the sky's haze. */
  shade = 1;

  /** `red`: the enemy's soldiers, their blue cloth turned crimson (see `redden`). */
  constructor(readonly k: number, private readonly height = STAND_H, red = false) {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false });
    if (red) redden(material);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), material);
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
    if (this.mesh.material.map !== frame.tex) {
      this.mesh.material.map = frame.tex;
      this.mesh.material.needsUpdate = true;
    }
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
    this.mesh.material.color.setScalar(this.shade * (1 + 2.5 * flash));
    this.mesh.material.opacity = alpha;
    this.shadow.material.opacity = alpha;
  }
}

/** A weapon's trail at the strike: drawn on the body, timed from the strike cue. */
export interface Effect {
  readonly mesh: THREE.Object3D;
  /** Draws the effect `age` seconds after the strike; `follow` is when the follow-through begins. */
  update(age: number, follow: number): void;
  /** A shot's speed in pose pixels a second (an arrow, a bolt); none for a blade's trail. */
  readonly speed?: number;
}

/**
 * A sword smear, drawn in code: a crescent swept around a pivot from the blade's old place to
 * its new one, thick and bright at the blade, thin and fading at the tail. Angles are radians
 * (counter-clockwise from the right), lengths in the figure's pose pixels.
 */
export class Smear implements Effect {
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
export interface Swing {
  pivot: THREE.Vector2;
  windUp: THREE.Vector2;
  slash: THREE.Vector2;
  follow: THREE.Vector2;
}
export const v = (x: number, y: number) => new THREE.Vector2(x, y);
/** Aria's sword: from over her right shoulder, down to the blade's tip low in front. */
export const ARIA_SWING: Swing = { pivot: v(120, 560), windUp: v(-164, 792), slash: v(501, 185), follow: v(440, 4) };
/** Corin's great axe: an overhead chop, from the axe head behind his head down to it low in front. */
export const CORIN_SWING: Swing = { pivot: v(80, 470), windUp: v(-202, 631), slash: v(386, 312), follow: v(391, 127) };
/** Sabine's sabre: from behind her head, over the top to the tip high in front, on down to it low by her front foot. */
export const SABINE_SWING: Swing = { pivot: v(100, 500), windUp: v(-346, 752), slash: v(564, 700), follow: v(439, 15) };
/** Gorran's cleaver: an overhead chop like Corin's, from the head behind his own down to it by his knees. */
export const GORRAN_SWING: Swing = { pivot: v(80, 480), windUp: v(-186, 584), slash: v(314, 254), follow: v(261, 114) };
/** The sword soldiers: Sabine's sweep, a level slash at the shoulder and down to the tip by the front foot. */
export const SWORD_M_SWING: Swing = { pivot: v(80, 520), windUp: v(-400, 766), slash: v(380, 590), follow: v(269, 37) };
export const SWORD_F_SWING: Swing = { pivot: v(80, 520), windUp: v(-343, 710), slash: v(522, 591), follow: v(123, 55) };
/** The axe soldiers: Corin's overhead chop. */
export const AXE_M_SWING: Swing = { pivot: v(80, 470), windUp: v(-308, 733), slash: v(351, 353), follow: v(400, 150) };
export const AXE_F_SWING: Swing = { pivot: v(80, 470), windUp: v(-240, 791), slash: v(357, 382), follow: v(327, 148) };

/**
 * A thrust's streak, drawn in code: a tapered white streak running back along the spear from its
 * tip, with two thin speed lines beside it. It flashes out with the thrust, holds through the
 * hit-stop, then its tail draws in toward the tip as it fades. Lengths in the figure's pose pixels.
 */
export class Streak implements Effect {
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

/** A magic glow's colours, [r, g, b]: just outside its white heart, halfway out, and at its clear rim. */
export type Glow = [number, number, number][];
/** Ilse's magic: violet. */
export const VIOLET: Glow = [[226, 204, 255], [160, 100, 255], [110, 60, 230]];
/** Morwen's magic: blood red. */
export const CRIMSON: Glow = [[255, 200, 190], [235, 50, 50], [150, 0, 20]];
/** The mage soldiers' magic: a plainer pale blue. */
export const AZURE: Glow = [[215, 235, 255], [90, 150, 255], [40, 80, 220]];

/** A soft round glow for magic, white at the heart and the glow's colour toward the rim. */
export function glowTexture([inner, mid, rim]: Glow): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.22, `rgba(${inner.join(', ')}, 1)`);
  g.addColorStop(0.5, `rgba(${mid.join(', ')}, 0.75)`);
  g.addColorStop(1, `rgba(${rim.join(', ')}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A flat shape of triangles in one colour, from [x, y] corners in pose pixels. */
export function shape(color: number, ...tris: [number, number][][]): THREE.Mesh {
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
export class Arrow implements Effect {
  readonly mesh = new THREE.Group();
  readonly speed = 6500;
  private readonly arrow = new THREE.Group();

  /** `from`: where the arrow's tip sits at full draw (pose pixels, y up, from the anchor); `fletching`: its feathers' colour. */
  constructor(private readonly from: THREE.Vector2, fletching = 0xf4f1e8) {
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
      shape(fletching, [[-L, 3], [-L + 56, 3], [-L - 10, 20]], [[-L, -3], [-L + 56, -3], [-L - 10, -20]]),
    );
    this.mesh.add(this.arrow);
  }

  update(age: number): void {
    this.mesh.visible = age >= 0 && age < 0.45;
    if (this.mesh.visible) this.arrow.position.set(this.from.x + this.speed * age, this.from.y, 0);
  }
}

/**
 * A magic bolt from the staff: a flash at the crystal, then a glowing orb with a trail of fading
 * sparks flying straight ahead until it leaves the screen.
 */
export class Bolt implements Effect {
  readonly mesh = new THREE.Group();
  readonly speed = 4200;
  private readonly flash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly orbs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

  /** `from`: the crystal's tip in the cast pose (pose pixels, y up, from the anchor). */
  constructor(private readonly from: THREE.Vector2, glow: Glow) {
    const tex = glowTexture(glow);
    // The flash adds light; the orb and sparks are painted over the scene, so their colour holds
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
    const x = this.from.x + 40 + this.speed * age;
    this.orbs.forEach((o, i) => {
      // Sparks trail behind the orb with a little shimmer up and down.
      o.position.set(x - i * 70, this.from.y + (i ? Math.sin(age * 40 + i * 1.7) * 10 : 0), 0);
      o.material.opacity = i ? 0.75 - i * 0.1 : 1;
    });
  }
}

/** A character the test can play. */
export interface Character {
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

export const CHARACTERS: Record<string, Character> = {
  aria: { set: 'aria-poses', effect: () => new Smear(ARIA_SWING), height: STAND_H, reach: 1, foot: 85, run: ON_FOOT },
  // The spear's tip in Bram's thrust pose, and the shaft pointing a little up from level.
  bram: { set: 'bram-poses', effect: () => new Streak(new THREE.Vector2(513, 436), new THREE.Vector2(1, 0.1)), height: STAND_H, reach: 1, foot: 85, run: ON_FOOT },
  corin: { set: 'corin-poses', effect: () => new Smear(CORIN_SWING), height: STAND_H, reach: 1, foot: 90, run: ON_FOOT },
  // The bow and the staff: a short step rather than a lunge, the arrow or the bolt does the travelling.
  dela: { set: 'dela-poses', effect: () => new Arrow(v(360, 564)), height: STAND_H, reach: 0.35, foot: 80, run: ON_FOOT, ranged: true },
  ilse: { set: 'ilse-poses', effect: () => new Bolt(v(551, 533), VIOLET), height: STAND_H, reach: 0.6, foot: 80, run: ON_FOOT, ranged: true },
  // The rival army's leaders, made the same way.
  sabine: { set: 'sabine-poses', effect: () => new Smear(SABINE_SWING), height: STAND_H, reach: 1, foot: 85, run: ON_FOOT },
  gorran: { set: 'gorran-poses', effect: () => new Smear(GORRAN_SWING), height: STAND_H, reach: 1, foot: 95, run: ON_FOOT },
  petra: { set: 'petra-poses', effect: () => new Streak(v(680, 498), v(1, 0.26)), height: STAND_H, reach: 1, foot: 85, run: ON_FOOT },
  ulric: { set: 'ulric-poses', effect: () => new Arrow(v(412, 624), 0x9a1830), height: STAND_H, reach: 0.35, foot: 80, run: ON_FOOT, ranged: true },
  morwen: { set: 'morwen-poses', effect: () => new Bolt(v(431, 620), CRIMSON), height: STAND_H, reach: 0.6, foot: 80, run: ON_FOOT, ranged: true },
  // The soldiers, a man and a woman of each class: smaller than the leaders, made the same way.
  'soldier-sword-m': { set: 'soldier-sword-m-poses', effect: () => new Smear(SWORD_M_SWING), height: SOLDIER_STAND, reach: 1, foot: 85, run: ON_FOOT },
  'soldier-sword-f': { set: 'soldier-sword-f-poses', effect: () => new Smear(SWORD_F_SWING), height: SOLDIER_STAND, reach: 1, foot: 85, run: ON_FOOT },
  'soldier-spear-m': { set: 'soldier-spear-m-poses', effect: () => new Streak(v(569, 466), v(1, 0.1)), height: SOLDIER_STAND, reach: 1, foot: 85, run: ON_FOOT },
  'soldier-spear-f': { set: 'soldier-spear-f-poses', effect: () => new Streak(v(656, 471), v(1, 0.13)), height: SOLDIER_STAND, reach: 1, foot: 85, run: ON_FOOT },
  'soldier-axe-m': { set: 'soldier-axe-m-poses', effect: () => new Smear(AXE_M_SWING), height: SOLDIER_STAND, reach: 1, foot: 90, run: ON_FOOT },
  'soldier-axe-f': { set: 'soldier-axe-f-poses', effect: () => new Smear(AXE_F_SWING), height: SOLDIER_STAND, reach: 1, foot: 90, run: ON_FOOT },
  'soldier-bow-m': { set: 'soldier-bow-m-poses', effect: () => new Arrow(v(340, 592)), height: SOLDIER_STAND, reach: 0.35, foot: 80, run: ON_FOOT, ranged: true },
  'soldier-bow-f': { set: 'soldier-bow-f-poses', effect: () => new Arrow(v(328, 557)), height: SOLDIER_STAND, reach: 0.35, foot: 80, run: ON_FOOT, ranged: true },
  'soldier-mage-m': { set: 'soldier-mage-m-poses', effect: () => new Bolt(v(580, 602), AZURE), height: SOLDIER_STAND, reach: 0.6, foot: 80, run: ON_FOOT, ranged: true },
  'soldier-mage-f': { set: 'soldier-mage-f-poses', effect: () => new Bolt(v(500, 615), AZURE), height: SOLDIER_STAND, reach: 0.6, foot: 80, run: ON_FOOT, ranged: true },
  'soldier-knight-m': { set: 'soldier-knight-m-poses', effect: () => new Streak(v(505, 590), v(1, 0.23)), height: SOLDIER_STAND * 1.7, reach: 2.2, foot: 190, run: GALLOP },
  'soldier-knight-f': { set: 'soldier-knight-f-poses', effect: () => new Streak(v(576, 606), v(1, 0.16)), height: SOLDIER_STAND * 1.7, reach: 2.2, foot: 190, run: GALLOP },
  // Horse and rider: the lance's tip in the thrust pose, the shaft angled up.
  edric: {
    set: 'edric-poses',
    effect: () => new Streak(new THREE.Vector2(543, 598), new THREE.Vector2(1, 0.3)),
    height: STAND_H * 1.7,
    reach: 2.2,
    foot: 190,
    run: GALLOP,
  },
  varek: {
    set: 'varek-poses',
    effect: () => new Streak(v(548, 627), v(1, 0.22)),
    height: STAND_H * 1.7,
    reach: 2.2,
    foot: 190,
    run: GALLOP,
  },
};


/** Dust kicked up by a stamp: a few puffs spreading low along the ground and fading. */
export class Dust {
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

export const smooth = (x: number) => x * x * (3 - 2 * x);

