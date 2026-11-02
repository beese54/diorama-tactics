import { audio } from '../audio/Audio';

/** How long the blade takes to sweep across, one way (ms). The styles read it from `--wipe`. */
export const WIPE_MS = 420;

/**
 * The wipe between the board and a battle (B8, `fx.wipe`): a slanted dark blade with gold edges
 * sweeps across the screen. `cover` sweeps it in until it covers the screen; `reveal` sweeps it
 * on and away, uncovering what is now behind it. Over everything, and it takes no clicks.
 */
export class Wipe {
  private static el: HTMLElement | null = null;

  private static blade(): HTMLElement {
    if (!Wipe.el) {
      Wipe.el = document.createElement('div');
      Wipe.el.id = 'wipe';
      Wipe.el.style.setProperty('--wipe', `${WIPE_MS}ms`);
      Wipe.el.innerHTML = '<div class="blade"></div>';
    }
    if (!Wipe.el.isConnected) document.body.appendChild(Wipe.el);
    return Wipe.el;
  }

  private static run(state: 'cover' | 'reveal'): Promise<void> {
    const el = Wipe.blade();
    el.className = '';
    // A reflow between, so the animation starts again each time.
    void el.offsetWidth;
    el.className = state;
    return new Promise((r) => setTimeout(r, WIPE_MS));
  }

  /** Sweeps the blade in until it covers the screen (at once, if it already does). */
  static cover(): Promise<void> {
    if (Wipe.state() === 'cover') return Promise.resolve();
    audio.play('wipe');
    return Wipe.run('cover');
  }

  /** Sweeps the blade on and away, uncovering the screen, then takes it off the page. */
  static async reveal(): Promise<void> {
    await Wipe.run('reveal');
    Wipe.el?.remove();
  }

  /** Whether the blade is on the page now, and how (for checks). */
  static state(): string | null {
    return Wipe.el?.isConnected ? Wipe.el.className : null;
  }
}
