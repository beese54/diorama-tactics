import type { Stance } from '../game/clash';
import { audio } from '../audio/Audio';
import { GAUGE_MAX } from '../game/gauge';
import { fx } from './transitions';

/** How long the intro's classes stay on the HUD (ms): the banners slide in, the VS slams down, the HUD shakes. */
const INTRO_MS = 1500;

/** One side's banner: its head's name and class, Morale, soldiers standing, stance, edge and skill gauge. */
export interface BannerInfo {
  name: string;
  cls: string;
  morale: number;
  maxMorale: number;
  /** Fighters standing, the head included, and the squad's full count. */
  standing: number;
  total: number;
  stance: Stance;
  /** The side's effectiveness: the weapon triangle, its stance and any card bonus. */
  edge: number;
  gauge: number;
  /** Whether it is the player's side: blue, with the stance keys. The foes' is red, wherever it stands. */
  ally: boolean;
}

/** The skill guide's state: what the player's card can do in this battle, and what to press. */
export interface GuideInfo {
  card: string;
  skill: string;
  text: string;
  /** ready: K fires it now, Space saves it; charging: not full yet; ace: the unit can't wield it; on-play: All In acted when played; fired / saved: chosen. */
  state: 'ready' | 'charging' | 'ace' | 'on-play' | 'fired' | 'saved';
  gauge: number;
  ace: string;
}

/** The stances in the order the chips show them, with the key that picks each on the player's side. */
const STANCES: { stance: Stance; key: string; label: string }[] = [
  { stance: 'aggressive', key: 'A', label: 'Aggressive' },
  { stance: 'neutral', key: 'S', label: 'Neutral' },
  { stance: 'passive', key: 'D', label: 'Passive' },
];

/**
 * The battle's heads-up display, drawn sharp over the full-resolution scene: a banner for each
 * side across the top (blue left, red right), and the matchup's effectiveness at the bottom;
 * a word across the field as the battle turns ("Charge!"), and the Morale lost over the loser.
 */
export class BattleHud {
  private readonly el: HTMLElement;
  private readonly word = document.createElement('div');
  private readonly loss = document.createElement('div');
  /** Which battle of a Union attack this is, under the VS. */
  private readonly union = document.createElement('div');
  /** The skill guide: the card's skill, and whether to fire it now or keep charging. */
  private readonly guideEl = document.createElement('div');
  private guideKey = '';
  /** Called when the guide's FIRE or SAVE button is pressed (a tap, on a phone). */
  onGuide: ((act: 'fire' | 'save') => void) | null = null;
  private shown = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'battle-hud';
    parent.appendChild(this.el);
    // The outro (B8, fx.intro): classes on the HUD itself, which outlast show()'s redraws.
    if (fx.intro) this.el.classList.add('outro');
  }

  /** The intro (B8, fx.intro), once the battle is ready: the banners slide in, the VS slams down, the HUD shakes. */
  intro(): void {
    if (!fx.intro) return;
    this.el.classList.add('intro');
    audio.play('clash', 0.62);
    setTimeout(() => this.el.classList.remove('intro'), INTRO_MS);
    this.guideEl.className = 'guide';
    this.guideEl.hidden = true;
    this.guideEl.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('button')?.dataset.act;
      if (act === 'fire' || act === 'save') this.onGuide?.(act);
    });
  }

  /** The skill guide: the card in play, its skill, and the choice (or why there is none), or nothing. */
  guide(g: GuideInfo | null): void {
    const key = JSON.stringify(g);
    if (key !== this.guideKey) {
      this.guideKey = key;
      this.guideEl.hidden = !g;
      if (g) {
        const status = {
          ready: `<b class="ready">READY</b> <button data-act="fire"><kbd>K</kbd> Fire now</button><button data-act="save"><kbd>Space</kbd> Save it</button>`,
          charging: `Charging <b>${g.gauge} / 100</b> · fight to fill it: Aggressive fills it faster, Passive not at all`,
          ace: `Needs <b>ACE ${g.ace.toUpperCase()}</b>: this unit can't fire it`,
          'on-play': 'Acted when the card was played',
          fired: '<b class="ready">FIRED</b>',
          saved: 'Saved: the gauge stays full for a later battle',
        }[g.state];
        this.guideEl.className = `guide ${g.state}`;
        this.guideEl.innerHTML = `<div class="head"><span class="card"></span><span class="skill"></span></div><div class="text"></div><div class="status">${status}</div>`;
        this.guideEl.querySelector('.card')!.textContent = g.card;
        this.guideEl.querySelector('.skill')!.textContent = g.skill;
        this.guideEl.querySelector('.text')!.textContent = g.text;
      }
    }
    if (!this.guideEl.isConnected) this.el.append(this.guideEl);
  }

  /** Draws the banners and the bottom line; unchanged, it leaves the page alone. */
  show(left: BannerInfo, right: BannerInfo, effect: string): void {
    const key = JSON.stringify([left, right, effect]);
    if (key === this.shown) return;
    this.shown = key;
    const banner = (b: BannerInfo, side: string) => {
      const share = Math.max(0, b.morale / b.maxMorale) * 100;
      const pips = Array.from({ length: b.total }, (_, i) => `<i class="${i < b.standing ? 'up' : ''}"></i>`).join('');
      // Only the player picks a stance, so only its chips show their keys: on the left when it
      // attacks, on the right when it defends against the foes' attack (B7).
      const chips = STANCES.map((s) => `<b class="${s.stance === b.stance ? 'on' : ''}" data-stance="${s.stance}">${b.ally ? `<kbd>${s.key}</kbd>` : ''}${s.label}</b>`).join('');
      return `<div class="banner ${side} ${b.ally ? 'ally' : 'foe'}"><div class="who"><span class="name"></span><span class="cls"></span><span class="edge">EDGE ${b.edge > 0 ? '+' : b.edge < 0 ? '−' : ''}${Math.abs(b.edge)}</span></div>` +
        `<div class="morale"><span class="label">MORALE</span><span class="bar"><span style="width:${share.toFixed(1)}%"></span></span><span class="value">${b.morale}</span></div>` +
        `<div class="troops">${pips}</div>` +
        `<div class="stance"><span class="label">STANCE</span>${chips}</div>` +
        `<div class="morale skill${b.gauge >= GAUGE_MAX ? ' full' : ''}"><span class="label">SKILL</span><span class="bar"><span style="width:${((b.gauge / GAUGE_MAX) * 100).toFixed(1)}%"></span></span><span class="value">${Math.floor(b.gauge)}</span></div></div>`;
    };
    this.el.innerHTML = `${banner(left, 'left')}<div class="vs">VS</div>${banner(right, 'right')}<div class="effect"></div>`;
    const [l, r] = this.el.querySelectorAll('.banner');
    for (const [node, b] of [[l, left], [r, right]] as const) {
      node.querySelector('.name')!.textContent = b.name;
      node.querySelector('.cls')!.textContent = b.cls;
    }
    this.el.querySelector('.effect')!.textContent = effect;
    this.word.className = 'callout';
    this.union.className = 'union';
    this.el.append(this.word, this.loss, this.union, this.guideEl);
  }

  /** "UNION 2 / 3" under the VS while a Union attack's battles play, or none. */
  chain(text: string | null): void {
    this.union.hidden = !text;
    this.union.textContent = text ?? '';
    if (!this.union.isConnected) this.el.append(this.union);
  }

  /** A word across the middle of the field, or none. */
  callout(text: string | null): void {
    this.word.hidden = !text;
    if (text && this.word.textContent !== text) this.word.textContent = text;
  }

  /** Takes the HUD off the page. */
  dispose(): void {
    this.el.remove();
  }

  /** The Morale lost, over the losing side's half of the field, or none. */
  pop(side: 'left' | 'right' | null, damage = 0): void {
    const landing = !!side && this.loss.hidden;
    this.loss.hidden = !side;
    this.el.classList.toggle('lost-left', side === 'left');
    this.el.classList.toggle('lost-right', side === 'right');
    if (!side) return;
    // The outro (B8): the Morale lost lands with a punch.
    if (landing && fx.intro) audio.play('crit');
    this.loss.className = `loss ${side}`;
    this.loss.textContent = `−${damage}`;
  }
}
