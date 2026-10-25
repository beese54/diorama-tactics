import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { SIDE_STYLES, TERRAIN, type SideStyle } from './terrain';
import { TERRAIN_IDS, type TerrainId } from './types';

export const TILE_PX = 16;
/** One height step is half a tile tall, so its side face is 8 px. */
export const STEP_PX = 8;
/** Cliff-face texture variants painted per material, so neighbouring steps don't repeat. */
export const VARIANTS = 4;

type Rand = () => number;
/**
 * Paints one pixel of the cell being drawn. `glows` also writes it to the emissive atlas:
 * true for its own colour, or a colour of its own (a window dark by day that glows warm at night).
 */
type Put = (x: number, y: number, color: string, glows?: boolean | string) => void;

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function pick<T>(items: readonly T[], rand: Rand): T {
  return items[Math.floor(rand() * items.length)];
}

const int = (rand: Rand, n: number) => Math.floor(rand() * n);

/** Cliff-face colours per material: [base, dark, light, accent]. */
const SIDE_PALETTES: Record<SideStyle, readonly string[]> = {
  soil: ['#7a5a3a', '#6a4c31', '#836240', '#9a8a72'],
  rock: ['#7c7466', '#655d51', '#8a8273', '#4b443b'],
  sand: ['#c9b682', '#b9a571', '#d6c597', '#a8935f'],
  redrock: ['#a86e48', '#8e5a3a', '#b98058', '#7a4a30'],
  masonry: ['#837e74', '#6b675f', '#959086', '#4f4b45'],
  concrete: ['#a29d94', '#8f8a81', '#b2ada4', '#7a756d'],
  brick: ['#a4533c', '#8a4331', '#b5644a', '#d9c4a8'],
  plaster: ['#d4c09c', '#c1ac88', '#e0d0b0', '#5f7a52'],
  shopfront: ['#3b3547', '#2e2a39', '#4a4459', '#ffb760'],
  timber: ['#6e5236', '#5a4230', '#806040', '#3e2c1e'],
  temple: ['#8f896a', '#78735a', '#a29c7c', '#5f7a3e'],
  basalt: ['#3e3938', '#2e2a29', '#4d4746', '#211e1d'],
  cottage: ['#e2d6bc', '#cbbd9f', '#efe6d0', '#5a3e26'],
};

/** Building fronts get windows; their street-level cell gets a shop window or door. */
const FACADES: ReadonlySet<SideStyle> = new Set(['brick', 'plaster', 'shopfront', 'cottage']);
const NEON = ['#ff5fa8', '#4fe3ff', '#ffd84a'];
const GLASS = ['#3c4c60', '#4c6078', '#7f97ad'];

/** A two-course band of stone blocks (masonry, temple stone). */
function paintBlocks(put: Put, rand: Rand, [base, dark, light, accent]: readonly string[], mossy: boolean): void {
  for (let course = 0; course < 2; course++) {
    const y0 = course * 4;
    const offset = course ? 4 : 0;
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const joint = y === y0 || (x + offset) % 8 === 0;
        const r = rand();
        put(x, y, joint ? accent : y === y0 + 1 ? light : r < 0.18 ? dark : base);
      }
    }
  }
  if (!mossy) return;
  for (let i = 0; i < 4; i++) {
    const x = int(rand, TILE_PX);
    const len = 1 + int(rand, 5);
    for (let y = 0; y < len; y++) put(x, y, y === 0 ? '#7a9a4e' : '#5f7a3e');
  }
}

/** One window: frame above, sill below, glass that is dark by day or lit at night. */
function paintWindow(put: Put, rand: Rand, x0: number, p: readonly string[], lit: boolean): void {
  const glow = lit && rand() < 0.65;
  for (let y = 1; y <= 5; y++) {
    for (let x = x0; x < x0 + 3; x++) {
      if (glow) put(x, y, y === 1 ? '#ffe2a0' : p[3], true);
      else put(x, y, x === x0 && y === 2 ? GLASS[2] : y < 3 ? GLASS[1] : GLASS[0]);
    }
  }
  for (let x = x0 - 1; x < x0 + 4; x++) put(x, 6, p[2]);
}

/** A front at street level: a wide shop window (lit at night) or a door beside a window. */
function paintGroundFloor(put: Put, rand: Rand, p: readonly string[], lit: boolean, variant: number): void {
  if (variant % 2 === 0) {
    for (let y = 1; y < 7; y++) {
      for (let x = 2; x < 14; x++) {
        const edge = y === 1 || x === 2 || x === 13;
        if (edge) put(x, y, p[1]);
        else if (lit) put(x, y, rand() < 0.15 ? '#c9803a' : y < 3 ? '#ffe2a0' : p[3], true);
        else put(x, y, (x - y) % 5 === 0 ? GLASS[2] : y < 3 ? GLASS[1] : GLASS[0]);
      }
    }
  } else {
    for (let y = 1; y < 8; y++) for (let x = 9; x < 13; x++) put(x, y, y === 1 ? p[1] : x === 9 ? '#4a3020' : '#5e3e28');
    put(10, 5, '#d9b44a');
    paintWindow(put, rand, 3, p, lit);
  }
  if (lit) {
    // Neon sign above the door, in the gap between floors.
    const color = pick(NEON, rand);
    for (let x = 4; x < 12; x++) put(x, 0, color, true);
  }
}

/** One 16x8 cliff-face cell of a material. */
function paintSide(put: Put, rand: Rand, style: SideStyle, groundFloor: boolean, variant: number): void {
  const p = SIDE_PALETTES[style];
  const [base, dark, light, accent] = p;
  switch (style) {
    case 'masonry':
    case 'temple':
      paintBlocks(put, rand, p, style === 'temple');
      return;
    case 'basalt':
      // Columnar jointing: dark vertical cracks between pillars of rock.
      for (let x = 0; x < TILE_PX; x++) {
        const joint = x % 4 === (variant & 1 ? 1 : 3);
        for (let y = 0; y < STEP_PX; y++) put(x, y, joint ? accent : rand() < 0.2 ? light : rand() < 0.2 ? dark : base);
      }
      return;
    case 'timber':
      for (let x = 0; x < TILE_PX; x++) for (let y = 0; y < STEP_PX; y++) put(x, y, x % 4 === 0 ? accent : rand() < 0.25 ? dark : x % 4 === 1 ? light : base);
      return;
    case 'concrete':
      for (let x = 0; x < TILE_PX; x++) for (let y = 0; y < STEP_PX; y++) put(x, y, y === 7 ? accent : rand() < 0.15 ? dark : rand() < 0.1 ? light : base);
      return;
    case 'cottage':
      paintCottage(put, rand, p, groundFloor, variant);
      return;
  }
  if (FACADES.has(style)) {
    const lit = style === 'shopfront';
    // Brick in two courses; plaster and shopfronts are plain speckled walls.
    for (let y = 0; y < STEP_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const mortar = style === 'brick' && (y % 4 === 3 || (x + (y < 4 ? 0 : 4)) % 8 === 0);
        const r = rand();
        put(x, y, mortar ? light : r < 0.15 ? dark : base);
      }
    }
    if (groundFloor) paintGroundFloor(put, rand, p, lit, variant);
    else {
      paintWindow(put, rand, 3, p, lit);
      paintWindow(put, rand, 10, p, lit);
      if (style === 'plaster') for (const x of [2, 6, 9, 13]) for (let y = 1; y <= 5; y++) put(x, y, accent);
      // Night streets hang vertical neon signs between the windows, two tones per sign.
      if (lit && variant % 2 === 1) {
        const [a, b] = [NEON[variant % 3], NEON[(variant + 1) % 3]];
        for (let y = 0; y < STEP_PX; y++) {
          put(7, y, y % 3 === 1 ? b : a, true);
          put(8, y, a, true);
        }
      }
    }
    return;
  }
  for (let y = 0; y < STEP_PX; y++) {
    // Alternate strata bands; red rock gets bolder banding.
    const band = style === 'redrock' ? (y < 3 ? light : y < 5 ? base : dark) : y % 4 === 3 ? dark : base;
    for (let x = 0; x < TILE_PX; x++) {
      const r = rand();
      put(x, y, r < 0.2 ? dark : r < 0.35 ? light : band);
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = int(rand, TILE_PX);
    const y = int(rand, STEP_PX);
    put(x, y, accent);
    if (style === 'rock') put(x, y + 1, accent);
  }
}

/**
 * A whitewashed, half-timbered cottage wall: dark posts at the corners and middle. At street
 * level a plank door (or, on some faces, a window); above, a shuttered window and a brace.
 */
function paintCottage(put: Put, rand: Rand, [base, dark, light, beam]: readonly string[], groundFloor: boolean, variant: number): void {
  for (let y = 0; y < STEP_PX; y++) for (let x = 0; x < TILE_PX; x++) put(x, y, rand() < 0.12 ? dark : rand() < 0.08 ? light : base);
  for (let y = 0; y < STEP_PX; y++) for (const x of [0, 15]) put(x, y, beam);
  if (groundFloor && variant % 2 === 0) {
    for (let y = 2; y < STEP_PX; y++) for (let x = 6; x < 10; x++) put(x, y, y === 2 ? beam : x === 6 ? '#4a3020' : '#6e4a2c');
    put(8, 5, '#d9b44a');
    return;
  }
  // Glass: dark by day; at night the hearth behind it glows (see MapMesh.setNightGlow).
  for (let y = 2; y < 6; y++) for (let x = 6; x < 10; x++) put(x, y, y === 2 ? '#6c88a0' : '#3c4c60', y === 2 ? '#ffe0a0' : x === 6 ? '#e8a050' : '#ffc870');
  for (let y = 2; y < 6; y++) (put(5, y, '#5e7a4a'), put(10, y, '#5e7a4a'));
  for (let x = 5; x < 11; x++) put(x, 6, beam);
  if (!groundFloor) for (let k = 0; k < 4; k++) put(1 + k, STEP_PX - 1 - k, beam);
}

/** A roof's eave over a cottage wall: two rows of the roof's own colours with a shadow line under them. */
function paintEave(put: Put, roof: readonly string[]): void {
  for (let x = 0; x < TILE_PX; x++) {
    put(x, 0, roof[3]);
    put(x, 1, x % 3 === 0 ? roof[1] : roof[0]);
    put(x, 2, roof[2]);
  }
}

/** Grass/snow/etc. overhang along the top of a natural column's highest step. */
function paintLip(put: Put, rand: Rand, palette: readonly string[]): void {
  for (let x = 0; x < TILE_PX; x++) {
    const color = pick(palette.slice(0, 2), rand);
    put(x, 0, color);
    put(x, 1, color);
    if (rand() < 0.45) put(x, 2, color);
  }
}

/** A built column's top edge: a light coping course with a shadow line under it. */
function paintCoping(put: Put, style: SideStyle): void {
  const [, dark, light] = SIDE_PALETTES[style];
  for (let x = 0; x < TILE_PX; x++) {
    put(x, 0, light);
    put(x, 1, dark);
  }
}

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TerrainAtlas {
  texture: THREE.CanvasTexture;
  /** Emitted light (lit windows, neon), same layout; black where nothing glows. */
  glow: THREE.CanvasTexture;
  /** Highest cliff step of a column: material plus the terrain's lip (natural) or coping (built). */
  sideTop(terrain: TerrainId, variant: number): UvRect;
  /** Any lower cliff step: bare material. */
  sideLower(style: SideStyle, variant: number): UvRect;
  /** The step just above the neighbouring ground: shop windows and doors on building fronts. */
  sideGround(style: SideStyle, variant: number): UvRect;
}

/**
 * One canvas holding every cliff-face texture, so all sides draw in one call, plus a
 * matching canvas of what glows. Columns = variants. Rows: terrain top-step sides (8 px),
 * then lower-step sides per material, then street-level sides per material. Tile tops are
 * painted map-wide instead (see ground.ts).
 */
export function buildTerrainAtlas(): TerrainAtlas {
  const lowerY = TERRAIN_IDS.length * STEP_PX;
  const groundY = lowerY + SIDE_STYLES.length * STEP_PX;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX * VARIANTS;
  canvas.height = groundY + SIDE_STYLES.length * STEP_PX;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = canvas.width;
  glowCanvas.height = canvas.height;
  const color = canvas.getContext('2d')!;
  const light = glowCanvas.getContext('2d')!;
  light.fillStyle = '#000';
  light.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

  const cell = (x0: number, y0: number): Put => (x, y, c, glows) => {
    if (x < 0 || y < 0 || x >= TILE_PX || y >= STEP_PX) return;
    color.fillStyle = c;
    color.fillRect(x0 + x, y0 + y, 1, 1);
    light.fillStyle = typeof glows === 'string' ? glows : glows ? c : '#000';
    light.fillRect(x0 + x, y0 + y, 1, 1);
  };

  TERRAIN_IDS.forEach((id, row) => {
    const def = TERRAIN[id];
    for (let v = 0; v < VARIANTS; v++) {
      const put = cell(v * TILE_PX, row * STEP_PX);
      const rand = mulberry32(row * 977 + v * 31 + 5);
      paintSide(put, rand, def.side, false, v);
      if (def.side === 'cottage') paintEave(put, def.palette);
      else if (def.shape === 'built') paintCoping(put, def.side);
      else paintLip(put, rand, def.palette);
    }
  });
  SIDE_STYLES.forEach((style, row) => {
    for (let v = 0; v < VARIANTS; v++) {
      paintSide(cell(v * TILE_PX, lowerY + row * STEP_PX), mulberry32(row * 613 + v * 7 + 3), style, false, v);
      paintSide(cell(v * TILE_PX, groundY + row * STEP_PX), mulberry32(row * 389 + v * 11 + 1), style, FACADES.has(style), v);
    }
  });

  const W = canvas.width;
  const H = canvas.height;
  // CanvasTexture is flipped: canvas y = 0 is v = 1.
  const rect = (x: number, y: number): UvRect => ({
    u0: x / W,
    u1: (x + TILE_PX) / W,
    v0: 1 - (y + STEP_PX) / H,
    v1: 1 - y / H,
  });
  const terrainRow = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const sideRow = new Map(SIDE_STYLES.map((s, i) => [s, i]));

  return {
    texture: toTexture(canvas),
    glow: toTexture(glowCanvas),
    sideTop: (terrain, v) => rect(v * TILE_PX, terrainRow.get(terrain)! * STEP_PX),
    sideLower: (style, v) => rect(v * TILE_PX, lowerY + sideRow.get(style)! * STEP_PX),
    sideGround: (style, v) => rect(v * TILE_PX, groundY + sideRow.get(style)! * STEP_PX),
  };
}
