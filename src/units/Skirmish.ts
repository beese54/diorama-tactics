import * as THREE from 'three';
import type { ClashSetup, ClashSide } from '../game/clash';
import { deploy } from '../game/deploy';
import { moveRange, pathTo, stopsIn, type Step } from '../game/movement';
import { deal, refill, unused, type Card, type Hand } from '../game/cards';
import { attackWith, canAttack, canMove, moveUnit, nextTurn, playCard, startTurn, takeBack, type TurnState } from '../game/turn';
import { planTurn, type Difficulty } from '../game/ai';
import { outcome, stats, type Outcome, type Stats } from '../game/end';
import { onPlay } from '../game/skills';
import { fightUnion, unionOf, unionShape } from '../game/union';
import type { Side, Unit } from '../game/units';
import { tileStats } from '../map/terrain';
import type { MapFile, Tile } from '../map/types';
import { CardHand } from '../ui/CardHand';
import { TurnBox } from '../ui/TurnBox';
import { UnitPanel } from '../ui/UnitPanel';
import { RangeLayer } from './RangeLayer';
import { UnitLayer } from './UnitLayer';

/** How long the foes' card shows before they move: long enough to watch it turn face up (ms). */
const FOES_CARD_MS = 1100;
/** A short pause between the foes' moves and their attack (ms), so the board can be read. */
const FOES_BEAT_MS = 350;
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What the skirmish needs from the rest of the app. */
export interface SkirmishHost {
  surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3;
  /** Eases the camera over to a point. */
  focus: (point: THREE.Vector3) => void;
  /** A short notice in the menu box. */
  say: (text: string) => void;
  /**
   * Plays a battle over the board; resolves with how it came out once the player goes on from it.
   * `chain`: which battle of a Union attack this is, counting from 0, and how many the Union has.
   * `card`: the attacking side's card in play, whose skill its unit may fire (B6). The outcome
   * carries each side's skill gauge as the battle ended.
   */
  battle: (
    setup: ClashSetup,
    options?: { chain?: { index: number; count: number }; card?: Card | null },
  ) => Promise<{ winner: ClashSide; damage: number; gauges?: Record<ClashSide, number> }>;
  /** The skirmish is over (B7): every foe fallen, or every ally. */
  end: (result: Outcome, stats: Stats) => void;
}

/**
 * A skirmish on one board: both sides deployed, each with a hand of cards. A turn opens on the
 * hand: the card played sets the MOV pool the side's units share and the POW of its battle (C
 * shows the hand again; X takes the card back until a unit moves). Then click (or Z) a unit to
 * select it and see where it can go; click a blue tile to walk there.
 * A foe on the next tile is marked in bold red: click it to attack, which opens the battle
 * over the board, and the loser's Morale drops when the player comes back (at 0 it leaves the
 * field). The battle ends the turn, as Enter does at any time. An enemy shows its reach in red;
 * X cancels. Then the foes play their turn by the AI (B7, at the chosen difficulty): their card,
 * their moves and an attack, which the player watches and defends in; then the next turn opens on
 * the hand. Once every foe or every ally has fallen, the skirmish ends.
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
  private readonly cards: CardHand;
  private hovered: Tile | null = null;
  /** The range the path preview was last drawn for: a new selection redraws it. */
  private previewed: Map<number, Step> | null = null;
  /** Whether a battle is on over the board. */
  private fighting = false;
  /** Battles fought so far, to give each its own seed. */
  private fights = 0;
  /** How the foes play their turns (B7): Easy, bold and simple; Hard, cautious and sharp. */
  difficulty: Difficulty = 'easy';
  /** How the skirmish ended, once it has. */
  ended: Outcome | null = null;
  /** For checks of other things than the AI: the foes play their card and hold their ground (dev hook). */
  idle = false;
  /** Battles fought, and won by the player's side, for the result screen. */
  private battles = 0;
  private won = 0;

  constructor(private readonly map: MapFile, private readonly host: SkirmishHost, private readonly ui: HTMLElement) {
    this.units = deploy(map);
    this.hands = { player: deal(map.seed, 'player'), enemy: deal(map.seed, 'enemy') };
    this.layer = new UnitLayer(map, this.units, host.surfacePoint);
    this.marks = new RangeLayer(host.surfacePoint);
    this.group.add(this.marks.group, this.layer.group);
    this.panel = new UnitPanel(ui);
    this.box = new TurnBox(ui);
    this.cards = new CardHand((id) => this.play(id));
    this.begin(this.turn);
    this.cards.prefetchFoes(this.hands.enemy.cards);
  }

  /**
   * Opens `turn`: the side's hand comes back once it is all played. The player's opens on the
   * hand; the foes' plays itself out (`foesTurn`).
   */
  private begin(turn: TurnState): TurnState {
    refill(this.hands[turn.side]);
    if (turn.side === 'player') this.cards.show(this.hands.player, null, false);
    return turn;
  }

  /** Whether the turn is under way: once a unit has moved or fought, the card stays. */
  private get committed(): boolean {
    return this.turn.moved.size > 0 || this.turn.attacked;
  }

  /** The player plays the card `id` (or swaps it for the one in play): the hand closes and the pool is its MOV. */
  private play(id: string): void {
    if (this.busy || !playCard(this.turn, this.hands.player, id)) return;
    this.cards.hide();
    this.select(null);
    const card = this.turn.card!;
    // All In acts as it is played: every ally's skill gauge fills.
    const filled = onPlay(card, 'player', this.units);
    this.host.say(`${card.name}: MOV ${card.mov}, POW ${card.pow}.${filled.length ? ` ${card.skill.name}: every ally's skill gauge is full.` : ''}`);
  }

  /** C: shows the hand, or puts it away. Once the turn is under way it is there to look at only. */
  toggleHand(): void {
    if (this.busy) return;
    if (this.cards.open) this.cards.hide();
    else this.cards.show(this.hands.player, this.turn.card, this.committed);
  }

  /** A key for the hand while it is open (arrows and Z). Returns whether it took the key. */
  key(code: string): boolean {
    return !this.busy && this.cards.key(code);
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

  /** Whether the board is taking no orders: a unit walking, a battle on, the foes' turn, or the skirmish over. */
  get busy(): boolean {
    return this.layer.busy || this.fighting || this.turn.side !== 'player' || this.ended !== null;
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
    this.marks.mark('union', []);
    this.marks.mark('shape', []);
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
    // The Union it would attack with: violet under the allies on its shape, the empty places edged.
    if (unit.side === this.turn.side && !this.turn.attacked) {
      const members = unionOf(unit, this.units).slice(1);
      this.marks.mark('union', members.map((m) => this.tileOf(m)));
      const empty = unionShape(unit)
        .map(([dx, dy]) => [unit.x + dx, unit.y + dy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < this.map.width && y < this.map.height && !members.some((m) => m.x === x && m.y === y));
      this.marks.mark('shape', empty.map(([x, y]) => this.map.tiles[y * this.map.width + x]));
    }
  }

  /** A click (or Z) on `tile`. */
  click(tile: Tile | null): void {
    if (this.busy || this.cards.open) return;
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
    const next = unit && unit !== mover ? unit : null;
    if (next && next.side === 'player' && !this.turn.card) this.host.say('Play a card first: C opens the hand.');
    this.select(next);
  }

  /**
   * `unit` attacks `foe` with its Union (B5): it fights first, then each ally on its shape fights
   * the same foe in turn, one battle each over the board (on the tiles' own defence), until the
   * foe falls or the Union runs out. Each loser loses its Morale before the next battle, so the
   * foe carries its losses down the chain. Alone, it is one battle, as before. Then the turn ends.
   */
  private async attack(unit: Unit, foe: Unit): Promise<void> {
    if (!attackWith(this.turn, unit, foe)) return;
    await this.fight(unit, foe);
    // One attack a turn: it ends the turn (unless it ended the skirmish).
    if (!this.checkEnd()) this.passTurn();
  }

  /**
   * `unit`'s Union attack on `foe`, for either side: each battle over the board on the side's card
   * (the player watches the foes' and defends in them), the gauges carried on, the battles counted
   * for the result screen, and a notice of how it went.
   */
  private async fight(unit: Unit, foe: Unit): Promise<void> {
    const members = unionOf(unit, this.units);
    this.select(null);
    this.fighting = true;
    if (members.length > 1) this.host.say(`${unit.name}'s Union attacks: ${members.length} battles.`);
    const before = foe.morale;
    const battles = await fightUnion(members, foe, async (attacker, index) => {
      const out = await this.host.battle(this.setupFor(attacker, foe), { chain: { index, count: members.length }, card: this.turn.card });
      // Each fighter carries its skill gauge on from the battle (spent, if its skill fired).
      if (out.gauges) [attacker.gauge, foe.gauge] = [out.gauges.attacker, out.gauges.defender];
      return out;
    });
    for (const b of battles) {
      this.layer.setRested(b.attacker, true);
      this.battles++;
      if ((b.winner === 'attacker') === (b.attacker.side === 'player')) this.won++;
    }
    this.fighting = false;
    const gone = foe.morale > 0 ? '.' : ' and leaves the field.';
    if (battles.length === 1) {
      const [{ attacker, winner, damage }] = battles;
      const [won, lost] = winner === 'attacker' ? [attacker, foe] : [foe, attacker];
      this.host.say(`${won.name} wins. ${lost.name} loses ${damage} Morale${lost.morale > 0 ? '.' : ' and leaves the field.'}`);
    } else {
      const fallen = battles.filter((b) => b.attackerMorale <= 0).map((b) => b.attacker.name);
      this.host.say(`${foe.name} loses ${before - foe.morale} Morale over ${battles.length} battles${gone}${fallen.length ? ` ${fallen.join(' and ')} fell.` : ''}`);
    }
  }

  /** Ends the skirmish if every foe or every ally has fallen: the result screen. Returns whether it ended. */
  private checkEnd(): boolean {
    const result = outcome(this.units);
    if (!result) return false;
    this.ended = result;
    this.select(null);
    this.cards.hide();
    this.cards.hideFoeCard();
    this.host.end(result, stats(this.units, this.turn.number, this.battles, this.won));
    return true;
  }

  /** One battle of an attack: `attacker` against `foe`, on this turn's card, with its own seed. */
  private setupFor(attacker: Unit, foe: Unit): ClashSetup {
    return {
      attacker, defender: foe, pow: this.turn.card!.pow, seed: this.map.seed * 1009 + this.turn.number * 31 + ++this.fights,
      attackerDefense: tileStats(this.tileOf(attacker)).defense, defenderDefense: tileStats(this.tileOf(foe)).defense,
    };
  }

  /** X: puts the hand away, or lets go of the selected unit, or takes the card back into the hand before anyone has moved. */
  cancel(): void {
    if (this.busy) return;
    if (this.cards.open) {
      if (this.turn.card && takeBack(this.turn, this.hands.player)) this.cards.show(this.hands.player, null, false);
      else this.cards.hide();
    } else if (this.selected) this.select(null);
    else if (takeBack(this.turn, this.hands.player)) {
      this.cards.show(this.hands.player, null, false);
      this.host.say('The card goes back into the hand.');
    }
  }

  /** Enter: ends the player's turn. */
  endTurn(): void {
    if (this.busy) return;
    this.passTurn();
  }

  /** The player's turn is over: the foes play theirs. */
  private passTurn(): void {
    this.select(null);
    this.cards.hide();
    this.turn = this.begin(nextTurn(this.turn));
    void this.foesTurn();
  }

  /**
   * The foes' turn (B7), as the AI plans it at the chosen difficulty: they play their card (it
   * slides in and turns face up), walk their moves one by one with the camera on each, then make
   * their attack, if any, which the player watches and defends in. Then the end check, or the
   * player's turn.
   */
  private async foesTurn(): Promise<void> {
    const plan = planTurn(this.map, this.units, this.hands.enemy, 'enemy', this.difficulty);
    playCard(this.turn, this.hands.enemy, plan.card.id);
    this.cards.showFoeCard(plan.card);
    this.host.say(`The foes play ${plan.card.name}.`);
    await pause(FOES_CARD_MS);
    if (this.idle) {
      this.cards.hideFoeCard();
      this.handBack();
      return;
    }
    for (const m of plan.moves) {
      if (this.ended) return;
      const path = moveUnit(this.turn, this.map, this.units, m.unit, m.path.at(-1)!);
      if (!path) continue;
      this.host.focus(this.host.surfacePoint(this.tileOf(m.unit), 0.5, 0.5));
      await new Promise<void>((done) => this.layer.walk(m.unit, path, done));
      this.layer.setRested(m.unit, true);
    }
    this.cards.hideFoeCard();
    const a = plan.attack;
    if (a && attackWith(this.turn, a.unit, a.target)) {
      this.host.focus(this.host.surfacePoint(this.tileOf(a.target), 0.5, 0.5));
      await pause(FOES_BEAT_MS);
      await this.fight(a.unit, a.target);
    } else if (!plan.moves.length) this.host.say('The foes hold their ground.');
    if (!this.checkEnd()) this.handBack();
  }

  /** The foes' turn is over: the next turn opens on the player's hand. */
  private handBack(): void {
    this.turn = this.begin(nextTurn(this.turn));
    for (const u of this.units) this.layer.setRested(u, false);
    this.host.say(`Turn ${this.turn.number}: play a card.`);
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
    this.panel.show(shown ?? null, !!shown && shown.side === this.turn.side && this.turn.moved.has(shown.id), shown ? unionOf(shown, this.units).length : 1);
    this.box.show(this.turn);
    // While the hand is open it has the bottom of the screen: the tile and unit panels step aside.
    this.ui.classList.toggle('choosing', this.cards.open);
  }

  /** The player's hand, for checks: each card, whether it is used, and the hand's state on screen; and how many cards the foes have left. */
  handInfo(): {
    open: boolean; focused: number; played: string | null; cards: { id: string; pow: number; mov: number; used: boolean }[]; foesLeft: number;
    view: ReturnType<CardHand['info']>;
  } {
    const hand = this.hands.player;
    return {
      open: this.cards.open, focused: this.cards.focused, played: this.turn.side === 'player' ? this.turn.card?.id ?? null : null,
      cards: hand.cards.map(({ id, pow, mov }) => ({ id, pow, mov, used: hand.used.has(id) })),
      foesLeft: unused(this.hands.enemy).length,
      view: this.cards.info(),
    };
  }

  /** The tiles the selected unit can move to now, as [x, y] (for checks). */
  reachable(): [number, number][] {
    return this.range ? stopsIn(this.range).map((i) => [i % this.map.width, Math.floor(i / this.map.width)]) : [];
  }

  /** Counts for checks: tiles marked, and the rules' own count for the selected unit. */
  marked(): { reach: number; foe: number; path: number; target: number; union: number; shape: number; rules: number } {
    const s = this.selected;
    return {
      reach: this.marks.count('reach'), foe: this.marks.count('foe'), path: this.marks.count('path'), target: this.marks.count('target'),
      union: this.marks.count('union'), shape: this.marks.count('shape'),
      rules: s && canMove(this.turn, s) ? stopsIn(moveRange(this.map, this.units, s, this.turn.pool)).length : 0,
    };
  }

  /** Takes the panels off the page (the meshes go with the board). */
  dispose(): void {
    this.panel.show(null);
    document.getElementById('unit-info')?.remove();
    document.getElementById('turn-info')?.remove();
    this.cards.dispose();
    this.ui.classList.remove('choosing');
  }

  /** The rules' Union for the selected unit, leader first, as ids (for checks). */
  unionIds(): string[] {
    return this.selected ? unionOf(this.selected, this.units).map((u) => u.id) : [];
  }
}
