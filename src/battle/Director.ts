import type { ClashSide, ClashSim, Phase } from '../game/clash';
import { CLASSES } from '../game/units';
import type { BannerInfo, BattleHud } from '../ui/BattleHud';
import type { BattleView } from './BattleView';
import { smooth } from './cast';
import { BLOCK, charge, FALL, FOLLOW, HURT, RUN_FROM, STRIDES, SWING, VICTORY } from './clips';
import { clipSeconds, sample, type Beat, type Body, type Cue } from './poseClip';
import { actSeconds, STRIKE, type Act, type BattleScript, type Who } from './script';
import type { FighterView, SquadLayer } from './SquadLayer';

/** An act on the battle's clock: `start` is seconds from the first beat. */
type Timed = Act & { start: number };
type BodyAct = Extract<Timed, { who: Who }>;

/** Quiet seconds before the charge, to take in the squads. */
export const LEAD = 1;
/** At rest, breathing. */
const IDLE: Beat[] = [{ pose: 'stance', seconds: 1.6, breathe: true }];
/** The win, held once it is played. */
const HOLD_WIN: Beat[] = [{ pose: 'victory', seconds: 1.6, breathe: true }];
/** A melee swing's way back to its place: the recovery and the stance at the end of the swing. */
const RETURN = clipSeconds(SWING.slice(-2));
/** How close a melee fighter comes to its foe for a swing, and the lines come to each other, in design units (times reach). */
const CONTACT = { base: 170, reach: 60 };
const CALLOUT: Record<Phase, string> = { charge: 'Charge!', counter: 'Counter!', melee: 'Melee!', done: '' };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const key = (w: Who) => `${w.side}:${w.fighter}`;
const isReaction = (a: Act) => a.kind === 'hurt' || a.kind === 'fall' || a.kind === 'block';

/** Where each cue starts in a clip. */
function cues(clip: readonly Beat[]): { cue: Cue; at: number }[] {
  const out: { cue: Cue; at: number }[] = [];
  let t = 0;
  for (const b of clip) {
    if (b.cue) out.push({ cue: b.cue, at: t });
    t += b.seconds;
  }
  return out;
}

/** The clip a body act plays. */
function clipOf(a: BodyAct): readonly Beat[] {
  switch (a.kind) {
    case 'attack':
      return SWING;
    case 'hurt':
      return HURT;
    case 'fall':
      return FALL;
    case 'block':
      return BLOCK;
    case 'cheer':
      return VICTORY;
    default:
      return IDLE;
  }
}

/** A clip played once: held on its last moment after it ends. */
const once = (clip: readonly Beat[], age: number) => sample(clip, Math.min(age, clipSeconds(clip) - 1e-6));

/**
 * Plays the rules' battle in the scene. It steps `ClashSim` a beat at a time, as each beat is
 * reached (so a stance changed mid-battle counts from the next beat), has `BattleScript` time
 * the beat, and draws every fighter at any moment from the acts so far: a pure function of the
 * clock, so a capture at a given second always shows the same picture.
 *
 * A melee fighter dashes to its foe for a swing and goes back to its place; a blow that cuts in
 * leaves it where it was hit, to stagger back (or fall there). Archers and mages shoot from
 * their places, the shot flying to land on the script's beat.
 */
export class Director {
  private readonly acts: Timed[] = [];
  private readonly body = new Map<string, BodyAct[]>();
  private readonly advances: Record<ClashSide, Extract<Timed, { kind: 'advance' }>[]> = { attacker: [], defender: [] };
  private readonly fell = new Map<string, number>();
  /** When the beats so far run out. */
  private end = LEAD;

  constructor(
    private readonly view: BattleView,
    private readonly squads: Record<ClashSide, SquadLayer>,
    private readonly sim: ClashSim,
    private readonly script: BattleScript,
    private readonly hud: BattleHud,
    private readonly names: Record<ClashSide, string>,
    /** The bottom line until the result: the matchup's edge. */
    private readonly matchup: string,
  ) {}

  /** Whether the battle is over and fully played by `seconds`. */
  over(seconds: number): boolean {
    return this.sim.phase === 'done' && seconds >= this.end;
  }

  /** When the last beat ends: plays the whole battle out to know it (the stances as they are now). */
  length(): number {
    while (this.sim.phase !== 'done') this.next();
    return this.end;
  }

  private next(): void {
    const take = this.script.beat(this.sim.step());
    for (const a of take.acts) {
      const t = { ...a, start: this.end + a.at } as Timed;
      this.acts.push(t);
      if ('who' in t && t.kind !== 'flash') {
        const list = this.body.get(key(t.who)) ?? [];
        list.push(t as BodyAct);
        list.sort((p, q) => p.start - q.start);
        this.body.set(key(t.who), list);
        if (t.kind === 'fall') this.fell.set(key(t.who), t.start);
      }
      if (t.kind === 'advance') this.advances[t.side].push(t);
    }
    this.end += take.seconds;
  }

  private fighter(w: Who): FighterView {
    return this.squads[w.side].fighters[w.fighter];
  }

  /** Forward is to the right for the attacker (on the left), to the left for the defender. */
  private dir(side: ClashSide): number {
    return side === 'attacker' ? 1 : -1;
  }

  private reach(side: ClashSide): number {
    return this.squads[side].fighters[0].character.reach;
  }

  /** How far the side's runs have carried it forward by `seconds`. */
  private advanced(side: ClashSide, seconds: number): number {
    const heads = (s: ClashSide) => this.squads[s].fighters[0].place.x * this.view.width;
    const gap = heads('attacker') + heads('defender') - CONTACT.base - CONTACT.reach * Math.max(this.reach('attacker'), this.reach('defender'));
    let x = 0;
    for (const a of this.advances[side]) x += (a.to === 'foe' ? gap : gap / 2) * this.runProgress(side, a, seconds).progress;
    return x;
  }

  /** A run's progress (0 to 1) and the runner's pose and body at `seconds`. */
  private runProgress(side: ClashSide, a: { start: number; seconds: number }, seconds: number) {
    const clip = charge(this.squads[side].fighters[0].character.run).slice(0, STRIDES + 2);
    const age = seconds - a.start;
    if (age < 0) return { progress: 0, s: null };
    const s = once(clip, age);
    return { progress: age >= a.seconds ? 1 : 1 - s.body.x / RUN_FROM, s: age < a.seconds ? s : null };
  }

  /** A fighter's place on the ground (x, design units from the middle) at `seconds`: its formation place plus its side's runs, until it falls. */
  private station(w: Who, seconds: number): number {
    const f = this.fighter(w);
    const until = Math.min(seconds, this.fell.get(key(w)) ?? Infinity);
    return this.dir(w.side) * (-f.place.x * this.view.width + this.advanced(w.side, until));
  }

  /**
   * How far a melee swing carries the fighter forward (design units): to its foe in a duel; in a
   * volley no further than the nearest foe standing, so the charge breaks on the enemy's front
   * rather than diving through it to a foe in the back.
   */
  private dash(a: Extract<BodyAct, { kind: 'attack' }>): number {
    if (a.ranged) return 0;
    const from = this.station(a.who, a.start);
    const gap = (w: Who) => Math.abs(this.station(w, a.start) - from);
    const foes = this.squads[a.foe.side].fighters.map((_, fighter) => ({ side: a.foe.side, fighter })).filter((w) => (this.fell.get(key(w)) ?? Infinity) > a.start);
    const reach = a.duel ? gap(a.foe) : Math.min(gap(a.foe), ...foes.map(gap));
    return Math.max(0, reach - CONTACT.base - CONTACT.reach * this.reach(a.who.side));
  }

  /** The fighter's forward offset from its place at `seconds`: a swing's dash, eased out and back, carried through any blow that cuts in. */
  private offset(w: Who, seconds: number): number {
    let off = 0;
    const list = (this.body.get(key(w)) ?? []).filter((a) => a.start <= seconds);
    for (const [i, a] of list.entries()) {
      const age = Math.min(seconds, list[i + 1]?.start ?? Infinity) - a.start;
      if (a.kind === 'attack') {
        const up = smooth(clamp01(age / STRIKE));
        const back = smooth(clamp01((age - (clipSeconds(SWING) - RETURN)) / RETURN));
        off = (off + (this.dash(a) - off) * up) * (1 - back);
      } else if (a.kind === 'hurt' || a.kind === 'block') {
        off *= 1 - smooth(clamp01(age / actSeconds(a)));
      }
    }
    return off;
  }

  /** Draws the battle as it stands `seconds` after it opens. */
  draw(seconds: number): void {
    while (this.sim.phase !== 'done' && seconds >= this.end) this.next();
    let shake = 0;
    for (const side of ['attacker', 'defender'] as const) {
      for (const [n, f] of this.squads[side].fighters.entries()) shake = Math.max(shake, this.drawFighter({ side, fighter: n }, f, seconds));
    }
    this.view.nudge(shake * Math.sin(seconds * 97), shake * 0.6 * Math.sin(seconds * 131));
    this.drawHud(seconds);
  }

  /** Draws one fighter; returns the screen shake it calls for. */
  private drawFighter(w: Who, f: FighterView, seconds: number): number {
    const has = (pose: string) => f.frames.has(pose);
    const list = (this.body.get(key(w)) ?? []).filter((a) => a.start <= seconds);
    const act = list.at(-1);
    const age = act ? seconds - act.start : 0;
    const fallen = this.fell.has(key(w)) && this.fell.get(key(w))! <= seconds;
    const run = fallen ? undefined : this.advances[w.side].map((a) => this.runProgress(w.side, a, seconds)).find((r) => r.s);
    let s;
    let clipCues: { cue: Cue; age: number }[] = [];
    if (run?.s) {
      s = run.s;
    } else if (act && (act.kind === 'fall' || age < actSeconds(act) || act.kind === 'cheer')) {
      const clip = clipOf(act);
      s = act.kind === 'cheer' && age >= clipSeconds(clip) ? sample(HOLD_WIN, seconds) : once(clip, age);
      clipCues = cues(clip).map((c) => ({ cue: c.cue, age: age - c.at }));
    } else {
      s = sample(IDLE, seconds + w.fighter * 0.37 + (w.side === 'defender' ? 0.2 : 0));
    }
    const off = this.offset(w, seconds);
    const reach = f.character.reach;
    const body: Body = { ...s.body, x: (run?.s ? 0 : s.body.x * reach) * f.scale + off, y: s.body.y * f.scale };
    f.figure.group.position.x = this.station(w, seconds);
    // A fighter mid-swing is drawn over the others at its depth (the sort puts nearer z later).
    f.figure.group.position.z = act?.kind === 'attack' && age < actSeconds(act) ? 1 : 0;
    f.figure.show(f.frames.get(has(s.pose) ? s.pose : 'stance')!, body);

    // The weapon: a blade's trail from the latest swing's blow; a shot flying to land on its beat.
    const swing = [...list].reverse().find((a) => a.kind === 'attack') as Extract<BodyAct, { kind: 'attack' }> | undefined;
    const blow = swing ? seconds - (swing.start + STRIKE) : -1;
    if (swing && f.effect.speed) {
      const flight = swing.lands - (swing.start + STRIKE);
      const distance = Math.abs(this.station(swing.foe, swing.start) - this.station(w, swing.start)) / (f.figure.k);
      f.effect.update(blow * (distance / f.effect.speed / flight), 0);
      if (blow > flight) f.effect.mesh.visible = false;
    } else {
      f.effect.update(blow, FOLLOW.attack);
    }

    // Dust from the latest stamp: a footfall, a fall, or a blade's blow at the front foot.
    const stamps = [...(run?.s ? run.s.cues : []), ...clipCues.filter((c) => c.age >= 0)].filter((c) => c.cue === 'step' || (c.cue === 'strike' && !f.effect.speed));
    const stamp = stamps.sort((p, q) => p.age - q.age)[0];
    f.dust.update(stamp?.age ?? -1, body.x + (stamp?.cue === 'strike' ? f.character.foot * f.scale : 0));

    // A blow landing: the white blink and the shake (harder for a crit).
    const hit = act && isReaction(act) && act.kind !== 'block' ? age : Infinity;
    f.figure.tint(hit < 0.12 ? 1 - hit / 0.12 : 0);
    const crit = swing?.crit ? 2 : 1;
    const shakes = [hit, swing && !swing.ranged ? blow : Infinity].filter((x) => x >= 0 && x < 0.2);
    return shakes.length ? 4 * crit * (1 - Math.min(...shakes) / 0.2) : 0;
  }

  private drawHud(seconds: number): void {
    const past = this.acts.filter((a) => a.start <= seconds);
    const result = past.find((a) => a.kind === 'result') as Extract<Timed, { kind: 'result' }> | undefined;
    const banner = (side: ClashSide): BannerInfo => {
      const { unit } = this.sim.squad(side);
      const total = this.squads[side].fighters.length;
      const down = [...this.fell].filter(([k, t]) => k.startsWith(side) && t <= seconds).length;
      const lost = result && result.winner !== side ? result.damage : 0;
      return { name: this.names[side], cls: CLASSES[unit.cls].name, morale: Math.max(0, unit.morale - lost), maxMorale: unit.maxMorale, standing: total - down, total };
    };
    const line = result ? `${this.names[result.winner]} wins · Morale −${result.damage}` : this.matchup;
    this.hud.show(banner('attacker'), banner('defender'), line);
    // A word for the moment: the phase, a panic or a flash.
    const word = [...past].reverse().find((a) => (a.kind === 'phase' && a.phase !== 'done') || a.kind === 'panic' || a.kind === 'flash');
    const text = word && seconds - word.start < 0.9 ? (word.kind === 'phase' ? CALLOUT[word.phase] : word.kind === 'panic' ? 'Panic!' : 'Flash!') : null;
    this.hud.callout(result ? null : text);
    this.hud.pop(result ? (result.winner === 'attacker' ? 'right' : 'left') : null, result?.damage);
  }
}
