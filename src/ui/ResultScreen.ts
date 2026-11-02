import { audio } from '../audio/Audio';
import type { Outcome, Stats } from '../game/end';

/**
 * The end of a skirmish (B7), over the board at full resolution, in the battle HUD's style rather
 * than the map's pixel menu: VICTORY in gold or DEFEAT in crimson, the battle's stats, and two
 * buttons, Play again (Enter: the same map, a fresh skirmish) and New map (R). Big enough to tap.
 */
export class ResultScreen {
  private static current: ResultScreen | null = null;
  private readonly el: HTMLElement;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter') this.choose(this.again, e);
    else if (e.code === 'KeyR') this.choose(this.newMap, e);
  };

  private constructor(result: Outcome, s: Stats, private readonly again: () => void, private readonly newMap: () => void) {
    this.el = document.createElement('div');
    this.el.id = 'result';
    this.el.className = result;
    this.el.innerHTML =
      `<div class="panel"><div class="title">${result === 'victory' ? 'Victory' : 'Defeat'}</div>` +
      `<div class="line">${result === 'victory' ? 'Every foe has fallen.' : 'Every ally has fallen.'}</div>` +
      '<dl class="stats">' +
      `<div><dt>Turns</dt><dd>${s.turns}</dd></div>` +
      `<div><dt>Battles won</dt><dd>${s.won} / ${s.battles}</dd></div>` +
      `<div><dt>Foes felled</dt><dd>${s.foesFelled}</dd></div>` +
      `<div><dt>Allies lost</dt><dd>${s.alliesLost}</dd></div>` +
      '</dl>' +
      '<div class="buttons"><button data-act="again"><kbd>Enter</kbd> Play again</button><button data-act="new"><kbd>R</kbd> New map</button></div></div>';
    this.el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('button')?.dataset.act;
      if (act === 'again') this.choose(this.again);
      else if (act === 'new') this.choose(this.newMap);
    });
    document.body.appendChild(this.el);
    // The key that ended the last battle mustn't also press a button: listen from the next one.
    setTimeout(() => addEventListener('keydown', this.onKey, true), 300);
  }

  /** Shows the result over the board; `again` replays the map, `newMap` moves on. Replaces any shown. */
  static show(result: Outcome, stats: Stats, again: () => void, newMap: () => void): void {
    ResultScreen.current?.dispose();
    ResultScreen.current = new ResultScreen(result, stats, again, newMap);
    audio.play(result);
    void audio.music(result);
  }

  /** Takes any result off the page (a new skirmish starting). */
  static hide(): void {
    ResultScreen.current?.dispose();
  }

  /** The result shown now, for checks: its outcome and the stats as written. */
  static state(): { result: string; text: string } | null {
    const el = document.getElementById('result');
    return el ? { result: el.className, text: el.textContent ?? '' } : null;
  }

  private choose(act: () => void, e?: KeyboardEvent): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.dispose();
    act();
  }

  private dispose(): void {
    removeEventListener('keydown', this.onKey, true);
    this.el.remove();
    if (ResultScreen.current === this) ResultScreen.current = null;
  }
}
