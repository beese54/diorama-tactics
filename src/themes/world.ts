import { generateMap, WORLD_SIZE } from '../map/generator';
import { meadow } from './meadow';
import type { Theme } from './types';

/** Seeds shown and typed by people stay short. */
const SEED_LIMIT = 1_000_000;

export const randomSeed = () => 1 + Math.floor(Math.random() * (SEED_LIMIT - 1));

/** `?seed=N` as a whole number in [0, 2^32), or null if it's missing or malformed. */
export function seedFromUrl(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const seed = Number(raw);
  return seed < 2 ** 32 ? seed : null;
}

/** Board sides people may ask for with `?size=N`, and the ones the menu offers. */
export const MIN_SIZE = 16;
export const MAX_SIZE = 64;
export const BOARD_SIZES = [WORLD_SIZE, 48, 64] as const;

/** `?size=N` as a whole number of tiles per side in [MIN_SIZE, MAX_SIZE], or the standard size. */
export function sizeFromUrl(search: string): number {
  const raw = new URLSearchParams(search).get('size');
  const size = raw !== null && /^\d{1,3}$/.test(raw) ? Number(raw) : WORLD_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}

/** A generated map for `seed`, under the original map's light and scenery. */
export function worldTheme(seed: number, size = WORLD_SIZE): Theme {
  return {
    ...meadow,
    id: 'world',
    name: 'Wild Lands',
    category: 'Generated',
    map: () => generateMap(seed, size),
    focus: [size / 2, size / 2],
    seed,
  };
}
