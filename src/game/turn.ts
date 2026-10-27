import type { MapFile } from '../map/types';
import { moveRange, pathTo } from './movement';
import type { Side, Unit } from './units';

/** MOV for every turn until cards (B4) set it. */
export const FIXED_POOL = 12;

/** Whose turn it is, the MOV left in the shared pool, and who has moved. */
export interface TurnState {
  side: Side;
  /** Counts up each time the player's turn comes round, from 1. */
  number: number;
  pool: number;
  moved: Set<string>;
}

export const startTurn = (side: Side, number: number, pool = FIXED_POOL): TurnState => ({ side, number, pool, moved: new Set() });

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

/** The next turn: the other side's, with a fresh pool. */
export const nextTurn = (turn: TurnState, pool = FIXED_POOL): TurnState =>
  startTurn(turn.side === 'player' ? 'enemy' : 'player', turn.side === 'enemy' ? turn.number + 1 : turn.number, pool);
