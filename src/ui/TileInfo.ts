import { IMPASSABLE, tileStats } from '../map/terrain';
import type { Tile } from '../map/types';

/** FFT-style info box in the bottom-left corner: terrain (or bridge) name, height, any cover, move cost, defence. */
export class TileInfo {
  private readonly el: HTMLElement;
  private readonly name: HTMLElement;
  private readonly height: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly cover: HTMLElement;
  private current: Tile | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'tile-info';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="head"><span class="name"></span><span class="h"></span></div><div class="cover"></div><div class="stats"></div>';
    this.name = this.el.querySelector('.name')!;
    this.height = this.el.querySelector('.h')!;
    this.stats = this.el.querySelector('.stats')!;
    this.cover = this.el.querySelector('.cover')!;
    parent.appendChild(this.el);
  }

  show(tile: Tile | null): void {
    if (tile === this.current) return;
    this.current = tile;
    this.el.hidden = tile === null;
    if (!tile) return;

    const stats = tileStats(tile);
    this.name.textContent = stats.name;
    // The pixel font's 0 looks like O, so spell out the label rather than "h0".
    this.height.textContent = `HT ${stats.height}`;
    // Cover standing on the tile; its defence is already in DEF.
    this.cover.textContent = stats.cover ?? '';
    this.cover.hidden = !stats.cover;
    const move = stats.moveCost === IMPASSABLE ? '--' : String(stats.moveCost);
    const sign = stats.defense > 0 ? '+' : '';
    this.stats.textContent = `MOV ${move}  DEF ${sign}${stats.defense}%`;
  }
}
