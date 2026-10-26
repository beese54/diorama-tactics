import { hash } from '../util/noise';
import type { PropId, Tile } from './types';

export interface PropLight {
  color: number;
  intensity: number;
  /** Reach in world units. */
  distance: number;
  /** Firelight wavers; electric light stays steady. */
  flicker?: boolean;
}

export interface PropDef {
  name: string;
  /** Defence bonus in percent for a unit beside or behind it. Data only during the map phase. */
  defense: number;
  /** Units can't stand on its tile (pillars, spires, landmarks). */
  blocks: boolean;
  /** Sprite variants, picked per tile. */
  variants: number;
  /** Radius of the contact shadow baked into the ground, in px. */
  shadow: number;
  /** How far the top leans in the wind, in world units. */
  sway: number;
  /** Natural props stand off-centre; built ones sit in the middle of their tile. */
  jitter: boolean;
  /** Light it casts on its surroundings (lit only on themes that turn prop lights on). */
  light?: PropLight;
  /** Sits on water rather than ground (boats). Everything else stands on land. */
  floats?: boolean;
}

const prop = (name: string, def: Partial<Omit<PropDef, 'name'>> = {}): PropDef => ({
  name, defense: 10, blocks: false, variants: 1, shadow: 4, sway: 0, jitter: false, ...def,
});

export const PROPS: Record<PropId, PropDef> = {
  pine:          prop('Pine',          { defense: 15, variants: 3, shadow: 5, sway: 0.035, jitter: true }),
  pine_snowy:    prop('Snowy Pine',    { defense: 15, variants: 2, shadow: 5, sway: 0.03, jitter: true }),
  boulder:       prop('Boulder',       { defense: 20, variants: 2, shadow: 6, jitter: true }),
  cairn:         prop('Summit Cairn',  { defense: 0, blocks: true, shadow: 5, sway: 0.02 }),
  crate:         prop('Crates',        { defense: 15, variants: 2, shadow: 5 }),
  barrel:        prop('Barrels',       { defense: 15, shadow: 4 }),
  brazier:       prop('Brazier',       { defense: 0, shadow: 3, light: { color: 0xff9a48, intensity: 4, distance: 4.5, flicker: true } }),
  banner:        prop('Banner',        { defense: 0, shadow: 2, sway: 0.05 }),
  throne:        prop('Throne',        { defense: 0, blocks: true, shadow: 6 }),
  haystack:      prop('Haystack',      { defense: 15, shadow: 6, jitter: true }),
  tree:          prop('Tree',          { defense: 15, variants: 2, shadow: 7, sway: 0.04, jitter: true }),
  lamp_post:     prop('Lamp Post',     { defense: 0, shadow: 2, light: { color: 0xffe0a0, intensity: 3, distance: 4 } }),
  bench:         prop('Bench',         { defense: 5, shadow: 5 }),
  fountain:      prop('Fountain',      { defense: 0, blocks: true, shadow: 11 }),
  traffic_light: prop('Traffic Light', { defense: 0, shadow: 2 }),
  planter:       prop('Planter',       { defense: 10, shadow: 5 }),
  stall:         prop('Market Stall',  { defense: 15, variants: 3, shadow: 8, light: { color: 0xffa860, intensity: 2.5, distance: 3.5, flicker: true } }),
  lantern_post:  prop('Lantern',       { defense: 0, shadow: 2, sway: 0.015, light: { color: 0xff6a4a, intensity: 3.5, distance: 4.5, flicker: true } }),
  lantern_gate:  prop('Lantern Gate',  { defense: 0, blocks: true, shadow: 9, light: { color: 0xff8050, intensity: 6, distance: 6, flicker: true } }),
  vending:       prop('Vending Machine', { defense: 15, shadow: 4, light: { color: 0x60e0ff, intensity: 2.5, distance: 3 } }),
  jungle_tree:   prop('Jungle Tree',   { defense: 20, variants: 2, shadow: 9, sway: 0.035, jitter: true }),
  fern:          prop('Ferns',         { defense: 5, variants: 2, shadow: 4, sway: 0.05, jitter: true }),
  altar:         prop('Altar',         { defense: 0, blocks: true, shadow: 7, light: { color: 0xffd060, intensity: 5, distance: 5, flicker: true } }),
  pillar:        prop('Broken Pillar', { defense: 0, blocks: true, variants: 2, shadow: 4 }),
  basalt_spire:  prop('Basalt Spire',  { defense: 0, blocks: true, variants: 2, shadow: 5, jitter: true }),
  dead_tree:     prop('Charred Tree',  { defense: 10, variants: 2, shadow: 4, jitter: true }),
  ember_rock:    prop('Ember Rock',    { defense: 15, shadow: 5, jitter: true, light: { color: 0xff6a20, intensity: 2, distance: 2.5, flicker: true } }),
  vent:          prop('Obsidian Vent', { defense: 0, blocks: true, shadow: 10, light: { color: 0xff6a20, intensity: 7, distance: 7, flicker: true } }),
  broadleaf:     prop('Broadleaf Tree', { defense: 15, variants: 3, shadow: 7, sway: 0.04, jitter: true }),
  snag:          prop('Drowned Tree',  { defense: 10, variants: 2, shadow: 4, sway: 0.015, jitter: true }),
  well:          prop('Village Well',  { defense: 0, blocks: true, shadow: 6 }),
  autumn_tree:   prop('Autumn Tree',   { defense: 15, variants: 3, shadow: 7, sway: 0.04, jitter: true }),
  great_maple:   prop('Old Maple',     { defense: 0, blocks: true, shadow: 13, sway: 0.025 }),
  palm:          prop('Palm',          { defense: 10, variants: 2, shadow: 6, sway: 0.05, jitter: true }),
  cactus:        prop('Cactus',        { defense: 10, variants: 2, shadow: 3, jitter: true }),
  stone_arch:    prop('Sandstone Arch', { defense: 0, blocks: true, shadow: 12 }),
  ice_hut:       prop('Fishing Hut',   { defense: 0, blocks: true, shadow: 9 }),
  snow_rock:     prop('Snowy Rock',    { defense: 20, variants: 2, shadow: 6, jitter: true }),
  bothy:         prop('Shepherd\'s Bothy', { defense: 0, blocks: true, shadow: 11 }),
  sheep:         prop('Sheep',         { defense: 5, variants: 2, shadow: 3, jitter: true }),
  gorse:         prop('Gorse',         { defense: 10, variants: 2, shadow: 4, sway: 0.02, jitter: true }),
  boat:          prop('Moored Boat',   { defense: 0, variants: 2, shadow: 0, sway: 0.01, floats: true }),
  lighthouse:    prop('Lighthouse',    { defense: 0, blocks: true, shadow: 8, light: { color: 0xfff0b0, intensity: 6, distance: 8 } }),
  net_rack:      prop('Drying Nets',   { defense: 15, shadow: 6 }),
  gazebo:        prop('Gazebo',        { defense: 0, blocks: true, shadow: 13 }),
  topiary:       prop('Topiary',       { defense: 15, variants: 2, shadow: 5 }),
  statue:        prop('Statue',        { defense: 20, variants: 2, shadow: 5 }),
  gatehouse:     prop('Gatehouse',     { defense: 25, shadow: 14 }),
  maypole:       prop('Maypole',       { defense: 0, blocks: true, shadow: 6, sway: 0.01 }),
  fair_tent:     prop('Fair Tent',     { defense: 0, blocks: true, variants: 3, shadow: 11 }),
  bunting:       prop('Bunting',       { defense: 0, shadow: 2, sway: 0.03 }),
  locomotive:    prop('Steam Engine',  { defense: 0, blocks: true, shadow: 14 }),
  bus_shelter:   prop('Bus Shelter',   { defense: 15, shadow: 9 }),
  bike_rack:     prop('Bike Rack',     { defense: 5, shadow: 6 }),
  buffer_stop:   prop('Buffer Stop',   { defense: 20, shadow: 6 }),
  station_clock: prop('Platform Clock', { defense: 0, shadow: 2 }),
  playground:    prop('Playground',    { defense: 0, blocks: true, shadow: 14 }),
  picnic_table:  prop('Picnic Table',  { defense: 10, shadow: 6 }),
  washing_line:  prop('Washing Line',  { defense: 5, shadow: 3, sway: 0.03 }),
  ducks:         prop('Ducks',         { defense: 0, shadow: 0, sway: 0.01, floats: true }),
  lock_gate:     prop('Lock Gate',     { defense: 0, shadow: 0, floats: true }),
  bollard:       prop('Bollard',       { defense: 5, shadow: 2 }),
  mill_chimney:  prop('Mill Chimney',  { defense: 0, blocks: true, shadow: 8 }),
  clock_tower:   prop('Clock Tower',   { defense: 0, blocks: true, shadow: 11 }),
  phone_box:     prop('Phone Box',     { defense: 15, shadow: 5 }),
  post_box:      prop('Post Box',      { defense: 5, shadow: 3 }),
  belisha:       prop('Belisha Beacon', { defense: 0, shadow: 2, light: { color: 0xffb040, intensity: 2, distance: 2.5 } }),
  cafe_table:    prop('Café Table',    { defense: 5, variants: 2, shadow: 7 }),
  billboard:     prop('Billboard',     { defense: 0, blocks: true, shadow: 10, light: { color: 0xff6ad0, intensity: 5, distance: 6 } }),
  sign_gantry:   prop('Sign Gantry',   { defense: 0, shadow: 4 }),
  jersey_barrier: prop('Road Barrier', { defense: 25, shadow: 6 }),
  traffic_cone:  prop('Traffic Cones', { defense: 0, shadow: 3 }),
  highway_lamp:  prop('Highway Lamp',  { defense: 0, shadow: 2, light: { color: 0xffa040, intensity: 3.5, distance: 5 } }),
  neon_sign:     prop('Neon Sign',     { defense: 0, blocks: true, shadow: 8, light: { color: 0x60e8ff, intensity: 5, distance: 6 } }),
  arcade_cabinet: prop('Arcade Cabinet', { defense: 15, variants: 2, shadow: 4, light: { color: 0x9a7aff, intensity: 1.5, distance: 2 } }),
  claw_machine:  prop('Claw Machine',  { defense: 15, shadow: 5, light: { color: 0xff7ad0, intensity: 1.5, distance: 2 } }),
  water_tank:    prop('Water Tank',    { defense: 0, blocks: true, shadow: 8 }),
  ac_unit:       prop('Air Conditioner', { defense: 20, shadow: 6 }),
  gantry_crane:  prop('Gantry Crane',  { defense: 0, blocks: true, shadow: 16, light: { color: 0xffe0b0, intensity: 4, distance: 7 } }),
  torii:         prop('Torii Gate',    { defense: 0, shadow: 6 }),
  stone_lantern: prop('Stone Lantern', { defense: 10, shadow: 3, light: { color: 0xffc070, intensity: 2, distance: 3, flicker: true } }),
  sakura:        prop('Cherry Tree',   { defense: 15, variants: 2, shadow: 8, sway: 0.03, jitter: true }),
  shrine:        prop('Shrine',        { defense: 0, blocks: true, shadow: 15, light: { color: 0xffb060, intensity: 3, distance: 5, flicker: true } }),
  obelisk:       prop('Obelisk',       { defense: 0, blocks: true, shadow: 5 }),
  ram_sphinx:    prop('Ram Sphinx',    { defense: 20, shadow: 8 }),
  colossal_head: prop('Colossal Head', { defense: 25, shadow: 10 }),
  column:        prop('Column',        { defense: 25, variants: 2, shadow: 4 }),
  stone_idol:    prop('Stone Face',    { defense: 0, blocks: true, shadow: 14 }),
  lilies:        prop('Water Lilies',  { defense: 0, variants: 2, shadow: 0, sway: 0.01, floats: true }),
  gladiator:     prop('Bronze Gladiator', { defense: 0, blocks: true, shadow: 7 }),
  cypress:       prop('Cypress',       { defense: 15, variants: 2, shadow: 4, sway: 0.03, jitter: true }),
  floodlight:    prop('Floodlight Mast', { defense: 0, shadow: 3, light: { color: 0xfff0d8, intensity: 5, distance: 7 } }),
  string_lights: prop('String Lights', { defense: 0, shadow: 2, sway: 0.02, light: { color: 0xffd890, intensity: 2, distance: 3.5 } }),
};

/** Where on its tile a prop stands (tile-local u, v) and which sprite variant it uses. Deterministic. */
export function propPlacement(tile: Tile): { u: number; v: number; variant: number } {
  const def = PROPS[tile.prop!];
  const jx = def.jitter ? (hash(0x1a2b, tile.x, tile.y) - 0.5) * 0.36 : 0;
  const jy = def.jitter ? (hash(0x3c4d, tile.x, tile.y) - 0.5) * 0.36 : 0;
  return { u: 0.5 + jx, v: 0.5 + jy, variant: Math.floor(hash(0x5e6f, tile.x, tile.y) * def.variants) };
}
