import type { Card } from './cards';
import type { SkillId } from './clash';
import { GAUGE_MAX } from './gauge';
import { CLASSES, type Side, type Unit } from './units';

/**
 * Card skills (B6). Each card names a skill; all but one act in a battle, fired by the unit
 * fighting it when its skill gauge is full and its weapon matches the card's ACE (or the card is
 * for All). King's Wager's All In acts when the card is played instead: every ally's gauge fills.
 * The battle effects themselves live in ClashSim, which takes a fired skill by its id.
 */

/** What a card's skill is: one that acts in battle, or All In, which acts on play. */
export type CardSkill = SkillId | 'all-in';

const SKILLS: Record<string, CardSkill> = {
  'long-road': 'forced-march',
  'swift-banner': 'lance-charge',
  'scouts-path': 'volley',
  'open-field': 'blade-dance',
  'iron-column': 'pike-wall',
  'ember-rite': 'firestorm',
  'steady-line': 'hold-fast',
  'cleavers-oath': 'rend',
  'shield-wall': 'parry',
  'thunder-hoof': 'trample',
  'grave-toll': 'executioner',
  'kings-wager': 'all-in',
};

/** The skill `card` carries. */
export function skillOf(card: Card): CardSkill {
  const s = SKILLS[card.id];
  if (!s) throw new Error(`no skill for card ${card.id}`);
  return s;
}

/** The battle skill `card` carries, or null if its skill acts on play. */
export function battleSkill(card: Card): SkillId | null {
  const s = skillOf(card);
  return s === 'all-in' ? null : s;
}

/** Whether `unit` may wield `card`'s skill: the card is for All, or its ACE is the unit's weapon. */
export const aceMatches = (unit: Unit, card: Card): boolean => card.ace === 'all' || CLASSES[unit.cls].weapon === card.ace;

/** Why `unit` can't fire `card`'s skill in a battle now, or null if it can. */
export type NotReady = { why: 'on-play' } | { why: 'ace'; ace: Card['ace'] } | { why: 'charging'; gauge: number };

export function whyNot(unit: Unit, card: Card): NotReady | null {
  if (!battleSkill(card)) return { why: 'on-play' };
  if (!aceMatches(unit, card)) return { why: 'ace', ace: card.ace };
  if (unit.gauge < GAUGE_MAX) return { why: 'charging', gauge: Math.floor(unit.gauge) };
  return null;
}

/** Whether `unit` can fire `card`'s skill in a battle now: a battle skill, its ACE, and a full gauge. */
export const canFire = (unit: Unit, card: Card): boolean => whyNot(unit, card) === null;

/**
 * Plays `card`'s on-play effect for `side`, if it has one: All In fills the gauge of every
 * unit of the side still standing. Returns the units it filled.
 */
export function onPlay(card: Card, side: Side, units: readonly Unit[]): Unit[] {
  if (skillOf(card) !== 'all-in') return [];
  const filled = units.filter((u) => u.side === side && u.morale > 0);
  for (const u of filled) u.gauge = GAUGE_MAX;
  return filled;
}
