import { PROPS } from './props';
import type { TerrainId, Tile } from './types';

/** How the ground painter draws a tile top (see ground.ts). */
export type PaintStyle =
  | 'grass' | 'flowers' | 'rows' | 'cobble' | 'woods' | 'canopy'
  | 'rock' | 'snow' | 'swamp' | 'sand' | 'crystal'
  | 'flagstone' | 'cobblestone' | 'blocks' | 'slabs' | 'asphalt' | 'planks' | 'thatch' | 'tiles'
  | LiquidStyle;

/** Liquids are flat, keep their exact shoreline and animate (see liquid.ts). */
export type LiquidStyle = 'water' | 'lava';
export const LIQUID_STYLES: readonly LiquidStyle[] = ['water', 'lava'];

/** What a column's cliff face is made of below the top lip. */
export type SideStyle =
  | 'soil' | 'rock' | 'sand' | 'redrock'
  | 'masonry' | 'concrete' | 'brick' | 'plaster' | 'shopfront' | 'timber' | 'temple' | 'basalt' | 'cottage';
export const SIDE_STYLES: readonly SideStyle[] = [
  'soil', 'rock', 'sand', 'redrock', 'masonry', 'concrete', 'brick', 'plaster', 'shopfront', 'timber', 'temple', 'basalt', 'cottage',
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
