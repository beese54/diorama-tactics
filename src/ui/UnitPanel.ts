import { GAUGE_MAX } from '../game/gauge';
import type { SkillMark } from '../game/skills';
import { CLASSES, type Unit } from '../game/units';
import { placeWindow } from './placeWindow';
import { weaponIcon } from './weaponIcon';

/**
 * Where a hero's portrait is kept: public/portraits/<name>.webp, painted for the window
 * (scripts/art/prompts/portraits.json). A missing one just leaves the portrait out.
 */
export const portraitUrl = (name: string) => `${import.meta.env.BASE_URL}portraits/${name.toLowerCase()}.webp`;

/**
 * FFT-style box: the unit's portrait, name and side, class, Morale, stats, and whether it has
 * moved. Pointed at, it floats beside the unit; otherwise (the selected unit) it sits in the
 * bottom-right corner.
 */
export class UnitPanel {
  private readonly el: HTMLElement;
  private current: string | null = null;
  private placedAt: string | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'unit-info';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /**
   * Shows `unit` (null hides the box); `moved` greys out a unit that has used its move this turn;
   * `union` is how many units its Union counts, itself included (1 when it stands alone); `skill`
   * is its SKILL READY mark: the full gauge reads READY when the card in play can fire it, SAVED
   * when it can't (kept for a later card).
   */
  show(unit: Unit | null, moved = false, union = 1, skill: SkillMark | null = null): void {
    const key = unit && `${unit.id}:${unit.morale}:${moved}:${union}:${Math.floor(unit.gauge)}:${skill}`;
    if (key === this.current) return;
    this.current = key;
    this.el.hidden = !unit;
    if (!unit) return;
    const def = CLASSES[unit.cls];
    const share = Math.max(0, unit.morale / unit.maxMorale);
    const { atk, tec, gen, luk } = unit.stats;
    this.el.className = unit.side;
    this.el.innerHTML =
      `<img class="portrait" alt="">` +
      `<div class="info">` +
      `<div class="head"><span class="name"></span><span class="side">${unit.side === 'player' ? 'ALLY' : 'FOE'}</span></div>` +
      `<div class="cls"><span class="wicon w-${def.weapon}">${weaponIcon(def.weapon)}</span>${def.name}${unit.gender === 'female' ? ' · +' : ' · x'}${union > 1 ? ` · UNION ×${union}` : ''}${moved ? ' · MOVED' : ''}</div>` +
      `<div class="morale"><span>MRL</span><span class="bar"><span style="width:${(share * 100).toFixed(1)}%"></span></span><span>${unit.morale}</span></div>` +
      // The skill gauge it carries from battle to battle: full, its card's skill can fire (B6).
      `<div class="morale skl${unit.gauge >= GAUGE_MAX ? ' full' : ''}${skill ? ` ${skill}` : ''}"><span>SKL</span><span class="bar"><span style="width:${Math.min(100, (unit.gauge / GAUGE_MAX) * 100).toFixed(1)}%"></span></span><span>${skill === 'ready' ? 'READY' : skill === 'held' ? 'SAVED' : Math.floor(unit.gauge)}</span></div>` +
      `<div class="stats">ATK ${atk}  TEC ${tec}  GEN ${gen}  LUK ${luk}</div>` +
      `</div>`;
    this.el.querySelector('.name')!.textContent = unit.name;
    const img = this.el.querySelector<HTMLImageElement>('.portrait')!;
    img.onerror = () => img.remove();
    img.src = portraitUrl(unit.name);
    this.placedAt = null;
  }

  /**
   * Floats the box beside `at` (a unit's head, in CSS px within the parent), `gap` px off it and
   * clear of `bottom` px below; or with null puts it back in its corner.
   */
  place(at: { x: number; y: number } | null, view: { w: number; h: number }, bottom = 0, gap = 24): void {
    if (this.el.hidden) return;
    if (!at) {
      if (this.placedAt === 'corner') return;
      this.placedAt = 'corner';
      this.el.classList.remove('floating');
      Object.assign(this.el.style, { left: '', top: '' });
      return;
    }
    this.el.classList.add('floating');
    const { left, top } = placeWindow(at, { w: this.el.offsetWidth, h: this.el.offsetHeight }, view, { bottom, gap });
    const key = `${left},${top}`;
    if (key === this.placedAt) return;
    this.placedAt = key;
    Object.assign(this.el.style, { left: `${left}px`, top: `${top}px` });
  }
}
