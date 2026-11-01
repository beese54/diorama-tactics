import * as THREE from 'three';
import type { Card } from '../game/cards';
import type { Side } from '../game/units';
import { ArtStage, type ArtParams } from './ArtStage';
import { paintCard } from './frameArt';
import { ART_UV, CARD_H, CARD_RADIUS, CARD_W } from './layout';
import { LOOKS } from './looks';

/** The card's live settings: the art's, plus the tilt and the foil. */
export interface CardParams extends ArtParams {
  /** The most the card tilts toward the pointer, in degrees. */
  maxTilt: number;
  /** The holographic foil's strength. */
  foil: number;
}

export const DEFAULT_PARAMS: CardParams = { maxTilt: 14, spread: 0.05, depth: 1, light: 1, crossfade: 0.5, clipStart: 0, foil: 1 };

/** The card in world units: 1 wide, 1.4 tall. */
export const CARD_WORLD_H = CARD_H / CARD_W;

const FACE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * One side of the card: the painted frame over the art, rounded corners cut smooth, the foil on
 * the metal and on the bright metal in the art, and an embossed highlight on the metal's edges
 * from a light that moves as the card tilts.
 */
const FACE_FRAG = /* glsl */ `
  uniform sampler2D frame, metal, art;
  uniform float hasArt, foil, clipMix, time;
  uniform vec4 artUv;
  uniform vec2 tilt, size, texel;
  uniform float radius;
  varying vec2 vUv;

  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  vec3 rainbow(float h) {
    return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    // Rounded corners, antialiased: nothing draws outside the card's shape.
    float d = roundBox((vUv - 0.5) * size, size * 0.5, radius);
    float edge = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
    if (edge <= 0.0) discard;

    vec4 fr = texture2D(frame, vUv);
    vec3 col = fr.rgb;
    float artMetal = 0.0;
    if (hasArt > 0.5) {
      vec2 auv = (vUv - artUv.xy) / (artUv.zw - artUv.xy);
      if (all(greaterThanEqual(auv, vec2(0.0))) && all(lessThanEqual(auv, vec2(1.0)))) {
        vec3 a = texture2D(art, auv).rgb;
        col = mix(a, fr.rgb, fr.a);
        // Bright, grey parts of the art (armour, blades) take a little foil too, but not while
        // the clip plays: the foil mustn't fight the moving picture.
        float luma = dot(a, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(a.r, max(a.g, a.b)) - min(a.r, min(a.g, a.b));
        artMetal = (1.0 - fr.a) * smoothstep(0.35, 0.8, luma) * (1.0 - smoothstep(0.08, 0.25, sat)) * (1.0 - clipMix);
      }
    }

    // The light, in the card's own frame: up and to the left, swinging as the card tilts.
    vec2 light = normalize(vec2(-0.45, 0.9) - tilt * 1.1);
    float m = texture2D(metal, vUv).r;
    vec2 grad = vec2(
      texture2D(metal, vUv + vec2(texel.x, 0.0)).r - texture2D(metal, vUv - vec2(texel.x, 0.0)).r,
      texture2D(metal, vUv + vec2(0.0, texel.y)).r - texture2D(metal, vUv - vec2(0.0, texel.y)).r
    );
    float lit = dot(grad, light);
    col += vec3(1.0, 0.92, 0.75) * max(lit, 0.0) * 0.9 - max(-lit, 0.0) * 0.18;

    // The foil: rainbow bands across the metal that slide as the card tilts.
    float phase = dot(vUv, vec2(1.3, 0.9)) * 1.6 + tilt.x * 1.4 - tilt.y * 1.1 + time * 0.03;
    vec3 bow = rainbow(phase);
    float bands = 0.55 + 0.45 * sin(phase * 18.0);
    float tiltAmt = 0.35 + 0.65 * clamp(length(tilt), 0.0, 1.0);
    float f = foil * tiltAmt * (m * 0.55 + artMetal * 0.3) * bands;
    col = mix(col, col * (0.55 + bow * 0.9) + bow * 0.06, f);

    // A soft sheen across the whole card, as on a coated card, moving with the light.
    float sheen = exp(-pow(dot(vUv - 0.5, light) * 3.0 + 0.4 - tilt.x * 0.6, 2.0) * 6.0);
    col += sheen * 0.035;

    gl_FragColor = vec4(col, edge);
    #include <colorspace_fragment>
  }
`;

const SHADOW_FRAG = /* glsl */ `
  uniform vec2 size;
  uniform float radius, blur, strength;
  varying vec2 vUv;
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    // The plane is larger than the card; the card's shape sits in its middle.
    vec2 p = (vUv - 0.5) * size * 1.5;
    float d = roundBox(p, size * 0.5, radius);
    float a = 1.0 - smoothstep(-blur, blur, d);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * strength);
  }
`;

/**
 * A layered, animated card (cards.md, Part 1): a 3D card with its art stage in the window,
 * tilting toward the pointer, floating at rest, flipping to its back, over a soft shadow.
 */
export class CardView {
  readonly group = new THREE.Group();
  /** The card itself (it flips and tilts inside the group, which floats). */
  private readonly body = new THREE.Group();
  private readonly face: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly back: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** The tilt now and where the pointer wants it, each axis -1 to 1 (x: turn right, y: lean back). */
  readonly tilt = new THREE.Vector2();
  readonly tiltGoal = new THREE.Vector2();
  /** Pointer over the card. */
  hovered = false;
  /** 0 face up, 1 face down; the flip eases toward `flipGoal`. */
  private flipT = 0;
  private flipGoal = 0;

  private constructor(readonly card: Card, readonly side: Side, readonly stage: ArtStage, readonly params: CardParams) {
    const paint = paintCard(card, side);
    const canvasTex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 8;
      return t;
    };
    const geo = new THREE.PlaneGeometry(1, CARD_WORLD_H);
    const material = (frame: HTMLCanvasElement, metal: HTMLCanvasElement, hasArt: boolean) =>
      new THREE.ShaderMaterial({
        uniforms: {
          frame: { value: canvasTex(frame, true) },
          metal: { value: canvasTex(metal, false) },
          art: { value: stage.target.texture },
          hasArt: { value: hasArt ? 1 : 0 },
          foil: { value: params.foil },
          clipMix: { value: 0 },
          time: { value: 0 },
          artUv: { value: new THREE.Vector4(ART_UV.u0, ART_UV.v0, ART_UV.u1, ART_UV.v1) },
          tilt: { value: new THREE.Vector2() },
          size: { value: new THREE.Vector2(CARD_W, CARD_H) },
          texel: { value: new THREE.Vector2(1.5 / frame.width, 1.5 / frame.height) },
          radius: { value: CARD_RADIUS },
        },
        vertexShader: FACE_VERT,
        fragmentShader: FACE_FRAG,
        transparent: true,
      });
    this.face = new THREE.Mesh(geo, material(paint.face, paint.faceMetal, true));
    this.back = new THREE.Mesh(geo, material(paint.back, paint.backMetal, false));
    this.back.rotation.y = Math.PI;
    this.body.add(this.face, this.back);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, CARD_WORLD_H * 1.5),
      new THREE.ShaderMaterial({
        uniforms: { size: { value: new THREE.Vector2(CARD_W, CARD_H) }, radius: { value: CARD_RADIUS }, blur: { value: 60 }, strength: { value: 0.5 } },
        vertexShader: FACE_VERT,
        fragmentShader: SHADOW_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.shadow.position.z = -0.35;
    this.group.add(this.shadow, this.body);
  }

  static async create(card: Card, side: Side, params: CardParams, artSize: number): Promise<CardView> {
    const stage = await ArtStage.load(card.id, LOOKS[card.id], params, artSize);
    return new CardView(card, side, stage, params);
  }

  /** The mesh to test the pointer against (the face's rest shape). */
  get hitTarget(): THREE.Object3D {
    return this.face;
  }

  get flipped(): boolean {
    return this.flipGoal === 1;
  }

  flip(): void {
    this.flipGoal = 1 - this.flipGoal;
  }

  hover(on: boolean): void {
    this.hovered = on;
    // Only a face-up card plays its clip.
    this.stage.hover(on && !this.flipped);
  }

  /** Advances the card to `time`: eases the tilt and the flip, floats it, and redraws the art. */
  update(time: number, dt: number, renderer: THREE.WebGLRenderer): void {
    const p = this.params;
    // At rest the card sways a little on its own, so its depth shows even untouched.
    const idle = this.hovered ? new THREE.Vector2() : new THREE.Vector2(Math.sin(time * 0.5) * 0.22, Math.cos(time * 0.37) * 0.16);
    const goal = this.hovered ? this.tiltGoal : idle;
    const k = 1 - Math.exp(-dt * (this.hovered ? 9 : 2.5));
    this.tilt.lerp(goal, k);
    const kf = 1 - Math.exp(-dt * 6);
    this.flipT += (this.flipGoal - this.flipT) * kf;
    if (Math.abs(this.flipGoal - this.flipT) < 1e-4) this.flipT = this.flipGoal;
    const flip = this.flipT * this.flipT * (3 - 2 * this.flipT);
    const max = THREE.MathUtils.degToRad(p.maxTilt);
    this.body.rotation.set(-this.tilt.y * max, this.tilt.x * max + flip * Math.PI, Math.sin(time * 0.6) * 0.012);
    // The float, and a lift through the middle of a flip.
    const lift = Math.sin(flip * Math.PI) * 0.18;
    this.body.position.set(0, Math.sin(time * 0.9) * 0.012, lift);
    // The shadow: down and to the right of the card, softer and fainter as the card lifts.
    const width = Math.max(0.02, Math.abs(Math.cos(this.body.rotation.y)));
    this.shadow.scale.set(width, 1, 1);
    this.shadow.position.set(0.05 - this.tilt.x * 0.04, -0.06 + this.tilt.y * 0.04 + this.body.position.y * 0.5, -0.35);
    const su = this.shadow.material.uniforms;
    su.blur.value = 50 + lift * 300;
    su.strength.value = 0.55 - lift * 1.2;

    // The art sees the tilt in its own frame (turned with the card when face down).
    this.stage.update(time, dt, this.tilt);
    this.stage.render(renderer);
    for (const m of [this.face.material, this.back.material]) {
      m.uniforms.time.value = time;
      m.uniforms.tilt.value.copy(this.tilt);
      m.uniforms.foil.value = p.foil;
      m.uniforms.clipMix.value = this.stage.clipMix;
    }
  }

  dispose(): void {
    this.stage.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.ShaderMaterial | undefined;
      if (mat?.uniforms) for (const u of Object.values(mat.uniforms)) (u.value as THREE.Texture)?.isTexture && u.value !== this.stage.target.texture && (u.value as THREE.Texture).dispose();
      mat?.dispose?.();
    });
  }
}
