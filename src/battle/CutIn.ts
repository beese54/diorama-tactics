import type { Card } from '../game/cards';

/**
 * How long the cut-in holds the battle, in seconds: the band sweeping in (about half a second),
 * holding while the card's clip plays, and leaving in a flash. Long enough for the clip to be the
 * focus (the user's review of B6: "the transition [is] too fast"); any of K, Space or Enter skips
 * it. The styles in index.html read it from `--cut-in`, so the two never drift apart.
 */
export const CUT_IN_SECONDS = 4.2;

/**
 * A card skill's cut-in (B6), over the battle: the battle dims, a slanted band sweeps across with
 * the card's own hover clip playing large in it (its still art until the clip is ready, or if it
 * can't play), the skill's name in large gold letters over the card's, and a white flash as it
 * leaves. A DOM overlay at full resolution, like the battle's HUD; it takes itself off the page
 * when done, or when skipped.
 */
export class CutIn {
  /** The cut-in on the page now, if any: a key can end it early. */
  private static current: CutIn | null = null;
  private readonly el: HTMLElement;
  private readonly video: HTMLVideoElement;
  private timer = 0;
  private done: () => void = () => {};

  private constructor(parent: HTMLElement, card: Card, skill: string) {
    const dir = `${import.meta.env.BASE_URL}cards/${card.id}/`;
    this.el = document.createElement('div');
    this.el.id = 'cut-in';
    this.el.style.setProperty('--cut-in', `${CUT_IN_SECONDS}s`);
    this.el.innerHTML =
      '<div class="dim"></div><div class="band"><div class="art"></div><div class="words"><div class="skill"></div><div class="card"></div></div></div><div class="flash"></div>';
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

  /** Plays `card`'s cut-in for its skill `skill` over `parent`; resolves once it has gone (or been skipped). */
  static play(parent: HTMLElement, card: Card, skill: string): Promise<void> {
    CutIn.current?.finish();
    const cut = new CutIn(parent, card, skill);
    CutIn.current = cut;
    return new Promise((resolve) => {
      cut.done = resolve;
      cut.timer = window.setTimeout(() => cut.finish(), CUT_IN_SECONDS * 1000);
    });
  }

  /** Ends the cut-in on the page now, if any (a key pressed through it). Returns whether there was one. */
  static skip(): boolean {
    if (!CutIn.current) return false;
    CutIn.current.finish();
    return true;
  }

  /** Whether a cut-in is on the page now, and whether its clip is playing (for checks). */
  static state(): { on: boolean; clip: boolean } {
    const el = document.getElementById('cut-in');
    return { on: !!el, clip: !!el?.querySelector('video.on') };
  }

  private finish(): void {
    if (CutIn.current === this) CutIn.current = null;
    clearTimeout(this.timer);
    this.video.pause();
    this.video.removeAttribute('src');
    this.el.remove();
    this.done();
  }
}
