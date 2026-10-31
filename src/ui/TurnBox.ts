import type { TurnState } from '../game/turn';

/** FFT-style box in the top-right corner: whose turn, the card in play, the MOV left in the shared pool out of the card's, and the keys. */
export class TurnBox {
  private readonly el: HTMLElement;
  private current = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'turn-info';
    parent.appendChild(this.el);
  }

  show(turn: TurnState): void {
    const key = `${turn.side}:${turn.number}:${turn.card?.id}:${turn.pool}`;
    if (key === this.current) return;
    this.current = key;
    this.el.className = turn.side;
    this.el.innerHTML =
      `<div class="head"><span>TURN ${turn.number}</span><span>${turn.side === 'player' ? 'ALLIES' : 'FOES'}</span></div>` +
      (turn.card
        ? `<div class="card">${turn.card.name.toUpperCase()} · POW ${turn.card.pow}</div><div class="mov">MOV ${turn.pool} / ${turn.card.mov}</div>`
        : '<div class="mov">PICK A CARD</div>') +
      '<div class="keys">C CARDS · ENTER END TURN</div>';
  }
}
