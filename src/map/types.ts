export const TERRAIN_IDS = [
  'plains', 'meadow', 'farmland', 'road', 'light_woods', 'forest', 'pine_forest',
  'hills', 'mountain', 'peak_snow', 'scree', 'cliff', 'swamp', 'marsh', 'bog',
  'beach', 'shallow_water', 'deep_water', 'badlands', 'desert', 'ruins', 'crystal_field',
] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

export const FEATURE_IDS = [
  'village', 'castle', 'watchtower', 'bridge_stone', 'bridge_wood', 'ancient_tree', 'oasis',
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export interface WaterInfo {
  kind: 'river' | 'lake' | 'sea' | 'ford' | 'waterfall';
  flow: [number, number];
}

export interface Tile {
  x: number;
  y: number;
  height: number;
  terrain: TerrainId;
  moisture: number;
  water: WaterInfo | null;
  feature: FeatureId | null;
  /** Per-tile variation in [0, 1), free for decor placement. */
  seedRand: number;
}

export interface MapFile {
  version: 1;
  seed: number;
  width: number;
  height: number;
  /** Row-major: index = y * width + x. */
  tiles: Tile[];
}

export function tileAt(map: MapFile, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return map.tiles[y * map.width + x];
}
