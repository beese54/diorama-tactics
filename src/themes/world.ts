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

/** A generated map for `seed`, under the original map's light and scenery. */
export function worldTheme(seed: number): Theme {
  return {
    ...meadow,
    id: 'world',
    name: 'Wild Lands',
    category: 'Generated',
    map: () => generateMap(seed),
    focus: [WORLD_SIZE / 2, WORLD_SIZE / 2],
    seed,
  };
}
