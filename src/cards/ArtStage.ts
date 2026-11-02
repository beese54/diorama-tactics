import * as THREE from 'three';
import type { LightKind, Look, ParticleKind } from './looks';

/** What `public/cards/<id>/layers.json` lists (scripts/art/cardart.py writes it). */
interface LayerFiles {
  art?: string;
  plate?: string;
  character?: string;
  front?: string;
  depth?: string;
  /** The hover clip, once one is installed. */
  motion?: string;
  /** The weapon's line, from hilt to tip, in fractions of the art from its top left. */
  glint?: [number, number][];
}

/** The live settings of the art (the showcase's dev panel changes them). */
export interface ArtParams {
  /** How far the layers part as the card tilts, in fractions of the art window. */
  spread: number;
  /** How strongly the plate's depth map bends it. */
  depth: number;
  /** The light's and the particles' strength. */
  light: number;
  /** Seconds the hover clip takes to fade in or out. */
  crossfade: number;
  /** Where the hover clip starts, in seconds. */
  clipStart: number;
}

/** Each layer's depth: how far it moves as the card tilts (0 = the far plate, 1 = the nearest). */
const DEPTH = { plate: 0, light: 0.15, motesBack: 0.35, character: 0.55, front: 1, motesFront: 1.1, clip: 0.35 } as const;
/** The depth the art turns about: layers nearer than it move with the tilt, farther against it. */
const PIVOT = 0.5;
/** The plate is drawn a little larger than the window, so its parallax never shows an edge. */
const PLATE_ZOOM = 1.06;

const QUAD = new THREE.PlaneGeometry(1, 1);

/** The light kinds, in the order the light shader's `mode` numbers them. */
const LIGHT_KINDS: LightKind[] = ['sunbeams', 'daylight', 'mist', 'bloom', 'storm-break', 'aura', 'rim', 'firelight', 'torchlight', 'lightning', 'moonbeams', 'candlelight'];

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * A card's art window (cards.md, Part 1: "Layers"), drawn into a texture every frame: the
 * plate, its light, the particles, the figures with a glint along the weapon, the foreground,
 * and the hover clip over them all. Each layer shifts with the card's tilt by its own depth,
 * and the plate bends by its depth map, so the flat picture opens up in depth.
 */
export class ArtStage {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10, 10);
  /** Each layer's mesh, with the depth it moves by. */
  private readonly movers: { obj: THREE.Object3D; depth: number }[] = [];
  private readonly uniforms: { [key: string]: THREE.IUniform }[] = [];
  private plateMat: THREE.ShaderMaterial | null = null;
  private video: HTMLVideoElement | null = null;
  private clipMat: THREE.MeshBasicMaterial | null = null;
  /** The clip's opacity, 0 to 1, and where it is heading. */
  clipMix = 0;
  private hovered = false;
  private lightScale = 1;
  /** The clip waiting to be fetched on the first hover (a lazy stage), and whether it is on its way. */
  private clipUrl: string | null = null;
  private clipLoading = false;
  /** Which of the card's files loaded, for the dev checklist and the checks. */
  readonly loaded: Record<string, boolean> = {};

  private constructor(size: number, readonly look: Look, private readonly params: ArtParams) {
    this.target = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false });
  }

  /**
   * Loads card `id`'s art from `public/cards/<id>/`; missing files fall back (see `build`).
   * `lazyClip`: the hover clip is fetched on the first hover instead of now.
   * `texSize`: the layers are scaled down to this many pixels square as they load (the files are
   * 1536 for the full-screen showcase; a hand card needs far less, and each layer at full size
   * is about 12 MB of GPU memory).
   */
  static async load(id: string, look: Look, params: ArtParams, size: number, opts: { lazyClip?: boolean; texSize?: number } = {}): Promise<ArtStage> {
    const stage = new ArtStage(size, look, params);
    const root = `${import.meta.env.BASE_URL}cards/`;
    const dir = `${root}${id}/`;
    // The manifest lists the cards that have art, so a card without any asks for nothing.
    const listed: string[] = await fetch(`${root}index.json`)
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((m: { cards: string[] }) => m.cards)
      .catch(() => []);
    const files: LayerFiles = listed.includes(id)
      ? await fetch(`${dir}layers.json`)
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}))
      : {};
    stage.loaded['layers.json'] = Object.keys(files).length > 0;
    const loader = new THREE.TextureLoader();
    const small = opts.texSize
      ? new THREE.ImageBitmapLoader().setOptions({
          imageOrientation: 'flipY', premultiplyAlpha: 'none', resizeWidth: opts.texSize, resizeHeight: opts.texSize, resizeQuality: 'high',
        })
      : null;
    const tex = async (name: keyof LayerFiles, srgb = true): Promise<THREE.Texture | null> => {
      const file = files[name];
      if (typeof file !== 'string') return null;
      try {
        let t: THREE.Texture;
        if (small) {
          // Decoded and scaled down off the main thread, already the right way up.
          t = new THREE.Texture(await small.loadAsync(dir + file));
          t.flipY = false;
          t.needsUpdate = true;
        } else t = await loader.loadAsync(dir + file);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.anisotropy = 4;
        stage.loaded[file] = true;
        return t;
      } catch {
        stage.loaded[file] = false;
        return null;
      }
    };
    const [art, plate, character, front, depth] = await Promise.all([tex('art'), tex('plate'), tex('character'), tex('front'), tex('depth', false)]);
    stage.build({ art, plate, character, front, depth, glint: files.glint ?? null });
    if (files.motion) {
      if (opts.lazyClip) stage.clipUrl = dir + files.motion;
      else await stage.loadClip(dir + files.motion);
    }
    return stage;
  }

  private build(t: {
    art: THREE.Texture | null;
    plate: THREE.Texture | null;
    character: THREE.Texture | null;
    front: THREE.Texture | null;
    depth: THREE.Texture | null;
    glint: [number, number][] | null;
  }): void {
    // The far layer: the plate (or, with no layers, the flat art; with no art, the look's sky).
    const back = t.plate ?? t.art;
    // Over a card with no art, the light only hints: on the bare sky it would wash out.
    if (!back) this.lightScale = 0.35;
    this.plateMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: back },
        depthMap: { value: t.depth },
        hasMap: { value: back ? 1 : 0 },
        hasDepth: { value: t.depth && t.plate ? 1 : 0 },
        shift: { value: new THREE.Vector2() },
        bend: { value: 0 },
        zoom: { value: PLATE_ZOOM },
        skyTop: { value: new THREE.Color(this.look.sky[0]) },
        skyBottom: { value: new THREE.Color(this.look.sky[1]) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D map, depthMap;
        uniform float hasMap, hasDepth, bend, zoom;
        uniform vec2 shift;
        uniform vec3 skyTop, skyBottom;
        varying vec2 vUv;
        void main() {
          vec2 uv = (vUv - 0.5) / zoom + 0.5;
          // The plate turns about the pivot depth: its far parts shift against the tilt, the
          // near ground with it. The depth map (white near) says how far each pixel is.
          float d = hasDepth > 0.5 ? texture2D(depthMap, uv).r : 0.0;
          uv -= shift * (d - ${PIVOT.toFixed(2)}) * bend;
          vec3 c = hasMap > 0.5 ? texture2D(map, uv).rgb : mix(skyBottom, skyTop, vUv.y);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.add(new THREE.Mesh(QUAD, this.plateMat), DEPTH.plate, 0);
    this.add(this.lightMesh(), DEPTH.light, 1);
    this.add(this.motes(this.look.particles, 70, 0.75), DEPTH.motesBack, 2);
    if (t.character) {
      this.add(this.cutout(t.character), DEPTH.character, 3);
      if (t.glint && t.glint.length >= 2) this.add(this.glintMesh(t.character, t.glint), DEPTH.character, 4);
    }
    if (t.front) this.add(this.cutout(t.front), DEPTH.front, 5);
    this.add(this.motes(this.look.particles, 18, 1.8), DEPTH.motesFront, 6);
  }

  private add(obj: THREE.Object3D, depth: number, order: number): void {
    obj.renderOrder = order;
    this.scene.add(obj);
    this.movers.push({ obj, depth });
  }

  private cutout(map: THREE.Texture): THREE.Mesh {
    return new THREE.Mesh(QUAD, new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false }));
  }

  /** The card's light, of its look's kind (cards.md, Part 3), from the look's source: added over the plate. */
  private lightMesh(): THREE.Mesh {
    const u = {
      time: { value: 0 },
      strength: { value: 1 },
      mode: { value: LIGHT_KINDS.indexOf(this.look.light) },
      glow: { value: new THREE.Color(this.look.glow) },
      source: { value: new THREE.Vector2(this.look.source[0], 1 - this.look.source[1]) },
    };
    this.uniforms.push(u);
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform float time, strength, mode;
        uniform vec3 glow;
        uniform vec2 source;
        varying vec2 vUv;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        float noise(float x) {
          float i = floor(x), f = fract(x);
          return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
        }
        /** A flame's unsteady brightness, about 0.6 to 1. */
        float flicker(float t) { return 0.6 + 0.4 * (noise(t * 7.0) * 0.6 + noise(t * 17.0 + 7.0) * 0.4); }
        /** Rays fanning from the source: slow sine combs across the angle, so the beams drift. */
        float rays(vec2 p, float n1, float n2, float speed) {
          float a = atan(p.y, p.x);
          float r = 0.5 + 0.5 * sin(a * n1 + time * 0.23 * speed) * sin(a * n2 - time * 0.17 * speed + 1.3);
          return pow(r, 2.5) + 0.35 * pow(0.5 + 0.5 * sin(a * 9.0 - time * 0.11 * speed), 4.0);
        }
        void main() {
          vec2 p = vUv - source;
          float r = length(p);
          int m = int(mode + 0.5);
          float l = 0.0;
          if (m == 0) {
            // Sunbeams: rays and a bright core, breathing.
            float beams = rays(p, 17.0, 29.0, 1.0) * exp(-r * 2.4) * smoothstep(0.02, 0.12, r);
            l = (beams * 0.32 + exp(-r * r * 60.0) * 0.8 + exp(-r * 7.0) * 0.18) * (0.85 + 0.15 * sin(time * 0.7));
          } else if (m == 1) {
            // Daylight: a wide soft glow with a few broad, slow rays.
            l = (rays(p, 7.0, 11.0, 0.6) * exp(-r * 1.7) * 0.2 + exp(-r * 3.0) * 0.2) * (0.9 + 0.1 * sin(time * 0.5));
          } else if (m == 2) {
            // Mist: slanting shafts from the source, and soft bands drifting across the lower half.
            float shafts = pow(0.5 + 0.5 * sin(atan(p.y, p.x) * 23.0 + time * 0.12) * sin(atan(p.y, p.x) * 13.0 - time * 0.08), 3.0);
            float bands = 0.5 + 0.5 * sin(vUv.y * 11.0 + sin(vUv.x * 3.0 + time * 0.15) * 1.5 + time * 0.1);
            l = shafts * exp(-r * 1.6) * 0.28 + bands * smoothstep(0.75, 0.1, vUv.y) * 0.1;
          } else if (m == 3) {
            // Bloom: a high, even, slowly breathing glow from above.
            l = (exp(-r * 2.2) * 0.3 + smoothstep(0.4, 1.0, vUv.y) * 0.12) * (0.88 + 0.12 * sin(time * 0.6));
          } else if (m == 4) {
            // A break in storm clouds: one shaft slanting down from the source, sweeping slowly.
            float a = atan(p.y, p.x);
            float aim = -1.72 + 0.1 * sin(time * 0.25);
            float shaft = exp(-pow((a - aim) / 0.14, 2.0)) + 0.5 * exp(-pow((a - aim - 0.26) / 0.06, 2.0));
            l = shaft * exp(-r * 1.4) * 0.34 * (0.8 + 0.2 * sin(time * 0.4)) + exp(-r * 9.0) * 0.25;
          } else if (m == 5) {
            // A magic aura: a glow pulsing around the source, with a ring breathing out.
            float pulse = 0.75 + 0.25 * sin(time * 2.2);
            float ring = exp(-pow((r - 0.2 - 0.04 * sin(time * 1.1)) / 0.03, 2.0));
            l = (exp(-r * 4.5) * 0.45 + ring * 0.12) * pulse * flicker(time * 0.3);
          } else if (m == 6) {
            // A cold rim: a faint wash from the source's side that shifts slowly.
            l = exp(-r * 2.0) * 0.22 * (0.9 + 0.1 * sin(time * 0.35));
          } else if (m == 7) {
            // Firelight from below: a flickering glow that rises and fades upward.
            l = exp(-r * 4.0) * 0.4 * flicker(time) + smoothstep(0.45, 0.0, vUv.y) * 0.07 * flicker(time + 3.0);
          } else if (m == 8) {
            // Torchlight: a tight flickering pool at the source's torch and at one across from it.
            // Night scenes: a broad glow would wash the dark out, so the light stays at the flames.
            float q = length(vUv - vec2(1.0 - source.x, source.y));
            l = (exp(-r * 8.0) * 0.32 + exp(-r * 22.0) * 0.3) * flicker(time) + (exp(-q * 9.0) * 0.22 + exp(-q * 24.0) * 0.2) * flicker(time + 11.0);
          } else if (m == 9) {
            // Lightning: a double flash every few seconds, washing the scene from the source.
            float t = mod(time, 3.7);
            float flash = exp(-t * 14.0) + 0.7 * step(0.16, t) * exp(-(t - 0.16) * 10.0);
            l = flash * (0.32 + exp(-r * 2.0) * 0.5) + exp(-r * 3.0) * 0.05;
          } else if (m == 10) {
            // Moonbeams: slow, faint rays and a halo round the moon.
            float beams = rays(p, 11.0, 19.0, 0.5) * exp(-r * 2.0) * smoothstep(0.03, 0.15, r);
            l = beams * 0.2 + exp(-r * r * 90.0) * 0.4 + exp(-r * 6.0) * 0.12;
          } else {
            // Candlelight: small warm pools at the source's candles and at a second stand across
            // the room, each flickering on its own.
            float q = length(vUv - vec2(1.0 - source.x, source.y));
            l = (exp(-r * 9.0) * 0.26 + exp(-r * 26.0) * 0.3) * flicker(time * 0.8) + (exp(-q * 9.0) * 0.2 + exp(-q * 26.0) * 0.24) * flicker(time * 0.8 + 5.0);
          }
          gl_FragColor = vec4(glow * l * strength, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    return new THREE.Mesh(QUAD, mat);
  }

  /** Particles of the look's kind, drifting through the art: soft motes that twinkle. */
  private motes(kind: ParticleKind, count: number, size: number): THREE.Points {
    const motion: Record<ParticleKind, [number, number, number]> = {
      // Drift x, drift y (art fractions a second), wobble.
      dust: [0.006, 0.01, 0.02],
      'gold-dust': [0.004, 0.012, 0.02],
      petals: [0.05, -0.03, 0.04],
      leaves: [0.02, -0.04, 0.05],
      embers: [0.01, 0.06, 0.03],
      sparks: [0.0, 0.12, 0.02],
      ash: [0.01, -0.015, 0.03],
      drizzle: [0.02, -0.5, 0.0],
      rain: [0.05, -0.9, 0.0],
    };
    const rain = kind === 'rain' || kind === 'drizzle';
    const seeds = new Float32Array(count * 4);
    let s = 1234567 + count;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count * 4; i++) seeds[i] = rand();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const u = {
      time: { value: 0 },
      strength: { value: 1 },
      scale: { value: 1 },
      colour: { value: new THREE.Color(this.look.mote) },
      drift: { value: new THREE.Vector3(...motion[kind]) },
      // Rain falls as thin streaks (three times a mote's size, so a streak is long enough to read);
      // everything else is a soft round mote.
      size: { value: rain ? size * 3 : size },
      streak: { value: rain ? 1 : 0 },
    };
    this.uniforms.push(u);
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float time, scale, size;
        uniform vec3 drift;
        varying float vTwinkle;
        void main() {
          float t = time * (0.6 + seed.z * 0.8);
          vec2 p = fract(seed.xy + drift.xy * t + drift.z * vec2(sin(t * 0.9 + seed.w * 6.28), cos(t * 0.7 + seed.z * 6.28)));
          vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(time * (1.2 + seed.w * 2.0) + seed.x * 40.0), 2.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p - 0.5, 0.0, 1.0);
          gl_PointSize = size * (3.0 + seed.w * 6.0) * scale;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 colour;
        uniform float strength, streak;
        varying float vTwinkle;
        void main() {
          vec2 c = (gl_PointCoord - 0.5) * 2.0;
          float d = streak > 0.5 ? length(c * vec2(9.0, 1.0)) : length(c);
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(colour * a * a * vTwinkle * 0.55 * strength, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  /** A glint that sweeps along the weapon every few seconds: only over bright, grey metal. */
  private glintMesh(character: THREE.Texture, line: [number, number][]): THREE.Mesh {
    const [a, b] = [line[0], line[line.length - 1]];
    const u = {
      time: { value: 0 },
      strength: { value: 1 },
      map: { value: character },
      from: { value: new THREE.Vector2(a[0], 1 - a[1]) },
      to: { value: new THREE.Vector2(b[0], 1 - b[1]) },
    };
    this.uniforms.push(u);
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float time, strength;
        uniform vec2 from, to;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          vec2 ab = to - from;
          float t = clamp(dot(vUv - from, ab) / dot(ab, ab), -0.2, 1.2);
          float d = length(vUv - from - ab * clamp(t, 0.0, 1.0));
          // One sweep from hilt to tip over 0.9 s, every 4.5 s.
          float phase = mod(time, 4.5) / 0.9 * 1.4 - 0.2;
          float band = exp(-pow((t - phase) / 0.07, 2.0));
          float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
          float metal = smoothstep(0.35, 0.75, luma) * (1.0 - smoothstep(0.12, 0.3, sat));
          float g = band * smoothstep(0.03, 0.006, d) * metal * c.a;
          // A star at the head of the sweep while it is on the blade.
          vec2 head = from + ab * clamp(phase, 0.0, 1.0);
          float onBlade = step(0.0, phase) * step(phase, 1.0);
          vec2 q = (vUv - head) * vec2(1.0, 1.0);
          float star = onBlade * (exp(-dot(q, q) * 9000.0) + 0.5 * exp(-abs(q.x) * 900.0 - abs(q.y) * 60.0) + 0.5 * exp(-abs(q.y) * 900.0 - abs(q.x) * 60.0));
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.86) * (g * 1.4 + star * 0.9) * strength, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    return new THREE.Mesh(QUAD, mat);
  }

  /** The hover clip, if the card has one: a muted video over the whole art, faded in on hover. */
  private async loadClip(url: string): Promise<void> {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    const ok = await new Promise<boolean>((resolve) => {
      video.addEventListener('loadeddata', () => resolve(true), { once: true });
      video.addEventListener('error', () => resolve(false), { once: true });
      video.src = url;
    });
    this.loaded[url.slice(url.lastIndexOf('/') + 1)] = ok;
    if (!ok) return;
    this.video = video;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.clipMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(QUAD, this.clipMat);
    mesh.scale.setScalar(1.03);
    this.add(mesh, DEPTH.clip, 7);
  }

  get hasClip(): boolean {
    return this.video !== null;
  }

  /** The clip's state, for the checks. */
  clipState(): { has: boolean; mix: number; time: number; playing: boolean } {
    const v = this.video;
    return { has: !!v, mix: this.clipMix, time: v?.currentTime ?? 0, playing: !!v && !v.paused && !v.ended };
  }

  /** Hovering fades the clip in and plays it once, holding its last frame; leaving fades it out and rewinds it. */
  hover(on: boolean): void {
    if (on === this.hovered) return;
    this.hovered = on;
    if (on && !this.video && this.clipUrl && !this.clipLoading) {
      // A lazy stage fetches its clip now, and plays it if the pointer is still there.
      this.clipLoading = true;
      void this.loadClip(this.clipUrl).then(() => {
        if (this.hovered && this.video) {
          this.video.currentTime = this.params.clipStart;
          void this.video.play().catch(() => {});
        }
      });
    }
    const v = this.video;
    if (on && v) {
      v.currentTime = this.params.clipStart;
      void v.play().catch(() => {});
    }
  }

  /** Puts the clip at `seconds`, paused (for captures that step time by hand). */
  seekClip(seconds: number): void {
    if (!this.video) return;
    this.video.pause();
    this.video.currentTime = seconds;
  }

  /** Advances the art to `time` (seconds) for a card tilted by `tilt` (each axis -1 to 1). */
  update(time: number, dt: number, tilt: THREE.Vector2): void {
    const p = this.params;
    for (const { obj, depth } of this.movers) {
      if (depth === DEPTH.plate) continue;
      obj.position.set(tilt.x * (depth - PIVOT) * p.spread, tilt.y * (depth - PIVOT) * p.spread, 0);
    }
    if (this.plateMat) {
      this.plateMat.uniforms.shift.value.set(tilt.x * p.spread, tilt.y * p.spread);
      this.plateMat.uniforms.bend.value = p.depth;
    }
    for (const u of this.uniforms) {
      u.time.value = time;
      u.strength.value = p.light * this.lightScale;
      if (u.scale) u.scale.value = this.target.width / 1024;
    }
    const goal = this.hovered && this.video ? 1 : 0;
    const step = dt / Math.max(0.05, p.crossfade);
    this.clipMix = goal > this.clipMix ? Math.min(goal, this.clipMix + step) : Math.max(goal, this.clipMix - step);
    if (this.clipMat) this.clipMat.opacity = this.clipMix;
    // Once it has faded out, the clip waits rewound for the next hover: whether it was still
    // playing, or had already played to its end and stopped there.
    if (!this.hovered && this.clipMix === 0 && this.video && (!this.video.paused || this.video.currentTime !== p.clipStart)) {
      this.video.pause();
      this.video.currentTime = p.clipStart;
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }

  resize(size: number): void {
    if (size !== this.target.width) this.target.setSize(size, size);
  }

  dispose(): void {
    this.target.dispose();
    this.video?.pause();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
  }
}
