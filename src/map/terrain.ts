import { PROPS } from './props';
import type { TerrainId, Tile } from './types';

/** How the ground painter draws a tile top (see ground.ts). */
export type PaintStyle =
  | 'grass' | 'flowers' | 'rows' | 'cobble' | 'woods' | 'canopy'
  | 'rock' | 'snow' | 'swamp' | 'sand' | 'crystal' | 'leaves' | 'ice' | 'heather' | 'gravel' | 'lawn' | 'hedge' | 'rails' | 'zebra' | 'lanes' | 'roofing' | 'containers' | 'deckplate'
  | 'flagstone' | 'cobblestone' | 'blocks' | 'slabs' | 'asphalt' | 'planks' | 'thatch' | 'tiles'
  | LiquidStyle;

/** Liquids are flat, keep their exact shoreline and animate (see liquid.ts). */
export type LiquidStyle = 'water' | 'lava';
export const LIQUID_STYLES: readonly LiquidStyle[] = ['water', 'lava'];

/** What a column's cliff face is made of below the top lip. */
export type SideStyle =
  | 'soil' | 'rock' | 'sand' | 'redrock'
  | 'masonry' | 'concrete' | 'brick' | 'plaster' | 'shopfront' | 'timber' | 'temple' | 'basalt' | 'cottage' | 'ice' | 'hedge' | 'villa' | 'shop' | 'shop_brick' | 'retaining' | 'container' | 'hull' | 'sandstone' | 'arcade';
export const SIDE_STYLES: readonly SideStyle[] = [
  'soil', 'rock', 'sand', 'redrock', 'masonry', 'concrete', 'brick', 'plaster', 'shopfront', 'timber', 'temple', 'basalt', 'cottage', 'ice', 'hedge', 'villa', 'shop', 'shop_brick', 'retaining', 'container', 'hull', 'sandstone', 'arcade',
];

/**
 * `natural` ground rounds its edges into slopes; `built` ground (paving, walls, buildings)
 * keeps sharp edges and a flat top, the way masonry does.
 */
export type Shape = 'natural' | 'built';

export interface TerrainDef {
  name: string;
  /** 99 = impassable. Data only during the map phase. */
  moveCost: number;
  /** Defence bonus in percent. Data only during the map phase. */
  defense: number;
  style: PaintStyle;
  side: SideStyle;
  shape: Shape;
  /** Muted FFT-style colours; meaning of each slot depends on `style`. */
  palette: readonly string[];
}

export const IMPASSABLE = 99;

const natural = (def: Omit<TerrainDef, 'shape'>): TerrainDef => ({ ...def, shape: 'natural' });
const built = (def: Omit<TerrainDef, 'shape'>): TerrainDef => ({ ...def, shape: 'built' });

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plains:        natural({ name: 'Plains',        moveCost: 1, defense: 0,   style: 'grass',   side: 'soil',    palette: ['#6f8a4a', '#667f44', '#7a9552', '#8aa35c'] }),
  meadow:        natural({ name: 'Meadow',        moveCost: 1, defense: 0,   style: 'flowers', side: 'soil',    palette: ['#76924e', '#6c8748', '#809b56', '#8fa862', '#d9c96a', '#c98a9a'] }),
  farmland:      natural({ name: 'Farmland',      moveCost: 1, defense: 0,   style: 'rows',    side: 'soil',    palette: ['#9a8448', '#7e6a3a', '#b09a58'] }),
  road:          natural({ name: 'Road',          moveCost: 1, defense: 0,   style: 'cobble',  side: 'soil',    palette: ['#9b8460', '#8f7856', '#b3a07c', '#c9b993'] }),
  light_woods:   natural({ name: 'Light Woods',   moveCost: 2, defense: 10,  style: 'woods',   side: 'soil',    palette: ['#6a8547', '#627c42', '#4f6b38', '#7c9a55'] }),
  forest:        natural({ name: 'Forest',        moveCost: 2, defense: 20,  style: 'canopy',  side: 'soil',    palette: ['#34502c', '#3a5730', '#47663a', '#5d7d48'] }),
  pine_forest:   natural({ name: 'Pine Forest',   moveCost: 2, defense: 20,  style: 'canopy',  side: 'soil',    palette: ['#2c4630', '#314d35', '#3b5c40', '#4f7352'] }),
  hills:         natural({ name: 'Hills',         moveCost: 2, defense: 10,  style: 'grass',   side: 'soil',    palette: ['#7d8a4c', '#738047', '#889656', '#99a564'] }),
  mountain:      natural({ name: 'Mountain',      moveCost: 3, defense: 30,  style: 'rock',    side: 'rock',    palette: ['#7c7466', '#72695c', '#5a5248', '#948b7b'] }),
  peak_snow:     natural({ name: 'Snowy Peak',    moveCost: IMPASSABLE, defense: 0, style: 'snow', side: 'rock', palette: ['#e6ecf0', '#d4dde4', '#b9c6d2'] }),
  scree:         natural({ name: 'Scree',         moveCost: 3, defense: 10,  style: 'rock',    side: 'rock',    palette: ['#8a8273', '#80786a', '#686052', '#a39a89'] }),
  cliff:         natural({ name: 'Cliff',         moveCost: IMPASSABLE, defense: 0, style: 'rock', side: 'rock', palette: ['#6b6357', '#625a4f', '#4b443b', '#80776a'] }),
  swamp:         natural({ name: 'Swamp',         moveCost: 3, defense: -10, style: 'swamp',   side: 'soil',    palette: ['#4f5a3a', '#56603d', '#2f3a2c', '#7a8650'] }),
  marsh:         natural({ name: 'Marsh',         moveCost: 2, defense: 0,   style: 'swamp',   side: 'soil',    palette: ['#66784a', '#6e8150', '#4a6a63', '#8c9a5c'] }),
  bog:           natural({ name: 'Bog',           moveCost: 3, defense: -10, style: 'swamp',   side: 'soil',    palette: ['#4a4433', '#524b38', '#2b2a22', '#6d6a4a'] }),
  beach:         natural({ name: 'Beach',         moveCost: 2, defense: -5,  style: 'sand',    side: 'sand',    palette: ['#d2c08c', '#c9b682', '#e0d1a2'] }),
  shallow_water: natural({ name: 'Shallows',      moveCost: 3, defense: -10, style: 'water',   side: 'soil',    palette: ['#4f8aa0', '#5893a8', '#8cc0cc', '#d8eef0'] }),
  deep_water:    natural({ name: 'Deep Water',    moveCost: IMPASSABLE, defense: 0, style: 'water', side: 'soil', palette: ['#2e5878', '#325f80', '#4f7f9c', '#9cc4d4'] }),
  badlands:      natural({ name: 'Badlands',      moveCost: 2, defense: 5,   style: 'rows',    side: 'redrock', palette: ['#a86e48', '#9a6442', '#b98058'] }),
  desert:        natural({ name: 'Desert',        moveCost: 2, defense: -5,  style: 'sand',    side: 'sand',    palette: ['#d9bf84', '#cfb47a', '#e6d0a0'] }),
  ruins:         natural({ name: 'Ruins',         moveCost: 1, defense: 20,  style: 'cobble',  side: 'rock',    palette: ['#7f8a6a', '#748060', '#a8a493', '#c4c0ae'] }),
  crystal_field: natural({ name: 'Crystal Field', moveCost: 1, defense: 10,  style: 'crystal', side: 'rock',    palette: ['#4a5a5e', '#526468', '#7fd6e0', '#e0fbff'] }),

  // Theme terrains. Paving palettes: [stone, stone dark, mortar, stone light, (moss)].
  snowfield:        natural({ name: 'Snowfield',    moveCost: 2, defense: 0,  style: 'snow',        side: 'rock',      palette: ['#e2e8ee', '#d3dce4', '#b8c5d1'] }),
  jungle_floor:     natural({ name: 'Jungle Floor', moveCost: 1, defense: 5,  style: 'grass',       side: 'soil',      palette: ['#4d6c33', '#44602e', '#587a3a', '#6c8f46'] }),
  basalt:           natural({ name: 'Basalt',       moveCost: 1, defense: 5,  style: 'rock',        side: 'basalt',    palette: ['#3a383e', '#323036', '#232126', '#4c4952'] }),
  ash:              natural({ name: 'Ash Field',    moveCost: 2, defense: 0,  style: 'sand',        side: 'basalt',    palette: ['#8c8884', '#807c78', '#a09c97'] }),
  lava:             natural({ name: 'Lava',         moveCost: IMPASSABLE, defense: 0, style: 'lava', side: 'basalt',   palette: ['#ff8a2a', '#c43c10', '#ffd060'] }),
  flagstone:        built({ name: 'Flagstones',     moveCost: 1, defense: 0,  style: 'flagstone',   side: 'masonry',   palette: ['#9c968b', '#8b857a', '#5c5850', '#aea89c'] }),
  cobblestone:      built({ name: 'Cobblestones',   moveCost: 1, defense: 0,  style: 'cobblestone', side: 'masonry',   palette: ['#928b80', '#817a6f', '#56514a', '#a7a094'] }),
  castle_wall:      built({ name: 'Castle Wall',    moveCost: IMPASSABLE, defense: 0, style: 'blocks', side: 'masonry', palette: ['#8f8a80', '#817c72', '#5a564f', '#a39e93'] }),
  asphalt:          built({ name: 'Road',           moveCost: 1, defense: 0,  style: 'asphalt',     side: 'concrete',  palette: ['#56585e', '#4d4f55', '#404247', '#66686d'] }),
  pavement:         built({ name: 'Pavement',       moveCost: 1, defense: 0,  style: 'slabs',       side: 'concrete',  palette: ['#bdb8ad', '#b0aa9f', '#918c82', '#cbc6bb'] }),
  brick_building:   built({ name: 'Building',       moveCost: IMPASSABLE, defense: 0, style: 'slabs', side: 'brick',   palette: ['#86827c', '#7a7671', '#5f5c58', '#94908a'] }),
  plaster_building: built({ name: 'Building',       moveCost: IMPASSABLE, defense: 0, style: 'slabs', side: 'plaster', palette: ['#8f8478', '#83796d', '#685f56', '#9d9286'] }),
  neon_building:    built({ name: 'Shop',           moveCost: IMPASSABLE, defense: 0, style: 'slabs', side: 'shopfront', palette: ['#34343f', '#2d2d38', '#1f1f28', '#3f3f4b'] }),
  wet_street:       built({ name: 'Street',         moveCost: 1, defense: 0,  style: 'flagstone',   side: 'masonry',   palette: ['#4a4752', '#423f4a', '#2a2830', '#5a5664'] }),
  boardwalk:        built({ name: 'Boardwalk',      moveCost: 1, defense: 5,  style: 'planks',      side: 'timber',    palette: ['#8a6a48', '#7a5c3e', '#4a3726', '#9e7c56'] }),
  temple_stone:     built({ name: 'Temple Steps',   moveCost: 1, defense: 10, style: 'blocks',      side: 'temple',    palette: ['#a49e80', '#969073', '#6b664f', '#b8b292', '#6f8a4a'] }),

  // Settlements on generated maps (M6). Rooftops and wall-walks can be stood on, FFT style.
  house_thatch:     built({ name: 'Thatched Roof',  moveCost: 1, defense: 10, style: 'thatch',      side: 'cottage',   palette: ['#b08a48', '#9a763c', '#6e5226', '#c9a25a'] }),
  house_tile:       built({ name: 'Tiled Roof',     moveCost: 1, defense: 10, style: 'tiles',       side: 'cottage',   palette: ['#a4553c', '#8a4430', '#5e2c20', '#bc6a4a'] }),
  rampart:          built({ name: 'Rampart',        moveCost: 1, defense: 20, style: 'blocks',      side: 'masonry',   palette: ['#8f8a80', '#817c72', '#5a564f', '#a39e93'] }),
  ruined_wall:      built({ name: 'Ruined Wall',    moveCost: 1, defense: 15, style: 'blocks',      side: 'temple',    palette: ['#8e8a78', '#807c6c', '#5c594d', '#a19d8a', '#6f8a4a'] }),

  // Wilds themes (M11). Fallen-leaf palettes: [grass ×3 dark to light, tuft, then leaves: red, orange, gold, brown].
  autumn_grass:     natural({ name: 'Autumn Grass', moveCost: 1, defense: 0,  style: 'leaves',      side: 'soil',      palette: ['#7a8844', '#6e7c3e', '#86944c', '#9aa456', '#b8482a', '#d0782c', '#dcae3c', '#86502c'] }),
  red_rock:         natural({ name: 'Red Rock',     moveCost: 2, defense: 10, style: 'rock',        side: 'redrock',   palette: ['#a8643e', '#9a5a38', '#74402a', '#c07a4e'] }),
  oasis_grass:      natural({ name: 'Oasis',        moveCost: 1, defense: 5,  style: 'grass',       side: 'sand',      palette: ['#6a9a40', '#5e8c3a', '#78a84a', '#92bc5a'] }),
  // Ice palette: [pale, light blue, deep blue, crack white, crack shadow, snow dusting].
  ice:              natural({ name: 'Frozen Lake',  moveCost: 1, defense: -10, style: 'ice',        side: 'ice',       palette: ['#d2e4ee', '#b6d2e2', '#8eb4ca', '#f4f9fc', '#7698b2', '#e8f0f5'] }),
  // Heather palette: [ground ×3 dark to light, then blossom: dark, mid, light, highlight].
  heather:          natural({ name: 'Heather',      moveCost: 2, defense: 5,  style: 'heather',     side: 'soil',      palette: ['#5e4a54', '#4e3e48', '#6c5662', '#7a4a78', '#9a5c96', '#bc7cb4', '#d89ccc'] }),
  moor_grass:       natural({ name: 'Moor Grass',   moveCost: 1, defense: 0,  style: 'grass',       side: 'soil',      palette: ['#8a8a50', '#7c7c48', '#9a985a', '#b0aa68'] }),
  drystone:         built({ name: 'Dry-Stone Wall', moveCost: 2, defense: 15, style: 'cobblestone', side: 'masonry',   palette: ['#8a887a', '#7a786c', '#4e4d46', '#a09e90'] }),

  // Kingdom themes (M12).
  gravel:           natural({ name: 'Gravel Walk',  moveCost: 1, defense: 0,  style: 'gravel',      side: 'soil',      palette: ['#c4b89c', '#b4a88c', '#8e826a', '#dcd2bc'] }),
  lawn:             natural({ name: 'Lawn',         moveCost: 1, defense: 0,  style: 'lawn',        side: 'soil',      palette: ['#5a8c3e', '#4c7c36', '#669a46', '#78aa52'] }),
  hedge:            built({ name: 'Hedge',          moveCost: 3, defense: 20, style: 'hedge',       side: 'hedge',     palette: ['#2a5226', '#356430', '#44763a', '#5a8c46'] }),
  flowerbed:        natural({ name: 'Flower Bed',   moveCost: 2, defense: 0,  style: 'flowers',     side: 'soil',      palette: ['#4e6a34', '#44602e', '#587638', '#6a8a40', '#d83a3a', '#f0c030', '#9a4ac8', '#f4f0e8'] }),

  // Modern Town themes (M13). Rail palette: [ballast, ballast dark, ballast light, sleeper, sleeper lit, rail head, rail shadow].
  rail:             built({ name: 'Railway',        moveCost: 2, defense: 0,  style: 'rails',       side: 'concrete',  palette: ['#857f74', '#6e695f', '#9c968a', '#4a3a2c', '#5e4a36', '#d4d8dc', '#34363c'] }),
  house_brick:      built({ name: 'Tiled Roof',     moveCost: 1, defense: 10, style: 'tiles',       side: 'villa',     palette: ['#5e626a', '#4e525a', '#363940', '#72767e'] }),
  shop_building:    built({ name: 'Shops',          moveCost: IMPASSABLE, defense: 0, style: 'slabs', side: 'shop',      palette: ['#8a857e', '#7e7972', '#625e58', '#99948c'] }),
  shop_brick:       built({ name: 'Shops',          moveCost: IMPASSABLE, defense: 0, style: 'slabs', side: 'shop_brick', palette: ['#86827c', '#7a7671', '#5f5c58', '#94908a'] }),
  // Zebra palette: asphalt as the road's, then the stripes' white and their worn edge.
  zebra:            built({ name: 'Zebra Crossing', moveCost: 1, defense: 0,  style: 'zebra',       side: 'concrete',  palette: ['#56585e', '#4d4f55', '#404247', '#66686d', '#ecebe4', '#c8c8c0'] }),

  // Neon City themes (M14). Highway palette: asphalt ×4 as the road's, then lane paint and tyre wear.
  highway:          built({ name: 'Expressway',     moveCost: 1, defense: 0,  style: 'lanes',       side: 'retaining', palette: ['#4a4c54', '#42444c', '#383a40', '#56585e', '#d8d8d0', '#3a3c42'] }),
  // Roofing palette: [membrane, membrane dark, seam, patch, grit].
  roof_deck:        built({ name: 'Rooftop',        moveCost: 1, defense: 0,  style: 'roofing',     side: 'shopfront', palette: ['#4a4652', '#423e4a', '#2c2a32', '#5a5662', '#6a6672'] }),
  roof_plant:       built({ name: 'Plant Room Roof', moveCost: 1, defense: 10, style: 'roofing',    side: 'concrete',  palette: ['#5a5862', '#524f5a', '#36343c', '#6a6872', '#7a7882'] }),
  turf:             built({ name: 'Artificial Turf', moveCost: 1, defense: 0, style: 'lawn',        side: 'concrete',  palette: ['#2e9a52', '#268a48', '#36a85c', '#48b86a'] }),
  // Container palette: four liveries as [colour, its shadow] pairs: rust red, blue, green, orange.
  container:        built({ name: 'Containers',     moveCost: 1, defense: 10, style: 'containers', side: 'container', palette: ['#a8402e', '#7e2e22', '#2e5a9a', '#22447a', '#3a7a4a', '#2a5a36', '#d88a2a', '#a8681e'] }),
  // Deck palette: [paint, paint dark, weld seam, tread].
  ship_deck:        built({ name: 'Ship\'s Deck',   moveCost: 1, defense: 0,  style: 'deckplate',   side: 'hull',      palette: ['#4e5a52', '#46524a', '#2e3630', '#5e6a62'] }),
  moss:             natural({ name: 'Mossy Slope',    moveCost: 2, defense: 5,  style: 'grass',       side: 'rock',      palette: ['#3e5a34', '#34502e', '#4a683c', '#5e7e48'] }),

  // Ruins themes (M15).
  pyramid:          built({ name: 'Pyramid Steps',  moveCost: 2, defense: 10, style: 'blocks',      side: 'sandstone', palette: ['#c8a870', '#b89860', '#8a7048', '#dcc088'] }),
  seating:          built({ name: 'Stands',         moveCost: 1, defense: 10, style: 'blocks',      side: 'arcade',    palette: ['#c4b898', '#b4a888', '#8a8068', '#d6ccae', '#6f8a4a'] }),
  arena_sand:       natural({ name: 'Arena Floor',  moveCost: 1, defense: 0,  style: 'sand',        side: 'sand',      palette: ['#d6c49a', '#ccb88e', '#e2d4ae'] }),

  // Elemental themes (M16).
  cave_floor:       natural({ name: 'Cave Floor',   moveCost: 1, defense: 5,  style: 'rock',        side: 'rock',      palette: ['#4c4a5c', '#444254', '#2e2c3c', '#5e5c70'] }),
  // Glacier palettes follow the ice painter: [pale, light blue, deep blue, crack white, crack shadow, snow dusting].
  glacier:          natural({ name: 'Glacier',      moveCost: 2, defense: 0,  style: 'ice',         side: 'ice',       palette: ['#dce8f0', '#c4d8e6', '#9ab8d0', '#f6fafc', '#7a9ab4', '#eef4f8'] }),
  crevasse:         natural({ name: 'Crevasse',     moveCost: IMPASSABLE, defense: 0, style: 'ice', side: 'ice',       palette: ['#1e3a5a', '#18304c', '#10243a', '#2e5070', '#0a1a2c', '#24405e'] }),
  sand_paving:      built({ name: 'Causeway',       moveCost: 1, defense: 0,  style: 'flagstone',   side: 'sandstone', palette: ['#c4a874', '#b49866', '#8a744c', '#d6bc88'] }),
  bark:             natural({ name: 'Bark Chippings', moveCost: 1, defense: 0, style: 'gravel',    side: 'soil',      palette: ['#8a6440', '#76543a', '#5a3e28', '#a87c50'] }),
};

export type BridgeId = 'bridge_wood' | 'bridge_stone';

/** Bridges carry units over water at the height of its banks, one step above the water. Data only during the map phase. */
export const BRIDGES: Record<BridgeId, { name: string; moveCost: number; defense: number }> = {
  bridge_wood: { name: 'Wooden Bridge', moveCost: 1, defense: 0 },
  bridge_stone: { name: 'Stone Bridge', moveCost: 1, defense: 5 },
};

export const bridgeOf = (tile: Tile): BridgeId | null => (tile.feature === 'bridge_wood' || tile.feature === 'bridge_stone' ? tile.feature : null);

/**
 * What a unit standing on the tile gets: a bridge's deck, or the ground (or water) itself,
 * plus the defence of any cover standing there (a tree, a rock).
 */
export function tileStats(tile: Tile): { name: string; height: number; moveCost: number; defense: number; cover: string | null } {
  const bridge = bridgeOf(tile);
  if (bridge) return { ...BRIDGES[bridge], height: tile.height + 1, cover: null };
  const { name, moveCost, defense } = TERRAIN[tile.terrain];
  const prop = tile.prop ? PROPS[tile.prop] : null;
  return { name, height: tile.height, moveCost, defense: defense + (prop?.defense ?? 0), cover: prop?.name ?? null };
}
