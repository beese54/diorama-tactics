import * as THREE from 'three';
import type { ClashSetup, ClashSide } from '../game/clash';
import { deploy } from '../game/deploy';
import { moveRange, pathTo, stopsIn, type Step } from '../game/movement';
import { deal, refill, unused, type Hand } from '../game/cards';
import { attackWith, canAttack, canMove, moveUnit, nextTurn, playCard, startTurn, type TurnState } from '../game/turn';
import { applyDamage, type Side, type Unit } from '../game/units';
import { tileStats } from '../map/terrain';
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
  /** Plays a battle over the board; resolves with how it came out once the player goes on from it. */
  battle: (setup: ClashSetup) => Promise<{ winner: ClashSide; damage: number }>;
}

/**
 * A skirmish on one board: both sides deployed, the player's turn with a shared MOV pool.
 * Click (or Z) a unit to select it and see where it can go; click a blue tile to walk there.
 * A foe on the next tile is marked in bold red: click it to attack, which opens the battle
 * over the board, and the loser's Morale drops when the player comes back (at 0 it leaves the
 * field). An enemy shows its reach in red. X cancels; Enter ends the turn (until the enemy has
 * an AI, its turn passes at once).
 */
export class Skirmish {
  readonly group = new THREE.Group();
  readonly units: Unit[];
  turn: TurnState = startTurn('player', 1);
  /** Each side's cards for the skirmish. */
  readonly hands: Record<Side, Hand>;
  selected: Unit | null = null;
  private range: Map<number, Step> | null = null;
  private readonly layer: UnitLayer;
  private readonly marks: RangeLayer;
  private readonly panel: UnitPanel;
  private readonly box: TurnBox;
  private hovered: Tile | null = null;
  /** The range the path preview was last drawn for: a new selection redraws it. */
  private previewed: Map<number, Step> | null = null;
  /** Whether a battle is on over the board. */
  private fighting = false;
  /** Battles fought so far, to give each its own seed. */
  private fights = 0;

  constructor(private readonly map: MapFile, private readonly host: SkirmishHost, ui: HTMLElement) {
    this.units = deploy(map);
    this.hands = { player: deal(map.seed, 'player'), enemy: deal(map.seed, 'enemy') };
    this.layer = new UnitLayer(map, this.units, host.surfacePoint);
    this.marks = new RangeLayer(host.surfacePoint);
    this.group.add(this.marks.group, this.layer.group);
    this.panel = new UnitPanel(ui);
    this.box = new TurnBox(ui);
    this.begin(this.turn);
  }

  /** Opens `turn`: the side's hand comes back once it is all played, and (until the hand is on screen) its longest reach is played. */
  private begin(turn: TurnState): TurnState {
    const hand = this.hands[turn.side];
    refill(hand);
    playCard(turn, hand, unused(hand)[0].id);
    return turn;
  }

  /** The longest reach left in `side`'s hand: how far its units could come next turn. */
  private reach(side: Side): number {
    const left = unused(this.hands[side]);
    return Math.max(...(left.length ? left : this.hands[side].cards).map((c) => c.mov));
  }

  /** The living unit standing on `tile`, if any. */
  unitAt(tile: Tile | null): Unit | undefined {
    return tile ? this.units.find((u) => u.morale > 0 && u.x === tile.x && u.y === tile.y) : undefined;
  }

  get busy(): boolean {
    return this.layer.busy || this.fighting;
  }

  private tileOf(unit: Unit): Tile {
    return this.map.tiles[unit.y * this.map.width + unit.x];
  }

  /** The foes `unit` can attack now. */
  private targets(unit: Unit): Unit[] {
    return this.units.filter((foe) => canAttack(this.turn, unit, foe));
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
    this.marks.mark('target', []);
    if (!unit) return;
    this.host.focus(this.host.surfacePoint(this.map.tiles[unit.y * this.map.width + unit.x], 0.5, 0.5));
    const tiles = (range: Map<number, Step>) => stopsIn(range).map((i) => this.map.tiles[i]);
    if (canMove(this.turn, unit)) {
      this.range = moveRange(this.map, this.units, unit, this.turn.pool);
      this.marks.mark('reach', tiles(this.range));
    } else if (unit.side !== this.turn.side) {
      // How far a foe could come on its longest card.
      this.marks.mark('foe', tiles(moveRange(this.map, this.units, unit, this.reach(unit.side))));
    }
    this.marks.mark('target', this.targets(unit).map((foe) => this.tileOf(foe)));
  }

  /** A click (or Z) on `tile`. */
  click(tile: Tile | null): void {
    if (this.busy) return;
    const unit = this.unitAt(tile);
    const mover = this.selected;
    if (mover && unit && canAttack(this.turn, mover, unit)) {
      void this.attack(mover, unit);
      return;
    }
    if (mover && this.range && tile && this.range.get(this.index(tile))?.stop && !(tile.x === mover.x && tile.y === mover.y)) {
      const path = moveUnit(this.turn, this.map, this.units, mover, this.index(tile));
      if (path) {
        this.select(null);
        // Arrived next to a foe, it stays selected, ready to attack.
        this.layer.walk(mover, path, () => {
          this.layer.setRested(mover, true);
          if (this.targets(mover).length) this.select(mover);
        });
        return;
      }
    }
    this.select(unit && unit !== mover ? unit : null);
  }

  /**
   * `unit` attacks `foe`: the battle plays over the board (on the tiles' own defence), and once
   * the player comes back the loser loses its Morale. The unit's turn is spent either way.
   */
  private async attack(unit: Unit, foe: Unit): Promise<void> {
    if (!attackWith(this.turn, unit, foe)) return;
    this.select(null);
    this.fighting = true;
    const setup: ClashSetup = {
      attacker: unit, defender: foe, pow: this.turn.card!.pow, seed: this.map.seed * 1009 + this.turn.number * 31 + ++this.fights,
      attackerDefense: tileStats(this.tileOf(unit)).defense, defenderDefense: tileStats(this.tileOf(foe)).defense,
    };
    const { winner, damage } = await this.host.battle(setup);
    const [won, lost] = winner === 'attacker' ? [unit, foe] : [foe, unit];
    applyDamage(lost, damage);
    this.layer.setRested(unit, true);
    this.fighting = false;
    this.host.say(`${won.name} wins. ${lost.name} loses ${damage} Morale${lost.morale > 0 ? '.' : ' and leaves the field.'}`);
  }

  /** X: lets go of the selected unit. */
  cancel(): void {
    if (!this.busy) this.select(null);
  }

  /** Enter: ends the player's turn. The enemy has no AI yet (B7): it plays a card and its turn passes straight back. */
  endTurn(): void {
    if (this.busy || this.turn.side !== 'player') return;
    this.select(null);
    const foes = this.begin(nextTurn(this.turn));
    this.turn = this.begin(nextTurn(foes));
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
    this.box.show(this.turn);
  }

  /** The tiles the selected unit can move to now, as [x, y] (for checks). */
  reachable(): [number, number][] {
    return this.range ? stopsIn(this.range).map((i) => [i % this.map.width, Math.floor(i / this.map.width)]) : [];
  }

  /** Counts for checks: tiles marked, and the rules' own count for the selected unit. */
  marked(): { reach: number; foe: number; path: number; target: number; rules: number } {
    const s = this.selected;
    return {
      reach: this.marks.count('reach'), foe: this.marks.count('foe'), path: this.marks.count('path'), target: this.marks.count('target'),
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
