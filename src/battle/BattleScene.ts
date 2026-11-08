import * as THREE from 'three';
import { fx } from '../ui/transitions';
import { Wipe } from '../ui/Wipe';
import type { Card } from '../game/cards';
import { ClashSim, resolveClash, type ClashSetup, type ClashSide, type SkillId, type Stance } from '../game/clash';
import { GAUGE_MAX } from '../game/gauge';
import { aceMatches, battleSkill, LATE_TEXT } from '../game/skills';
import { CLASSES, triangleEdge } from '../game/units';
import { BattleHud, type GuideInfo } from '../ui/BattleHud';
import { BattleView } from './BattleView';
import { ART, CHARACTERS } from './cast';
import { CutIn } from './CutIn';
import { Director, LEAD } from './Director';
import { BattleScript } from './script';
import { SquadLayer } from './SquadLayer';

/** The keys that set the player's stance, from the next beat. */
const STANCE_KEYS: Record<string, Stance> = { KeyA: 'aggressive', KeyS: 'neutral', KeyD: 'passive' };
/** The keys that go on from a finished battle (a click does too). */
const LEAVE_KEYS = new Set(['Space', 'Enter', 'KeyZ']);
const SIDES = ['attacker', 'defender'] as const;
const other = (side: ClashSide): ClashSide => (side === 'attacker' ? 'defender' : 'attacker');

/** The matchup's line under the banners: who has the weapon triangle's edge, if anyone. */
function matchup({ attacker, defender }: ClashSetup): string {
  const [wa, wd] = [CLASSES[attacker.cls].weapon, CLASSES[defender.cls].weapon];
  const edge = triangleEdge(wa, wd);
  if (edge > 0) return `Advantage ${attacker.name} · ${wa} beats ${wd}`;
  if (edge < 0) return `Advantage ${defender.name} · ${wd} beats ${wa}`;
  return `Even match · ${wa} against ${wd}`;
}

/** How a battle came out, as the scene played it (the stances as the player set them). */
export interface BattleOutcome {
  winner: ClashSide;
  /** Morale the loser loses. */
  damage: number;
  /** Each side's skill gauge as the battle ended: for its unit to carry on. */
  gauges: Record<ClashSide, number>;
  /** The skill the player fired, if any. */
  fired: SkillId | null;
}

/** Where the clock holds while the player chooses whether to fire a skill: in the opening, before the charge. */
const CHOOSE_AT = LEAD * 0.5;

/**
 * One battle on screen, over whatever is behind it: its own full-resolution canvas and HUD, the
 * attacker's squad on the left and the defender's on the right on the meadow. The rules decide
 * it (`ClashSim`, seeded) and the director plays it. Space skips to the result; A, S and D set
 * the player's stance. Once it is over, Space, Enter, Z or a click goes on, if the caller has
 * somewhere to go back to: the battle leaves the page and `onLeave` gets how it came out.
 *
 * Card skills (B6, mid-battle since 2026-11-08): each side may fire its card's skill once a
 * battle, attacking or defending, whenever its gauge is full and its weapon matches the card's
 * ACE. The stance charges the gauge (passive fast, neutral slowly) or drains it (aggressive). The
 * player fires with K or the guide's FIRE; a gauge full as the battle opens holds it there for
 * the choice (FIRE, or Space to fight on). The foes fire as soon as they can. A skill fired acts
 * from the next beat, after its cut-in.
 *
 * The clock runs in real time, or stands still for captures (`at`, and `__battle.at` in dev).
 */
export class BattleScene {
  readonly sim: ClashSim;
  private readonly clock = new THREE.Clock();
  /** Seconds added to the real clock: Space jumps it to the result. */
  private skew = 0;
  /** While the player chooses whether to fire, or a cut-in plays, the clock holds here. */
  private held: number | null = null;
  /** Whether the clock is held at the opening for the player's choice. */
  private choosing = false;
  /** Whether the opening's choice has been offered (it is, once, on the first frame). */
  private offered = false;
  /** The skill guide's state, or null when the player's side has no card. */
  private guide: GuideInfo | null = null;
  /** Each side's skill fired this battle, and how many beats had been played when it fired. */
  private readonly fired: Record<ClashSide, { skill: SkillId; beat: number; late: string | null } | null> = { attacker: null, defender: null };
  private readonly onKey = (e: KeyboardEvent) => this.key(e);
  private readonly onClick = () => this.over() && this.leave();

  private constructor(
    private readonly view: BattleView,
    private readonly hud: BattleHud,
    private readonly director: Director,
    sim: ClashSim,
    private readonly setup: ClashSetup,
    /** The player's side in this battle: the one whose stance A, S and D set. */
    private readonly player: ClashSide,
    /** A still clock's second, or null for real time. */
    private fixed: number | null,
    private readonly onLeave?: (outcome: BattleOutcome) => void,
    /** Each side's card: the attacker's in play, the defender's the last its side played. Its skill is what the side may fire. */
    private readonly cards: Record<ClashSide, Card | null> = { attacker: null, defender: null },
  ) {
    this.sim = sim;
    view.renderer.setAnimationLoop(() => this.fixed === null && this.frame(this.now()));
    if (fixed !== null) this.frame(fixed);
    window.addEventListener('keydown', this.onKey);
    view.canvas.addEventListener('click', this.onClick);
    hud.onGuide = (act) => (act === 'fire' ? void this.fire() : this.save());
    if (import.meta.env.DEV) this.hook();
  }

  private frame(seconds: number): void {
    this.draw(seconds);
    this.skills(seconds);
  }

  /** The skill `side` could fire now (its card's battle skill, its weapon the card's ACE, not fired yet), or null. */
  private skillFor(side: ClashSide): SkillId | null {
    const card = this.cards[side];
    const unit = side === 'attacker' ? this.setup.attacker : this.setup.defender;
    const skill = card && battleSkill(card);
    return skill && aceMatches(unit, card) && !this.fired[side] && this.sim.phase !== 'done' ? skill : null;
  }

  /** Whether `side`'s gauge shows full at `seconds`. */
  private full(side: ClashSide, seconds: number): boolean {
    return this.director.gauge(side, seconds) >= GAUGE_MAX;
  }

  /**
   * Each frame: the player's guide, kept to the gauge as it charges; the opening's hold for the
   * choice when the player's gauge is full from the start; and the foes' skill, fired as soon as
   * their gauge is full.
   */
  private skills(seconds: number): void {
    const real = this.fixed === null;
    if (!this.offered) {
      this.offered = true;
      if (real && this.skillFor(this.player) && this.full(this.player, seconds)) {
        this.held = CHOOSE_AT;
        this.choosing = true;
      }
    }
    this.updateGuide(seconds);
    if (this.held !== null) return;
    const foe = other(this.player);
    const skill = this.skillFor(foe);
    if (skill && this.full(foe, seconds)) void this.fireFor(foe, skill, seconds);
  }

  private updateGuide(seconds: number): void {
    const card = this.cards[this.player];
    if (!card) return;
    const unit = this.player === 'attacker' ? this.setup.attacker : this.setup.defender;
    const skill = battleSkill(card);
    const gauge = Math.floor(this.director.gauge(this.player, seconds));
    const fired = this.fired[this.player];
    const state: GuideInfo['state'] = fired ? 'fired'
      : !skill ? 'on-play'
      : !aceMatches(unit, card) ? 'ace'
      : this.sim.phase === 'done' ? (gauge >= GAUGE_MAX ? 'saved' : 'charging')
      : gauge >= GAUGE_MAX ? 'ready' : 'charging';
    // What firing now does, when its moment has passed; once fired, what it did.
    const late = fired ? fired.late : skill && state !== 'saved' && this.sim.late(this.player, skill) ? LATE_TEXT[skill] ?? null : null;
    this.guide = { card: card.name, skill: card.skill.name, text: card.skill.text, state, gauge, ace: card.ace, choosing: this.choosing, late };
    this.hud.guide(this.guide);
  }

  /**
   * Fires `side`'s skill: the rules take it from the next beat, its gauge shows empty, and its
   * cut-in plays with the clock held (in real time), then the battle goes on.
   */
  private async fireFor(side: ClashSide, skill: SkillId, seconds: number): Promise<void> {
    const beat = this.sim.played;
    const late = this.sim.late(side, skill) ? LATE_TEXT[skill] ?? null : null;
    if (!this.sim.fire(side, skill)) return;
    this.fired[side] = { skill, beat, late };
    this.director.spent(side, seconds);
    this.choosing = false;
    this.updateGuide(seconds);
    if (this.fixed !== null) return;
    this.held ??= seconds;
    await CutIn.play(document.body, this.cards[side]!, this.cards[side]!.skill.name);
    this.release();
  }

  /** K, or the guide's FIRE: fires the player's skill if its gauge is full. */
  private async fire(): Promise<void> {
    const seconds = this.fixed ?? this.now();
    const skill = this.skillFor(this.player);
    if (!skill || !this.full(this.player, seconds) || CutIn.state().on) return;
    await this.fireFor(this.player, skill, seconds);
  }

  /** Space while the battle holds for the choice, or the guide's SAVE: fights on, the gauge kept (it can still be fired later). */
  private save(): void {
    if (!this.choosing) return;
    this.choosing = false;
    this.release();
  }

  /** Lets the held clock run on from where it stood. */
  private release(): void {
    if (this.held === null) return;
    this.skew = this.held - this.clock.getElapsedTime();
    this.held = null;
  }

  /**
   * Loads both squads and the backdrop for `setup` and opens the battle on the page. `chain`:
   * which battle of a Union attack this is (from 0) and how many the Union has; shown as
   * "UNION 2 / 3" under the VS when there is more than one. `cards`: each side's card, whose
   * skill its unit may fire: the attacker's in play, the defender's the last its side played.
   */
  static async open(
    setup: ClashSetup,
    options: { at?: number | null; onLeave?: (outcome: BattleOutcome) => void; chain?: { index: number; count: number }; cards?: Partial<Record<ClashSide, Card | null>> } = {},
  ): Promise<BattleScene> {
    const view = new BattleView(document.body);
    const hud = new BattleHud(document.body);
    const chain = options.chain && options.chain.count > 1 ? options.chain : null;
    hud.chain(chain ? `UNION ${chain.index + 1} / ${chain.count}` : null);
    const sim = new ClashSim(setup);
    const sizes = { attacker: sim.attacker.fighters.length, defender: sim.defender.fighters.length };
    const [a, d] = [setup.attacker, setup.defender];
    const [left, right] = await Promise.all([
      SquadLayer.load(view, a.side, a.cls, 'left', sizes.attacker - 1),
      SquadLayer.load(view, d.side, d.cls, 'right', sizes.defender - 1),
      view.setBackdrop(`${ART}../meadow.jpg`),
    ]);
    view.add(left.group, right.group);
    const script = new BattleScript({ attacker: a.cls, defender: d.cls }, sizes);
    const names = { attacker: a.name, defender: d.name };
    const director = new Director(view, { attacker: left, defender: right }, sim, script, hud, names, matchup(setup));
    const player: ClashSide = a.side === 'player' ? 'attacker' : 'defender';
    const cards = { attacker: options.cards?.attacker ?? null, defender: options.cards?.defender ?? null };
    const scene = new BattleScene(view, hud, director, sim, setup, player, options.at ?? null, options.onLeave, cards);
    hud.intro();
    if (import.meta.env.DEV) Object.assign((window as { __battle?: object }).__battle!, { chain, attacker: setup.attacker.id, defenderMorale: setup.defender.morale });
    return scene;
  }

  /** Set once the battle has begun to leave (the wipe covering it), so a second key doesn't leave twice. */
  private leaving = false;

  private now(): number {
    return this.held ?? this.clock.getElapsedTime() + this.skew;
  }

  private draw(seconds: number): void {
    this.director.draw(seconds);
    this.view.render();
  }

  /** Whether the battle is over and played out on screen. */
  private over(): boolean {
    return this.director.over(this.fixed ?? this.now());
  }

  /** Goes on from a finished battle, if there is somewhere to go: takes the battle off the page and hands back how it came out. */
  private async leave(): Promise<void> {
    if (!this.onLeave || !this.sim.winner || this.leaving) return;
    this.leaving = true;
    // The wipe (B8): the blade covers the battle before it goes, so the board never flashes between.
    if (fx.wipe) await Wipe.cover();
    this.dispose();
    this.onLeave({
      winner: this.sim.winner, damage: this.sim.damage,
      gauges: { attacker: this.sim.gauge('attacker'), defender: this.sim.gauge('defender') },
      fired: this.fired[this.player]?.skill ?? null,
    });
  }

  private key(e: KeyboardEvent): void {
    // While the battle holds for the choice: K fires the skill, Space fights on with it kept.
    if (this.choosing && (e.code === 'KeyK' || e.code === 'Space')) {
      e.preventDefault();
      if (e.code === 'KeyK') void this.fire();
      else this.save();
      return;
    }
    // Through a cut-in, K, Space or Enter skips it: the battle goes on at once.
    if (this.held !== null && CutIn.state().on && (e.code === 'KeyK' || e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      CutIn.skip();
      return;
    }
    if (this.held !== null) return;
    if (e.code === 'KeyK') {
      e.preventDefault();
      void this.fire();
    } else if (LEAVE_KEYS.has(e.code) && this.over() && this.onLeave) {
      e.preventDefault();
      void this.leave();
    } else if (e.code === 'Space') {
      e.preventDefault();
      this.skew += Math.max(0, this.director.length() - this.now());
    } else if (STANCE_KEYS[e.code]) {
      this.sim.squad(this.player).stance = STANCE_KEYS[e.code];
      if (this.fixed !== null) this.frame(this.fixed);
    }
  }

  /** Takes the battle off the page and frees its renderer, its pictures and its HUD. */
  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.view.canvas.removeEventListener('click', this.onClick);
    this.view.dispose();
    this.hud.dispose();
    if (import.meta.env.DEV) delete (window as { __battle?: unknown }).__battle;
  }

  /** Hooks for scripts/check.mjs and the capture scripts (dev builds only). */
  private hook(): void {
    const { view, setup, director } = this;
    Object.assign(window, {
      __battle: {
        ready: true,
        /** The drawing buffer against the canvas's size on the page, and the pixel ratio. */
        canvas: () => ({ w: view.canvas.width, h: view.canvas.height, cssW: view.canvas.clientWidth, cssH: view.canvas.clientHeight, dpr: window.devicePixelRatio }),
        at: (seconds: number) => this.frame((this.fixed = seconds)),
        /** When the battle opens and when it ends, in seconds. */
        lead: LEAD,
        length: () => director.length(),
        /** The battle's clock now (held through a choice or a cut-in). */
        now: () => this.fixed ?? this.now(),
        /** The rules' own result for this battle at neutral stances, with the skills fired where they were, for checks against what the scene shows. */
        rules: () => {
          const fire = Object.fromEntries(SIDES.flatMap((s) => { const f = this.fired[s]; return f ? [[s, { skill: f.skill, beat: f.beat }]] : []; }));
          const { winner, damage } = resolveClash({ ...setup, fire });
          return { winner, damage, pow: setup.pow, morale: { attacker: setup.attacker.morale, defender: setup.defender.morale } };
        },
        /**
         * The card skill: the guide's state, whether the clock holds (for the choice, or a cut-in),
         * the skill the player fired and the foes', when (in beats), each side's gauge as shown,
         * and the cut-in.
         */
        skill: () => {
          const t = this.fixed ?? this.now();
          const foe = other(this.player);
          return {
            state: this.guide?.state ?? null, held: this.held !== null, choosing: this.choosing, late: this.guide?.late ?? null,
            fired: this.fired[this.player]?.skill ?? null, firedBeat: this.fired[this.player]?.beat ?? null, foeFired: this.fired[foe]?.skill ?? null,
            gauge: { player: director.gauge(this.player, t), foe: director.gauge(foe, t) }, played: this.sim.played, phase: this.sim.phase,
            cutIn: CutIn.state(),
          };
        },
        /** Each side's stance now. */
        stances: () => ({ attacker: this.sim.attacker.stance, defender: this.sim.defender.stance }),
        /** The battle effects drawn so far (B8): blows' bursts, and the fighters lit by a skill. */
        fx: () => this.director.fx(),
        result: () => (this.sim.winner ? { winner: this.sim.winner, damage: this.sim.damage, defender: setup.defender.id, attacker: setup.attacker.id } : null),
        /** Every character the scene could cast, for checks. */
        characters: Object.keys(CHARACTERS),
      },
    });
  }
}
