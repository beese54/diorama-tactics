import { valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import { isLiquid } from './surface';
import { tileAt, type MapFile, type PropId, type TerrainId, type Tile } from './types';

/** At most this share of the land carries cover, so the grid stays readable and lanes stay open. */
export const COVER_SHARE = 0.125;
/** Size of the tree clumps, in tiles. */
const CLUMP_SCALE = 3.2;
/** Rows nearest the front edges carry less cover, so it doesn't hide the board behind it. */
const FRONT_ROWS = 3;
const FRONT_THINNING = 0.35;

/**
 * What each natural ground grows, and how thickly at the heart of a clump (0-1).
 * Trees grow in clumps; rocks and drowned trees are scattered.
 */
const GROWS: Partial<Record<TerrainId, { props: readonly PropId[]; density: number; clumped: boolean }>> = {
  light_woods: { props: ['broadleaf'], density: 0.4, clumped: true },
  forest: { props: ['broadleaf'], density: 0.65, clumped: true },
  pine_forest: { props: ['pine'], density: 0.65, clumped: true },
  snowfield: { props: ['pine_snowy'], density: 0.2, clumped: true },
  hills: { props: ['boulder'], density: 0.08, clumped: false },
  scree: { props: ['boulder'], density: 0.14, clumped: false },
  mountain: { props: ['boulder'], density: 0.12, clumped: false },
  badlands: { props: ['boulder'], density: 0.1, clumped: false },
  swamp: { props: ['snag'], density: 0.2, clumped: false },
  bog: { props: ['snag'], density: 0.22, clumped: false },
};

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const stretch = (n: number) => Math.min(1, Math.max(0, (n - 0.5) * 2 + 0.5));

/**
 * Trees, rocks and drowned trees for a generated map, as tile props. Woods grow in clumps
 * with open ground between them; rocks and swamp snags are scattered. Water, bridges and
 * the tiles beside them stay clear, and so do river banks, so the rivers stay in view; the
 * front rows are thinner. At most COVER_SHARE of the land is covered: the strongest spots
 * win. Cover never blocks a tile. Deterministic.
 */
export function placeCover(map: MapFile): void {
  const rand = mulberry32(map.seed ^ 0xc0e4);
  const size = Math.max(map.width, map.height);
  const near = (t: Tile, test: (n: Tile) => boolean) => AROUND.some(([dx, dy]) => { const n = tileAt(map, t.x + dx, t.y + dy); return !!n && test(n); });
  const scored: { tile: Tile; prop: PropId; score: number }[] = [];
  for (const tile of map.tiles) {
    // Every tile draws the same number of rolls, so changing one rule never reshuffles the rest.
    const [roll, pick] = [rand(), rand()];
    const grows = GROWS[tile.terrain];
    if (!grows || isLiquid(tile) || tile.feature || tile.prop) continue;
    if (near(tile, (n) => !!n.feature || n.water?.kind === 'river' || n.water?.kind === 'waterfall')) continue;
    const clump = grows.clumped ? stretch(valueNoise(map.seed ^ 0x7ee5, tile.x / CLUMP_SCALE, tile.y / CLUMP_SCALE)) : 1;
    const front = Math.min(map.width - 1 - tile.x, map.height - 1 - tile.y) < FRONT_ROWS ? FRONT_THINNING : 1;
    const chance = grows.density * clump * clump * front;
    if (roll >= chance) continue;
    // High pine woods catch the snow.
    const prop = tile.terrain === 'pine_forest' && tile.height >= 5 && pick < 0.5 ? 'pine_snowy' : grows.props[Math.floor(pick * grows.props.length)];
    scored.push({ tile, prop, score: chance - roll });
  }
  const land = map.tiles.filter((t) => !isLiquid(t)).length;
  const cap = Math.floor(land * COVER_SHARE);
  scored.sort((a, b) => b.score - a.score || a.tile.y * size + a.tile.x - (b.tile.y * size + b.tile.x));
  for (const { tile, prop } of scored.slice(0, cap)) tile.prop = prop;
}
