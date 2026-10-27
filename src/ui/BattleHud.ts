/** One side's banner: its head's name and class, Morale, and soldiers standing. */
export interface BannerInfo {
  name: string;
  cls: string;
  morale: number;
  maxMorale: number;
  /** Fighters standing, the head included, and the squad's full count. */
  standing: number;
  total: number;
}

/**
 * The battle's heads-up display, drawn sharp over the full-resolution scene: a banner for each
 * side across the top (blue left, red right), and the matchup's effectiveness at the bottom.
 */
export class BattleHud {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'battle-hud';
    parent.appendChild(this.el);
  }

  show(left: BannerInfo, right: BannerInfo, effect: string): void {
    const banner = (b: BannerInfo, side: string) => {
      const share = Math.max(0, b.morale / b.maxMorale) * 100;
      const pips = Array.from({ length: b.total }, (_, i) => `<i class="${i < b.standing ? 'up' : ''}"></i>`).join('');
      return `<div class="banner ${side}"><div class="who"><span class="name"></span><span class="cls"></span></div>` +
        `<div class="morale"><span class="label">MORALE</span><span class="bar"><span style="width:${share.toFixed(1)}%"></span></span><span class="value">${b.morale}</span></div>` +
        `<div class="troops">${pips}</div></div>`;
    };
    this.el.innerHTML = `${banner(left, 'left')}<div class="vs">VS</div>${banner(right, 'right')}<div class="effect"></div>`;
    const [l, r] = this.el.querySelectorAll('.banner');
    for (const [node, b] of [[l, left], [r, right]] as const) {
      node.querySelector('.name')!.textContent = b.name;
      node.querySelector('.cls')!.textContent = b.cls;
    }
    this.el.querySelector('.effect')!.textContent = effect;
  }
}
