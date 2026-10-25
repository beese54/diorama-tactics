import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { isLiquid } from '../map/surface';
import type { MapFile, Tile } from '../map/types';
import { WEATHER_LOOP, type WeatherLook } from './weather';

/** Fireflies over a full-size board on a clear night; smaller boards get fewer. */
const FIREFLIES = 80;
/** Ground fireflies like: meadows, fields, marsh and the edges of woods and water. */
const FIREFLY_GROUND = new Set(['meadow', 'plains', 'marsh', 'swamp', 'light_woods', 'forest', 'farmland', 'jungle_floor']);
/** Puffs of smoke in the air above each chimney at once, how high they climb (units) and how far the wind carries them. */
const PUFFS = 6;
const SMOKE_RISE = 1.4;
const SMOKE_DRIFT = 0.9;
/** Share of cottages with a lit hearth. */
const CHIMNEY_SHARE = 0.6;
/** Wind blows the same way the plants lean (see SpriteField). */
const WIND_DIR = new THREE.Vector2(1, 0.35).normalize();

/**
 * Life on the board that changes with the hour: fireflies drifting and blinking over
 * meadows, marsh and woods at night (none in rain or snow), and smoke curling up from
 * cottage chimneys and drifting downwind, day and night. Every motion loops in WEATHER_LOOP
 * seconds, like the water and the weather.
 */
export class AmbienceLayer {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly fireflies: THREE.ShaderMaterial;
  private readonly smoke: THREE.ShaderMaterial;
  private readonly chimneys: THREE.ShaderMaterial;
  private objects: THREE.Object3D[] = [];
  /** How many fireflies and chimneys the current board has (for checks). */
  fireflyCount = 0;
  chimneyCount = 0;

  constructor() {
    this.fireflies = fireflyMaterial(this.time);
    this.smoke = smokeMaterial(this.time);
    this.chimneys = chimneyMaterial();
  }

  setBoard(map: MapFile, surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3): void {
    for (const object of this.objects) {
      this.group.remove(object);
      if (object instanceof THREE.Points) object.geometry.dispose();
    }
    const rand = mulberry32(map.seed ^ 0xf1ef);
    const share = (Math.max(map.width, map.height) / 32) ** 2;

    const homes = map.tiles.filter((t) => FIREFLY_GROUND.has(t.terrain) && !isLiquid(t));
    const flies: number[] = [];
    const flyInfo: number[] = [];
    for (let i = 0; homes.length && i < Math.round(FIREFLIES * share); i++) {
      const p = surfacePoint(homes[Math.floor(rand() * homes.length)], rand(), rand());
      flies.push(p.x, p.y + 0.25 + 0.6 * rand(), p.z);
      flyInfo.push(i / FIREFLIES, rand(), rand());
    }
    const fliesGeometry = new THREE.BufferGeometry();
    fliesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(flies, 3));
    fliesGeometry.setAttribute('aInfo', new THREE.Float32BufferAttribute(flyInfo, 3));
    this.fireflyCount = flies.length / 3;

    // A chimney on the back corner of some cottages' roofs, and the smoke above it.
    const roofs = map.tiles.filter((t) => t.terrain === 'house_thatch' || t.terrain === 'house_tile');
    const stacks: number[] = [];
    const puffs: number[] = [];
    const puffInfo: number[] = [];
    for (const roof of roofs) {
      if (rand() >= CHIMNEY_SHARE) continue;
      const p = surfacePoint(roof, 0.3, 0.3);
      // Stands on the roof, not half sunk in it.
      stacks.push(p.x, p.y + 0.12, p.z);
      const phase = rand();
      for (let k = 0; k < PUFFS; k++) {
        puffs.push(p.x, p.y + 0.3, p.z);
        puffInfo.push(k / PUFFS, phase);
      }
    }
    const stackGeometry = new THREE.BufferGeometry();
    stackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stacks, 3));
    const puffGeometry = new THREE.BufferGeometry();
    puffGeometry.setAttribute('position', new THREE.Float32BufferAttribute(puffs, 3));
    puffGeometry.setAttribute('aInfo', new THREE.Float32BufferAttribute(puffInfo, 2));
    this.chimneyCount = stacks.length / 3;

    this.objects = [new THREE.Points(fliesGeometry, this.fireflies), new THREE.Points(stackGeometry, this.chimneys), new THREE.Points(puffGeometry, this.smoke)];
    for (const object of this.objects) object.frustumCulled = false;
    this.group.add(...this.objects);
  }

  /** `night` 0 (day) to 1 (full night); fireflies hide from rain and snow; smoke drifts with the wind. */
  update(elapsed: number, night: number, weather: WeatherLook): void {
    this.time.value = elapsed;
    const shelter = 1 - Math.min(1, 2 * (weather.rain + weather.snow) + weather.mist);
    this.fireflies.uniforms.uAmount.value = Math.max(0, (night - 0.4) / 0.6) * shelter;
    this.smoke.uniforms.uWind.value.copy(WIND_DIR).multiplyScalar(SMOKE_DRIFT * (0.6 + 0.4 * weather.wind));
    // Smoke is pale by day and a dim grey-blue under the moon.
    this.smoke.uniforms.uColor.value.setRGB(0.74, 0.74, 0.73).lerp(new THREE.Color(0.32, 0.34, 0.42), night);
  }
}

/** Fireflies: single yellow-green pixels that wander in small loops and pulse on and off. */
function fireflyMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uAmount: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uAmount;
      attribute vec3 aInfo;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float a = 6.2831853 * (uTime / ${WEATHER_LOOP.toFixed(1)} + aInfo.y);
        p.x += 0.25 * sin(a);
        p.z += 0.25 * cos(a * 2.0 + aInfo.z * 6.28);
        p.y += 0.08 * sin(a * 4.0);
        // Each blinks on for part of a two-second beat.
        vGlow = step(fract(uTime / 2.0 + aInfo.z), 0.55);
        if (aInfo.x >= uAmount || vGlow < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        gl_PointSize = aInfo.z < 0.2 ? 2.0 : 1.0;
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        gl_FragColor = vec4(0.88, 1.0, 0.5, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A chimney stack: a 2x4 px brick block standing on the roof, its cap dark. */
function chimneyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        gl_PointSize = 4.0;
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        vec2 c = floor(gl_PointCoord * 4.0);
        if (c.x < 0.5 || c.x > 2.5) discard;
        gl_FragColor = vec4(c.y < 0.5 ? vec3(0.25, 0.2, 0.18) : vec3(0.5, 0.3, 0.24), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Smoke: puffs leave the chimney one after another, rise, swell and drift downwind, and fade
 * in two flat steps of see-through grey, so they stay crisp pixel art.
 */
function smokeMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time, uWind: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uWind;
      attribute vec2 aInfo;
      varying float vAge;
      void main() {
        vAge = fract(uTime / ${WEATHER_LOOP.toFixed(1)} + aInfo.x + aInfo.y);
        vec3 p = position + vec3(uWind.x * vAge * vAge, ${SMOKE_RISE.toFixed(2)} * vAge, uWind.y * vAge * vAge);
        p.x += 0.06 * sin(vAge * 12.0 + aInfo.y * 6.28);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        gl_PointSize = floor(3.0 + 5.0 * vAge);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAge;
      void main() {
        // A rounded puff: drop the corners.
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        if (dot(c, c) > 1.1) discard;
        gl_FragColor = vec4(uColor, vAge < 0.55 ? 0.78 : 0.45);
        #include <colorspace_fragment>
      }
    `,
  });
}
