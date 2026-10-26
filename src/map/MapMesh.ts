import * as THREE from 'three';
import { bridgeOf } from './terrain';
import { buildBridges } from './bridges';
import { addSkyShadow, skyShadow } from '../render/skyShadow';
import { buildTerrainAtlas, type TerrainAtlas } from './textures';
import { TILE_PX, type MapFile, type Tile } from './types';
import { STEP_HEIGHT, surfaceAt } from './surface';
import type { GroundImage } from './ground';
import { LIQUID_FPS, LIQUID_FRAMES } from './liquid';
import { paintWaterfall, type WaterfallImage } from './waterfall';
import { buildColumnRange, tileOrigin, type ColumnData } from './columns';

/**
 * Weather on the tile tops, in place of three's map_fragment. Liquid pixels carry a lower
 * alpha (LIQUID_ALPHA) and are left alone; roofs (ROOF_ALPHA) take snow but never puddles.
 * Everything is worked out per ground pixel (16 per tile), so it stays crisp pixel art.
 * - Wet land darkens and cools.
 * - Puddles: about one flat tile in six holds one, a blob of its own size and place,
 *   its edge wobbled by noise; they spread as the ground gets wetter. Dark sky-blue water,
 *   a light rim on the far side.
 * - Cloud shadows: soft patches of shade drifting downwind by day (they don't loop; they
 *   are slow and broad enough that a jump at a clip's end isn't noticed).
 * - Snow lies in drifts from two octaves of noise, thick in some places and thin or bare
 *   in others, with a dusting of single flakes at its edges; three tones (lit, plain and
 *   blue shadow) from finer noise give it lumps and hollows. Only on tops facing up.
 */
const WEATHER_GROUND = /* glsl */ `
  #include <map_fragment>
  float notLiquid = step(0.984, diffuseColor.a);
  float roof = notLiquid * (1.0 - step(0.994, diffuseColor.a));
  diffuseColor.a = 1.0;
  vec2 px = floor(vWorld.xz * 16.0) / 16.0;
  float fine = wHash(px * 16.0);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.68, 0.72, 0.8), uWet * notLiquid);

  // Cloud shadows.
  float cloud = wNoise(px / 7.0 - vec2(0.94, 0.33) * uTime * 0.05) * 0.7 + wNoise(px / 3.0 + 5.0 - vec2(0.94, 0.33) * uTime * 0.11) * 0.3;
  diffuseColor.rgb *= 1.0 - 0.13 * uCloud * step(0.58, cloud);

  // Puddles.
  vec2 tileId = floor(vWorld.xz);
  float chance = wHash(tileId + 17.0);
  vec2 centre = tileId + 0.25 + 0.5 * vec2(wHash(tileId + 3.1), wHash(tileId + 7.7));
  float radius = (0.16 + 0.26 * wHash(tileId + 11.3)) * smoothstep(0.15, 0.9, uWet);
  float wobble = 0.12 * (wNoise(px * 5.0 + chance * 13.0) - 0.5);
  float d = length((px + 0.5 / 16.0 - centre) * vec2(1.0, 1.25)) + wobble;
  float puddle = step(chance, 0.175) * step(d, radius) * notLiquid * (1.0 - roof) * step(0.92, vUp);
  float rim = puddle * step(radius - 1.5 / 16.0, d) * step(0.0, px.y + 0.5 / 16.0 - centre.y);
  // Dark water reflecting a grey sky, a few lighter glints, and a light rim on the far bank.
  vec3 water = mix(vec3(0.33, 0.41, 0.52), vec3(0.58, 0.66, 0.76), step(0.88, fine));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(water, vec3(0.66, 0.73, 0.8), rim), puddle);

  // Snow.
  float drift = 0.65 * wNoise(px * 0.6 + 4.0) + 0.35 * wNoise(px * 1.9 + 9.0);
  float depth = uSnow * 0.72 - drift;
  float covered = step(0.0, depth) + step(-0.08, depth) * step(fine, 0.35) * (1.0 - step(0.0, depth));
  float settle = min(1.0, covered) * notLiquid * step(0.6, vUp);
  float lump = wNoise(px * 3.2 + 2.0) + 0.15 * (fine - 0.5);
  vec3 snow = lump > 0.6 ? vec3(0.98, 0.99, 1.0) : lump < 0.4 ? vec3(0.7, 0.77, 0.87) : vec3(0.87, 0.91, 0.96);
  diffuseColor.rgb = mix(diffuseColor.rgb, snow, settle);
`;
/** Hash and value noise for WEATHER_GROUND. */
const WEATHER_NOISE = /* glsl */ `
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

/** The board's columns as one geometry, plus the cliff atlas they're textured from. */
export interface MapShape {
  geometry: THREE.BufferGeometry;
  /** Triangle index -> tile index, for picking. */
  triangleTile: Uint32Array;
  atlas: TerrainAtlas;
}

/** Turns built columns into a geometry with one material group per layer (tops, sides, falls), and paints the cliff atlas. */
export function columnShape(data: ColumnData, atlas = buildTerrainAtlas()): MapShape {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  const index = new Uint32Array(data.indices.reduce((n, l) => n + l.length, 0));
  let start = 0;
  data.indices.forEach((layer, material) => {
    index.set(layer, start);
    g.addGroup(start, layer.length, material);
    start += layer.length;
  });
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const triangleTile = new Uint32Array(index.length / 3);
  data.tiles.reduce((at, layer) => (triangleTile.set(layer, at), at + layer.length), 0);
  return { geometry: g, triangleTile, atlas };
}

/** Builds every column on this thread (BoardWorkers builds them on workers). */
export const buildColumns = (map: MapFile): MapShape => columnShape(buildColumnRange(map));

/**
 * The whole map as one merged mesh of stepped columns with rounded edges (see surface.ts),
 * in three draw calls: tile tops sample the map-wide ground image (see ground.ts), whose water
 * animates by swapping frames; cliff faces use the side atlas; and where a river pours over
 * a drop, the face is falling water (see waterfall.ts). Cliff faces fill the gap between a
 * column's edge and its lower neighbour's (or the diorama base at the map edge).
 */
export class MapMesh {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly bridges: THREE.Group;
  private readonly triangleTile: Uint32Array;
  private readonly groundTexture: THREE.DataTexture;
  private readonly glowTexture: THREE.DataTexture | null;
  private readonly fall: WaterfallImage = paintWaterfall();
  private readonly fallTexture: THREE.DataTexture;
  private readonly sides: THREE.MeshLambertMaterial;
  /** Weather on the ground: how wet (0-1) and how much snow has settled (0-1). */
  private readonly wet = { value: 0 };
  private readonly snow = { value: 0 };
  /** How strongly drifting clouds shade the ground (0-1), and the clock they drift by. */
  private readonly cloud = { value: 0 };
  private readonly time = { value: 0 };
  private frame = 0;

  constructor(
    private readonly map: MapFile,
    private readonly ground: GroundImage,
    shape: MapShape = buildColumns(map),
  ) {
    const { geometry, atlas } = shape;
    this.triangleTile = shape.triangleTile;

    const dataTexture = (data: Uint8Array, width = ground.width, height = ground.height) => {
      const tex = new THREE.DataTexture(data, width, height);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    };
    this.groundTexture = dataTexture(ground.frames[0]);
    this.glowTexture = ground.glow && dataTexture(ground.glow[0]);
    this.fallTexture = dataTexture(this.fall.frames[0], this.fall.width, this.fall.height);
    this.fallTexture.wrapS = this.fallTexture.wrapT = THREE.RepeatWrapping;
    // Emissive maps make lava, lit windows and neon glow whatever the lighting.
    const glowing = (glow: THREE.Texture | null) => (glow ? { emissiveMap: glow, emissive: 0xffffff } : {});
    const tops = new THREE.MeshLambertMaterial({ map: this.groundTexture, vertexColors: true, ...glowing(this.glowTexture) });
    tops.onBeforeCompile = (shader) => {
      shader.uniforms.uWet = this.wet;
      shader.uniforms.uSnow = this.snow;
      shader.uniforms.uCloud = this.cloud;
      shader.uniforms.uTime = this.time;
      addSkyShadow(shader, skyShadow);
      shader.vertexShader = 'varying vec3 vWorld;\nvarying float vUp;\n' + shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvUp = objectNormal.y;',
      );
      shader.fragmentShader = 'uniform float uWet;\nuniform float uSnow;\nuniform float uCloud;\nuniform float uTime;\nvarying vec3 vWorld;\nvarying float vUp;\n' + WEATHER_NOISE + shader.fragmentShader.replace('#include <map_fragment>', WEATHER_GROUND);
    };
    this.sides = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, ...glowing(atlas.glow) });
    this.sides.onBeforeCompile = (shader) => addSkyShadow(shader, skyShadow);
    this.mesh = new THREE.Mesh(geometry, [
      tops,
      this.sides,
      new THREE.MeshLambertMaterial({ map: this.fallTexture, vertexColors: true }),
    ]);
    this.bridges = buildBridges(map, (tile) => this.tileOrigin(tile));
    // Columns, walls and bridges cast the sun's shadow and take it.
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.bridges.traverse((o) => (o.castShadow = o.receiveShadow = true));
    this.group.add(this.mesh, this.bridges);
  }

  /** Advances the liquid loop to the frame for `elapsed` seconds. */
  update(elapsed: number): void {
    this.time.value = elapsed;
    const frame = Math.floor(elapsed * LIQUID_FPS) % LIQUID_FRAMES;
    // Until the rest of the loop is painted (just after a board appears), the liquids hold still.
    if (frame === this.frame || !this.ground.frames[frame]) return;
    this.frame = frame;
    this.groundTexture.image.data = this.ground.frames[frame];
    this.groundTexture.needsUpdate = true;
    if (this.glowTexture && this.ground.glow) {
      this.glowTexture.image.data = this.ground.glow[frame];
      this.glowTexture.needsUpdate = true;
    }
    this.fallTexture.image.data = this.fall.frames[frame];
    this.fallTexture.needsUpdate = true;
  }

  /** Cloud shadows drifting over the ground, 0 (none: night or overcast) to 1 (a bright day with clouds about). */
  setClouds(strength: number): void {
    this.cloud.value = strength;
  }

  /** Lit windows (cottages, shopfronts, neon): 0 by day, 1 at night. */
  setNightGlow(strength: number): void {
    this.sides.emissiveIntensity = strength;
  }

  /** Darkens the ground when wet, and settles snow on the tops (never on water). */
  setWeather(wet: number, snow: number): void {
    this.wet.value = wet;
    this.snow.value = snow;
    // Wet cliff faces darken too.
    this.sides.color.setRGB(1 - 0.3 * wet, 1 - 0.27 * wet, 1 - 0.2 * wet);
  }

  /** Index of the liquid frame on screen (for headless checks). */
  get waterFrame(): number {
    return this.frame;
  }

  /** World-space north-west corner of a tile; the map is centred on the origin. */
  tileOrigin(tile: Pick<Tile, 'x' | 'y'>): [number, number] {
    return tileOrigin(this.map, tile);
  }

  tileCenter(tile: Tile): THREE.Vector3 {
    return this.surfacePoint(tile, 0.5, 0.5);
  }

  /** World-space point on a tile's rounded surface at local (u, v) in [0, 1]; on a bridge, its deck. */
  surfacePoint(tile: Tile, u: number, v: number): THREE.Vector3 {
    const [x0, z0] = this.tileOrigin(tile);
    if (bridgeOf(tile)) return new THREE.Vector3(x0 + u, (tile.height + 1) * STEP_HEIGHT + 1 / TILE_PX, z0 + v);
    return new THREE.Vector3(x0 + u, tile.height * STEP_HEIGHT + surfaceAt(this.map, tile, u, v).offset, z0 + v);
  }

  /** The first column or bridge the ray hits (top or side), i.e. the one you can actually see. */
  pick(raycaster: THREE.Raycaster): Tile | null {
    const hit = raycaster.intersectObjects([this.mesh, ...this.bridges.children], false)[0];
    if (!hit) return null;
    if (hit.object !== this.mesh) return this.map.tiles[hit.object.userData.tile as number];
    return hit.faceIndex == null ? null : this.map.tiles[this.triangleTile[hit.faceIndex]];
  }
}
