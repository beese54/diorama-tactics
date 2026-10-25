import { alpine } from './alpine';
import { courtyard } from './courtyard';
import { jungle } from './jungle';
import { market } from './market';
import { meadow } from './meadow';
import { plaza } from './plaza';
import type { Theme } from './types';
import { volcano } from './volcano';

/** Every map theme, in menu order. The first is the default. */
export const THEMES: readonly Theme[] = [meadow, alpine, courtyard, plaza, market, jungle, volcano];

/** The theme named by `?map=<id>`, or the default. */
export function themeFromUrl(search: string): Theme {
  const id = new URLSearchParams(search).get('map');
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
