import type { MapFile } from '../map/types';
import { moveRange, pathTo } from './movement';
import type { Side, Unit } from './units';

/** MOV for every turn until cards (B4) set it. */
export const FIXED_POOL = 12;
/** POW for every attack until cards (B4) set it: the base of the Morale the battle's loser loses. */
export const FIXED_POW = 60;

/** Whose turn it is, the MOV left in the shared pool, who has moved, and who has attacked. */
export interface TurnState {
  side: Side;
  /** Counts up each time the player's turn comes round, from 1. */
  number: number;
  pool: number;
  moved: Set<string>;
  attacked: Set<string>;
}

export const startTurn = (side: Side, number: number, pool = FIXED_POOL): TurnState => ({ side, number, pool, moved: new Set(), attacked: new Set() });

/** Whether `unit` may move now: its side's turn, still standing, and not moved yet this turn. */
export const canMove = (turn: TurnState, unit: Unit): boolean => unit.side === turn.side && unit.morale > 0 && !turn.moved.has(unit.id);

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
 * Whether `unit` may attack `foe` now: its side's turn, both standing, on tiles side by side, and
 * it hasn't attacked yet this turn. A unit may move and then attack, but not the other way round.
 */
export const canAttack = (turn: TurnState, unit: Unit, foe: Unit): boolean =>
  unit.side === turn.side && foe.side !== unit.side && unit.morale > 0 && foe.morale > 0 &&
  !turn.attacked.has(unit.id) && Math.abs(unit.x - foe.x) + Math.abs(unit.y - foe.y) === 1;

/** Spends `unit`'s attack on `foe` if the rules allow it: it can neither move nor attack again this turn. Returns whether it may. */
export function attackWith(turn: TurnState, unit: Unit, foe: Unit): boolean {
  if (!canAttack(turn, unit, foe)) return false;
  turn.attacked.add(unit.id);
  turn.moved.add(unit.id);
  return true;
}

/** The next turn: the other side's, with a fresh pool. */
export const nextTurn = (turn: TurnState, pool = FIXED_POOL): TurnState =>
  startTurn(turn.side === 'player' ? 'enemy' : 'player', turn.side === 'enemy' ? turn.number + 1 : turn.number, pool);
