import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { isLiquid } from '../map/surface';
import type { MapFile, Tile } from '../map/types';
import type { Backdrop } from './Backdrop';
import {
  blendLooks, ease, EASE_SECONDS, lightningAt, LOOKS, loopSpeed, SNOW_SETTLE_SECONDS, WEATHER_LOOP, type WeatherKind, type WeatherLook,
} from './weather';

/** Drops, flakes and splashes at full strength; a lighter weather shows a share of them. */
const RAIN_DROPS = 1800;
const SNOWFLAKES = 1400;
const SPLASHES = 420;
/** Rain and snow fill the board and a margin around it, from above the tallest column to below the diorama's base. */
const MARGIN = 4;
const TOP = 9;
const BOTTOM = -2.5;
/** Fall speeds (units/s, adjusted so each loops in WEATHER_LOOP), a drop's length, and how far wind slants it per unit fallen. */
const RAIN_SPEED = 14;
const SNOW_SPEED = 1.6;
/**
 * Each flake falls through its own band this tall, at its own height, and wraps: snow is
 * slow, and a flake falling the whole volume couldn't loop in WEATHER_LOOP at snow speed.
 */
const SNOW_BAND = 5.5;
const DROP_LENGTH = 0.55;
const SLANT = 0.09;
/** Each splash shows for this share of its half-second cycle. */
const SPLASH_CYCLE = 0.5;
/** Mist layers: heights just above the first few steps, so it pools in the low ground. */
const MIST_LAYERS = [0.55, 1.05, 1.55];
/** Wind blows the same way the plants lean (see SpriteField). */
const WIND_DIR = new THREE.Vector2(1, 0.35).normalize();

const RAIN_COLOR = new THREE.Color('#a9c2da');
const SNOW_COLOR = new THREE.Color('#f4f8fc');
const SPLASH_COLOR = new THREE.Color('#d2e4f0');

/** The bits of the scene weather acts on. */
export interface WeatherTargets {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  backdrop: Backdrop;
  /** Colour of mist and distance haze for this theme's light. */
  fogColor: THREE.Color;
  /** How bright the theme's daylight is (1 = full day); rain and snow dim to match a dusk or night map. */
  daylight: number;
}

/** What weather needs from the board in play. */
export interface WeatherBoard {
  map: MapFile;
  surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3;
  /** Called with how wet the ground is and how much snow has settled (0-1); snow buries flowers and grass. */
  setGround: (wet: number, snow: number) => void;
  /** Called with the wind strength (1 = a breeze). */
  setWind: (wind: number) => void;
}

/**
 * Rain, storms, snow and fog over the board: falling pixel streaks and flakes, splashes and
 * rings, drifting low mist and lightning, with the light, sky, wind and ground changed to
 * match. A change of weather eases in over a couple of seconds (snow settles slower).
 * Every motion loops in WEATHER_LOOP seconds.
 */
export class WeatherLayer {
  readonly group = new THREE.Group();
  private current: WeatherKind = 'clear';
  private from: WeatherLook = LOOKS.clear;
  private changedAt = 0;
  private now = 0;
  private shown: WeatherLook = LOOKS.clear;
  private board: WeatherBoard | null = null;
  private readonly base: { sky: number; sun: number; skyColor: THREE.Color; ground: THREE.Color; sunColor: THREE.Color };
  private readonly time = { value: 0 };
  private readonly rain: THREE.ShaderMaterial;
  private readonly snow: THREE.ShaderMaterial;
  private readonly splash: THREE.ShaderMaterial;
  private readonly mist: THREE.ShaderMaterial;
  /** Rebuilt for each board; freed when the board changes. */
  private boardObjects: THREE.Object3D[] = [];
  private readonly noise: THREE.DataTexture;

  constructor(private readonly targets: WeatherTargets) {
    this.base = {
      sky: targets.hemi.intensity,
      sun: targets.sun.intensity,
      skyColor: targets.hemi.color.clone(),
      ground: targets.hemi.groundColor.clone(),
      sunColor: targets.sun.color.clone(),
    };
    const wind = new THREE.Vector2();
    const dim = 0.4 + 0.6 * Math.min(1, targets.daylight);
    this.rain = fallMaterial(this.time, RAIN_COLOR.clone().multiplyScalar(dim), wind, true);
    this.snow = fallMaterial(this.time, SNOW_COLOR.clone().multiplyScalar(dim), wind, false);
    this.splash = splashMaterial(this.time);
    this.noise = noiseTexture();
    this.mist = mistMaterial(this.noise, targets.fogColor);
  }

  get kind(): WeatherKind {
    return this.current;
  }

  /** The look on screen right now, partway through any change. */
  get look(): WeatherLook {
    return this.shown;
  }

  /** Switches to a weather, easing over from the current look (or at once). */
  set(kind: WeatherKind, instant = false): void {
    this.from = instant ? LOOKS[kind] : this.shown;
    this.current = kind;
    this.changedAt = this.now;
    this.apply();
  }

  /** Builds the rain, snow, splashes and mist for a board, freeing the previous board's. */
  setBoard(board: WeatherBoard): void {
    for (const object of this.boardObjects) {
      this.group.remove(object);
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) object.geometry.dispose();
    }
    this.board = board;
    const { map } = board;
    const half = Math.max(map.width, map.height) / 2;
    const span = half + MARGIN;
    // The same density of rain and snow on a smaller board.
    const share = (span / (16 + MARGIN)) ** 2;
    const rand = mulberry32(map.seed ^ 0x7a1d);

    // Rain: one segment per drop, its head and its tail; snow: one point per flake.
    const fall = (count: number, ends: number, band: number) => {
      const seeds: number[] = [];
      const end: number[] = [];
      const bottoms: number[] = [];
      for (let i = 0; i < count; i++) {
        const [x, y, z, size] = [(rand() * 2 - 1) * span, BOTTOM + rand() * (TOP - BOTTOM), (rand() * 2 - 1) * span, rand()];
        const bottom = BOTTOM + rand() * (TOP - BOTTOM - band);
        for (let e = 0; e < ends; e++) (seeds.push(x, y, z, i / count, size), end.push(e), bottoms.push(bottom));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(seeds.flatMap((_, k) => (k % 5 === 0 ? [seeds[k], seeds[k + 1], seeds[k + 2]] : [])), 3));
      g.setAttribute('aRank', new THREE.Float32BufferAttribute(seeds.filter((_, k) => k % 5 === 3), 1));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(seeds.filter((_, k) => k % 5 === 4), 1));
      g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
      g.setAttribute('aBottom', new THREE.Float32BufferAttribute(bottoms, 1));
      return g;
    };
    const rain = new THREE.LineSegments(fall(Math.round(RAIN_DROPS * share), 2, TOP - BOTTOM), this.rain);
    const snow = new THREE.Points(fall(Math.round(SNOWFLAKES * share), 1, SNOW_BAND), this.snow);

    // Splashes on dry tops and rings on water, at random spots on the board.
    const land = map.tiles;
    const splashPos: number[] = [];
    const splashInfo: number[] = [];
    for (let i = 0; i < SPLASHES; i++) {
      const tile = land[Math.floor(rand() * land.length)];
      const p = board.surfacePoint(tile, 0.1 + 0.8 * rand(), 0.1 + 0.8 * rand());
      splashPos.push(p.x, p.y + 0.02, p.z);
      splashInfo.push(i / SPLASHES, rand(), isLiquid(tile) ? 1 : 0);
    }
    const splashGeometry = new THREE.BufferGeometry();
    splashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(splashPos, 3));
    splashGeometry.setAttribute('aInfo', new THREE.Float32BufferAttribute(splashInfo, 3));
    const splashes = new THREE.Points(splashGeometry, this.splash);

    // Mist: flat layers over the board just above the low steps, so higher ground rises out of it.
    const mists = MIST_LAYERS.map((y, k) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * half, 2 * half), this.mist.clone());
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = y;
      (plane.material as THREE.ShaderMaterial).uniforms.uLayer.value = k;
      (plane.material as THREE.ShaderMaterial).uniforms.uHalf.value = half;
      return plane;
    });

    for (const object of [rain, snow, splashes, ...mists]) object.frustumCulled = false;
    this.boardObjects = [rain, snow, splashes, ...mists];
    this.group.add(...this.boardObjects);
    this.rain.uniforms.uSpeed.value = loopSpeed(RAIN_SPEED, TOP - BOTTOM);
    this.snow.uniforms.uSpeed.value = loopSpeed(SNOW_SPEED, SNOW_BAND);
    this.apply();
  }

  update(elapsed: number): void {
    this.now = elapsed;
    this.time.value = elapsed;
    this.apply();
  }

  /** Works out the look for this moment and pushes it to everything weather touches. */
  private apply(): void {
    const target = LOOKS[this.current];
    const since = this.now - this.changedAt;
    const look = blendLooks(this.from, target, ease(since, EASE_SECONDS));
    look.snowCover = this.from.snowCover + (target.snowCover - this.from.snowCover) * ease(since, SNOW_SETTLE_SECONDS);
    this.shown = look;

    const flash = look.lightning * lightningAt(this.now);
    // Lightning washes the storm's blue-grey out to white for a moment.
    const tint = new THREE.Color(...look.tint).lerp(new THREE.Color(1, 1, 1), flash);
    const { hemi, sun, backdrop, fogColor } = this.targets;
    hemi.intensity = this.base.sky * (look.sky + 1.6 * flash);
    hemi.color.copy(this.base.skyColor).multiply(tint);
    hemi.groundColor.copy(this.base.ground).multiply(tint);
    sun.intensity = this.base.sun * (look.sun + 0.8 * flash);
    sun.color.copy(this.base.sunColor).multiply(tint);
    backdrop.setWeather(tint.clone().multiplyScalar(look.sky), fogColor, look.haze, flash);

    const windVec = WIND_DIR.clone().multiplyScalar(SLANT * look.wind);
    for (const [material, amount] of [[this.rain, look.rain], [this.snow, look.snow]] as const) {
      material.uniforms.uAmount.value = amount;
      material.uniforms.uWind.value.copy(windVec);
    }
    this.rain.uniforms.uLength.value = DROP_LENGTH * (0.8 + 0.2 * look.wind);
    this.splash.uniforms.uAmount.value = look.rain;
    for (const object of this.boardObjects) {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial && 'uMist' in object.material.uniforms) {
        object.material.uniforms.uMist.value = look.mist;
        object.material.uniforms.uTime.value = this.now;
      }
    }
    this.board?.setGround(look.wet, look.snowCover);
    this.board?.setWind(look.wind);
  }
}

/** Rain (segments: head and slanted tail) or snow (points that swirl as they fall). */
function fallMaterial(time: { value: number }, color: THREE.Color, wind: THREE.Vector2, rain: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: time, uAmount: { value: 0 }, uSpeed: { value: 1 }, uHeight: { value: rain ? TOP - BOTTOM : SNOW_BAND },
      uWind: { value: wind.clone() }, uLength: { value: DROP_LENGTH }, uColor: { value: color },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uAmount, uSpeed, uHeight, uLength;
      uniform vec2 uWind;
      attribute float aRank, aSize, aEnd, aBottom;
      void main() {
        if (aRank >= uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float y = aBottom + mod(position.y - aBottom - uSpeed * uTime, uHeight);
        vec3 p = vec3(position.x, y, position.z);
        // Blown downwind as it falls; the drop's tail trails up and upwind.
        p.xz += uWind * (aBottom + uHeight - y);
        ${rain ? 'p += aEnd * uLength * vec3(-uWind.x, 1.0, -uWind.y);' : 'p.x += 0.22 * sin(6.2831853 * (uTime / 2.0 + aSize)); p.z += 0.22 * cos(6.2831853 * (uTime / 4.0 + aSize));'}
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize < 0.35 ? 2.0 : 1.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Rain hitting the board: a little crown on dry ground, a ring on water, each for a moment of a half-second cycle. */
function splashMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uAmount: { value: 0 }, uColor: { value: SPLASH_COLOR } },
    vertexShader: /* glsl */ `
      uniform float uTime, uAmount;
      attribute vec3 aInfo;
      varying float vWater;
      varying float vAge;
      void main() {
        vAge = fract(uTime / ${SPLASH_CYCLE.toFixed(2)} + aInfo.y);
        if (aInfo.x >= uAmount || vAge > 0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vWater = aInfo.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        gl_PointSize = aInfo.z > 0.5 ? 5.0 : 3.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vWater;
      varying float vAge;
      void main() {
        vec2 c = floor(gl_PointCoord * (vWater > 0.5 ? 5.0 : 3.0));
        bool on;
        if (vWater > 0.5) {
          // A ring three pixels tall, widening as it ages.
          on = (c.y == 1.0 || c.y == 3.0) ? (c.x >= 1.0 && c.x <= 3.0) : (c.y == 2.0 && (c.x == 0.0 || c.x == 4.0 || vAge < 0.1));
        } else {
          // A crown: two droplets thrown up beside the strike.
          on = (c.y == 2.0 && c.x == 1.0) || (c.y == 1.0 && (c.x == 0.0 || c.x == 2.0) && vAge > 0.1);
        }
        if (!on) discard;
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * One layer of low mist: tileable noise drifting with the wind, drawn see-through in a few
 * flat steps of opacity (soft banks with crisp edges, not a dither grid, which read as
 * noise). Two copies of the pattern half a loop apart cross-fade, so the drift loops
 * seamlessly; it thins toward the board's edges.
 */
function mistMaterial(noise: THREE.Texture, color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMist: { value: 0 }, uLayer: { value: 0 }, uHalf: { value: 16 }, uNoise: { value: noise }, uColor: { value: color } },
    depthWrite: false,
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vXZ = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uMist, uLayer, uHalf;
      uniform sampler2D uNoise;
      uniform vec3 uColor;
      varying vec2 vXZ;
      void main() {
        if (uMist <= 0.0) discard;
        vec2 drift = vec2(${WIND_DIR.x.toFixed(3)}, ${WIND_DIR.y.toFixed(3)}) * 1.0;
        float a = fract(uTime / ${WEATHER_LOOP.toFixed(1)});
        float b = fract(a + 0.5);
        float w = 1.0 - abs(1.0 - 2.0 * a);
        vec2 p = vXZ / 9.0 + vec2(uLayer * 0.37, uLayer * 0.61);
        float n = w * texture2D(uNoise, p - drift * a / 9.0 * 4.0).r + (1.0 - w) * texture2D(uNoise, p + 0.5 - drift * b / 9.0 * 4.0).r;
        float edge = clamp((uHalf - max(abs(vXZ.x), abs(vXZ.y))) / 2.5, 0.0, 1.0);
        float density = (n - 0.35 + 0.35 * uMist) * uMist * edge * (1.0 - uLayer * 0.25);
        // Three flat steps of opacity: thin, middling and thick mist.
        float alpha = floor(clamp(density, 0.0, 1.0) * 3.0) / 3.0 * 0.55;
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A tileable 64x64 value-noise texture (red channel), for the mist. */
function noiseTexture(): THREE.DataTexture {
  const size = 64;
  const cells = 8;
  const rand = mulberry32(0x6157);
  const lattice = Array.from({ length: cells * cells }, () => rand());
  const at = (x: number, y: number) => lattice[((y + cells) % cells) * cells + ((x + cells) % cells)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
      const [tx, ty] = [smooth(fx - x0), smooth(fy - y0)];
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      data.set([Math.round((top + (bottom - top) * ty) * 255), 0, 0, 255], (y * size + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

