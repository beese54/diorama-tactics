/** Cards: each turn a side plays one, and it sets the turn's MOV pool and its battle's POW. Pure rules. */
import { mulberry32 } from '../util/rng';
import type { Side, Weapon } from './units';

export interface Card {
  id: string;
  name: string;
  /** The base of the Morale the turn's battle costs its loser. */
  pow: number;
  /** The MOV pool every unit of the side moves from this turn. */
  mov: number;
  /** The weapon a unit needs to fire the card's skill, or any. */
  ace: Weapon | 'all';
  /** Named and described now; skills fire in B6. */
  skill: { name: string; text: string };
}

/** Every card, the longest reach first: the stronger the card, the shorter the march (POW + 5 MOV ≈ 115). */
export const CARDS: readonly Card[] = [
  { id: 'long-road', name: 'Long Road', pow: 40, mov: 15, ace: 'all', skill: { name: 'Forced March', text: '+3 edge for the whole battle.' } },
  { id: 'swift-banner', name: 'Swift Banner', pow: 45, mov: 14, ace: 'lance', skill: { name: 'Lance Charge', text: 'The charge strikes twice.' } },
  { id: 'scouts-path', name: "Scout's Path", pow: 50, mov: 13, ace: 'bow', skill: { name: 'Volley', text: 'Every archer looses a second arrow.' } },
  { id: 'open-field', name: 'Open Field', pow: 55, mov: 12, ace: 'sword', skill: { name: 'Blade Dance', text: 'Each duel won fells a second foe.' } },
  { id: 'iron-column', name: 'Iron Column', pow: 60, mov: 11, ace: 'spear', skill: { name: 'Pike Wall', text: "The foe's charge misses." } },
  { id: 'ember-rite', name: 'Ember Rite', pow: 60, mov: 11, ace: 'staff', skill: { name: 'Firestorm', text: 'A blast strikes every foe at the charge.' } },
  { id: 'steady-line', name: 'Steady Line', pow: 65, mov: 10, ace: 'all', skill: { name: 'Hold Fast', text: 'Lose only half the Morale if the battle is lost.' } },
  { id: 'cleavers-oath', name: "Cleaver's Oath", pow: 70, mov: 9, ace: 'axe', skill: { name: 'Rend', text: '+20 Morale damage on a win.' } },
  { id: 'shield-wall', name: 'Shield Wall', pow: 75, mov: 8, ace: 'sword', skill: { name: 'Parry', text: 'The first three blows at the leader miss.' } },
  { id: 'thunder-hoof', name: 'Thunder Hoof', pow: 80, mov: 7, ace: 'lance', skill: { name: 'Trample', text: 'The charge fells the front rank.' } },
  { id: 'grave-toll', name: 'Grave Toll', pow: 85, mov: 6, ace: 'axe', skill: { name: 'Executioner', text: 'A duel with the leader is won outright.' } },
  { id: 'kings-wager', name: "King's Wager", pow: 90, mov: 5, ace: 'all', skill: { name: 'All In', text: 'The skill gauge starts full.' } },
];

export const HAND_SIZE = 8;

/** A side's cards for the skirmish, in catalogue order, and the ones played since it was last full. */
export interface Hand {
  cards: readonly Card[];
  used: Set<string>;
}

/** `side`'s hand for a skirmish on a map with `seed`: HAND_SIZE different cards, the same each time. */
export function deal(seed: number, side: Side): Hand {
  const rand = mulberry32(seed * 2 + (side === 'enemy' ? 1 : 0));
  const order = CARDS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { cards: order.slice(0, HAND_SIZE).sort((a, b) => a - b).map((i) => CARDS[i]), used: new Set() };
}

/** The cards in `hand` still to be played. */
export const unused = (hand: Hand): Card[] => hand.cards.filter((c) => !hand.used.has(c.id));

/** At a turn's start: once every card has been played, they all come back. */
export function refill(hand: Hand): void {
  if (!unused(hand).length) hand.used.clear();
}
