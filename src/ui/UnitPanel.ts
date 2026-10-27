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

  /** Shows `unit` (null hides the box); `moved` greys out a unit that has used its move this turn. */
  show(unit: Unit | null, moved = false): void {
    const key = unit && `${unit.id}:${unit.morale}:${moved}`;
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
      `<div class="cls">${def.name}${unit.gender === 'female' ? ' · +' : ' · x'}${moved ? ' · MOVED' : ''}</div>` +
      `<div class="morale"><span>MRL</span><span class="bar"><span style="width:${(share * 100).toFixed(1)}%"></span></span><span>${unit.morale}</span></div>` +
      `<div class="stats">ATK ${atk}  TEC ${tec}  GEN ${gen}  LUK ${luk}</div>`;
    this.el.querySelector('.name')!.textContent = unit.name;
  }
}
