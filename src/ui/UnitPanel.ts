import { GAUGE_MAX } from '../game/gauge';
import { CLASSES, type Unit } from '../game/units';

/** FFT-style box in the bottom-right corner: the unit's name, class and side, Morale, stats, and whether it has moved. */
export class UnitPanel {
  private readonly el: HTMLElement;
  private current: string | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'unit-info';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /**
   * Shows `unit` (null hides the box); `moved` greys out a unit that has used its move this turn;
   * `union` is how many units its Union counts, itself included (1 when it stands alone).
   */
  show(unit: Unit | null, moved = false, union = 1): void {
    const key = unit && `${unit.id}:${unit.morale}:${moved}:${union}:${Math.floor(unit.gauge)}`;
    if (key === this.current) return;
    this.current = key;
    this.el.hidden = !unit;
    if (!unit) return;
    const def = CLASSES[unit.cls];
    const share = Math.max(0, unit.morale / unit.maxMorale);
    const { atk, tec, gen, luk } = unit.stats;
    this.el.className = unit.side;
    this.el.innerHTML =
      `<div class="head"><span class="name"></span><span class="side">${unit.side === 'player' ? 'ALLY' : 'FOE'}</span></div>` +
      `<div class="cls">${def.name}${unit.gender === 'female' ? ' · +' : ' · x'}${union > 1 ? ` · UNION ×${union}` : ''}${moved ? ' · MOVED' : ''}</div>` +
      `<div class="morale"><span>MRL</span><span class="bar"><span style="width:${(share * 100).toFixed(1)}%"></span></span><span>${unit.morale}</span></div>` +
      // The skill gauge it carries from battle to battle: full, its card's skill can fire (B6).
      `<div class="morale skl${unit.gauge >= GAUGE_MAX ? ' full' : ''}"><span>SKL</span><span class="bar"><span style="width:${Math.min(100, (unit.gauge / GAUGE_MAX) * 100).toFixed(1)}%"></span></span><span>${Math.floor(unit.gauge)}</span></div>` +
      `<div class="stats">ATK ${atk}  TEC ${tec}  GEN ${gen}  LUK ${luk}</div>`;
    this.el.querySelector('.name')!.textContent = unit.name;
  }
}
