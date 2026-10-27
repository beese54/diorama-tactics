import * as THREE from 'three';
import { deploy } from '../game/deploy';
import { moveRange, pathTo, stopsIn, type Step } from '../game/movement';
import { canMove, FIXED_POOL, moveUnit, nextTurn, startTurn, type TurnState } from '../game/turn';
import type { Unit } from '../game/units';
import type { MapFile, Tile } from '../map/types';
import { TurnBox } from '../ui/TurnBox';
import { UnitPanel } from '../ui/UnitPanel';
import { RangeLayer } from './RangeLayer';
import { UnitLayer } from './UnitLayer';

/** What the skirmish needs from the rest of the app. */
export interface SkirmishHost {
  surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3;
  /** Eases the camera over to a point. */
  focus: (point: THREE.Vector3) => void;
  /** A short notice in the menu box. */
  say: (text: string) => void;
}

/**
 * A skirmish on one board: both sides deployed, the player's turn with a shared MOV pool.
 * Click (or Z) a unit to select it and see where it can go; click a blue tile to walk there.
 * An enemy shows its reach in red. X cancels; Enter ends the turn (until the enemy has an AI,
 * its turn passes at once).
 */
export class Skirmish {
  readonly group = new THREE.Group();
  readonly units: Unit[];
  turn: TurnState = startTurn('player', 1);
  selected: Unit | null = null;
  private range: Map<number, Step> | null = null;
  private readonly layer: UnitLayer;
  private readonly marks: RangeLayer;
  private readonly panel: UnitPanel;
  private readonly box: TurnBox;
  private hovered: Tile | null = null;
  /** The range the path preview was last drawn for: a new selection redraws it. */
  private previewed: Map<number, Step> | null = null;

  constructor(private readonly map: MapFile, private readonly host: SkirmishHost, ui: HTMLElement) {
    this.units = deploy(map);
    this.layer = new UnitLayer(map, this.units, host.surfacePoint);
    this.marks = new RangeLayer(host.surfacePoint);
    this.group.add(this.marks.group, this.layer.group);
    this.panel = new UnitPanel(ui);
    this.box = new TurnBox(ui);
  }

  /** The living unit standing on `tile`, if any. */
  unitAt(tile: Tile | null): Unit | undefined {
    return tile ? this.units.find((u) => u.morale > 0 && u.x === tile.x && u.y === tile.y) : undefined;
  }

  get busy(): boolean {
    return this.layer.busy;
  }

  private index(tile: Tile): number {
    return tile.y * this.map.width + tile.x;
  }

  private select(unit: Unit | null): void {
    this.selected = unit;
    this.range = null;
    this.marks.mark('reach', []);
    this.marks.mark('foe', []);
    this.marks.mark('path', []);
    if (!unit) return;
    this.host.focus(this.host.surfacePoint(this.map.tiles[unit.y * this.map.width + unit.x], 0.5, 0.5));
    const tiles = (range: Map<number, Step>) => stopsIn(range).map((i) => this.map.tiles[i]);
    if (canMove(this.turn, unit)) {
      this.range = moveRange(this.map, this.units, unit, this.turn.pool);
      this.marks.mark('reach', tiles(this.range));
    } else if (unit.side !== this.turn.side) {
      // How far a foe could come on a full pool of its own.
      this.marks.mark('foe', tiles(moveRange(this.map, this.units, unit, FIXED_POOL)));
    }
  }

  /** A click (or Z) on `tile`. */
  click(tile: Tile | null): void {
    if (this.busy) return;
    const unit = this.unitAt(tile);
    const mover = this.selected;
    if (mover && this.range && tile && this.range.get(this.index(tile))?.stop && !(tile.x === mover.x && tile.y === mover.y)) {
      const path = moveUnit(this.turn, this.map, this.units, mover, this.index(tile));
      if (path) {
        this.select(null);
        this.layer.walk(mover, path, () => this.layer.setRested(mover, true));
        return;
      }
    }
    this.select(unit && unit !== mover ? unit : null);
  }

  /** X: lets go of the selected unit. */
  cancel(): void {
    if (!this.busy) this.select(null);
  }

  /** Enter: ends the player's turn. The enemy has no AI yet (B7), so its turn passes straight back. */
  endTurn(): void {
    if (this.busy || this.turn.side !== 'player') return;
    this.select(null);
    this.turn = nextTurn(nextTurn(this.turn));
    for (const u of this.units) this.layer.setRested(u, false);
    this.host.say(`The foes hold their ground. Turn ${this.turn.number}.`);
  }

  /** The tile under the cursor: previews the path there and shows whoever stands on it. */
  hover(tile: Tile | null): void {
    if (tile === this.hovered && this.range === this.previewed) return;
    this.hovered = tile;
    this.previewed = this.range;
    const path = this.range && tile ? pathTo(this.range, this.index(tile)) : [];
    this.marks.mark('path', path.length > 1 ? path.map((i) => this.map.tiles[i]) : []);
  }

  update(elapsed: number, dt: number, camera: THREE.Camera): void {
    this.layer.update(elapsed, dt, camera);
    this.marks.update(elapsed);
    const shown = this.unitAt(this.hovered) ?? this.selected;
    this.panel.show(shown ?? null, !!shown && shown.side === this.turn.side && this.turn.moved.has(shown.id));
    this.box.show(this.turn, FIXED_POOL);
  }

  /** The tiles the selected unit can move to now, as [x, y] (for checks). */
  reachable(): [number, number][] {
    return this.range ? stopsIn(this.range).map((i) => [i % this.map.width, Math.floor(i / this.map.width)]) : [];
  }

  /** Counts for checks: tiles marked, and the rules' own count for the selected unit. */
  marked(): { reach: number; foe: number; path: number; rules: number } {
    const s = this.selected;
    return {
      reach: this.marks.count('reach'), foe: this.marks.count('foe'), path: this.marks.count('path'),
      rules: s && canMove(this.turn, s) ? stopsIn(moveRange(this.map, this.units, s, this.turn.pool)).length : 0,
    };
  }

  /** Takes the panels off the page (the meshes go with the board). */
  dispose(): void {
    this.panel.show(null);
    document.getElementById('unit-info')?.remove();
    document.getElementById('turn-info')?.remove();
  }
}
