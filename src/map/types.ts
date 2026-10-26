/** Pixels per tile side in every texture: ground image, cliff atlas, sprites. */
export const TILE_PX = 16;

export const TERRAIN_IDS = [
  'plains', 'meadow', 'farmland', 'road', 'light_woods', 'forest', 'pine_forest',
  'hills', 'mountain', 'peak_snow', 'scree', 'cliff', 'swamp', 'marsh', 'bog',
  'beach', 'shallow_water', 'deep_water', 'badlands', 'desert', 'ruins', 'crystal_field',
  'snowfield', 'jungle_floor', 'basalt', 'ash', 'lava', 'flagstone', 'cobblestone', 'castle_wall',
  'asphalt', 'pavement', 'brick_building', 'plaster_building', 'neon_building', 'wet_street', 'boardwalk', 'temple_stone',
  'house_thatch', 'house_tile', 'rampart', 'ruined_wall',
  'autumn_grass', 'red_rock', 'oasis_grass', 'ice', 'heather', 'moor_grass', 'drystone',
] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

export const FEATURE_IDS = [
  'village', 'castle', 'watchtower', 'bridge_stone', 'bridge_wood', 'ancient_tree', 'oasis',
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

/** Decor standing on a tile: cover, obstacles and landmarks (see props.ts). */
export const PROP_IDS = [
  'pine', 'pine_snowy', 'boulder', 'cairn',
  'crate', 'barrel', 'brazier', 'banner', 'throne', 'haystack',
  'tree', 'lamp_post', 'bench', 'fountain', 'traffic_light', 'planter',
  'stall', 'lantern_post', 'lantern_gate', 'vending',
  'jungle_tree', 'fern', 'altar', 'pillar',
  'basalt_spire', 'dead_tree', 'ember_rock', 'vent',
  'broadleaf', 'snag', 'well',
  'autumn_tree', 'great_maple', 'palm', 'cactus', 'stone_arch', 'ice_hut', 'snow_rock', 'bothy', 'sheep', 'gorse',
  'boat', 'lighthouse', 'net_rack',
] as const;
export type PropId = (typeof PROP_IDS)[number];

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
  /** Decor standing on the tile, if any. */
  prop?: PropId;
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
