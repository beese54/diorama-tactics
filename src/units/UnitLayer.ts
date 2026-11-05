import * as THREE from 'three';
import type { Unit } from '../game/units';
import { PX, SpriteField, type SpriteRect } from '../render/SpriteField';
import { frameAt, nearest, quadUV, sheetPixel } from './unitPick';
import { tileAt, type MapFile, type Tile } from '../map/types';
import { FINE_LAYER } from '../render/PixelPipeline';
import { buildUnitSheet, DENSITY, lookOf, spriteSet, type UnitSheet } from './unitSprites';

/** Seconds to walk from one tile to the next. */
const STEP_SECONDS = 0.16;
/** How high a unit hops when the step changes height, in world units. */
const HOP = 0.28;

interface Walk {
  path: Tile[];
  /** Seconds since the walk began. */
  t: number;
  done: () => void;
}

/** Where a unit stands and which way it faces (a world direction on the ground: x, z). */
interface Pose {
  unit: Unit;
  index: number;
  heading: THREE.Vector2;
  walk: Walk | null;
  rested: boolean;
  shadow: THREE.Mesh;
  /** What it showed last frame, for picking: where it stood, its cell, and whether mirrored. */
  drawn: { root: THREE.Vector3; rect: SpriteRect; mirrored: boolean } | null;
}

/** Each sprite's own phase in its animation (as SpriteField plays it). */
const phaseOf = (i: number) => (i * 0.37) % 1;

/**
 * The units on the board as upright pixel sprites, like the props (one draw call), each with a
 * soft shadow at its feet. A unit faces a direction on the ground; on screen its sprite is
 * mirrored whenever that direction points left, so it keeps facing the right way as the
 * camera orbits. Walks play the walk clip along a path, hopping up and down steps.
 */
export class UnitLayer {
  readonly group = new THREE.Group();
  private readonly sheet: UnitSheet;
  private readonly field: SpriteField;
  private readonly poses: Pose[];
  private readonly right = new THREE.Vector3();
  /** The sheet's pixels, to tell a sprite's figure from its clear surround. */
  private readonly sheetPixels: ImageData;
  private elapsed = 0;

  constructor(
    private readonly map: MapFile,
    units: readonly Unit[],
    private readonly surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3,
  ) {
    this.sheet = buildUnitSheet(units.map(lookOf));
    const centre = new THREE.Vector2(map.width / 2, map.height / 2);
    this.field = new SpriteField(
      units.map((unit, i) => ({ root: this.standPoint(unit), rect: this.sheet.cell(i, 'idle'), sway: 0, phase: phaseOf(i) })),
      this.sheet.texture,
      this.sheet.glow,
    );
    this.group.add(this.field.group);
    const canvas = this.sheet.texture.image as HTMLCanvasElement;
    this.sheetPixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    // Finer than the map: drawn in the pipeline's second, finer pass.
    if (DENSITY[spriteSet()] > 1) this.field.mesh.layers.set(FINE_LAYER);
    const shadowGeometry = new THREE.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2).scale(1, 1, 0.7);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    this.poses = units.map((unit, index) => {
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      this.group.add(shadow);
      // Everyone starts facing the middle of the board, so the two sides face each other.
      const heading = centre.clone().sub(new THREE.Vector2(unit.x + 0.5, unit.y + 0.5)).normalize();
      return { unit, index, heading, walk: null, rested: false, shadow, drawn: null };
    });
  }

  private standPoint(unit: Unit): THREE.Vector3 {
    return this.surfacePoint(tileAt(this.map, unit.x, unit.y)!, 0.5, 0.5);
  }

  private pose(unit: Unit): Pose {
    return this.poses.find((p) => p.unit === unit)!;
  }

  /** Whether any unit is walking. */
  get busy(): boolean {
    return this.poses.some((p) => p.walk);
  }

  /** Dims a unit that has moved this turn (or brightens it again). */
  setRested(unit: Unit, rested: boolean): void {
    this.pose(unit).rested = rested;
  }

  /** Walks `unit` along `path` (tile indices, its start first); `done` runs once it arrives. */
  walk(unit: Unit, path: readonly number[], done: () => void = () => {}): void {
    this.pose(unit).walk = { path: path.map((i) => this.map.tiles[i]), t: 0, done };
  }

  /** Moves the sprites along: `dt` seconds since the last frame; `camera` decides which way is left on screen. */
  update(elapsed: number, dt: number, camera: THREE.Camera): void {
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const p of this.poses) {
      const { unit, index } = p;
      if (unit.morale <= 0) {
        // Fallen units leave the board: their sprite shrinks to nothing.
        this.field.place(index, new THREE.Vector3(), { ...this.sheet.cell(index, 'idle'), w: 0, h: 0 });
        p.shadow.visible = false;
        p.drawn = null;
        continue;
      }
      let root: THREE.Vector3;
      let ground: number;
      if (p.walk) {
        const w = p.walk;
        w.t += dt;
        const step = Math.min(w.path.length - 1, Math.floor(w.t / STEP_SECONDS));
        if (step >= w.path.length - 1) {
          p.walk = null;
          root = this.standPoint(unit);
          w.done();
        } else {
          const [a, b] = [w.path[step], w.path[step + 1]];
          const k = (w.t - step * STEP_SECONDS) / STEP_SECONDS;
          const from = this.surfacePoint(a, 0.5, 0.5);
          const to = this.surfacePoint(b, 0.5, 0.5);
          root = from.clone().lerp(to, k);
          ground = root.y;
          if (Math.abs(to.y - from.y) > 0.05) root.y += Math.sin(Math.PI * k) * HOP;
          p.heading.set(b.x - a.x, b.y - a.y);
        }
      } else {
        root = this.standPoint(unit);
      }
      ground ??= root.y;
      const clip = p.walk ? 'walk' : p.rested ? 'rest' : 'idle';
      // Facing a ground direction (x, z) that points left on screen: mirror the sprite.
      const mirrored = this.right.x * p.heading.x + this.right.z * p.heading.y < 0;
      const rect = this.sheet.cell(index, clip);
      this.field.place(index, root, rect, mirrored);
      p.drawn = { root, rect, mirrored };
      p.shadow.visible = true;
      p.shadow.position.set(root.x, ground + 0.01, root.z);
    }
    this.field.update(elapsed);
    this.elapsed = elapsed;
  }

  /** The point just over a unit's head, in normalised device coordinates (null once it has fallen). */
  headAt(unit: Unit, camera: THREE.Camera): THREE.Vector3 | null {
    const drawn = this.pose(unit).drawn;
    return drawn ? drawn.root.clone().setY(drawn.root.y + drawn.rect.h / PX).project(camera) : null;
  }

  /** How tall a unit's sprite stands, in world units (0 once it has fallen). */
  heightOf(unit: Unit): number {
    const drawn = this.pose(unit).drawn;
    return drawn ? drawn.rect.h / PX : 0;
  }

  /**
   * The unit whose figure is under `ndc` (the pointer in normalised device coordinates), or null:
   * its sprite's quad, as last drawn, must hold the point and the sheet pixel there must be part of
   * the figure. Of several, the nearest the camera, so the one in front wins in a crowd.
   */
  pickAt(ndc: THREE.Vector2, camera: THREE.Camera): Unit | null {
    const e = camera.matrixWorldInverse.elements;
    // The quad's right is the camera's, flattened onto the ground (as SpriteField's shader has it).
    const right = new THREE.Vector3(e[0], 0, e[8]).normalize();
    const { width, height, data } = this.sheetPixels;
    const hits: { item: Unit; depth: number }[] = [];
    for (const p of this.poses) {
      if (!p.drawn) continue;
      const { root, rect, mirrored } = p.drawn;
      const o = root.clone().project(camera);
      const r = root.clone().add(right).project(camera);
      const u = root.clone().setY(root.y + 1).project(camera);
      const uv = quadUV([ndc.x, ndc.y], [o.x, o.y], [r.x - o.x, r.y - o.y], [u.x - o.x, u.y - o.y], rect.w / PX, rect.h / PX);
      if (!uv) continue;
      const [x, y] = sheetPixel(rect, width, height, uv.u, uv.v, frameAt(rect, this.elapsed, phaseOf(p.index)), mirrored);
      if (data[(y * width + x) * 4 + 3] < 128) continue;
      hits.push({ item: p.unit, depth: o.z });
    }
    return nearest(hits);
  }
}
