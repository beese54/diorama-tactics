import * as THREE from 'three';
import { addSkyShadow, skyShadow } from './skyShadow';

/** Pixels per world unit: sprites keep one texel per ground texel. */
const PX = 16;

/** Wind: direction (world xz), a wave that travels with it, slower gusts, and a per-sprite flutter. All periods divide 4 s, so the motion loops. */
const WIND_DIR = new THREE.Vector2(1, 0.35).normalize();
const WIND_PERIOD = 2;
const WIND_WAVELENGTH = 7;
const GUST_PERIOD = 4;
const GUST_WAVELENGTH = 16;
const FLUTTER_PERIOD = 1;

export interface SpriteRect {
  /** UV rectangle in the sheet (v0 = bottom). */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Size in px. */
  w: number;
  h: number;
  /** Optional animation: frames laid side by side, `stride` apart in u, played at `fps`. */
  frames?: number;
  fps?: number;
  stride?: number;
}

export interface SpriteInstance {
  /** World point the sprite stands on (bottom centre). */
  root: THREE.Vector3;
  rect: SpriteRect;
  /** How far the top leans at full gust, in world units; 0 = rigid. */
  sway: number;
  /** Flutter phase in [0, 1). */
  phase: number;
}

const f = (n: number) => n.toFixed(5);

/** Steps the sprite through its animation frames; each sprite starts at its own phase. */
const FRAME_VERTEX = /* glsl */ `
  #include <uv_vertex>
  float frameShift = frameStride * floor(mod(uTime * frameRate + phase * frameCount, max(frameCount, 1.0)));
  #ifdef USE_MAP
    vMapUv.x += frameShift;
  #endif
  #ifdef USE_EMISSIVEMAP
    vEmissiveMapUv.x += frameShift;
  #endif
`;

/**
 * Snow on a sprite. Counting down from a top edge (a pixel with empty sheet above: a crown,
 * a tier of branches, a rock's back), each column of the sprite takes a cap of snow 2 to 4
 * pixels deep, its depth rolling across the columns so the cap's lower edge is a soft wave: a bright top row,
 * plain snow, and a blue shadow along the underside. The cap deepens with the cover.
 * Works on any sprite, since it reads only the sheet's alpha.
 */
const SNOW_CAP_FRAGMENT = /* glsl */ `
  #include <map_fragment>
  if (uSnowCap > 0.0 && diffuseColor.a > 0.5) {
    // Rows of sprite above this pixel before the edge (0 = this pixel is the top).
    float rows = 4.0;
    for (int k = 4; k >= 1; k--) if (texture2D(map, vMapUv + vec2(0.0, float(k) * uTexel.y)).a < 0.5) rows = float(k - 1);
    // The cap's depth rolls gently from column to column, so its underside is a soft wave.
    float column = floor(vMapUv.x / uTexel.x);
    float wave = 0.5 + 0.5 * sin(column * 1.1 + 2.0 * sin(column * 0.37));
    float depth = floor(uSnowCap * (2.6 + 2.0 * wave));
    if (rows < depth) {
      diffuseColor.rgb = rows < 0.5 ? vec3(0.97, 0.98, 1.0) : rows + 1.0 >= depth ? vec3(0.74, 0.8, 0.9) : vec3(0.9, 0.93, 0.97);
    }
  }
`;

/**
 * Upright billboard (turns to face the camera, stays vertical), then leans with the wind:
 * the top bends most, a wave of lean travels across the field, gusts swell and fade, and
 * each sprite flutters a little on its own phase.
 */
const SWAY_VERTEX = /* glsl */ `
  vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec2 windDir = vec2(${f(WIND_DIR.x)}, ${f(WIND_DIR.y)});
  float along = dot(position.xz, windDir);
  float bend = corner.y / max(spriteHeight, 0.0001);
  bend *= bend;
  float wave = 0.5 + 0.5 * sin(6.2831853 * (uTime / ${f(WIND_PERIOD)} - along / ${f(WIND_WAVELENGTH)}));
  float gust = 0.6 + 0.4 * sin(6.2831853 * (uTime / ${f(GUST_PERIOD)} - along / ${f(GUST_WAVELENGTH)}));
  float flutter = sin(6.2831853 * (uTime / ${f(FLUTTER_PERIOD)} + phase));
  float sway = swayAmount * uWind * bend * (gust * wave + 0.25 * flutter);
  vec3 transformed = position + camRight * corner.x + vec3(0.0, corner.y, 0.0);
  transformed.xz += windDir * sway;
  // Buried (under snow): the quad shrinks to its root and draws nothing.
  if (phase < uBury) transformed = position;
`;

/**
 * Many camera-facing pixel sprites from one sheet in a single draw call: flowers, trees,
 * crates, landmarks. Lit like the ground they stand on; an optional glow sheet makes parts
 * of them (flames, lanterns, screens) emit light.
 */
export class SpriteField {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly time = { value: 0 };
  /** Wind strength: 1 is a breeze; weather turns it up or down. */
  private readonly wind = { value: 1 };
  /** Share of the sprites hidden (by their phase), as snow buries flowers and grass. */
  private readonly bury = { value: 0 };
  /** How much snow lies on the sprites' top edges (0-1). */
  private readonly snowCap = { value: 0 };
  private readonly geometry: THREE.BufferGeometry;

  constructor(sprites: SpriteInstance[], sheet: THREE.Texture, glow?: THREE.Texture) {
    const positions: number[] = [];
    const corners: number[] = [];
    const heights: number[] = [];
    const sways: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const phases: number[] = [];
    const frames: number[] = [];
    const indices: number[] = [];
    sprites.forEach(({ root, rect, sway, phase }, i) => {
      const w = rect.w / PX;
      const h = rect.h / PX;
      const quad: [number, number, number, number][] = [
        [-w / 2, 0, rect.u0, rect.v0],
        [w / 2, 0, rect.u1, rect.v0],
        [w / 2, h, rect.u1, rect.v1],
        [-w / 2, h, rect.u0, rect.v1],
      ];
      for (const [cx, cy, u, v] of quad) {
        positions.push(root.x, root.y, root.z);
        corners.push(cx, cy);
        heights.push(h);
        sways.push(sway);
        uvs.push(u, v);
        normals.push(0, 1, 0); // lit like the ground it stands on
        phases.push(phase);
        frames.push(rect.frames ?? 1, rect.fps ?? 0, rect.stride ?? 0);
      }
      indices.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3);
    });
    this.count = sprites.length;

    const geometry = (this.geometry = new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
    geometry.setAttribute('spriteHeight', new THREE.Float32BufferAttribute(heights, 1));
    geometry.setAttribute('swayAmount', new THREE.Float32BufferAttribute(sways, 1));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute('frameInfo', new THREE.Float32BufferAttribute(frames, 3));
    geometry.setIndex(indices);

    const material = new THREE.MeshLambertMaterial({
      map: sheet,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      ...(glow ? { emissiveMap: glow, emissive: 0xffffff } : {}),
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uWind = this.wind;
      shader.uniforms.uBury = this.bury;
      shader.uniforms.uSnowCap = this.snowCap;
      addSkyShadow(shader, skyShadow);
      const { width, height } = sheet.image as { width: number; height: number };
      shader.uniforms.uTexel = { value: new THREE.Vector2(1 / width, 1 / height) };
      shader.fragmentShader = 'uniform float uSnowCap;\nuniform vec2 uTexel;\n' + shader.fragmentShader.replace('#include <map_fragment>', SNOW_CAP_FRAGMENT);
      shader.vertexShader =
        'uniform float uTime;\nuniform float uWind;\nuniform float uBury;\nattribute vec2 corner;\nattribute float spriteHeight;\nattribute float swayAmount;\nattribute float phase;\n' +
        'attribute vec3 frameInfo;\n#define frameCount frameInfo.x\n#define frameRate frameInfo.y\n#define frameStride frameInfo.z\n' +
        shader.vertexShader.replace('#include <uv_vertex>', FRAME_VERTEX).replace('#include <begin_vertex>', SWAY_VERTEX);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // vertices move in the shader; positions are only the roots
    mesh.receiveShadow = true; // trees and flowers darken in the shadow of a wall or a cliff
    this.group.add(mesh);
  }

  update(elapsed: number): void {
    this.time.value = elapsed;
  }

  /**
   * Moves sprite `i` to stand on `root` showing `rect`, mirrored to face the other way if
   * asked: for sprites that walk about (units), where the props stay put.
   */
  place(i: number, root: THREE.Vector3, rect: SpriteRect, mirrored = false): void {
    const a = this.geometry.attributes;
    const [w, h] = [rect.w / PX, rect.h / PX];
    const [left, right] = mirrored ? [rect.u1, rect.u0] : [rect.u0, rect.u1];
    const quad = [[-w / 2, 0, left, rect.v0], [w / 2, 0, right, rect.v0], [w / 2, h, right, rect.v1], [-w / 2, h, left, rect.v1]];
    quad.forEach(([cx, cy, u, v], k) => {
      const at = 4 * i + k;
      a.position.setXYZ(at, root.x, root.y, root.z);
      a.corner.setXY(at, cx, cy);
      a.spriteHeight.setX(at, h);
      a.uv.setXY(at, u, v);
      // Mirrored or not, the next frame sits one stride to the right in the sheet.
      a.frameInfo.setXYZ(at, rect.frames ?? 1, rect.fps ?? 0, rect.stride ?? 0);
    });
    for (const name of ['position', 'corner', 'spriteHeight', 'uv', 'frameInfo']) a[name].needsUpdate = true;
  }

  setWind(strength: number): void {
    this.wind.value = strength;
  }

  /** Settles snow (0-1) along every top edge of the sprites: branches, crowns, rocks, roofs. */
  setSnowCap(cover: number): void {
    this.snowCap.value = cover;
  }

  /** Hides this share (0-1) of the sprites, the same ones each time. */
  setBury(share: number): void {
    this.bury.value = share;
  }
}
