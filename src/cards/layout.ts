/** The card's face, in design units (cards.md, Part 1): a portrait 5:7 card. Pure. */
import { CARDS, type Card } from '../game/cards';

export const CARD_W = 1000;
export const CARD_H = 1400;
export const CARD_RADIUS = 44;
/** The square art window, at full width inside the border. */
export const ART = { x: 40, y: 170, size: 920 } as const;
/** The POW and MOV medallions overlap the art window's lower corners. */
export const MEDAL = { r: 80, y: ART.y + ART.size - 8, inset: 112 } as const;

export const ACE_LABEL: Record<Card['ace'], string> = {
  all: 'ALL', sword: 'SWORD', spear: 'SPEAR', axe: 'AXE', bow: 'BOW', staff: 'STAFF', lance: 'LANCE',
};

/** Rarity by POW: one diamond up to 55, two up to 70, three above. */
export function rarity(pow: number): 1 | 2 | 3 {
  return pow <= 55 ? 1 : pow <= 70 ? 2 : 3;
}

/** The card's number in the set, as the footer prints it: "01 / 12". */
export function cardNumber(card: Card): string {
  const i = CARDS.findIndex((c) => c.id === card.id);
  if (i < 0) throw new Error(`card ${card.id} is not in the set`);
  return `${String(i + 1).padStart(2, '0')} / ${CARDS.length}`;
}

/** The art window as fractions of the card (u from the left, v from the bottom, as a texture reads). */
export const ART_UV = {
  u0: ART.x / CARD_W,
  u1: (ART.x + ART.size) / CARD_W,
  v0: 1 - (ART.y + ART.size) / CARD_H,
  v1: 1 - ART.y / CARD_H,
} as const;
