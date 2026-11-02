/** How long a turn banner stays (ms). The styles read it from `--banner`. */
export const BANNER_MS = 1300;

/**
 * The turn banners (B8, `fx.banners`): "YOUR TURN" in blue or "FOES' TURN" in red, with the turn
 * number, sweeping across the board as each turn starts. Over the board, at full resolution in the
 * battle HUD's style; it takes no clicks, and goes by itself.
 */
export class TurnBanner {
  private static el: HTMLElement | null = null;
  private static timer = 0;
  /** How many have been shown, and the last one's words (for checks). */
  static shown = 0;
  static last = '';

  static show(side: 'player' | 'enemy', turn: number): void {
    const el = (TurnBanner.el ??= Object.assign(document.createElement('div'), { id: 'turn-banner' }));
    el.style.setProperty('--banner', `${BANNER_MS}ms`);
    el.className = '';
    void el.offsetWidth;
    el.className = side;
    el.innerHTML = `<div class="band"><span class="words">${side === 'player' ? 'Your turn' : "Foes' turn"}</span><span class="number">Turn ${turn}</span></div>`;
    document.body.appendChild(el);
    TurnBanner.shown++;
    TurnBanner.last = el.textContent ?? '';
    clearTimeout(TurnBanner.timer);
    TurnBanner.timer = window.setTimeout(() => el.remove(), BANNER_MS);
  }

  /** Whether a banner is on the page now (for checks). */
  static on(): boolean {
    return !!TurnBanner.el?.isConnected;
  }
}
