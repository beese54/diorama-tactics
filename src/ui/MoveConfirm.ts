/**
 * After the player's unit walks (B8, the user's ask: "a confirmed move button, so that i can
 * confirm or undo"): a small box beside its head, CONFIRM to keep the move, UNDO to walk it back
 * and get the MOV back. Z and X do the same from the keyboard. In the map's own pixel style, kept
 * on the unit as the camera moves.
 */
export class MoveConfirm {
  private readonly el = document.createElement('div');

  constructor(parent: HTMLElement, onConfirm: () => void, onUndo: () => void) {
    this.el.id = 'move-confirm';
    this.el.hidden = true;
    const button = (cls: string, key: string, label: string, act: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      // Never takes the focus: Enter and Space belong to the map, not to the last button clicked.
      b.tabIndex = -1;
      b.innerHTML = `<b>${key}</b>${label}`;
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', act);
      return b;
    };
    this.el.append(button('confirm', 'Z', 'CONFIRM', onConfirm), button('undo', 'X', 'UNDO', onUndo));
    parent.appendChild(this.el);
  }

  /** Opens or closes the box. */
  show(open: boolean): void {
    this.el.hidden = !open;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Puts the box beside `at` (the unit's head, in CSS px within the UI), or hides it a moment with null (off screen). */
  place(at: { x: number; y: number } | null): void {
    if (!at) {
      this.el.style.visibility = 'hidden';
      return;
    }
    this.el.style.visibility = '';
    this.el.style.left = `${at.x}px`;
    this.el.style.top = `${at.y}px`;
  }

  /** The buttons' centres on the page, while the box shows (for checks). */
  aims(): { confirm: { x: number; y: number }; undo: { x: number; y: number } } | null {
    if (this.el.hidden) return null;
    const at = (cls: string) => {
      const r = this.el.querySelector(`.${cls}`)!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    return { confirm: at('confirm'), undo: at('undo') };
  }

  remove(): void {
    this.el.remove();
  }
}
