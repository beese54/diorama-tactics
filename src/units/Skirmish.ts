import * as THREE from 'three';
import type { ClashSetup, ClashSide } from '../game/clash';
import { deploy } from '../game/deploy';
import { moveRange, pathTo, stopsIn, type Step } from '../game/movement';
import { CARDS, deal, refill, unused, type Card, type Hand } from '../game/cards';
import { attackWith, canAttack, canMove, moveUnit, nextTurn, playCard, startTurn, takeBack, undoMove, type TurnState } from '../game/turn';
import { newTrace, planTurn, type Difficulty, type PlanTrace } from '../game/ai';
import { outcome, stats, type Outcome, type Stats } from '../game/end';
import { onPlay, skillMark, type SkillMark } from '../game/skills';
import { audio } from '../audio/Audio';
import { fightUnion, unionOf, unionShape } from '../game/union';
import { freshTurn, type Side, type Unit } from '../game/units';
import { tileStats } from '../map/terrain';
import { tileAt, type MapFile, type Tile } from '../map/types';
import { AllInFx } from '../ui/AllInFx';
import { CardHand } from '../ui/CardHand';
import { MoveConfirm } from '../ui/MoveConfirm';
import { PathCost } from '../ui/PathCost';
import { SkillMarks } from '../ui/SkillMarks';
import { fx } from '../ui/transitions';
import { TurnBanner } from '../ui/TurnBanner';
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
   * `cards`: each side's card, whose skill its unit may fire (B6; defenders too since 2026-11-08):
   * the attacker's in play, the defender's the last its side played. The outcome carries each
   * side's skill gauge as the battle ended.
   */
  battle: (
    setup: ClashSetup,
    options?: { chain?: { index: number; count: number }; cards?: Record<ClashSide, Card | null> },
  ) => Promise<{ winner: ClashSide; damage: number; gauges?: Record<ClashSide, number> }>;
  /** The skirmish is over (B7): every foe fallen, or every ally. */
  end: (result: Outcome, stats: Stats) => void;
}

/**
 * A skirmish on one board: both sides deployed, each with a hand of cards. A turn opens on the
 * hand: the card played sets the MOV pool the side's units share and the POW of its battle (C
 * shows the hand again; X takes the card back until a unit moves). Then click (or Z) a unit to
 * select it and see where it can go; click a blue tile to walk there, then CONFIRM (Z) the move
 * or UNDO (X) it, which walks the unit back and refunds its MOV.
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
  /** The card each side played on its last turn: a unit defending fires its skill (2026-11-08). */
  private readonly lastCard: Record<Side, Card | null> = { player: null, enemy: null };
  /** Each side's cards for the skirmish. */
  readonly hands: Record<Side, Hand>;
  selected: Unit | null = null;
  private range: Map<number, Step> | null = null;
  private readonly layer: UnitLayer;
  private readonly marks: RangeLayer;
  private readonly panel: UnitPanel;
  private readonly box: TurnBox;
  private readonly cards: CardHand;
  /** All In's burst over the units it fills, as its card is played. */
  private readonly allIn: AllInFx;
  private readonly skillMarks: SkillMarks;
  private readonly pathCost: PathCost;
  /** CONFIRM / UNDO beside a unit that has just walked (B8). */
  private readonly confirmBox: MoveConfirm;
  /** The player's move waiting on CONFIRM or UNDO: who, the tiles walked (start first), and the MOV it spent. */
  private pending: { unit: Unit; path: number[]; cost: number } | null = null;
  /** The tile the previewed path ends on, for its cost label. */
  private pathEnd: Tile | null = null;
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
  /** What the AI weighed for the foes' last turn (dev hook: its thinking shown in the demo video). */
  thinking: PlanTrace | null = null;
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
    this.allIn = new AllInFx(ui);
    this.skillMarks = new SkillMarks(ui);
    this.pathCost = new PathCost(ui);
    this.confirmBox = new MoveConfirm(ui, () => this.confirm(), () => this.undo());
    this.begin(this.turn);
    this.cards.prefetchFoes(this.hands.enemy.cards);
  }

  /** Deals `side` the cards `ids` in place of its hand (dev hook: a demo played the same way each time). */
  setHand(side: Side, ids: readonly string[]): void {
    this.hands[side] = { cards: CARDS.filter((c) => ids.includes(c.id)), used: new Set() };
    if (side === 'enemy') this.cards.prefetchFoes(this.hands.enemy.cards);
    else if (this.turn.side === 'player' && !this.turn.card) this.cards.show(this.hands.player, null, false);
  }

  /**
   * Opens `turn`: the side's hand comes back once it is all played. The player's opens on the
   * hand; the foes' plays itself out (`foesTurn`).
   */
  /** The next turn, the card of the one ending kept as its side's last. */
  private nextTurn(): TurnState {
    if (this.turn.card) this.lastCard[this.turn.side] = this.turn.card;
    return nextTurn(this.turn);
  }

  private begin(turn: TurnState): TurnState {
    // The turn banner (B8): whose turn it is, sweeping across the board.
    if (fx.banners) TurnBanner.show(turn.side, turn.number);
    refill(this.hands[turn.side]);
    // Every unit comes to its first battle of the turn at full strength.
    freshTurn(this.units);
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
    this.burst(filled);
    this.host.say(`${card.name}: MOV ${card.mov}, POW ${card.pow}.${filled.length ? ` ${card.skill.name}: every ally's skill gauge is full.` : ''}`);
  }

  /** All In's burst over the units whose gauges it filled, with a ring of sound; none filled, none. */
  private burst(filled: readonly Unit[]): void {
    if (!filled.length) return;
    this.allIn.play(filled);
    audio.play('cutin');
  }

  /**
   * A unit's SKILL READY mark: judged by the card its side has in play this turn, or, on the other
   * side's turn, the card its side played last, whose skill it would fire defending.
   */
  private markOf(unit: Unit): SkillMark | null {
    return skillMark(unit, unit.side === this.turn.side ? this.turn.card : this.lastCard[unit.side]);
  }

  /** The card behind each side of a battle: the attacker's in play, the defender's the last its side played. */
  private battleCards(attacker: Unit, foe: Unit): Record<ClashSide, Card | null> {
    return { attacker: attacker.side === this.turn.side ? this.turn.card : this.lastCard[attacker.side], defender: this.lastCard[foe.side] };
  }

  /** The path's cost label, as shown, or null (for checks). */
  get pathCostText(): string | null {
    return this.pathCost.text;
  }

  /** The SKILL READY marks showing on the map, by kind (for checks). */
  get skillMarksShown(): { ready: number; held: number } {
    return this.skillMarks.count();
  }

  /** How many All In bursts are playing (for checks). */
  get allInPlaying(): number {
    return this.allIn.playing;
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
  /** The tile of the unit whose figure is under `ndc` (the pointer), or null: see UnitLayer.pickAt. */
  unitTileAt(ndc: THREE.Vector2, camera: THREE.Camera): Tile | null {
    const unit = this.layer.pickAt(ndc, camera);
    return unit ? tileAt(this.map, unit.x, unit.y) ?? null : null;
  }

  /** The unit sheet as an image, for review captures. */
  sheetImage(): string {
    return this.layer.sheetImage();
  }

  /** How tall the figure on `tile` stands, in world units (0: no one there), so the cursor floats over its head. */
  figureHeight(tile: Tile | null): number {
    const unit = this.unitAt(tile);
    return unit ? this.layer.heightOf(unit) : 0;
  }

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
    this.pathEnd = null;
    this.pathCost.show(null);
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
    // While the move waits on CONFIRM or UNDO, the board waits too; a click on a foe marked red
    // beside the mover keeps the move and attacks.
    if (this.pending) {
      const mover = this.pending.unit;
      if (unit && canAttack(this.turn, mover, unit) && this.confirm()) void this.attack(mover, unit);
      return;
    }
    const mover = this.selected;
    if (mover && unit && canAttack(this.turn, mover, unit)) {
      void this.attack(mover, unit);
      return;
    }
    if (mover && this.range && tile && this.range.get(this.index(tile))?.stop && !(tile.x === mover.x && tile.y === mover.y)) {
      const pool = this.turn.pool;
      const path = moveUnit(this.turn, this.map, this.units, mover, this.index(tile));
      if (path) {
        this.select(null);
        // Arrived, the move waits on CONFIRM or UNDO, with any foe it could attack from there marked.
        const cost = pool - this.turn.pool;
        this.layer.walk(mover, path, () => {
          // The camera eases over to it, so the box opens clear of the screen's edges and windows.
          this.host.focus(this.host.surfacePoint(this.tileOf(mover), 0.5, 0.5));
          this.pending = { unit: mover, path, cost };
          this.marks.mark('target', this.targets(mover).map((foe) => this.tileOf(foe)));
          this.confirmBox.show(true);
        });
        return;
      }
    }
    const next = unit && unit !== mover ? unit : null;
    if (next && next.side === 'player' && !this.turn.card) this.host.say('Play a card first: C opens the hand.');
    this.select(next);
  }

  /**
   * CONFIRM (or Z): keeps the move waiting on the box. The unit rests; next to a foe it stays
   * selected, ready to attack. Returns whether there was a move to keep.
   */
  confirm(): boolean {
    const m = this.pending;
    if (!m || this.busy) return false;
    this.pending = null;
    this.confirmBox.show(false);
    this.layer.setRested(m.unit, true);
    this.select(this.targets(m.unit).length ? m.unit : null);
    return true;
  }

  /**
   * UNDO (or X): takes back the move waiting on the box. The unit walks back to where it stood,
   * the pool gets its MOV back, and the unit is selected again with its reach. Returns whether
   * there was a move to take back.
   */
  undo(): boolean {
    const m = this.pending;
    if (!m || this.busy || !undoMove(this.turn, this.map, m.unit, m.path[0], m.cost)) return false;
    this.pending = null;
    this.confirmBox.show(false);
    this.marks.mark('target', []);
    this.layer.walk(m.unit, [...m.path].reverse(), () => this.select(m.unit));
    this.host.say(`${m.unit.name} goes back: ${this.turn.pool} MOV left.`);
    return true;
  }

  /** The unit whose move waits on CONFIRM or UNDO, and the box's buttons on the page (for checks). */
  get pendingMove(): { id: string; cost: number; aims: ReturnType<MoveConfirm['aims']> } | null {
    return this.pending && { id: this.pending.unit.id, cost: this.pending.cost, aims: this.confirmBox.aims() };
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
    // The map stops drawing under a battle: its unit window goes now, not left over the battle.
    this.panel.show(null);
    if (members.length > 1) this.host.say(`${unit.name}'s Union attacks: ${members.length} battles.`);
    const before = foe.morale;
    // Each fighter carries its skill gauge on from the battle (spent, if its skill fired), and the
    // Union hands its gauge down the chain (fightUnion).
    const battles = await fightUnion(members, foe, (attacker, index) =>
      this.host.battle(this.setupFor(attacker, foe), { chain: { index, count: members.length }, cards: this.battleCards(attacker, foe) }));
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

  /** X: puts the hand away, or takes back the move waiting on UNDO, or lets go of the selected unit, or takes the card back into the hand before anyone has moved. */
  cancel(): void {
    if (this.busy) return;
    if (this.cards.open) {
      if (this.turn.card && takeBack(this.turn, this.hands.player)) this.cards.show(this.hands.player, null, false);
      else this.cards.hide();
    } else if (this.undo()) return;
    else if (this.selected) this.select(null);
    else if (takeBack(this.turn, this.hands.player)) {
      this.cards.show(this.hands.player, null, false);
      this.host.say('The card goes back into the hand.');
    }
  }

  /** Enter: ends the player's turn, keeping any move still waiting on CONFIRM. */
  endTurn(): void {
    if (this.busy) return;
    this.confirm();
    this.passTurn();
  }

  /** The player's turn is over: the foes play theirs. */
  private passTurn(): void {
    this.select(null);
    this.cards.hide();
    this.turn = this.begin(this.nextTurn());
    void this.foesTurn();
  }

  /**
   * The foes' turn (B7), as the AI plans it at the chosen difficulty: they play their card (it
   * slides in and turns face up), walk their moves one by one with the camera on each, then make
   * their attack, if any, which the player watches and defends in. Then the end check, or the
   * player's turn.
   */
  private async foesTurn(): Promise<void> {
    const trace = newTrace();
    const plan = planTurn(this.map, this.units, this.hands.enemy, 'enemy', this.difficulty, trace);
    this.thinking = trace;
    playCard(this.turn, this.hands.enemy, plan.card.id);
    this.cards.showFoeCard(plan.card);
    // The same rules for both sides: the foes' All In fills their gauges as it is played.
    const filled = onPlay(plan.card, 'enemy', this.units);
    this.burst(filled);
    this.host.say(`The foes play ${plan.card.name}.${filled.length ? ` ${plan.card.skill.name}: their skill gauges are full.` : ''}`);
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
    this.turn = this.begin(this.nextTurn());
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
    // The move's cost and what the side's pool keeps after it, by the tile the path ends on.
    this.pathEnd = path.length > 1 ? this.map.tiles[path.at(-1)!] : null;
    this.pathCost.show(this.pathEnd && this.range ? { cost: this.range.get(this.index(this.pathEnd))!.cost, pool: this.turn.pool } : null);
  }

  update(elapsed: number, dt: number, camera: THREE.Camera): void {
    this.layer.update(elapsed, dt, camera);
    this.marks.update(elapsed);
    // In a battle the map's windows stand down: nothing pointed at, nothing shown.
    const pointed = this.fighting ? undefined : this.unitAt(this.hovered);
    const shown = this.fighting ? undefined : pointed ?? this.selected;
    this.panel.show(shown ?? null, !!shown && shown.side === this.turn.side && this.turn.moved.has(shown.id), shown ? unionOf(shown, this.units).length : 1, shown ? this.markOf(shown) : null);
    // Pointed at, the box floats beside the unit's head, clear of the tucked hand; else it keeps its corner.
    // While CONFIRM / UNDO shows beside the mover, the window keeps to its corner, clear of it.
    const head = pointed && !this.pending && this.layer.headAt(pointed, camera);
    const [w, h] = [this.ui.clientWidth, this.ui.clientHeight];
    this.panel.place(head ? { x: ((head.x + 1) / 2) * w, y: ((1 - head.y) / 2) * h } : null, { w: Math.min(w, innerWidth), h: Math.min(h, innerHeight) }, this.cards.open ? innerHeight * 0.13 : 0, innerHeight / 270 * 12);
    // All In's bursts stay on their units as the camera moves.
    const css = (v: THREE.Vector3) => ({ x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h });
    this.allIn.place((u) => {
      const [top, feet] = [this.layer.headAt(u, camera), this.layer.feetAt(u, camera)];
      return top && feet ? { head: css(top), feet: css(feet) } : null;
    });
    this.pathCost.place(this.pathEnd ? css(this.host.surfacePoint(this.pathEnd, 0.5, 0.5).project(camera)) : null);
    const moverHead = this.pending && this.layer.headAt(this.pending.unit, camera);
    this.confirmBox.place(moverHead ? css(moverHead) : null);
    // SKILL READY: a sparkle by each full gauge's head; held back while All In's burst plays.
    this.skillMarks.show(this.units, (u) => this.markOf(u), (u) => {
      const top = this.layer.headAt(u, camera);
      return top ? css(top) : null;
    }, this.allIn.playing > 0);
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
    this.confirmBox.remove();
    this.cards.dispose();
    this.ui.classList.remove('choosing');
  }

  /** The rules' Union for the selected unit, leader first, as ids (for checks). */
  unionIds(): string[] {
    return this.selected ? unionOf(this.selected, this.units).map((u) => u.id) : [];
  }
}
