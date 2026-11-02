import type { Card, Hand } from '../game/cards';
import { HandView, type HandCardState } from '../cards/HandView';

/**
 * The player's hand of cards, drawn as the animated cards (src/cards/HandView.ts) along the
 * bottom of the screen. Point at a card (or ←/→) to bring it up: it plays its clip; click it (or
 * Z) to play it, F or a long press to turn it over. Used cards are greyed and can't be played.
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
        if (id && this.playable(id)) this.onPlay(id);
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

  hideFoeCard(): void {
    this.view.hideFoe();
  }

  /** Gets the foes' cards ready in the background, so theirs shows the moment they play it. */
  prefetchFoes(cards: readonly Card[]): void {
    this.view.prefetch(cards, 'enemy');
  }

  /** A key while the hand is open: ←/→ move along it, Z plays the focused card, F turns it over. Returns whether the hand took it. */
  key(code: string): boolean {
    if (!this.open || !this.hand) return false;
    const n = this.hand.cards.length;
    if (code === 'ArrowLeft' || code === 'ArrowRight') this.focus((this.focused + (code === 'ArrowLeft' ? n - 1 : 1)) % n);
    else if (code === 'KeyZ') {
      const id = this.hand.cards[this.focused].id;
      if (this.playable(id)) this.onPlay(id);
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
    this.focused = i;
    this.view.setFocus(i);
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
    return this.locked ? 'F FLIP · C CLOSE' : this.played ? '←→ CHOOSE · Z SWAP · X TAKE BACK · F FLIP · C CLOSE' : '←→ CHOOSE · Z PLAY · F FLIP · C CLOSE';
  }
}
