import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { SIDE_STYLES, TERRAIN, type SideStyle } from './terrain';
import { TERRAIN_IDS, TILE_PX } from './types';
import { atlasLayout, STEP_PX, VARIANTS, type AtlasLayout } from './atlasLayout';

export { TILE_PX, STEP_PX, VARIANTS };
export type { UvRect } from './atlasLayout';

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
  ice: ['#8eb8d0', '#5e88a8', '#c4dcea', '#2e4a66'],
  hedge: ['#356430', '#24481f', '#4a7a3c', '#5e9048'],
  villa: ['#b05a40', '#924834', '#d0bca4', '#e8e0d0'],
  shop: ['#eedcb4', '#dcc69a', '#f8ecd0', '#f4f0e8'],
  shop_brick: ['#a85038', '#8a4030', '#d0bca4', '#f4f0e8'],
  retaining: ['#7a7c80', '#66686c', '#8e9094', '#44464a'],
  container: ['#a8402e', '#7e2e22', '#c45a44', '#2a2a2e'],
  hull: ['#1e2a3a', '#16202e', '#2c3a4e', '#6a3a26'],
};

/** Building fronts get windows; their street-level cell gets a shop window or door. */
const FACADES: ReadonlySet<SideStyle> = new Set(['brick', 'plaster', 'shopfront', 'cottage', 'villa', 'shop', 'shop_brick']);
/** House walls that sit under a roof's eave rather than a coping. */
const EAVED: ReadonlySet<SideStyle> = new Set(['cottage', 'villa']);
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
    case 'container':
      // The corrugated side of a container, one box per step: its own livery, vertical ribs,
      // top and bottom rails, a corner post. Stacks come out mixed, as on any quay.
      {
        const [paint, shadow, light] = [['#a8402e', '#7e2e22', '#c45a44'], ['#2e5a9a', '#22447a', '#4a78b8'], ['#3a7a4a', '#2a5a36', '#52965e'], ['#d88a2a', '#a8681e', '#eeaa4a']][variant];
        for (let x = 0; x < TILE_PX; x++) {
          for (let y = 0; y < STEP_PX; y++) {
            const rail = y === 0 || y === STEP_PX - 1;
            put(x, y, rail || x === 0 ? accent : y === 1 ? light : x % 2 ? shadow : paint);
          }
        }
        if (variant & 1) for (let y = 2; y < 6; y++) put(9, y, '#d8d4c8');
      }
      return;
    case 'hull':
      // A ship's hull: dark painted plates in strakes, rust weeping from the seams.
      for (let x = 0; x < TILE_PX; x++) {
        for (let y = 0; y < STEP_PX; y++) {
          const seam = y === 3 || x === (variant * 5) % 16;
          put(x, y, seam ? dark : rand() < 0.1 ? light : base);
        }
      }
      for (let i = 0; i < 2; i++) {
        const x = int(rand, TILE_PX);
        for (let y = 4; y < 4 + int(rand, 4); y++) put(x, y, accent);
      }
      return;
    case 'retaining':
      // Cast concrete panels holding up the expressway: joints between panels, rust and rain
      // stains running down from them, and on some panels a burst of graffiti.
      for (let x = 0; x < TILE_PX; x++) {
        for (let y = 0; y < STEP_PX; y++) {
          const joint = x === 0 || y === STEP_PX - 1;
          const stain = (x === 3 || x === 11) && rand() < 0.7;
          put(x, y, joint ? accent : stain ? dark : rand() < 0.12 ? dark : rand() < 0.08 ? light : base);
        }
      }
      if (variant === 1 || variant === 2) {
        const tag = variant === 1 ? ['#e84a9a', '#48d0e8'] : ['#f0d040', '#9a5ae0'];
        for (let i = 0; i < 9; i++) {
          const x = 3 + int(rand, 10);
          const y = 1 + int(rand, 5);
          put(x, y, tag[0]);
          put(x + 1, y + (rand() < 0.5 ? 1 : 0), tag[i & 1]);
        }
      }
      return;
    case 'concrete':
      for (let x = 0; x < TILE_PX; x++) for (let y = 0; y < STEP_PX; y++) put(x, y, y === 7 ? accent : rand() < 0.15 ? dark : rand() < 0.1 ? light : base);
      return;
    case 'cottage':
      paintCottage(put, rand, p, groundFloor, variant);
      return;
    case 'villa':
      paintVilla(put, rand, p, groundFloor, variant);
      return;
    case 'shop':
    case 'shop_brick':
      paintShop(put, rand, p, groundFloor, variant, style === 'shop_brick');
      return;
    case 'hedge':
      // Clipped box hedge: dense leaves in small clumps, lit on top, darker at the root.
      for (let y = 0; y < STEP_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const r = rand();
          put(x, y, r < 0.18 ? light : r < 0.4 ? dark : y > 6 ? dark : base);
        }
      }
      for (let i = 0; i < 4; i++) put(int(rand, TILE_PX), int(rand, 4), accent);
      return;
    case 'ice':
      // A cut through lake ice: clear and pale near the top, darkening to the cold water beneath,
      // with streaks of trapped air and the odd hairline crack.
      for (let y = 0; y < STEP_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const depth = y < 2 ? light : y < 5 ? base : y < 7 ? dark : accent;
          put(x, y, rand() < 0.06 ? light : depth);
        }
      }
      for (let i = 0; i < 2; i++) {
        const x = int(rand, TILE_PX - 3);
        const y = 1 + int(rand, 4);
        for (let k = 0; k < 3; k++) put(x + k, y, '#e8f4fa');
      }
      if (variant & 1) for (let y = 0; y < 6; y++) put(3 + variant * 2 + (y > 2 ? 1 : 0), y, '#e8f4fa');
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

/**
 * A suburban house in red brick with white-framed windows; at street level a bay window and
 * a front door painted a different colour on each face.
 */
function paintVilla(put: Put, rand: Rand, [brick, dark, mortar, sill]: readonly string[], groundFloor: boolean, variant: number): void {
  const white = '#f4f0e8';
  for (let y = 0; y < STEP_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const joint = y % 3 === 2 || (x + (Math.floor(y / 3) & 1) * 2) % 4 === 0;
      put(x, y, joint ? mortar : rand() < 0.2 ? dark : brick);
    }
  }
  if (groundFloor) {
    // The bay window, lit at night; the door with its fanlight and brass knob.
    for (let y = 1; y < 7; y++) for (let x = 1; x < 8; x++) put(x, y, y === 1 || x === 1 || x === 7 || x === 4 ? white : y === 2 ? '#6c88a0' : '#3c4c60', y === 1 || x === 1 || x === 7 || x === 4 ? undefined : '#ffc870');
    const door = ['#2e4a7a', '#8a2a24', '#2e5a3a', '#d8a838'][variant % 4];
    for (let y = 1; y < STEP_PX; y++) for (let x = 10; x < 15; x++) put(x, y, x === 10 || x === 14 || y === 1 ? white : y === 2 ? '#8ea4b4' : door);
    put(13, 5, '#e0c050');
    return;
  }
  // A window with a white frame and a cross bar over a stone sill; a downpipe at the corner of every other face.
  for (let y = 2; y < 7; y++) for (let x = 4; x < 12; x++) put(x, y, x === 4 || x === 11 || x === 8 || y === 2 ? white : y === 3 ? '#6c88a0' : '#3c4c60', x === 4 || x === 11 || x === 8 || y === 2 ? undefined : '#ffc870');
  for (let x = 3; x < 13; x++) put(x, 7, sill);
  if (variant & 1) for (let y = 0; y < STEP_PX; y++) put(15, y, '#5a5e64');
}

/**
 * A high-street shop: rendered upstairs with tall sash windows; at street level a painted
 * fascia over a striped awning, the display window and the door. Each face gets its own
 * colours, so a row of shops reads as a row of different businesses.
 */
function paintShop(put: Put, rand: Rand, [wall, shadow, light, white]: readonly string[], groundFloor: boolean, variant: number, brick: boolean): void {
  for (let y = 0; y < STEP_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      // Brick has light mortar courses; render is a plain speckled wall.
      const joint = brick && (y % 3 === 2 || (x + (Math.floor(y / 3) & 1) * 2) % 4 === 0);
      put(x, y, joint ? light : rand() < 0.12 ? shadow : !brick && rand() < 0.06 ? light : wall);
    }
  }
  if (!groundFloor) {
    for (const x0 of [3, 9]) {
      for (let y = 1; y < 7; y++) for (let x = x0; x < x0 + 4; x++) put(x, y, x === x0 || x === x0 + 3 || y === 1 || y === 4 ? white : y < 4 ? '#6c88a0' : '#3c4c60', x === x0 || x === x0 + 3 || y === 1 || y === 4 ? undefined : '#ffc870');
      for (let x = x0 - 1; x < x0 + 5; x++) put(x, 7, shadow);
    }
    return;
  }
  const [awning, fascia] = [['#c4302a', '#2a3440'], ['#2e6a3a', '#3a2a22'], ['#2e4a8a', '#24303c'], ['#d8a838', '#5a1e1a']][variant % 4];
  // Fascia board with a line of gilt lettering.
  for (let x = 0; x < TILE_PX; x++) {
    put(x, 0, fascia);
    put(x, 1, x > 2 && x < 13 && (x * 7 + variant) % 3 !== 0 ? '#e0c060' : fascia);
  }
  // The awning, striped, with a scalloped edge.
  for (let x = 0; x < TILE_PX; x++) {
    const stripe = (x >> 1) & 1 ? white : awning;
    put(x, 2, stripe);
    if ((x & 1) === 0) put(x, 3, stripe);
  }
  // Display window full of goods, and the door.
  for (let y = 4; y < STEP_PX; y++) {
    for (let x = 1; x < 10; x++) {
      const goods = y > 5 && rand() < 0.45;
      put(x, y, goods ? pick(['#e05a4a', '#f0c84a', '#7ab0d8', '#e8e0d0'], rand) : y === 4 ? '#7f97ad' : '#4c6078', goods ? undefined : '#ffd890');
    }
    for (let x = 11; x < 15; x++) put(x, y, x === 11 ? white : y < 6 ? '#6c88a0' : fascia);
  }
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

export interface TerrainAtlas extends AtlasLayout {
  texture: THREE.CanvasTexture;
  /** Emitted light (lit windows, neon), same layout; black where nothing glows. */
  glow: THREE.CanvasTexture;
}

/**
 * One canvas holding every cliff-face texture, so all sides draw in one call, plus a
 * matching canvas of what glows. Columns = variants. Rows: terrain top-step sides (8 px),
 * then lower-step sides per material, then street-level sides per material. Tile tops are
 * painted map-wide instead (see ground.ts).
 */
export function buildTerrainAtlas(): TerrainAtlas {
  const layout = atlasLayout();
  const { lowerY, groundY } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
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
      if (EAVED.has(def.side)) paintEave(put, def.palette);
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

  return { ...layout, texture: toTexture(canvas), glow: toTexture(glowCanvas) };
}
