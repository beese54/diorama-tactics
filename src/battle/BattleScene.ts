import * as THREE from 'three';
import type { Card } from '../game/cards';
import { ClashSim, resolveClash, type ClashSetup, type ClashSide, type SkillId, type Stance } from '../game/clash';
import { battleSkill, whyNot } from '../game/skills';
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
 * The clock runs in real time, or stands still for captures (`at`, and `__battle.at` in dev).
 */
export class BattleScene {
  readonly sim: ClashSim;
  private readonly clock = new THREE.Clock();
  /** Seconds added to the real clock: Space jumps it to the result. */
  private skew = 0;
  /** While the player chooses whether to fire (and through the cut-in), the clock holds here. */
  private held: number | null = null;
  /** The skill guide's state, or null with no card in play. */
  private guide: GuideInfo | null = null;
  private fired: SkillId | null = null;
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
    /** The card the player's side has in play, whose skill it may fire. */
    private readonly card: Card | null = null,
  ) {
    this.sim = sim;
    this.prepareSkill();
    view.renderer.setAnimationLoop(() => this.fixed === null && this.draw(this.now()));
    if (fixed !== null) this.draw(fixed);
    window.addEventListener('keydown', this.onKey);
    view.canvas.addEventListener('click', this.onClick);
    hud.onGuide = (act) => (act === 'fire' ? void this.fire() : this.save());
    if (import.meta.env.DEV) this.hook();
  }

  /**
   * The skill guide (B6), for the card the player's side has in play: ready (the battle holds in
   * its opening until the player fires it, K, or saves the gauge, Space), charging, or the wrong
   * ACE. Only the player's own unit chooses; the foes fire theirs when they attack (from B7).
   */
  private prepareSkill(): void {
    const card = this.card;
    if (!card) return;
    const unit = this.player === 'attacker' ? this.setup.attacker : this.setup.defender;
    const not = whyNot(unit, card);
    const state: GuideInfo['state'] = !not ? 'ready' : not.why === 'charging' ? 'charging' : not.why === 'ace' ? 'ace' : 'on-play';
    this.guide = { card: card.name, skill: card.skill.name, text: card.skill.text, state, gauge: Math.floor(unit.gauge), ace: card.ace };
    this.hud.guide(this.guide);
    // Ready, in real time: hold in the opening for the choice.
    if (state === 'ready' && this.fixed === null) this.held = CHOOSE_AT;
  }

  /** K, or the guide's FIRE: fires the card's skill, plays its cut-in with the clock held, then lets the battle go on. */
  private async fire(): Promise<void> {
    const skill = this.card && battleSkill(this.card);
    if (!skill || this.guide?.state !== 'ready' || this.fired) return;
    if (!this.sim.fire(this.player, skill)) return;
    this.fired = skill;
    this.guide = { ...this.guide, state: 'fired', gauge: 0 };
    this.hud.guide(this.guide);
    this.held ??= this.now();
    await CutIn.play(document.body, this.card!, this.card!.skill.name);
    this.release();
  }

  /** Space while the battle holds for the choice, or the guide's SAVE: keeps the gauge full for later. */
  private save(): void {
    if (this.guide?.state !== 'ready') return;
    this.guide = { ...this.guide, state: 'saved' };
    this.hud.guide(this.guide);
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
   * "UNION 2 / 3" under the VS when there is more than one. `card`: the card the player's side
   * has in play, whose skill its unit may fire (B6).
   */
  static async open(
    setup: ClashSetup,
    options: { at?: number | null; onLeave?: (outcome: BattleOutcome) => void; chain?: { index: number; count: number }; card?: Card | null } = {},
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
    const scene = new BattleScene(view, hud, director, sim, setup, player, options.at ?? null, options.onLeave, options.card ?? null);
    if (import.meta.env.DEV) Object.assign((window as { __battle?: object }).__battle!, { chain, attacker: setup.attacker.id, defenderMorale: setup.defender.morale });
    return scene;
  }

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
  private leave(): void {
    if (!this.onLeave || !this.sim.winner) return;
    this.dispose();
    this.onLeave({ winner: this.sim.winner, damage: this.sim.damage, gauges: { attacker: this.sim.gauge('attacker'), defender: this.sim.gauge('defender') }, fired: this.fired });
  }

  private key(e: KeyboardEvent): void {
    // While the battle holds for the choice: K fires the skill, Space saves the gauge.
    if (this.guide?.state === 'ready' && (e.code === 'KeyK' || e.code === 'Space')) {
      e.preventDefault();
      if (e.code === 'KeyK') void this.fire();
      else this.save();
      return;
    }
    if (this.held !== null) return;
    if (LEAVE_KEYS.has(e.code) && this.over() && this.onLeave) {
      e.preventDefault();
      this.leave();
    } else if (e.code === 'Space') {
      e.preventDefault();
      this.skew += Math.max(0, this.director.length() - this.now());
    } else if (STANCE_KEYS[e.code]) {
      this.sim.squad(this.player).stance = STANCE_KEYS[e.code];
      if (this.fixed !== null) this.draw(this.fixed);
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
        at: (seconds: number) => this.draw((this.fixed = seconds)),
        /** When the battle opens and when it ends, in seconds. */
        lead: LEAD,
        length: () => director.length(),
        /** The rules' own result for this battle at neutral stances, for checks against what the scene shows. */
        rules: () => {
          const { winner, damage } = resolveClash(this.fired ? { ...setup, fire: { [this.player]: this.fired } } : setup);
          return { winner, damage, pow: setup.pow, morale: { attacker: setup.attacker.morale, defender: setup.defender.morale } };
        },
        /** The card skill: the guide's state, whether the clock holds for the choice, the skill fired, and the cut-in. */
        skill: () => ({ state: this.guide?.state ?? null, held: this.held !== null, fired: this.fired, cutIn: CutIn.state() }),
        /** Every character the scene could cast, for checks. */
        characters: Object.keys(CHARACTERS),
      },
    });
  }
}
