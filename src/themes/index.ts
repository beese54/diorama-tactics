import { alpine } from './alpine';
import { autumn } from './autumn';
import { bridge } from './bridge';
import { courtyard } from './courtyard';
import { desert } from './desert';
import { frozen } from './frozen';
import { gardens } from './gardens';
import { harbour } from './harbour';
import { jungle } from './jungle';
import { market } from './market';
import { meadow } from './meadow';
import { moor } from './moor';
import { plaza } from './plaza';
import type { Theme } from './types';
import { volcano } from './volcano';
import { randomSeed, seedFromUrl, sizeFromUrl, worldTheme } from './world';

/** Every map theme, in menu order. The first is the default. */
export const THEMES: readonly Theme[] = [meadow, alpine, autumn, desert, frozen, moor, courtyard, harbour, gardens, bridge, plaza, market, jungle, volcano];

/**
 * The theme named by `?map=<id>`, or the default. `?map=world` (or just `?seed=N`) grows a
 * map from the seed; a missing or malformed seed gets a random one.
 */
export function themeFromUrl(search: string): Theme {
  const params = new URLSearchParams(search);
  const id = params.get('map');
  if (id === 'world' || (id === null && params.has('seed'))) return worldTheme(seedFromUrl(search) ?? randomSeed(), sizeFromUrl(search));
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
