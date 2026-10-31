import type { MapFile } from '../map/types';
import type { Card, Hand } from './cards';
import { moveRange, pathTo } from './movement';
import type { Side, Unit } from './units';

/** POW for a battle with no card behind it (the battle preview, `?mode=battle`). */
export const FIXED_POW = 60;

/**
 * Whose turn it is, the card played, the MOV left in the shared pool, who has moved, and
 * whether the side has fought its one battle (which ends the turn).
 */
export interface TurnState {
  side: Side;
  /** Counts up each time the player's turn comes round, from 1. */
  number: number;
  /** Null until the side plays a card: nobody moves or attacks without one. */
  card: Card | null;
  pool: number;
  moved: Set<string>;
  attacked: boolean;
}

export const startTurn = (side: Side, number: number): TurnState => ({ side, number, card: null, pool: 0, moved: new Set(), attacked: false });

/**
 * Plays the card `id` from `hand`: the pool becomes its MOV and the card is used. Until a unit
 * moves, another card may take its place (the first comes back to the hand). Returns whether it
 * may: not a card in the hand, a used card, or a turn already under way changes nothing.
 */
export function playCard(turn: TurnState, hand: Hand, id: string): boolean {
  const card = hand.cards.find((c) => c.id === id);
  if (!card || hand.used.has(id) || turn.moved.size || turn.attacked) return false;
  if (turn.card) hand.used.delete(turn.card.id);
  hand.used.add(id);
  turn.card = card;
  turn.pool = card.mov;
  return true;
}

/** Takes the played card back into the hand, before anyone has moved. Returns whether it may. */
export function takeBack(turn: TurnState, hand: Hand): boolean {
  if (!turn.card || turn.moved.size || turn.attacked) return false;
  hand.used.delete(turn.card.id);
  turn.card = null;
  turn.pool = 0;
  return true;
}

/** Whether `unit` may move now: its side's turn, a card played, no battle yet, still standing, and not moved yet this turn. */
export const canMove = (turn: TurnState, unit: Unit): boolean =>
  unit.side === turn.side && !!turn.card && !turn.attacked && unit.morale > 0 && !turn.moved.has(unit.id);

/**
 * Moves `unit` to the tile at `index` if the rules allow it: spends the path's cost from the
 * pool, marks the unit moved and returns the tiles walked (start included). Returns null and
 * changes nothing otherwise.
 */
export function moveUnit(turn: TurnState, map: MapFile, units: readonly Unit[], unit: Unit, index: number): number[] | null {
  if (!canMove(turn, unit)) return null;
  const range = moveRange(map, units, unit, turn.pool);
  const path = pathTo(range, index);
  if (path.length < 2) return null;
  turn.pool -= range.get(index)!.cost;
  turn.moved.add(unit.id);
  unit.x = index % map.width;
  unit.y = Math.floor(index / map.width);
  return path;
}

/**
 * Whether `unit` may attack `foe` now: its side's turn, a card played, both standing, on tiles
 * side by side, and the side hasn't fought yet this turn. A unit may move and then attack.
 */
export const canAttack = (turn: TurnState, unit: Unit, foe: Unit): boolean =>
  unit.side === turn.side && foe.side !== unit.side && !!turn.card && !turn.attacked && unit.morale > 0 && foe.morale > 0 &&
  Math.abs(unit.x - foe.x) + Math.abs(unit.y - foe.y) === 1;

/** Spends the side's one battle of the turn on `unit` against `foe`, if the rules allow it: after it nobody moves or attacks again this turn. Returns whether it may. */
export function attackWith(turn: TurnState, unit: Unit, foe: Unit): boolean {
  if (!canAttack(turn, unit, foe)) return false;
  turn.attacked = true;
  turn.moved.add(unit.id);
  return true;
}

/** The next turn: the other side's, with no card yet. */
export const nextTurn = (turn: TurnState): TurnState =>
  startTurn(turn.side === 'player' ? 'enemy' : 'player', turn.side === 'enemy' ? turn.number + 1 : turn.number);
