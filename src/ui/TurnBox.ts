import type { TurnState } from '../game/turn';

/** FFT-style box in the top-right corner: whose turn, the MOV left in the shared pool, and the keys. */
export class TurnBox {
  private readonly el: HTMLElement;
  private current = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'turn-info';
    parent.appendChild(this.el);
  }

  show(turn: TurnState, full: number): void {
    const key = `${turn.side}:${turn.number}:${turn.pool}`;
    if (key === this.current) return;
    this.current = key;
    this.el.className = turn.side;
    this.el.innerHTML =
      `<div class="head"><span>TURN ${turn.number}</span><span>${turn.side === 'player' ? 'ALLIES' : 'FOES'}</span></div>` +
      `<div class="mov">MOV ${turn.pool} / ${full}</div>` +
      '<div class="keys">ENTER END TURN</div>';
  }
}
