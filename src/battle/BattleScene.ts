import * as THREE from 'three';
import { ClashSim, resolveClash, type ClashSetup, type ClashSide, type Stance } from '../game/clash';
import { CLASSES, triangleEdge } from '../game/units';
import { BattleHud } from '../ui/BattleHud';
import { BattleView } from './BattleView';
import { ART, CHARACTERS } from './cast';
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
}

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
  ) {
    this.sim = sim;
    view.renderer.setAnimationLoop(() => this.fixed === null && this.draw(this.now()));
    if (fixed !== null) this.draw(fixed);
    window.addEventListener('keydown', this.onKey);
    view.canvas.addEventListener('click', this.onClick);
    if (import.meta.env.DEV) this.hook();
  }

  /** Loads both squads and the backdrop for `setup` and opens the battle on the page. */
  static async open(setup: ClashSetup, options: { at?: number | null; onLeave?: (outcome: BattleOutcome) => void } = {}): Promise<BattleScene> {
    const view = new BattleView(document.body);
    const hud = new BattleHud(document.body);
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
    return new BattleScene(view, hud, director, sim, setup, player, options.at ?? null, options.onLeave);
  }

  private now(): number {
    return this.clock.getElapsedTime() + this.skew;
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
    this.onLeave({ winner: this.sim.winner, damage: this.sim.damage });
  }

  private key(e: KeyboardEvent): void {
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
          const { winner, damage } = resolveClash(setup);
          return { winner, damage, pow: setup.pow, morale: { attacker: setup.attacker.morale, defender: setup.defender.morale } };
        },
        /** Every character the scene could cast, for checks. */
        characters: Object.keys(CHARACTERS),
      },
    });
  }
}
