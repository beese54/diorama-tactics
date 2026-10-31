import type { Card, Hand } from '../game/cards';

const ACE: Record<Card['ace'], string> = { all: 'ALL', sword: 'SWORD', spear: 'SPEAR', axe: 'AXE', bow: 'BOW', staff: 'STAFF', lance: 'LANCE' };

/**
 * The hand along the bottom of the screen, in the map's menu style: each card's name, POW, MOV
 * and ACE, and the focused card's skill in a box above. Click a card, or ←/→ and Z, to play it;
 * used cards are greyed and can't be. Shown locked (to look at only) once the turn is under way.
 */
export class CardHand {
  private readonly el: HTMLElement;
  private hand: Hand | null = null;
  private played: Card | null = null;
  private locked = false;
  /** The card the arrows and the detail box are on, as an index into the hand. */
  focused = 0;

  constructor(parent: HTMLElement, private readonly onPlay: (id: string) => void) {
    this.el = document.createElement('div');
    this.el.id = 'card-hand';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('.card')?.dataset.id;
      if (id && this.playable(id)) this.onPlay(id);
    });
    this.el.addEventListener('mouseover', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('.card')?.dataset.id;
      const i = this.hand?.cards.findIndex((c) => c.id === id) ?? -1;
      if (i >= 0 && i !== this.focused) this.focus(i);
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Opens `hand`, with `played` the card in play this turn, if any; `locked` once the turn is under way. */
  show(hand: Hand, played: Card | null, locked: boolean): void {
    [this.hand, this.played, this.locked] = [hand, played, locked];
    const first = hand.cards.findIndex((c) => this.playable(c.id));
    this.focused = played ? hand.cards.indexOf(played) : Math.max(0, first);
    this.el.hidden = false;
    this.render();
  }

  hide(): void {
    this.el.hidden = true;
  }

  /** A key while the hand is open: ←/→ move along it and Z plays the focused card. Returns whether the hand took it. */
  key(code: string): boolean {
    if (!this.open || !this.hand) return false;
    const n = this.hand.cards.length;
    if (code === 'ArrowLeft' || code === 'ArrowRight') this.focus((this.focused + (code === 'ArrowLeft' ? n - 1 : 1)) % n);
    else if (code === 'KeyZ') {
      const id = this.hand.cards[this.focused].id;
      if (this.playable(id)) this.onPlay(id);
    } else return code === 'ArrowUp' || code === 'ArrowDown';
    return true;
  }

  private playable(id: string): boolean {
    return !this.locked && !!this.hand && !this.hand.used.has(id);
  }

  private focus(i: number): void {
    this.focused = i;
    this.render();
  }

  private render(): void {
    const hand = this.hand!;
    const f = hand.cards[this.focused];
    const cards = hand.cards.map((c, i) => {
      const state = c === this.played ? 'played' : hand.used.has(c.id) ? 'used' : this.locked ? 'locked' : '';
      return `<div class="card ${state}${i === this.focused ? ' focus' : ''}" data-id="${c.id}">` +
        `<div class="name">${c.name}</div>` +
        `<div class="num"><span>POW</span><b class="pow">${c.pow}</b></div>` +
        `<div class="num"><span>MOV</span><b class="mov">${c.mov}</b></div>` +
        // A used card, or the one in play, is stamped where its ACE was (the box above still shows it).
        (state === 'played' ? '<div class="stamp">IN PLAY</div>' : state === 'used' ? '<div class="stamp">USED</div>' : `<div class="ace">ACE<br>${ACE[c.ace]}</div>`) +
        '</div>';
    }).join('');
    const keys = this.locked ? 'C CLOSE' : this.played ? '←→ CHOOSE · Z SWAP · X TAKE BACK · C CLOSE' : '←→ CHOOSE · Z PLAY · C CLOSE';
    this.el.innerHTML =
      `<div class="detail"><div class="head"><span class="skill">${f.skill.name}</span><span class="ace">ACE ${ACE[f.ace]}</span></div>` +
      `<div class="text">${f.skill.text}</div><div class="keys">${keys}</div></div>` +
      `<div class="cards">${cards}</div>`;
  }
}
