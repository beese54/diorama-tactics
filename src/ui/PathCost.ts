/**
 * What a move costs, by the tile the path ends on: "−7 MOV" and what the side's shared pool keeps
 * after it ("3 LEFT"), so a card's MOV reads as a budget the ground spends, not a count of tiles.
 * Drawn in the map's own UI, kept on the tile as the camera moves.
 */
export class PathCost {
  private readonly el = document.createElement('div');
  private key = '';

  constructor(parent: HTMLElement) {
    this.el.id = 'path-cost';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** Shows the move's `cost` out of `pool` (null hides it). */
  show(move: { cost: number; pool: number } | null): void {
    const key = move ? `${move.cost}/${move.pool}` : '';
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = !move;
    if (move) this.el.innerHTML = `<b>-${move.cost} MOV</b><span>${move.pool - move.cost} LEFT</span>`;
  }

  /** Puts the label to the right of `at` (the path's last tile, in CSS px within the UI), or hides it with null. */
  place(at: { x: number; y: number } | null): void {
    if (!at) {
      this.el.style.visibility = 'hidden';
      return;
    }
    this.el.style.visibility = '';
    this.el.style.left = `${at.x}px`;
    this.el.style.top = `${at.y}px`;
  }

  /** The label's text now, or null when hidden (for checks). */
  get text(): string | null {
    return this.el.hidden ? null : this.el.textContent;
  }
}
