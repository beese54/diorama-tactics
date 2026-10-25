import * as THREE from 'three';
import { hash } from '../util/noise';
import { SpriteField } from '../render/SpriteField';
import { buildPropSheet } from './propSprites';
import { propPlacement, PROPS } from './props';
import type { MapFile, Tile } from './types';

/** Forward-lit point lights get expensive quickly; the brightest few are plenty. */
const MAX_LIGHTS = 12;

/**
 * Every tile's prop as an upright pixel sprite (one draw call), and the light that lamps,
 * lanterns and fire cast on the ground around them when the theme turns them on.
 */
export class PropLayer {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly field: SpriteField;
  /** Firelit lights with their steady brightness and a per-light phase. */
  private readonly flames: { light: THREE.PointLight; base: number; phase: number }[] = [];

  constructor(map: MapFile, surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3, options: { lights: boolean }) {
    const sheet = buildPropSheet();
    const tiles = map.tiles.filter((t) => t.prop);
    this.field = new SpriteField(
      tiles.map((tile) => {
        const { u, v, variant } = propPlacement(tile);
        const def = PROPS[tile.prop!];
        return { root: surfacePoint(tile, u, v), rect: sheet.cell(tile.prop!, variant), sway: def.sway, phase: hash(0x7f11, tile.x, tile.y) };
      }),
      sheet.texture,
      sheet.glow,
    );
    this.count = this.field.count;
    this.group.add(this.field.group);

    if (!options.lights) return;
    const lit = tiles.filter((t) => PROPS[t.prop!].light).sort((a, b) => PROPS[b.prop!].light!.intensity - PROPS[a.prop!].light!.intensity);
    for (const tile of lit.slice(0, MAX_LIGHTS)) {
      const { color, intensity, distance } = PROPS[tile.prop!].light!;
      const { u, v, variant } = propPlacement(tile);
      const light = new THREE.PointLight(color, intensity, distance, 1);
      light.position.copy(surfacePoint(tile, u, v)).add(new THREE.Vector3(0, (sheet.cell(tile.prop!, variant).h / 16) * 0.7, 0));
      this.group.add(light);
      if (PROPS[tile.prop!].light!.flicker) this.flames.push({ light, base: intensity, phase: hash(0x2d9f, tile.x, tile.y) * 6.283 });
    }
  }

  /** Wind strength from the weather: 1 is a breeze. */
  setWind(strength: number): void {
    this.field.setWind(strength);
  }

  /** Settled snow (0-1) lies on the props' top edges: tree crowns, branches, rocks, roofs. */
  setSnow(cover: number): void {
    this.field.setSnowCap(cover);
  }

  update(elapsed: number): void {
    this.field.update(elapsed);
    // Two quick wobbles whose periods divide 4 s, so recorded loops stay seamless.
    const w = (2 * Math.PI * elapsed) / 4;
    for (const { light, base, phase } of this.flames) light.intensity = base * (0.84 + 0.09 * Math.sin(w * 11 + phase) + 0.07 * Math.sin(w * 23 + phase * 2));
  }
}
