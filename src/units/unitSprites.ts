import * as THREE from 'three';
import type { SpriteRect } from '../render/SpriteField';
import { Gfx, nearestTexture, shade } from '../map/propSprites';
import type { ClassId, Gender, Side, Unit } from '../game/units';
import { HAIR as HERO_HAIR, HERO_ART, PALETTE } from './heroArt';

/** What a unit looks like on the map: its class, side, and a few traits of its own. */
export interface UnitLook {
  name: string;
  cls: ClassId;
  side: Side;
  gender: Gender;
  hair: string;
}

/** A clip of a unit's sprite: standing (breathing), walking, or resting once it has moved this turn (dimmed). */
export type UnitClip = 'idle' | 'walk' | 'rest';
const CLIPS: Record<UnitClip, { frames: number; fps: number }> = {
  idle: { frames: 2, fps: 2 },
  walk: { frames: 4, fps: 8 },
  rest: { frames: 1, fps: 0 },
};

/** Hair for each named head (the knight's is under his helm). */
const HAIR: Record<string, string> = {
  Aria: '#d0a040', Bram: '#5a3a22', Corin: '#8e3a1e', Dela: '#2c2430', Ilse: '#d8d8e4',
  Varek: '#3a3030', Sabine: '#4a2c52', Gorran: '#6a4a2a', Petra: '#c8a050', Ulric: '#4a3a30',
};

export const lookOf = (unit: Unit): UnitLook => ({ name: unit.name, cls: unit.cls, side: unit.side, gender: unit.gender, hair: HAIR[unit.name] ?? '#5a3a22' });

const W = 20;
const H = 26;
/** The figure's centre column; it faces right (the sheet is mirrored on screen to face left). */
const CX = 9;

const SKIN = ['#a8704e', '#cf9670', '#eebc94'];
const STEEL = ['#4a5060', '#7a8294', '#b4bccc', '#e6ecf4'];
const LEATHER = ['#3e2a1c', '#5c4028', '#7c5a38'];
const WOOD = ['#4a321e', '#6a4a2c', '#8a6438'];
const GOLD = '#e8c860';
/** Team cloth, dark to light: the player's blue, the enemy's red. */
const CLOTH: Record<Side, string[]> = {
  player: ['#1c2f66', '#2a4ca0', '#3f6fd0', '#6e9cec'],
  enemy: ['#5a1418', '#8e2224', '#bc3a32', '#e0665a'],
};

/** Columns shaded light (left, towards the sun) to dark (right). */
function shaded(g: Gfx, x0: number, x1: number, y: number, ramp: readonly string[]): void {
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0);
    g.set(x, y, t < 0.25 ? ramp[ramp.length - 1] : t < 0.7 ? ramp[ramp.length - 2] : ramp[ramp.length - 3]);
  }
}

/** Two legs and boots, striding with the walk frame. */
function legs(g: Gfx, top: number, stride: number, ramp: readonly string[]): void {
  for (const [x, shift, dark] of [[CX - 2, -stride, true], [CX + 1, stride, false]] as const) {
    for (let y = top; y < 24; y++) {
      const lean = Math.round((shift * (y - top + 1)) / (24 - top));
      g.set(x + lean, y, dark ? ramp[0] : ramp[1]);
      g.set(x + 1 + lean, y, dark ? ramp[0] : ramp[2]);
    }
    for (const y of [24, 25]) for (let i = 0; i < 3; i++) g.set(x + shift + i, y, y === 24 && i === 0 && !dark ? LEATHER[2] : dark ? LEATHER[0] : LEATHER[1]);
  }
}

/** A round head with an eye looking right, under hair (long for women) or nothing (a helm goes on after). */
function head(g: Gfx, cy: number, look: UnitLook, covered: boolean): void {
  g.ball(CX + 0.5, cy, 3.4, 3.5, SKIN);
  g.set(CX + 2, cy, '#1a1420');
  if (covered) return;
  const hair = [shade(look.hair, 0.62), look.hair, shade(look.hair, 1.3)];
  for (let y = Math.floor(cy - 4); y <= cy + 3; y++) {
    for (let x = CX - 4; x <= CX + 4; x++) {
      if (!g.get(x, y) && y > cy - 4) continue;
      const fringe = y <= cy - 2 || (x <= CX - 1 && y <= cy + 1);
      if (fringe && Math.hypot(x + 0.5 - CX - 0.5, (y + 0.5 - cy) * 0.95) <= 4) g.set(x, y, y <= cy - 3 ? hair[2] : x > CX + 1 ? hair[0] : hair[1]);
    }
  }
  if (look.gender === 'female') for (let y = cy + 1; y <= cy + 6; y++) for (const x of [CX - 3, CX - 2]) g.set(x, y, x === CX - 3 ? hair[0] : hair[1]);
}

/** The body: a tunic (or armour) in the team's cloth, `hw` columns either side, with a belt. */
function torso(g: Gfx, top: number, bottom: number, hw: number, ramp: readonly string[], belt = true): void {
  for (let y = top; y <= bottom; y++) shaded(g, CX - hw + 1, CX + hw, y, ramp);
  if (belt) for (let x = CX - hw + 1; x <= CX + hw; x++) g.set(x, bottom - 1, LEATHER[1]);
}

/** The hand on the weapon side, at the front. */
const hand = (g: Gfx, x: number, y: number) => g.ball(x + 0.5, y + 0.5, 1.2, 1.2, SKIN);

/**
 * Paints one frame of a unit. `frame` counts within the clip; `bob` lifts the body a pixel
 * between steps (walk) or settles it a pixel as it breathes (idle).
 */
function paintUnit(g: Gfx, look: UnitLook, clip: UnitClip, frame: number): void {
  const cloth = CLOTH[look.side];
  const stride = clip === 'walk' ? [0, 1, 0, -1][frame] : 0;
  const bob = clip === 'walk' ? (frame % 2 ? -1 : 0) : clip === 'idle' && frame === 1 ? 1 : 0;
  const headY = 9 + bob;
  const top = 13 + bob;
  const trousers = look.cls === 'knight' ? STEEL : [shade(cloth[0], 0.8), cloth[0], cloth[1]];
  switch (look.cls) {
    case 'sword': {
      legs(g, 20, stride, trousers);
      g.ball(CX - 3.5, top + 3.5, 2.6, 3.2, [cloth[0], cloth[1], cloth[2]]); // shield on the far arm
      g.set(CX - 4, top + 3, GOLD);
      torso(g, top, 20 + Math.max(0, bob), 3, cloth);
      head(g, headY, look, false);
      g.line(CX + 4, top + 2, CX + 9, top - 5, STEEL[3]);
      g.line(CX + 5, top + 2, CX + 9, top - 4, STEEL[1]);
      g.line(CX + 3, top + 2, CX + 5, top + 4, GOLD); // guard
      hand(g, CX + 3, top + 3);
      break;
    }
    case 'spear': {
      for (let y = 4 + bob; y < 25; y++) g.set(CX + 5, y, y % 5 ? WOOD[1] : WOOD[2]);
      for (let y = 0; y < 4; y++) for (let x = -Math.floor(y / 2); x <= Math.floor(y / 2); x++) g.set(CX + 5 + x, y + bob, x < 0 ? STEEL[3] : STEEL[1]);
      legs(g, 20, stride, trousers);
      torso(g, top, 20 + Math.max(0, bob), 3, cloth);
      g.rect(CX - 1, top, 5, 2, STEEL[2]); // a gorget
      head(g, headY, look, false);
      // A steel cap over the hair.
      for (let x = CX - 3; x <= CX + 4; x++) for (let y = headY - 4; y <= headY - 2; y++) if (Math.hypot(x + 0.5 - CX - 0.5, y + 0.5 - headY) <= 4.1) g.set(x, y, x < CX ? STEEL[3] : STEEL[2]);
      hand(g, CX + 4, top + 3);
      break;
    }
    case 'axe': {
      legs(g, 20, stride, trousers);
      torso(g, top, 20 + Math.max(0, bob), 4, cloth);
      for (let y = top; y < top + 5; y++) g.set(CX - 3, y, SKIN[1]); // bare far arm
      head(g, headY, look, false);
      if (look.gender === 'male') for (let x = CX; x <= CX + 3; x++) g.set(x, headY + 3, shade(look.hair, 0.8)); // a beard
      g.line(CX + 3, top + 6, CX + 6, top - 6, WOOD[1]);
      g.line(CX + 4, top + 6, CX + 7, top - 6, WOOD[0]);
      // A crescent blade beyond the haft: bright along its cutting edge, darker by the haft.
      for (let dy = -4; dy <= 3; dy++) {
        const reach = Math.round(3.4 * Math.sqrt(1 - ((dy + 0.5) / 4.2) ** 2));
        for (let dx = 1; dx <= reach; dx++) g.set(CX + 7 + dx, top - 3 + dy, dx === reach ? STEEL[3] : dx === 1 ? STEEL[0] : STEEL[2]);
      }
      hand(g, CX + 4, top + 3);
      break;
    }
    case 'bow': {
      g.line(CX - 4, top + 6, CX - 2, top, LEATHER[1]); // a quiver slung across the back, fletchings up
      for (const [x, y] of [[CX - 2, top - 1], [CX - 1, top - 2], [CX - 3, top - 1]] as const) g.set(x, y, '#e8e0cc');
      legs(g, 20, stride, trousers);
      torso(g, top, 20 + Math.max(0, bob), 3, [shade(cloth[1], 0.7), cloth[1], cloth[2], LEATHER[2]]);
      head(g, headY, look, false);
      // A hood in the team's cloth over the hair, open at the face.
      for (let y = headY - 4; y <= headY + 2; y++) for (let x = CX - 4; x <= CX + 4; x++) {
        const d = Math.hypot(x + 0.5 - CX - 0.5, y + 0.5 - headY);
        if (d <= 4.2 && (y <= headY - 2 || x <= CX - 1)) g.set(x, y, x < CX - 1 ? cloth[2] : cloth[1]);
      }
      // A tall bow held out in front: a thin curved stave and its string.
      for (let y = top - 6; y <= top + 9; y++) g.set(CX + 6 + Math.round(2.2 * Math.sin((Math.PI * (y - top + 6)) / 15)), y, y < top - 4 || y > top + 7 ? WOOD[0] : WOOD[2]);
      for (let y = top - 5; y <= top + 8; y++) g.set(CX + 6, y, '#d8d0bc');
      hand(g, CX + 5, top + 2);
      break;
    }
    case 'mage': {
      for (let y = 3 + bob; y < 25; y++) g.set(CX + 6, y, WOOD[1]);
      g.ball(CX + 6.5, 2.5 + bob, 1.6, 1.6, ['#5ac8e8', '#9ff0ff', '#e8ffff'], true);
      // Boots peek out under the robe as she walks.
      for (const [x, shift] of [[CX - 2, -stride], [CX + 1, stride]] as const) for (let i = 0; i < 3; i++) g.set(x + shift + i, 25, LEATHER[1]);
      // A robe that flares to the hem.
      for (let y = top; y <= 24; y++) {
        const hw = 3 + Math.floor(((y - top) / (24 - top)) * 2.5);
        shaded(g, CX - hw + 1, CX + hw, y, cloth);
      }
      for (let x = CX - 4; x <= CX + 5; x++) g.set(x, 24, GOLD);
      head(g, headY, look, false);
      // A tall pointed hat with a wide brim.
      for (let y = 0; y <= headY - 3; y++) {
        const hw = Math.round(((y + 1) / (headY - 2)) * 3);
        for (let x = -hw; x <= hw; x++) g.set(CX + 1 + x - Math.round((headY - 3 - y) / 3), y + Math.min(0, bob), x < 0 ? cloth[2] : cloth[1]);
      }
      for (let x = CX - 4; x <= CX + 5; x++) g.set(x, headY - 2, cloth[0]);
      hand(g, CX + 5, top + 3);
      break;
    }
    case 'knight': {
      for (let i = 0; i < 20; i++) g.set(CX + 2 + i * 0.45, top + 5 - i, i > 15 ? STEEL[3] : WOOD[i % 2]); // the lance, couched
      // A cape in the team's cloth falling behind.
      for (let y = top; y <= 22; y++) for (let x = CX - 5 - Math.floor((y - top) / 4); x <= CX - 2; x++) g.set(x, y, x === CX - 2 ? cloth[0] : y % 3 ? cloth[1] : cloth[2]);
      legs(g, 20, stride, STEEL);
      torso(g, top, 20 + Math.max(0, bob), 4, STEEL, false);
      for (let y = top + 1; y <= 20 + Math.max(0, bob); y++) for (let x = CX; x <= CX + 2; x++) g.set(x, y, x === CX ? cloth[2] : cloth[1]); // tabard
      g.ball(CX - 2.5, top + 1, 2.4, 1.8, STEEL); // pauldron
      head(g, headY, look, true);
      // A great helm with a visor slit and a plume streaming back.
      g.ball(CX + 0.5, headY, 3.8, 3.9, STEEL);
      for (let x = CX; x <= CX + 3; x++) g.set(x, headY, '#1a1c22');
      for (let i = 0; i < 6; i++) g.set(CX - i, headY - 4 + Math.floor(i / 2), i < 3 ? cloth[3] : cloth[2]);
      hand(g, CX + 3, top + 3);
      break;
    }
  }
  g.outline(0.4);
}

export interface UnitSheet {
  texture: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  cell(index: number, clip: UnitClip): SpriteRect;
}

const SHEET_W = 256;
const SHEET_H = 512;
const PAD = 1;
const ORDER: UnitClip[] = ['idle', 'walk', 'rest'];

/**
 * Which map sprites to draw, for the detail preview: today's ('now'), the hand-drawn heroes at
 * today's size ('detail'), or hand-drawn at 1.3x the height ('tall'). Set with ?sprites=.
 */
export type SpriteSet = 'now' | 'detail' | 'tall';
export const spriteSet = (): SpriteSet => {
  const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('sprites');
  return asked === 'detail' || asked === 'tall' ? asked : 'now';
};
/** Cell sizes: the art with a pixel of outline round it, and a row spare above for the walk's bob. */
const CELL: Record<SpriteSet, [number, number]> = { now: [W, H], detail: [22, 29], tall: [28, 37] };

const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
};

/**
 * A hero's hand-drawn grid as colours, padded by a pixel and outlined: each clear pixel beside the
 * figure takes a deep shade of its darkest neighbour, so the rim follows the colours it borders.
 */
function heroPixels(look: UnitLook, set: SpriteSet): (string | null)[][] | null {
  const art = set === 'now' ? undefined : HERO_ART[look.name]?.[set];
  if (!art) return null;
  const keys: Record<string, string> = { ...PALETTE, ...HERO_HAIR[look.name] };
  CLOTH[look.side].forEach((c, i) => (keys[String(i + 1)] = c));
  const [w, h] = [art[0].length + 2, art.length + 2];
  const px: (string | null)[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const ch = art[y - 1]?.[x - 1];
      return ch && ch !== '.' ? keys[ch] : null;
    }),
  );
  const rim: [number, number, string][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[y][x]) continue;
      const nb = [px[y][x + 1], px[y][x - 1], px[y + 1]?.[x], px[y - 1]?.[x]].filter((c): c is string => !!c);
      if (nb.length) rim.push([x, y, shade(nb.reduce((a, b) => (luma(b) < luma(a) ? b : a)), 0.32)]);
    }
  }
  for (const [x, y, c] of rim) px[y][x] = c;
  return px;
}

/** One frame into a cell of `cw` x `ch`: the hero's own art, standing on the cell's bottom row, or today's sprite. */
function paintFrame(look: UnitLook, clip: UnitClip, frame: number, set: SpriteSet, cw: number, ch: number): Gfx {
  const g = new Gfx(cw, ch);
  const hero = heroPixels(look, set);
  if (hero) {
    let bottom = hero.length - 1;
    while (bottom > 0 && hero[bottom].every((c) => !c)) bottom--;
    const bob = clip === 'walk' && frame % 2 ? 1 : 0;
    const dy = ch - 1 - bottom - bob;
    const dx = Math.round((cw - hero[0].length) / 2);
    hero.forEach((row, y) => row.forEach((c, x) => c && g.set(x + dx, y + dy, c)));
    return g;
  }
  const old = new Gfx(W, H);
  paintUnit(old, look, clip, frame);
  const [dx, dy] = [Math.round((cw - W) / 2), ch - H];
  old.color.forEach((c, i) => c && g.set((i % W) + dx, Math.floor(i / W) + dy, c, old.glow[i]));
  return g;
}

/** Every unit's clips in one sheet: a row per unit, its idle, walk and rest frames side by side. */
export function buildUnitSheet(looks: readonly UnitLook[], set: SpriteSet = spriteSet()): UnitSheet {
  const [CW, CH] = CELL[set];
  if (looks.length * (CH + PAD) > SHEET_H) throw new Error('Too many units for the unit sheet.');
  const canvas = document.createElement('canvas');
  const glowCanvas = document.createElement('canvas');
  canvas.width = glowCanvas.width = SHEET_W;
  canvas.height = glowCanvas.height = SHEET_H;
  const ctx = canvas.getContext('2d')!;
  const glowCtx = glowCanvas.getContext('2d')!;
  glowCtx.fillStyle = '#000';
  glowCtx.fillRect(0, 0, SHEET_W, SHEET_H);
  const column: Record<UnitClip, number> = { idle: 0, walk: 0, rest: 0 };
  let x0 = 0;
  for (const clip of ORDER) {
    column[clip] = x0;
    x0 += CLIPS[clip].frames * (CW + PAD);
  }
  looks.forEach((look, row) => {
    for (const clip of ORDER) {
      for (let frame = 0; frame < CLIPS[clip].frames; frame++) {
        const g = paintFrame(look, clip === 'rest' ? 'idle' : clip, frame, set, CW, CH);
        const x = column[clip] + frame * (CW + PAD);
        const y = row * (CH + PAD);
        g.color.forEach((c, i) => {
          if (!c) return;
          // Resting units are dimmed, as in FFT, so the ones still to move stand out.
          ctx.fillStyle = clip === 'rest' ? shade(c, 0.62) : c;
          ctx.fillRect(x + (i % CW), y + Math.floor(i / CW), 1, 1);
          if (!g.glow[i] || clip === 'rest') return;
          glowCtx.fillStyle = c;
          glowCtx.fillRect(x + (i % CW), y + Math.floor(i / CW), 1, 1);
        });
      }
    }
  });
  return {
    texture: nearestTexture(canvas),
    glow: nearestTexture(glowCanvas),
    cell(index, clip) {
      const x = column[clip];
      const y = index * (CH + PAD);
      // CanvasTexture is flipped: canvas y = 0 is v = 1.
      return {
        u0: x / SHEET_W, u1: (x + CW) / SHEET_W, v0: 1 - (y + CH) / SHEET_H, v1: 1 - y / SHEET_H, w: CW, h: CH,
        frames: CLIPS[clip].frames, fps: CLIPS[clip].fps, stride: (CW + PAD) / SHEET_W,
      };
    },
  };
}
