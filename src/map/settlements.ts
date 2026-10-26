import { mulberry32 } from '../util/rng';
import { isLiquid } from './surface';
import { IMPASSABLE, TERRAIN } from './terrain';
import { tileAt, type MapFile, type PropId, type TerrainId, type Tile } from './types';

/** What a generated map is built around: a village, a small castle, or old ruins. */
export type SettlementKind = 'village' | 'castle' | 'ruins';
export const SETTLEMENT_KINDS: readonly SettlementKind[] = ['village', 'castle', 'ruins'];

export interface Settlement {
  kind: SettlementKind;
  /** North-west corner and side of its square footprint, in tiles. */
  x: number;
  y: number;
  size: number;
  /** The level the footprint is cut to. */
  ground: number;
  /** Footprint edge tiles where roads leave it. */
  gates: Tile[];
}

const FOOTPRINT: Record<SettlementKind, number> = { village: 6, castle: 7, ruins: 5 };
/** Footprints keep this far from the board's edge. */
const MARGIN = 2;
/** How far (tiles, diagonals count as one) a footprint keeps from water: wider first, narrower if nothing fits. */
const WATER_CLEARANCES = [4, 3, 2];
/** Open ground kept between footprints: between a seed's own settlements, and around the extras bigger boards get, per tile of board width. */
const APART = 2;
const EXTRA_APART = 0.2;
/** What the extra settlements on bigger boards are, by chance. */
const EXTRA_KINDS: readonly [number, SettlementKind][] = [[0.5, 'village'], [0.85, 'ruins'], [1, 'castle']];
/** A site whose ground varies more than this many steps is too rugged to build on. */
const MAX_RELIEF = 3;

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const BLOCKED: readonly TerrainId[] = ['peak_snow', 'snowfield'];

/** Each seed's settlement: village, castle or ruins; maps that aren't ruins may also have ruins on high ground. */
export function settlementKinds(seed: number): SettlementKind[] {
  const rand = mulberry32(seed ^ 0x5e77);
  const roll = rand();
  const main: SettlementKind = roll < 0.45 ? 'village' : roll < 0.75 ? 'castle' : 'ruins';
  return main !== 'ruins' && rand() < 0.5 ? [main, 'ruins'] : [main];
}

/**
 * Builds the seed's settlements on the best flat, dry ground: away from water, cliffs and
 * snow, leaning to the back of the board (castles most), villages near water and ruins on
 * high ground. Each footprint is cut level and the ground around it eased to meet it.
 * Houses, ramparts and ruined walls stand above the street, and their tops can be stood on.
 * Bigger boards ask for `extra` settlements (villages, ruins, now and then a castle), kept
 * well apart; the seed's own come first, so a standard board is unchanged.
 */
export function placeSettlements(map: MapFile, extra = 0): Settlement[] {
  const rand = mulberry32(map.seed ^ 0x5e78);
  const extraRand = mulberry32(map.seed ^ 0x5e79);
  const own = settlementKinds(map.seed);
  const extras = Array.from({ length: extra }, () => {
    const roll = extraRand();
    return EXTRA_KINDS.find(([upTo]) => roll < upTo)![1];
  });
  const built: Settlement[] = [];
  for (const [i, wanted] of [...own, ...extras].entries()) {
    // Extras spread out over the board instead of crowding the best corner.
    const apart = i < own.length ? APART : Math.round(EXTRA_APART * map.width);
    // Where the wanted kind doesn't fit (a rugged island has no room for a castle), a smaller one is built instead.
    const tries = SETTLEMENT_KINDS.slice(SETTLEMENT_KINDS.indexOf(wanted)).filter((k) => k === wanted || !built.some((b) => b.kind === k));
    let kind = wanted;
    let site = null;
    for (const k of tries) {
      site = bestSite(map, k, built, rand, apart);
      kind = k;
      if (site) break;
    }
    if (!site) continue;
    const settlement: Settlement = { kind, x: site.x, y: site.y, size: site.size, ground: site.ground, gates: [] };
    level(map, settlement);
    BUILD[kind](map, settlement, rand);
    built.push(settlement);
  }
  return built;
}

function footprintTiles(map: MapFile, s: Pick<Settlement, 'x' | 'y' | 'size'>): Tile[] {
  const tiles: Tile[] = [];
  for (let y = s.y; y < s.y + s.size; y++) for (let x = s.x; x < s.x + s.size; x++) tiles.push(tileAt(map, x, y)!);
  return tiles;
}

/** Whether a tile lies inside a settlement's footprint. */
export const inside = (s: Pick<Settlement, 'x' | 'y' | 'size'>, t: Pick<Tile, 'x' | 'y'>) => t.x >= s.x && t.y >= s.y && t.x < s.x + s.size && t.y < s.y + s.size;

function bestSite(map: MapFile, kind: SettlementKind, taken: readonly Settlement[], rand: () => number, apart: number) {
  const n = FOOTPRINT[kind];
  const size = map.width;
  const liquids = map.tiles.filter(isLiquid);
  for (const clearance of WATER_CLEARANCES) {
    let best: { x: number; y: number; size: number; ground: number; score: number } | null = null;
    for (let y = MARGIN; y + n <= size - MARGIN; y++) {
      for (let x = MARGIN; x + n <= size - MARGIN; x++) {
        const site = { x, y, size: n };
        // Keep open ground between settlements.
        if (taken.some((o) => x < o.x + o.size + apart && o.x < x + n + apart && y < o.y + o.size + apart && o.y < y + n + apart)) continue;
        const tiles = footprintTiles(map, site);
        if (tiles.some((t) => isLiquid(t) || t.feature || BLOCKED.includes(t.terrain) || TERRAIN[t.terrain].moveCost >= IMPASSABLE)) continue;
        const gap = (t: Tile) => Math.max(Math.max(x - t.x, t.x - (x + n - 1), 0), Math.max(y - t.y, t.y - (y + n - 1), 0));
        if (liquids.some((t) => gap(t) < clearance)) continue;
        const heights = tiles.map((t) => t.height).sort((a, b) => a - b);
        if (heights[heights.length - 1] - heights[0] > MAX_RELIEF) continue;
        const ground = heights[heights.length >> 1];
        const spread = tiles.reduce((sum, t) => sum + Math.abs(t.height - ground), 0) / tiles.length;
        // 1 at the back corner of the opening view, 0 at the front.
        const back = 1 - (x + y + n - 1) / (2 * (size - 1));
        const water = Math.min(...liquids.map(gap), 99);
        const score =
          -2 * spread +
          (kind === 'castle' ? 4 : 2) * back +
          (kind === 'village' && water <= 6 ? 1.5 : 0) +
          (kind === 'ruins' ? 0.5 * ground : 0) -
          (ground >= 6 ? 3 : 0) +
          rand();
        if (!best || score > best.score) best = { x, y, size: n, ground, score };
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Cuts the footprint level and eases the ring around it to within a step (then two) of it.
 * Ground touching water is left alone, so banks keep one step above the water.
 */
function level(map: MapFile, s: Settlement): void {
  for (const t of footprintTiles(map, s)) {
    t.height = s.ground;
    t.prop = undefined;
  }
  for (const [reach, slack] of [[1, 1], [2, 2]]) {
    for (let y = s.y - reach; y < s.y + s.size + reach; y++) {
      for (let x = s.x - reach; x < s.x + s.size + reach; x++) {
        const t = tileAt(map, x, y);
        if (!t || inside(s, t) || isLiquid(t) || TERRAIN[t.terrain].shape === 'built') continue;
        if (AROUND.some(([dx, dy]) => { const n = tileAt(map, t.x + dx, t.y + dy); return !!n && isLiquid(n); })) continue;
        const ring = Math.max(s.x - x, x - (s.x + s.size - 1), s.y - y, y - (s.y + s.size - 1));
        if (ring !== reach) continue;
        t.height = Math.min(s.ground + slack, Math.max(s.ground - slack, t.height));
      }
    }
  }
}

const set = (t: Tile, terrain: TerrainId, height: number, prop?: PropId) => {
  t.terrain = terrain;
  t.height = height;
  t.prop = prop;
};

/** The footprint side facing the middle of the board, as a unit step outward. */
function facing(map: MapFile, s: Settlement): [number, number] {
  const dx = map.width / 2 - (s.x + s.size / 2);
  const dy = map.height / 2 - (s.y + s.size / 2);
  return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
}

/** The tile in the middle of one footprint side. */
function sideMiddle(map: MapFile, s: Settlement, [dx, dy]: [number, number]): Tile {
  const mid = s.size >> 1;
  const lx = dx > 0 ? s.size - 1 : dx < 0 ? 0 : mid;
  const ly = dy > 0 ? s.size - 1 : dy < 0 ? 0 : mid;
  return tileAt(map, s.x + lx, s.y + ly)!;
}

const BUILD: Record<SettlementKind, (map: MapFile, s: Settlement, rand: () => number) => void> = {
  /**
   * Two crossing streets with a well where they meet; a cottage or two in each corner
   * block, thatched or tiled, one or two storeys; gardens with haystacks; fields outside.
   */
  village(map, s, rand) {
    const at = (lx: number, ly: number) => tileAt(map, s.x + lx, s.y + ly)!;
    const street = (l: number) => l === 2 || l === 3;
    for (let ly = 0; ly < 6; ly++) for (let lx = 0; lx < 6; lx++) if (street(lx) || street(ly)) set(at(lx, ly), 'road', s.ground);
    at(2, 2).prop = 'well';
    for (const [qx, qy] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
      const roof: TerrainId = rand() < 0.5 ? 'house_thatch' : 'house_tile';
      const block = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => at(qx + dx, qy + dy));
      const houses = 1 + Math.floor(rand() * 2);
      // Cottages sit on the block's street-side corner first.
      const order = [...block].sort((a, b) => Math.abs(a.x - (s.x + 2.5)) + Math.abs(a.y - (s.y + 2.5)) - (Math.abs(b.x - (s.x + 2.5)) + Math.abs(b.y - (s.y + 2.5))));
      order.forEach((t, k) => {
        if (k < houses) set(t, roof, s.ground + (rand() < 0.25 ? 3 : 2));
        else set(t, 'plains', s.ground, rand() < 0.3 ? 'haystack' : undefined);
      });
    }
    s.gates = [[0, -1], [0, 1], [-1, 0], [1, 0]].map((d) => sideMiddle(map, s, d as [number, number]));
    fields(map, s, rand);
  },

  /** A walled square with corner towers, a gate facing the middle of the board, a keep at the back and a flagstone yard. */
  castle(map, s) {
    const last = s.size - 1;
    const gate = sideMiddle(map, s, facing(map, s));
    const [fx, fy] = facing(map, s);
    for (const t of footprintTiles(map, s)) {
      const lx = t.x - s.x;
      const ly = t.y - s.y;
      const edgeX = lx === 0 || lx === last;
      const edgeY = ly === 0 || ly === last;
      if (t === gate) set(t, 'flagstone', s.ground);
      else if (edgeX && edgeY) set(t, 'rampart', s.ground + 4, 'banner');
      else if (edgeX || edgeY) set(t, 'rampart', s.ground + 3);
      else set(t, 'flagstone', s.ground);
    }
    // The keep: two by two, against the wall opposite the gate.
    const mid = s.size >> 1;
    const kx = fx > 0 ? 1 : fx < 0 ? last - 2 : mid - 1;
    const ky = fy > 0 ? 1 : fy < 0 ? last - 2 : mid - 1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(tileAt(map, s.x + kx + dx, s.y + ky + dy)!, 'rampart', s.ground + 5);
    tileAt(map, s.x + kx, s.y + ky)!.prop = 'banner';
    s.gates = [gate];
  },

  /** A cracked floor with stubs of wall along two sides and broken pillars standing in it. */
  ruins(map, s, rand) {
    const last = s.size - 1;
    for (const t of footprintTiles(map, s)) {
      const lx = t.x - s.x;
      const ly = t.y - s.y;
      const wall = (lx === 0 || ly === 0) && rand() < 0.75;
      set(t, wall ? 'ruined_wall' : 'ruins', s.ground + (wall ? 1 + Math.floor(rand() * 2) : 0));
    }
    const inner = footprintTiles(map, s).filter((t) => t.terrain === 'ruins' && t.x > s.x && t.y > s.y && t.x < s.x + last && t.y < s.y + last);
    for (let k = 0; k < 2 && inner.length; k++) inner.splice(Math.floor(rand() * inner.length), 1)[0].prop = 'pillar';
    const gate = sideMiddle(map, s, facing(map, s));
    if (gate.terrain === 'ruined_wall') set(gate, 'ruins', s.ground);
    s.gates = [gate];
  },
};

/** A patch of farmland beside a village, on the side with the most open, gentle ground, with a haystack or two. */
function fields(map: MapFile, s: Settlement, rand: () => number): void {
  const options = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => {
    const tiles: Tile[] = [];
    for (let k = 1; k <= 3; k++) {
      for (let j = 0; j < s.size; j++) {
        const x = dx ? (dx > 0 ? s.x + s.size - 1 + k : s.x - k) : s.x + j;
        const y = dy ? (dy > 0 ? s.y + s.size - 1 + k : s.y - k) : s.y + j;
        const t = tileAt(map, x, y);
        // Leave the middle of each side open for the road.
        if (t && j !== (s.size >> 1) && !isLiquid(t) && !t.feature && TERRAIN[t.terrain].shape !== 'built' && Math.abs(t.height - s.ground) <= 1 && !AROUND.some(([ax, ay]) => { const n = tileAt(map, t.x + ax, t.y + ay); return !!n && isLiquid(n); })) tiles.push(t);
      }
    }
    return tiles;
  });
  const best = options.sort((a, b) => b.length - a.length)[0];
  for (const t of best) set(t, 'farmland', t.height, rand() < 0.08 ? 'haystack' : undefined);
}
