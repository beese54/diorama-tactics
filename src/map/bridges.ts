import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { STEP_HEIGHT, isLiquid } from './surface';
import { bridgeOf, type BridgeId } from './terrain';
import { TILE_PX } from './textures';
import { tileAt, type MapFile, type Tile } from './types';

const PX = 1 / TILE_PX;
/** How far a bridge reaches onto each bank, past the rounded lip to level ground (tiles). */
const ABUTMENT = 0.42;
/** Gap between a lone bridge's deck and the tile's up- and downstream edges (tiles). */
const INSET = 0.18;

/** Bridge colours: deck, deck shadow lines, sides, and the dark under the arch or between posts. */
const LOOKS: Record<BridgeId, { deck: string; seam: string; side: string; trim: string; dark: string }> = {
  bridge_wood: { deck: '#8f6d49', seam: '#5e4630', side: '#6e5238', trim: '#4a3726', dark: '#2e2a26' },
  bridge_stone: { deck: '#a29d91', seam: '#7b766c', side: '#8e897e', trim: '#6c675e', dark: '#283036' },
};

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function texture(w: number, h: number, paint: Painter): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  paint(ctx, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const fill = (color: string): Painter => (ctx, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
};

/**
 * A box in bridge coordinates: `s` runs along the span (bank to bank), `c` across it (with
 * the current), `y` up. Each face is painted at the map's pixel density; `across` paints
 * the faces looking up- and downstream, `top` the deck, and the rest are plain `side`.
 */
interface Piece {
  s: [number, number];
  c: [number, number];
  y: [number, number];
  top?: Painter;
  across?: Painter;
  side: string;
}

/**
 * Wooden and stone bridges over the rivers, as small textured boxes: a plank deck on posts
 * with rails, or a stone span with a parapet and an arch over the water. Each bridge tile
 * builds its own piece of deck; neighbouring bridge tiles join into one wider or longer bridge.
 */
export function buildBridges(map: MapFile, origin: (tile: Tile) => [number, number]): THREE.Group {
  const group = new THREE.Group();
  map.tiles.forEach((tile, index) => {
    const kind = bridgeOf(tile);
    if (!kind) return;
    // The span crosses the current; still water spans whichever way has banks on both sides.
    const [fx, fy] = tile.water?.flow ?? [0, 0];
    const banked = (dx: number, dy: number) => [1, -1].every((k) => { const n = tileAt(map, tile.x + k * dx, tile.y + k * dy); return !!n && (!isLiquid(n) || !!bridgeOf(n)); });
    const spanX = fx !== 0 || fy !== 0 ? Math.abs(fx) < Math.abs(fy) : banked(1, 0);
    const [sx, sy] = spanX ? [1, 0] : [0, 1];
    const [cx, cy] = spanX ? [0, 1] : [1, 0];
    const at = (ds: number, dc: number) => tileAt(map, tile.x + ds * sx + dc * cx, tile.y + ds * sy + dc * cy);
    const isBridge = (t: Tile | undefined) => !!t && !!bridgeOf(t);
    const reach = (ds: number) => { const n = at(ds, 0); return n && !isLiquid(n) ? ABUTMENT : 0; };
    const s: [number, number] = [-reach(-1), 1 + reach(1)];
    const outer = [!isBridge(at(0, -1)), !isBridge(at(0, 1))];
    const c: [number, number] = [outer[0] ? INSET : 0, outer[1] ? 1 - INSET : 1];
    const water = tile.height * STEP_HEIGHT;
    const deck = (tile.height + 1) * STEP_HEIGHT + PX;
    const look = LOOKS[kind];
    const rand = mulberry32(Math.floor(tile.seedRand * 0x7fffffff));
    const pieces: Piece[] = [];

    if (kind === 'bridge_wood') {
      pieces.push({ s, c, y: [deck - 2 * PX, deck], side: look.side, top: planks(look, rand), across: fill(look.side) });
      for (const [k, edge] of outer.entries()) {
        if (!edge) continue;
        const c0 = k === 0 ? c[0] : c[1] - 1.5 * PX;
        // Posts down into the water at both banks' edges and mid-stream, a rail along their tops.
        for (const p of [0.08, 0.5, 0.92]) pieces.push({ s: [p - PX, p + PX], c: [c0, c0 + 1.5 * PX], y: [water - PX, deck + 5 * PX], side: look.trim });
        pieces.push({ s: [s[0] + 0.1, s[1] - 0.1], c: [c0, c0 + 1.5 * PX], y: [deck + 3 * PX, deck + 4.5 * PX], side: look.trim });
      }
    } else {
      // The span and abutments, with an arch where the river runs under.
      const body = { s, c, y: [water - 2 * PX, deck] as [number, number] };
      pieces.push({ ...body, side: look.side, top: cobbles(look, rand), across: masonry(look, rand, -s[0], deck - body.y[0]) });
      for (const [k, edge] of outer.entries()) {
        if (!edge) continue;
        const c0 = k === 0 ? c[0] : c[1] - 2 * PX;
        pieces.push({ s: [s[0] + 0.12, s[1] - 0.12], c: [c0, c0 + 2 * PX], y: [deck, deck + 3 * PX], side: look.trim, top: fill(look.deck) });
      }
    }

    const [x0, z0] = origin(tile);
    for (const piece of pieces) {
      const mesh = box(piece, (sv, cv): [number, number] => [x0 + sv * sx + cv * cx, z0 + sv * sy + cv * cy], spanX);
      mesh.userData.tile = index;
      group.add(mesh);
    }
  });
  return group;
}

/** One piece as a mesh, its faces sorted into top, across (up/downstream) and side materials. */
function box(piece: Piece, world: (s: number, c: number) => [number, number], spanX: boolean): THREE.Mesh {
  const [a, b] = [world(piece.s[0], piece.c[0]), world(piece.s[1], piece.c[1])];
  const min = [Math.min(a[0], b[0]), piece.y[0], Math.min(a[1], b[1])];
  const max = [Math.max(a[0], b[0]), piece.y[1], Math.max(a[1], b[1])];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2);
  const span = piece.s[1] - piece.s[0];
  const width = piece.c[1] - piece.c[0];
  const height = piece.y[1] - piece.y[0];
  const material = (paint: Painter | undefined, w: number, h: number) =>
    new THREE.MeshLambertMaterial(paint ? { map: texture(w * TILE_PX, h * TILE_PX, paint) } : { color: piece.side });
  const top = material(piece.top, spanX ? span : width, spanX ? width : span);
  const across = material(piece.across, span, height);
  const side = material(undefined, 0, 0);
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z. The across faces look along the current.
  const alongX = !spanX;
  const materials = [alongX ? across : side, alongX ? across : side, top, side, alongX ? side : across, alongX ? side : across];
  return new THREE.Mesh(geometry, materials);
}

/** Deck planks laid across the span, with dark seams and the odd knot. */
function planks(look: (typeof LOOKS)[BridgeId], rand: () => number): Painter {
  return (ctx, w, h) => {
    fill(look.deck)(ctx, w, h);
    ctx.fillStyle = look.seam;
    const spanX = w >= h;
    const length = spanX ? w : h;
    for (let k = 2; k < length; k += 3) spanX ? ctx.fillRect(k, 0, 1, h) : ctx.fillRect(0, k, w, 1);
    for (let n = 0; n < 3; n++) ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 1, 1);
  };
}

/** Worn paving stones on a stone deck. */
function cobbles(look: (typeof LOOKS)[BridgeId], rand: () => number): Painter {
  return (ctx, w, h) => {
    fill(look.deck)(ctx, w, h);
    ctx.fillStyle = look.seam;
    for (let y = 0; y < h; y += 3) {
      const shift = Math.floor(rand() * 4);
      for (let x = shift; x < w; x += 4) ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(0, y + 2, w, 0.5);
    }
  };
}

/**
 * Coursed stone blocks on the faces along the current, with a dark arch where the river
 * runs under: centred on the tile, `offset` tiles in from the face's start, `height` tiles tall.
 */
function masonry(look: (typeof LOOKS)[BridgeId], rand: () => number, offset: number, height: number): Painter {
  return (ctx, w, h) => {
    fill(look.side)(ctx, w, h);
    ctx.fillStyle = look.trim;
    for (let row = 0; row * 3 < h; row++) {
      ctx.fillRect(0, row * 3, w, 1);
      for (let x = (row % 2) * 3 + Math.floor(rand() * 2); x < w; x += 6) ctx.fillRect(x, row * 3, 1, 3);
    }
    // The arch: a half-ellipse rising from the waterline to most of the way up.
    const cx = (offset + 0.5) * TILE_PX;
    const rx = 0.34 * TILE_PX;
    const ry = 0.62 * height * TILE_PX;
    for (let y = 0; y < h; y++) {
      const up = h - y; // px above the bottom
      if (up > ry) continue;
      const half = rx * Math.sqrt(1 - (up / ry) ** 2);
      ctx.fillStyle = look.dark;
      ctx.fillRect(Math.round(cx - half), y, Math.round(2 * half), 1);
      ctx.fillStyle = look.trim;
      ctx.fillRect(Math.round(cx - half) - 1, y, 1, 1);
      ctx.fillRect(Math.round(cx + half), y, 1, 1);
    }
  };
}
