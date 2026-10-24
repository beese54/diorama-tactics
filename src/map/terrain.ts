import type { TerrainId } from './types';

/** How the procedural painter draws a tile top (see textures.ts). */
export type PaintStyle =
  | 'grass' | 'flowers' | 'rows' | 'cobble' | 'woods' | 'canopy'
  | 'rock' | 'snow' | 'swamp' | 'sand' | 'water' | 'crystal';

/** What a column's cliff face is made of below the top lip. */
export type SideStyle = 'soil' | 'rock' | 'sand' | 'redrock';
export const SIDE_STYLES: readonly SideStyle[] = ['soil', 'rock', 'sand', 'redrock'];

export interface TerrainDef {
  name: string;
  /** 99 = impassable. Data only during the map phase. */
  moveCost: number;
  /** Defence bonus in percent. Data only during the map phase. */
  defense: number;
  style: PaintStyle;
  side: SideStyle;
  /** Muted FFT-style colours; meaning of each slot depends on `style`. */
  palette: readonly string[];
}

export const IMPASSABLE = 99;

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plains:        { name: 'Plains',        moveCost: 1, defense: 0,   style: 'grass',   side: 'soil',    palette: ['#6f8a4a', '#667f44', '#7a9552', '#8aa35c'] },
  meadow:        { name: 'Meadow',        moveCost: 1, defense: 0,   style: 'flowers', side: 'soil',    palette: ['#76924e', '#6c8748', '#809b56', '#8fa862', '#d9c96a', '#c98a9a'] },
  farmland:      { name: 'Farmland',      moveCost: 1, defense: 0,   style: 'rows',    side: 'soil',    palette: ['#9a8448', '#7e6a3a', '#b09a58'] },
  road:          { name: 'Road',          moveCost: 1, defense: 0,   style: 'cobble',  side: 'soil',    palette: ['#9b8460', '#8f7856', '#b3a07c', '#c9b993'] },
  light_woods:   { name: 'Light Woods',   moveCost: 2, defense: 10,  style: 'woods',   side: 'soil',    palette: ['#6a8547', '#627c42', '#4f6b38', '#7c9a55'] },
  forest:        { name: 'Forest',        moveCost: 2, defense: 20,  style: 'canopy',  side: 'soil',    palette: ['#34502c', '#3a5730', '#47663a', '#5d7d48'] },
  pine_forest:   { name: 'Pine Forest',   moveCost: 2, defense: 20,  style: 'canopy',  side: 'soil',    palette: ['#2c4630', '#314d35', '#3b5c40', '#4f7352'] },
  hills:         { name: 'Hills',         moveCost: 2, defense: 10,  style: 'grass',   side: 'soil',    palette: ['#7d8a4c', '#738047', '#889656', '#99a564'] },
  mountain:      { name: 'Mountain',      moveCost: 3, defense: 30,  style: 'rock',    side: 'rock',    palette: ['#7c7466', '#72695c', '#5a5248', '#948b7b'] },
  peak_snow:     { name: 'Snowy Peak',    moveCost: IMPASSABLE, defense: 0, style: 'snow', side: 'rock', palette: ['#e6ecf0', '#d4dde4', '#b9c6d2'] },
  scree:         { name: 'Scree',         moveCost: 3, defense: 10,  style: 'rock',    side: 'rock',    palette: ['#8a8273', '#80786a', '#686052', '#a39a89'] },
  cliff:         { name: 'Cliff',         moveCost: IMPASSABLE, defense: 0, style: 'rock', side: 'rock', palette: ['#6b6357', '#625a4f', '#4b443b', '#80776a'] },
  swamp:         { name: 'Swamp',         moveCost: 3, defense: -10, style: 'swamp',   side: 'soil',    palette: ['#4f5a3a', '#56603d', '#2f3a2c', '#7a8650'] },
  marsh:         { name: 'Marsh',         moveCost: 2, defense: 0,   style: 'swamp',   side: 'soil',    palette: ['#66784a', '#6e8150', '#4a6a63', '#8c9a5c'] },
  bog:           { name: 'Bog',           moveCost: 3, defense: -10, style: 'swamp',   side: 'soil',    palette: ['#4a4433', '#524b38', '#2b2a22', '#6d6a4a'] },
  beach:         { name: 'Beach',         moveCost: 2, defense: -5,  style: 'sand',    side: 'sand',    palette: ['#d2c08c', '#c9b682', '#e0d1a2'] },
  shallow_water: { name: 'Shallows',      moveCost: 3, defense: -10, style: 'water',   side: 'soil',    palette: ['#4f8aa0', '#5893a8', '#8cc0cc', '#d8eef0'] },
  deep_water:    { name: 'Deep Water',    moveCost: IMPASSABLE, defense: 0, style: 'water', side: 'soil', palette: ['#2e5878', '#325f80', '#4f7f9c', '#9cc4d4'] },
  badlands:      { name: 'Badlands',      moveCost: 2, defense: 5,   style: 'rows',    side: 'redrock', palette: ['#a86e48', '#9a6442', '#b98058'] },
  desert:        { name: 'Desert',        moveCost: 2, defense: -5,  style: 'sand',    side: 'sand',    palette: ['#d9bf84', '#cfb47a', '#e6d0a0'] },
  ruins:         { name: 'Ruins',         moveCost: 1, defense: 20,  style: 'cobble',  side: 'rock',    palette: ['#7f8a6a', '#748060', '#a8a493', '#c4c0ae'] },
  crystal_field: { name: 'Crystal Field', moveCost: 1, defense: 10,  style: 'crystal', side: 'rock',    palette: ['#4a5a5e', '#526468', '#7fd6e0', '#e0fbff'] },
};
