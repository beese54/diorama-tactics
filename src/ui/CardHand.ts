import { audio } from '../audio/Audio';
import type { Card, Hand } from '../game/cards';
import { HandView, type FlyTarget, type HandCardState } from '../cards/HandView';
import { fx } from './transitions';

/** The turn box on screen, to fly a played card into (B8), or null if it isn't up. */
function turnBox(): { el: HTMLElement; to: FlyTarget } | null {
  const el = document.getElementById('turn-info');
  const r = el?.getBoundingClientRect();
  if (!el || !r || r.width === 0) return null;
  return { el, to: { x: r.left + r.width / 2, y: r.top + r.height / 2, h: Math.max(48, r.height * 1.1) } };
}

/** The turn box lights up as a card lands in it. */
function glow(el: HTMLElement): void {
  el.animate(
    [
      { boxShadow: '0 0 0 0 rgba(255, 224, 138, 0)', filter: 'brightness(1)' },
      { boxShadow: '0 0 28px 8px rgba(255, 224, 138, 0.9)', filter: 'brightness(1.7)', offset: 0.25 },
      { boxShadow: '0 0 0 0 rgba(255, 224, 138, 0)', filter: 'brightness(1)' },
    ],
    { duration: 750, easing: 'ease-out' },
  );
}

/**
 * The player's hand of cards, drawn as the animated cards (src/cards/HandView.ts), tucked along
 * the bottom of the screen. Point at a card (or ←/→) to bring the hand into focus and the card up
 * in the middle: it plays its clip; click it (or Z) to play it, F or a long press to turn it
 * over, Esc or the pointer off the hand to tuck it away again. Used cards are greyed and can't be played.
 * Shown locked (to look at only) once the turn is under way. It also shows the card the foes play.
 */
export class CardHand {
  private readonly view: HandView;
  private hand: Hand | null = null;
  private played: Card | null = null;
  private locked = false;
  /** The card the arrows are on, as an index into the hand. */
  focused = 0;

  constructor(private readonly onPlay: (id: string) => void) {
    this.view = new HandView({
      focus: (i) => this.focus(i),
      play: (i) => {
        const id = this.hand?.cards[i].id;
        if (id && this.playable(id)) this.playCard(id);
      },
    });
  }

  get open(): boolean {
    return this.view.open;
  }

  /** Opens `hand`, with `played` the card in play this turn, if any; `locked` once the turn is under way. */
  show(hand: Hand, played: Card | null, locked: boolean): void {
    [this.hand, this.played, this.locked] = [hand, played, locked];
    const first = hand.cards.findIndex((c) => this.playable(c.id));
    this.focused = played ? hand.cards.indexOf(played) : Math.max(0, first);
    this.view.show(hand.cards, this.states(), this.focused, this.keys());
  }

  hide(): void {
    this.view.hide();
  }

  /** The foes play `card`: it shows face down, then turns face up. */
  showFoeCard(card: Card): void {
    this.view.showFoe(card);
  }

  /** The foes' card goes: into the turn box (B8), or off to the side. */
  hideFoeCard(): void {
    const box = fx.cardfly ? turnBox() : null;
    if (box) this.view.hideFoe(box.to, () => glow(box.el));
    else this.view.hideFoe();
  }

  /** Gets the foes' cards ready in the background, so theirs shows the moment they play it. */
  prefetchFoes(cards: readonly Card[]): void {
    this.view.prefetch(cards, 'enemy');
  }

  /**
   * A key while the hand is open: ←/→ bring it into focus and move along it, Esc tucks it back
   * down, Z plays the focused card, F turns it over. Returns whether the hand took it.
   */
  key(code: string): boolean {
    if (!this.open || !this.hand) return false;
    const n = this.hand.cards.length;
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      // The first arrow brings the hand into focus on the card already up; the next ones move along.
      if (this.view.focusing) this.focus((this.focused + (code === 'ArrowLeft' ? n - 1 : 1)) % n);
      else this.view.browse(true);
    } else if (code === 'Escape' && this.view.focusing) this.view.browse(false);
    else if (code === 'KeyZ') {
      const id = this.hand.cards[this.focused].id;
      if (this.playable(id)) this.playCard(id);
    } else if (code === 'KeyF') this.view.flipFocused();
    else return code === 'ArrowUp' || code === 'ArrowDown';
    return true;
  }

  /** The hand on screen, for checks. */
  info(): ReturnType<HandView['info']> {
    return this.view.info();
  }

  dispose(): void {
    this.view.dispose();
  }

  private playable(id: string): boolean {
    return !this.locked && !!this.hand && !this.hand.used.has(id);
  }

  private focus(i: number): void {
    if (i !== this.focused) audio.play('tick');
    this.focused = i;
    this.view.setFocus(i);
  }

  /** Plays card `id`, with its swish; it flies into the turn box (B8). */
  private playCard(id: string): void {
    audio.play('card');
    const box = fx.cardfly ? turnBox() : null;
    if (box && this.hand) this.view.fly(this.hand.cards.findIndex((c) => c.id === id), box.to, () => glow(box.el));
    // Played, the hand tucks back down and the board comes clear.
    this.view.browse(false);
    this.onPlay(id);
  }

  private states(): HandCardState[] {
    const hand = this.hand!;
    return hand.cards.map((c) => (c === this.played ? 'played' : hand.used.has(c.id) ? 'used' : this.locked ? 'locked' : ''));
  }

  /** The line of keys over the hand; on a touch screen, what a finger does instead. */
  private keys(): string {
    if (matchMedia('(pointer: coarse)').matches) {
      return this.locked ? 'HOLD A CARD TO FLIP IT' : this.played ? 'TAP TO CHOOSE · TAP AGAIN TO SWAP · HOLD TO FLIP' : 'TAP TO CHOOSE · TAP AGAIN TO PLAY · HOLD TO FLIP';
    }
    return this.locked ? '←→ CHOOSE · F FLIP · ESC BACK · C CLOSE' : this.played ? '←→ CHOOSE · Z SWAP · X TAKE BACK · F FLIP · ESC BACK' : '←→ CHOOSE · Z PLAY · F FLIP · ESC BACK · C CLOSE';
  }
}
