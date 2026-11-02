import type { Card } from '../game/cards';

/** How long the cut-in holds the battle, in seconds: the band sweeping in, holding, and leaving in a flash. */
export const CUT_IN_SECONDS = 1.9;

/**
 * A card skill's cut-in (B6), over the battle: a slanted band sweeps across with the card's own
 * hover clip playing in it (its still art until the clip is ready, or if it can't play), the
 * skill's name in large gold letters over the card's, and a white flash as it leaves. A DOM
 * overlay at full resolution, like the battle's HUD; it takes itself off the page when done.
 */
export class CutIn {
  private readonly el: HTMLElement;
  private readonly video: HTMLVideoElement;
  private timer = 0;

  private constructor(parent: HTMLElement, card: Card, skill: string) {
    const dir = `${import.meta.env.BASE_URL}cards/${card.id}/`;
    this.el = document.createElement('div');
    this.el.id = 'cut-in';
    this.el.innerHTML =
      '<div class="band"><div class="art"></div><div class="words"><div class="skill"></div><div class="card"></div></div></div><div class="flash"></div>';
    this.el.querySelector<HTMLElement>('.skill')!.textContent = skill;
    this.el.querySelector<HTMLElement>('.card')!.textContent = card.name;
    const art = this.el.querySelector<HTMLElement>('.art')!;
    art.style.backgroundImage = `url("${dir}art.jpg")`;
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true, preload: 'auto' });
    this.video.src = `${dir}motion.mp4`;
    // Shown once it plays; the still stays behind it until then, or if it can't.
    this.video.addEventListener('playing', () => this.video.classList.add('on'), { once: true });
    void this.video.play().catch(() => {});
    art.appendChild(this.video);
    parent.appendChild(this.el);
  }

  /** Plays `card`'s cut-in for its skill `skill` over `parent`; resolves once it has gone. */
  static play(parent: HTMLElement, card: Card, skill: string): Promise<void> {
    const cut = new CutIn(parent, card, skill);
    return new Promise((resolve) => {
      cut.timer = window.setTimeout(() => {
        cut.dispose();
        resolve();
      }, CUT_IN_SECONDS * 1000);
    });
  }

  /** Whether a cut-in is on the page now, and whether its clip is playing (for checks). */
  static state(): { on: boolean; clip: boolean } {
    const el = document.getElementById('cut-in');
    return { on: !!el, clip: !!el?.querySelector('video.on') };
  }

  private dispose(): void {
    clearTimeout(this.timer);
    this.video.pause();
    this.video.removeAttribute('src');
    this.el.remove();
  }
}
