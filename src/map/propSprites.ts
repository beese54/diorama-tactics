import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { PROPS } from './props';
import { PROP_IDS, type PropId } from './types';

type Rand = () => number;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
/** Scales a colour's brightness (k < 1 darkens, k > 1 lightens). */
export const shade = (hex: string, k: number) => toHex(rgb(hex).map((c) => c * k));

/** A small pixel canvas for one sprite: colour plus a parallel glow mask. y grows downward, base on the last row. */
class Gfx {
  readonly color: (string | null)[];
  readonly glow: boolean[];
  constructor(readonly w: number, readonly h: number) {
    this.color = new Array(w * h).fill(null);
    this.glow = new Array(w * h).fill(false);
  }
  set(x: number, y: number, c: string, glows = false): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.color[y * this.w + x] = c;
    this.glow[y * this.w + x] = glows;
  }
  /** Makes a pixel transparent again (a gap in foliage). */
  clear(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.color[y * this.w + x] = null;
  }
  get(x: number, y: number): string | null {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.color[y * this.w + x];
  }
  rect(x: number, y: number, w: number, h: number, c: string, glows = false): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, glows);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, glows = false): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, glows);
  }
  /** A shaded ellipsoid lit from the upper left; `ramp` runs dark to light. */
  ball(cx: number, cy: number, rx: number, ry: number, ramp: readonly string[], glows = false): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        const light = -0.55 * nx - 0.6 * ny + 0.58 * nz;
        const level = (light * 0.5 + 0.5) * ramp.length + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.9;
        this.set(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(level)))], glows);
      }
    }
  }
  /** Selective outline: a darker rim on transparent pixels beside the sprite, so it reads against the ground. */
  outline(k = 0.45): void {
    const add: [number, number, string][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const nb = this.get(x + 1, y) ?? this.get(x - 1, y) ?? this.get(x, y + 1) ?? this.get(x, y - 1);
        if (nb) add.push([x, y, shade(nb, k)]);
      }
    }
    for (const [x, y, c] of add) this.set(x, y, c);
  }
}

interface SpriteArt {
  w: number;
  h: number;
  /** Animation frames (default 1) and how fast they play; each loop divides 4 s, so recordings loop seamlessly. */
  frames?: number;
  fps?: number;
  paint: (g: Gfx, variant: number, rand: Rand, frame: number) => void;
}

const WOOD = ['#4a321e', '#6a4a2c', '#8a6438', '#a87c4a'];
const STONE = ['#4c4842', '#66615a', '#817b72', '#9d978c'];
const IRON = ['#25262b', '#3a3c43', '#55585f'];
const FIRE = ['#ff7a2a', '#ffb347', '#ffe08a'];

/** One tier of a conifer: a triangle, light on the left, dark on the right, drooping tips. */
function conifer(g: Gfx, cx: number, top: number, height: number, halfWidth: number, ramp: readonly string[], snow: boolean): void {
  for (let r = 0; r < height; r++) {
    const hw = Math.round(((r + 1) / height) * halfWidth);
    for (let x = -hw; x <= hw; x++) {
      const side = x / Math.max(1, hw);
      let c = side < -0.35 ? ramp[2] : side > 0.4 ? ramp[0] : ramp[1];
      if (r === height - 1 && Math.abs(x) > hw - 2) c = ramp[0];
      if (snow && r < height * 0.45 && side < 0.3) c = r < 2 ? '#f4f8fb' : '#dfe8ef';
      g.set(cx + x, top + r, c);
    }
  }
}

/** A tongue of fire rising from (cx, base) that wavers and leans with the animation frame. */
function flame(g: Gfx, cx: number, base: number, height: number, width: number, frame: number): void {
  for (let r = 0; r < height; r++) {
    const t = r / Math.max(1, height - 1); // 0 at the base, 1 at the tip
    const hw = Math.round(width * Math.sqrt(1 - t) * (0.85 + 0.15 * Math.sin(frame * 2.1 + r)));
    const lean = Math.round(Math.sin((frame * Math.PI) / 2 + r * 0.8) * t * 1.5);
    for (let x = -hw; x <= hw; x++) {
      const core = Math.abs(x) <= hw * 0.45 && t < 0.7;
      g.set(cx + x + lean, base - r, core ? FIRE[2] : Math.abs(x) < hw * 0.8 ? FIRE[1] : FIRE[0], true);
    }
  }
  if (frame % 2 === 0) g.set(cx + (frame === 0 ? 1 : -1), base - height - 1, FIRE[0], true); // a spark leaping off the tip
}

const ART: Record<PropId, SpriteArt> = {
  pine: {
    w: 13, h: 27,
    paint(g, v) {
      const ramp = [['#1d3628', '#2b4a33', '#3e6444'], ['#22382a', '#314e36', '#466a45'], ['#1f342c', '#2d4838', '#41604a']][v];
      g.rect(5, 22, 3, 5, WOOD[1]);
      g.rect(5, 22, 1, 5, WOOD[2]);
      [[0, 7, 3], [5, 7, 4], [10, 7, 5], [15, 8, 6]].forEach(([top, h, hw]) => conifer(g, 6, top, h, hw, ramp, false));
      g.outline();
    },
  },
  pine_snowy: {
    w: 13, h: 27,
    paint(g, v) {
      const ramp = v ? ['#1f342c', '#2d4838', '#41604a'] : ['#1d3628', '#2b4a33', '#3e6444'];
      g.rect(5, 22, 3, 5, WOOD[1]);
      [[0, 7, 3], [5, 7, 4], [10, 7, 5], [15, 8, 6]].forEach(([top, h, hw]) => conifer(g, 6, top, h, hw, ramp, true));
      g.outline();
    },
  },
  boulder: {
    w: 13, h: 10,
    paint(g, v) {
      g.ball(6.5, 5.5, 6, 4.6, STONE);
      if (v) g.ball(10, 7, 2.6, 2.2, STONE);
      for (const [x, y] of [[4, 2], [5, 2], [6, 2], [3, 3]]) g.set(x, y, '#7f9a52');
      g.outline();
    },
  },
  cairn: {
    w: 13, h: 24,
    paint(g) {
      const flat = (cx: number, cy: number, rx: number, ry: number) => g.ball(cx, cy, rx, ry, STONE);
      flat(6.5, 20.5, 5.5, 3);
      flat(6, 16.5, 4.5, 2.4);
      flat(7, 13, 3.8, 2.2);
      flat(6.5, 9.8, 3, 1.8);
      g.line(8, 0, 8, 8, WOOD[0]);
      for (let y = 0; y < 4; y++) g.rect(9, y, 4 - y, 1, y < 2 ? '#c8402e' : '#a83226');
      g.outline();
    },
  },
  crate: {
    w: 11, h: 11,
    paint(g, v) {
      const w = v ? ['#5a3e26', '#7a5636', '#9a7046', '#b8895a'] : WOOD;
      g.rect(0, 0, 11, 3, w[3]);
      g.rect(0, 3, 11, 8, w[2]);
      for (const y of [3, 7]) g.rect(0, y, 11, 1, w[1]);
      g.line(1, 4, 9, 10, w[1]);
      g.rect(0, 3, 1, 8, w[1]);
      g.rect(10, 3, 1, 8, w[0]);
      g.rect(0, 0, 11, 1, shade(w[3], 1.12));
      g.outline();
    },
  },
  barrel: {
    w: 9, h: 11,
    paint(g) {
      for (let x = 0; x < 9; x++) {
        const t = x / 8;
        const c = t < 0.3 ? WOOD[3] : t < 0.65 ? WOOD[2] : t < 0.85 ? WOOD[1] : WOOD[0];
        const inset = x === 0 || x === 8 ? 1 : 0;
        g.rect(x, 1 + inset, 1, 10 - inset * 2, c);
      }
      for (const y of [3, 8]) for (let x = 0; x < 9; x++) g.set(x, y, x < 3 ? IRON[2] : IRON[1]);
      g.rect(1, 0, 7, 2, WOOD[3]);
      g.rect(2, 0, 5, 1, shade(WOOD[3], 1.15));
      g.outline();
    },
  },
  brazier: {
    w: 9, h: 16, frames: 4, fps: 8,
    paint(g, _v, _r, frame) {
      g.line(1, 15, 3, 9, IRON[1]);
      g.line(7, 15, 5, 9, IRON[0]);
      g.line(4, 15, 4, 9, IRON[2]);
      g.rect(0, 7, 9, 3, IRON[1]);
      g.rect(0, 7, 9, 1, IRON[2]);
      flame(g, 4, 6, 6 + (frame % 2), 3, frame);
      g.outline(0.35);
    },
  },
  banner: {
    w: 11, h: 30,
    paint(g) {
      g.rect(1, 1, 1, 29, WOOD[1]);
      g.set(1, 0, '#e0b84a');
      g.rect(1, 2, 9, 1, WOOD[2]);
      const cloth = ['#6e1e22', '#93282c', '#b33a36'];
      for (let y = 3; y < 19; y++) {
        for (let x = 2; x < 10; x++) {
          if (y > 15 && Math.abs(x - 5.5) < (y - 15) * 1.2) continue; // swallowtail
          g.set(x, y, x < 4 ? cloth[2] : x > 8 ? cloth[0] : cloth[1]);
        }
      }
      for (const [x, y] of [[5, 7], [6, 7], [5, 8], [6, 8], [4, 9], [7, 9], [5, 10], [6, 10], [5, 11], [6, 11]]) g.set(x, y, '#e0b84a');
      g.outline();
    },
  },
  throne: {
    w: 15, h: 21,
    paint(g) {
      const gold = ['#7a5a1e', '#a87e2a', '#d4a83c', '#f0d070'];
      const velvet = ['#5a1420', '#7a1c2a', '#9a2836'];
      g.rect(2, 1, 11, 13, gold[1]);
      g.rect(2, 1, 2, 13, gold[2]);
      g.rect(4, 3, 7, 10, velvet[1]);
      g.rect(4, 3, 2, 10, velvet[2]);
      g.rect(6, 0, 3, 2, gold[3]);
      g.set(7, 0, '#e04a4a');
      g.rect(0, 12, 15, 4, gold[1]);
      g.rect(0, 12, 15, 1, gold[3]);
      g.rect(3, 13, 9, 2, velvet[0]);
      g.rect(1, 16, 2, 5, gold[0]);
      g.rect(12, 16, 2, 5, gold[0]);
      g.rect(1, 16, 1, 5, gold[2]);
      g.outline();
    },
  },
  haystack: {
    w: 13, h: 10,
    paint(g, _v, rand) {
      g.ball(6.5, 7, 6.2, 6, ['#7a5a22', '#a07a32', '#c8a048', '#e2c46a']);
      for (let i = 0; i < 10; i++) {
        const x = 1 + Math.floor(rand() * 11);
        const y = 2 + Math.floor(rand() * 7);
        g.set(x, y, '#f0d882');
      }
      g.outline();
    },
  },
  tree: {
    w: 19, h: 27,
    paint(g, v) {
      const leaves = v ? ['#2c4c22', '#3c6628', '#528434', '#6fa244'] : ['#2f5226', '#3f6a2e', '#55843a', '#73a04a'];
      g.rect(8, 16, 3, 11, WOOD[1]);
      g.rect(8, 16, 1, 11, WOOD[2]);
      g.line(10, 18, 13, 15, WOOD[1]);
      const blobs = v ? [[9.5, 9, 7, 6.5], [4.5, 12, 4.5, 4], [14.5, 12, 4.5, 4], [9, 4, 5, 4]] : [[9.5, 10, 8, 6.5], [5, 13, 4.5, 3.5], [14, 13, 4.5, 3.5], [10, 5, 5.5, 4.5]];
      for (const [cx, cy, rx, ry] of blobs) g.ball(cx, cy, rx, ry, leaves);
      g.outline();
    },
  },
  lamp_post: {
    w: 7, h: 24,
    paint(g) {
      g.rect(3, 6, 1, 16, IRON[1]);
      g.rect(2, 21, 3, 3, IRON[0]);
      g.rect(2, 21, 1, 3, IRON[2]);
      g.rect(1, 5, 5, 1, IRON[1]);
      g.rect(1, 1, 5, 4, '#ffe7a8', true);
      g.rect(2, 2, 3, 2, '#fff6d8', true);
      g.rect(0, 0, 7, 1, IRON[0]);
      g.outline();
    },
  },
  bench: {
    w: 13, h: 8,
    paint(g) {
      g.rect(0, 0, 13, 2, WOOD[2]);
      g.rect(0, 0, 13, 1, WOOD[3]);
      g.rect(0, 3, 13, 2, WOOD[2]);
      g.rect(0, 3, 13, 1, WOOD[3]);
      for (const x of [1, 11]) g.rect(x, 2, 1, 6, IRON[1]);
      g.outline();
    },
  },
  fountain: {
    w: 27, h: 25, frames: 4, fps: 6,
    paint(g, _v, _r, frame) {
      const water = ['#3f7fa8', '#5c9cc4', '#8cc4e0', '#d8f0f8'];
      // Lower basin: a wide stone ring holding water.
      for (let y = 16; y < 25; y++) {
        for (let x = 0; x < 27; x++) {
          const nx = (x + 0.5 - 13.5) / 13.5;
          const ny = (y + 0.5 - 19) / 5;
          if (nx * nx + ny * ny > 1 && y < 20) continue;
          if (y >= 20 && Math.abs(nx) > 1) continue;
          g.set(x, y, y >= 20 ? (nx < -0.5 ? STONE[3] : nx > 0.5 ? STONE[1] : STONE[2]) : STONE[2]);
        }
      }
      g.ball(13.5, 18.5, 11, 3, water);
      g.rect(1, 20, 25, 1, STONE[3]);
      // Column and upper bowl.
      g.rect(12, 9, 3, 9, STONE[2]);
      g.rect(12, 9, 1, 9, STONE[3]);
      g.ball(13.5, 9, 6, 1.8, STONE);
      g.ball(13.5, 8.5, 4.5, 1, water);
      // Jets: a bobbing spout, and arcs falling into the basin with droplets running down them.
      const top = 1 + (frame % 2);
      g.rect(13, top + 1, 1, 8 - top, water[3]);
      g.set(13, top, water[2]);
      const arc = (t: number): [number, number] => [2 + t * 9, 7 + t * t * 10 - (1 - t) * 3];
      for (let i = 0; i <= 20; i++) {
        const [dx, dy] = arc(i / 20);
        g.set(13.5 - dx, dy, water[1]);
        g.set(13.5 + dx, dy, water[1]);
      }
      for (let i = 0; i < 6; i++) {
        const t = (i + frame / 4) / 6;
        const [dx, dy] = arc(t);
        g.set(13.5 - dx, dy, water[3]);
        g.set(13.5 + dx, dy, water[t < 0.5 ? 3 : 2]);
      }
      // Ripples spreading across the basin.
      for (let k = 0; k < 4; k++) g.set(4 + ((k * 5 + frame * 2) % 19), 17 + (k % 3), water[3]);
      g.outline(0.5);
    },
  },
  traffic_light: {
    w: 6, h: 22,
    paint(g) {
      g.rect(2, 9, 2, 13, IRON[1]);
      g.rect(2, 9, 1, 13, IRON[2]);
      g.rect(0, 0, 6, 10, IRON[0]);
      g.rect(1, 1, 4, 2, '#5a1c1c');
      g.rect(1, 4, 4, 2, '#5a4a1c');
      g.rect(1, 7, 4, 2, '#5cff8a', true);
      g.outline();
    },
  },
  planter: {
    w: 13, h: 10,
    paint(g, _v, rand) {
      g.rect(0, 5, 13, 5, STONE[2]);
      g.rect(0, 5, 13, 1, STONE[3]);
      g.rect(10, 6, 3, 4, STONE[1]);
      g.ball(6.5, 4, 6, 3, ['#2f5226', '#3f6a2e', '#55843a']);
      for (let i = 0; i < 7; i++) g.set(1 + Math.floor(rand() * 11), 2 + Math.floor(rand() * 3), ['#e05a4a', '#f0c84a', '#e88ab0'][i % 3]);
      g.outline();
    },
  },
  stall: {
    w: 19, h: 19,
    paint(g, v, rand) {
      const cloth = [['#b8322a', '#e8ddd0'], ['#2a8a8a', '#e8ddd0'], ['#d8a02a', '#3a2a22']][v];
      // Striped awning with a scalloped edge.
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 19; x++) {
          if (y === 5 && x % 3 === 2) continue;
          const c = Math.floor(x / 3) % 2 ? cloth[1] : cloth[0];
          g.set(x, y, y === 0 ? shade(c, 1.1) : y > 3 ? shade(c, 0.85) : c);
        }
      }
      for (const x of [1, 17]) g.rect(x, 6, 1, 7, WOOD[0]);
      // Counter with goods.
      g.rect(0, 12, 19, 7, WOOD[2]);
      g.rect(0, 12, 19, 1, WOOD[3]);
      g.rect(0, 15, 19, 1, WOOD[1]);
      for (let i = 0; i < 9; i++) g.set(2 + i * 1.7, 11 - Math.floor(rand() * 2), ['#e8a03a', '#c83a3a', '#7ab84a', '#e8d870'][Math.floor(rand() * 4)]);
      // A paper lantern hung under the awning.
      g.ball(9.5, 8, 2, 2, ['#c8402e', '#ff7a4a', '#ffb070'], true);
      g.outline();
    },
  },
  lantern_post: {
    w: 7, h: 24, frames: 4, fps: 4,
    paint(g, _v, _r, frame) {
      g.rect(3, 9, 1, 15, WOOD[1]);
      g.rect(3, 9, 1, 1, WOOD[0]);
      g.rect(1, 1, 5, 1, WOOD[0]);
      // The candle inside gutters a little from frame to frame.
      const glow = [
        ['#b02a22', '#e04a30', '#ff7a4a', '#ffb070'],
        ['#a82620', '#d84228', '#ff6e40', '#ffa060'],
        ['#b02a22', '#e04a30', '#ff7a4a', '#ffb070'],
        ['#b8302a', '#e8523a', '#ff8656', '#ffbc80'],
      ][frame];
      g.ball(3.5, 5, 3, 3.6, glow, true);
      g.rect(2, 1, 3, 1, '#2a1a14');
      g.rect(3, 9, 1, 1, '#ffd060', true);
      g.outline();
    },
  },
  lantern_gate: {
    w: 31, h: 33,
    paint(g) {
      const red = ['#6e1a18', '#9a2420', '#c4342a'];
      for (const x of [5, 23]) {
        g.rect(x, 4, 3, 29, red[1]);
        g.rect(x, 4, 1, 29, red[2]);
        g.rect(x - 1, 30, 5, 3, '#2a2228');
      }
      // Top beam curving up at the ends, a second beam below.
      for (let x = 0; x < 31; x++) {
        const lift = Math.round(Math.pow(Math.abs(x - 15) / 15, 3) * 3);
        g.rect(x, 2 - lift, 1, 3, x < 15 ? '#2a2228' : '#1f1a20');
        g.set(x, 4 - lift, red[1]);
      }
      g.rect(3, 9, 25, 2, red[1]);
      g.rect(3, 9, 25, 1, red[2]);
      g.rect(14, 5, 3, 4, '#2a2228');
      g.rect(15, 6, 1, 2, '#ffd060', true);
      for (const x of [11, 19]) {
        g.line(x, 11, x, 13, '#2a2228');
        g.ball(x + 0.5, 16, 2.6, 3, ['#b02a22', '#e04a30', '#ff7a4a', '#ffb070'], true);
      }
      g.outline();
    },
  },
  vending: {
    w: 9, h: 15,
    paint(g) {
      g.rect(0, 0, 9, 15, '#3a4a6a');
      g.rect(0, 0, 2, 15, '#4c5e84');
      g.rect(2, 2, 5, 7, '#7ff0ff', true);
      for (let y = 3; y < 9; y += 2) g.rect(3, y, 3, 1, ['#ff6ab0', '#ffe070', '#6aff9a'][(y - 3) / 2], true);
      g.rect(2, 10, 5, 2, '#1a2236');
      g.set(6, 13, '#ff5fa8', true);
      g.outline();
    },
  },
  jungle_tree: {
    w: 25, h: 35,
    paint(g, v, rand) {
      const leaves = v ? ['#1c3a1c', '#285024', '#3a6a2c', '#52863a'] : ['#1f3f1c', '#2c5524', '#3d6e2c', '#568c3a'];
      // A tall trunk leaning a little, with buttress roots.
      for (let y = 12; y < 35; y++) {
        const x = 11 + Math.round(Math.sin(y / 9) * 1.2);
        g.rect(x, y, 3, 1, WOOD[1]);
        g.set(x, y, WOOD[2]);
      }
      g.line(9, 34, 11, 30, WOOD[1]);
      g.line(15, 34, 13, 30, WOOD[0]);
      const blobs = v ? [[12.5, 8, 10, 6], [5, 11, 5, 4], [20, 11, 5, 4], [12, 3.5, 6, 3.5]] : [[12.5, 9, 11, 6], [4.5, 12, 4.5, 3.5], [20.5, 12, 4.5, 3.5], [13, 4, 6.5, 3.5]];
      for (const [cx, cy, rx, ry] of blobs) g.ball(cx, cy, rx, ry, leaves);
      // Hanging vines.
      for (let i = 0; i < 5; i++) {
        const x = 3 + Math.floor(rand() * 19);
        const len = 4 + Math.floor(rand() * 9);
        for (let y = 13; y < 13 + len; y++) g.set(x, y, y % 3 ? leaves[2] : leaves[1]);
      }
      g.outline();
    },
  },
  fern: {
    w: 13, h: 9,
    paint(g, v) {
      const greens = v ? ['#2c5a24', '#3f7a2e', '#5a9a3c'] : ['#2f5f26', '#447f30', '#62a040'];
      for (const [tx, ty] of [[0, 3], [2, 0], [6, 0], [10, 0], [12, 3], [4, 1], [8, 1]]) {
        g.line(6, 8, tx, ty, greens[1]);
        g.set(tx, ty, greens[2]);
      }
      for (const [x, y] of [[3, 4], [9, 4], [5, 3], [7, 3], [6, 5]]) g.set(x, y, greens[2]);
      for (const [x, y] of [[4, 6], [8, 6]]) g.set(x, y, greens[0]);
      g.outline(0.5);
    },
  },
  altar: {
    w: 17, h: 20, frames: 4, fps: 8,
    paint(g, _v, _r, frame) {
      const temple = ['#5f5a44', '#7d7758', '#9a9474', '#b8b292'];
      g.rect(0, 11, 17, 9, temple[1]);
      g.rect(0, 11, 17, 1, temple[3]);
      g.rect(0, 12, 3, 8, temple[2]);
      g.rect(14, 12, 3, 8, temple[0]);
      for (const [x, y] of [[2, 14], [3, 14], [12, 17], [13, 16], [6, 19]]) g.set(x, y, '#5f7a3e');
      // A golden idol between two fire bowls.
      g.ball(8.5, 6, 3, 4, ['#8a6420', '#c49a34', '#f0cc5a', '#fff0a0'], true);
      g.rect(7, 9, 4, 2, '#8a6420');
      g.set(7, 5, '#3a2a10');
      g.set(10, 5, '#3a2a10');
      for (const x of [1, 14]) {
        g.rect(x, 9, 3, 2, '#3a3428');
        flame(g, x + 1, 8, 3 + (frame % 2), 1, frame + x);
      }
      g.outline();
    },
  },
  pillar: {
    w: 9, h: 24,
    paint(g, v) {
      const temple = ['#5f5a44', '#7d7758', '#9a9474', '#b8b292'];
      const top = v ? 6 : 2;
      for (let y = top; y < 22; y++) {
        for (let x = 1; x < 8; x++) g.set(x, y, x < 3 ? temple[3] : x > 6 ? temple[0] : x % 2 ? temple[2] : temple[1]);
      }
      // Jagged broken top.
      for (let x = 1; x < 8; x++) g.rect(x, top - ((x * 7) % 3), 1, 1 + ((x * 7) % 3), temple[2]);
      g.rect(0, 21, 9, 3, temple[1]);
      g.rect(0, 21, 9, 1, temple[3]);
      for (const [x, y] of [[2, 12], [3, 13], [6, 17], [5, 18], [2, 19]]) g.set(x, y, '#5f7a3e');
      g.outline();
    },
  },
  basalt_spire: {
    w: 11, h: 24,
    paint(g, v) {
      const rock = ['#1c1a1a', '#2c2828', '#3e3938', '#575150'];
      for (let y = 0; y < 24; y++) {
        const hw = Math.min(5, 1 + y * (v ? 0.22 : 0.3));
        for (let x = Math.round(5.5 - hw); x < Math.round(5.5 + hw); x++) {
          const t = (x - (5.5 - hw)) / (2 * hw);
          g.set(x, y, t < 0.3 ? rock[3] : t < 0.6 ? rock[2] : t < 0.85 ? rock[1] : rock[0]);
        }
      }
      for (const [x, y] of [[4, 12], [5, 13], [5, 14], [6, 18]]) g.set(x, y, '#ff7a2a', true);
      g.outline(0.6);
    },
  },
  dead_tree: {
    w: 13, h: 21,
    paint(g, v) {
      const bark = ['#1a1614', '#2c2622', '#3e3630'];
      g.rect(6, 6, 2, 15, bark[1]);
      g.rect(6, 6, 1, 15, bark[2]);
      g.line(6, 11, 1, 5, bark[1]);
      g.line(7, 9, 12, v ? 2 : 4, bark[1]);
      g.line(3, 8, 2, 3, bark[0]);
      g.line(7, 6, 6, 0, bark[2]);
      g.line(10, 6, 11, 2, bark[0]);
      g.outline(0.7);
    },
  },
  ember_rock: {
    w: 11, h: 9,
    paint(g) {
      g.ball(5.5, 5, 5.2, 4, ['#1c1a1a', '#2c2828', '#3e3938', '#4e4847']);
      for (const [x, y] of [[3, 4], [4, 5], [5, 5], [6, 6], [7, 4], [8, 3]]) g.set(x, y, x === 5 ? '#ffd060' : '#ff7a2a', true);
      g.outline(0.6);
    },
  },
  vent: {
    w: 23, h: 25, frames: 4, fps: 6,
    paint(g, _v, _r, frame) {
      const obsidian = ['#14101a', '#221a2a', '#342a40', '#54486a'];
      // A glassy black cone with a glowing crater.
      for (let y = 5; y < 25; y++) {
        const hw = 4 + (y - 5) * 0.38;
        for (let x = Math.round(11.5 - hw); x < Math.round(11.5 + hw); x++) {
          const t = (x - (11.5 - hw)) / (2 * hw);
          g.set(x, y, t < 0.2 ? obsidian[3] : t < 0.5 ? obsidian[2] : t < 0.8 ? obsidian[1] : obsidian[0]);
        }
      }
      g.rect(8, 4, 7, 2, frame % 2 ? '#ffb347' : '#ffc860', true);
      g.rect(9, 3, 5, 1, '#ffe08a', true);
      flame(g, 11, 2, 3 + (frame % 2), 1, frame);
      // Lava running down the sides, with bright pulses travelling downhill.
      for (const [x0, len] of [[9, 9], [14, 12], [11, 6]]) {
        for (let y = 6; y < 6 + len; y++) g.set(x0 + (y % 4 === 0 ? 1 : 0), y, (y - frame + 8) % 4 === 0 ? '#ffd060' : y < 9 ? '#ffb347' : '#ff7a2a', true);
      }
      g.outline(0.7);
    },
  },
  broadleaf: {
    w: 21, h: 30,
    paint(g, v, rand) {
      const bark = v === 2 ? ['#8c8678', '#d8d2c2', '#f0ebde'] : [WOOD[0], WOOD[1], WOOD[2]];
      if (v === 0) {
        // A spreading oak: a stout trunk forking under a broad, lumpy crown.
        const leaves = ['#2a4a24', '#3a6230', '#4f7c3a', '#6a9848'];
        g.rect(9, 18, 3, 12, bark[1]);
        g.rect(9, 18, 1, 12, bark[2]);
        g.line(11, 21, 15, 16, bark[1]);
        g.line(9, 20, 5, 16, bark[0]);
        for (const [cx, cy, rx, ry] of [[10.5, 11, 9.5, 6.5], [4.5, 14, 4.5, 3.5], [16.5, 14, 4.5, 3.5], [8, 6, 5.5, 4.5], [14, 7, 5, 4]]) g.ball(cx, cy, rx, ry, leaves);
      } else if (v === 1) {
        // A poplar: a tall, narrow column of leaves.
        const leaves = ['#284a2a', '#365e34', '#4a7840', '#62904c'];
        g.rect(10, 22, 2, 8, bark[1]);
        g.rect(10, 22, 1, 8, bark[2]);
        for (const [cx, cy, rx, ry] of [[10.5, 17, 5, 6], [10.5, 10, 4.5, 6.5], [10.5, 4, 3, 4]]) g.ball(cx, cy, rx, ry, leaves);
      } else {
        // A birch: a pale, black-marked trunk under a light, airy crown.
        const leaves = ['#3c5e28', '#507a32', '#6a9440', '#88b056'];
        g.rect(9, 16, 2, 14, bark[2]);
        g.rect(10, 16, 1, 14, bark[1]);
        // Short dark scars at uneven heights, never a regular stripe.
        for (const y of [19, 23, 24, 28]) g.set(y % 2 ? 9 : 10, y, '#3a3630');
        g.line(10, 19, 14, 15, bark[1]);
        for (const [cx, cy, rx, ry] of [[10, 12, 8, 6], [4.5, 16, 4, 3.5], [15.5, 15, 4.5, 3.5], [10.5, 6, 5.5, 4.5]]) g.ball(cx, cy, rx, ry, leaves);
        // Gaps in the crown, so it reads lighter than an oak.
        for (let i = 0; i < 6; i++) g.clear(4 + Math.floor(rand() * 13), 6 + Math.floor(rand() * 10));
      }
      g.outline();
    },
  },
  well: {
    w: 15, h: 18,
    paint(g) {
      // A round stone well under a little shingled roof, with a bucket on its rope.
      g.ball(7.5, 14, 7, 3.6, STONE);
      g.rect(1, 13, 13, 4, STONE[2]);
      for (let x = 1; x < 14; x += 3) g.rect(x, 13, 1, 4, STONE[1]);
      g.rect(1, 12, 13, 1, STONE[3]);
      g.rect(3, 12, 9, 1, '#2a3640');
      g.rect(2, 3, 1, 10, WOOD[1]);
      g.rect(12, 3, 1, 10, WOOD[0]);
      for (let r = 0; r < 4; r++) g.rect(4 - r, r, 7 + 2 * r, 1, r % 2 ? '#8a4430' : '#a4553c');
      g.rect(3, 5, 9, 1, WOOD[2]);
      g.line(7, 6, 7, 9, '#c9b993');
      g.rect(6, 9, 3, 2, WOOD[1]);
      g.outline();
    },
  },
  autumn_tree: {
    w: 21, h: 30,
    paint(g, v, rand) {
      const crowns = [
        // A red maple: a broad dome, flecked with orange where the sun catches it.
        { leaves: ['#561a12', '#8a2a1a', '#b84024', '#de6436'], fleck: '#f0985a', bark: [WOOD[0], WOOD[1], WOOD[2]], balls: [[10.5, 12, 9, 6.5], [4.5, 15, 4, 3.5], [16.5, 15, 4, 3.5], [7.5, 6.5, 5.5, 4.5], [13.5, 6.5, 5.5, 4.5]] },
        // An oak turning orange-brown, its crown lumpier and lower.
        { leaves: ['#5a2e12', '#86481a', '#b46a28', '#dc943e'], fleck: '#ecb45a', bark: [WOOD[0], WOOD[1], WOOD[2]], balls: [[10.5, 13, 9.5, 6], [3.5, 16, 3.5, 3], [17.5, 16, 3.5, 3], [7, 8, 5, 4], [14.5, 8.5, 5, 4], [10.5, 4.5, 4, 3]] },
        // A birch gone gold: pale bark, an airy crown with sky showing through.
        { leaves: ['#665016', '#937620', '#c09e30', '#e6c858'], fleck: '#f6e48a', bark: ['#8c8678', '#d8d2c2', '#f0ebde'], balls: [[10, 12, 8, 6], [4.5, 16, 4, 3.5], [15.5, 15, 4.5, 3.5], [10.5, 6, 5.5, 4.5]] },
      ][v];
      const { leaves, bark } = crowns;
      g.rect(9, 17, 3, 13, bark[1]);
      g.rect(9, 17, 1, 13, bark[2]);
      if (v === 2) for (const y of [20, 23, 24, 27]) g.set(y % 2 ? 9 : 10, y, '#3a3630');
      g.line(11, 21, 15, 16, bark[1]);
      g.line(9, 20, 5, 16, bark[0]);
      for (const [cx, cy, rx, ry] of crowns.balls) g.ball(cx, cy, rx, ry, leaves);
      for (let i = 0; i < 7; i++) g.set(3 + Math.floor(rand() * 15), 3 + Math.floor(rand() * 12), crowns.fleck);
      if (v === 2) for (let i = 0; i < 6; i++) g.clear(4 + Math.floor(rand() * 13), 6 + Math.floor(rand() * 10));
      g.outline();
      // A few leaves already down around the trunk.
      for (const [x, k] of [[5, 2], [7, 1], [13, 3], [15, 2]]) g.set(x, 29, leaves[k]);
    },
  },
  great_maple: {
    w: 37, h: 44,
    paint(g, _v, rand) {
      // The ridge's old maple: a gnarled trunk on flaring roots under a vast red crown.
      const leaves = ['#4e1610', '#7e2416', '#aa3820', '#d25630', '#ec8048'];
      const bark = ['#2e2018', '#4a3426', '#6a4c36', '#86664a'];
      g.rect(15, 26, 7, 16, bark[1]);
      g.rect(15, 26, 2, 16, bark[2]);
      g.rect(20, 26, 2, 16, bark[0]);
      for (const [x0, x1] of [[11, 15], [22, 26]]) g.line(x0, 43, x1, 38, bark[1]);
      g.rect(12, 42, 13, 2, bark[1]);
      g.rect(12, 42, 4, 1, bark[3]);
      for (const y of [29, 33, 36]) g.set(17 + (y % 3), y, bark[0]);
      g.line(16, 30, 9, 21, bark[1]);
      g.line(21, 29, 28, 20, bark[1]);
      g.line(18, 27, 18, 16, bark[1]);
      for (const [cx, cy, rx, ry] of [
        [18.5, 15, 15, 9], [7, 20, 6.5, 4.5], [30, 20, 6.5, 4.5], [11, 9, 8, 6], [26, 9, 8, 6], [18.5, 6, 8, 5.5], [3.5, 15, 3.5, 3], [33.5, 14, 3.5, 3],
      ]) g.ball(cx, cy, rx, ry, leaves);
      for (let i = 0; i < 16; i++) g.set(4 + Math.floor(rand() * 29), 2 + Math.floor(rand() * 20), rand() < 0.5 ? '#f4a860' : '#e8c060');
      for (let i = 0; i < 5; i++) g.clear(6 + Math.floor(rand() * 25), 8 + Math.floor(rand() * 12));
      g.outline();
      // Leaves drifting down beside the trunk, and a ring of them on the ground.
      for (const [x, y, k] of [[6, 27, 3], [31, 29, 2], [9, 33, 4], [28, 35, 3]]) g.set(x, y, leaves[k]);
      for (const x of [8, 10, 13, 24, 27, 29]) g.set(x, 43, leaves[2 + (x % 3)]);
    },
  },
  palm: {
    w: 25, h: 36,
    paint(g, v) {
      // A date palm: a ringed trunk curving up to a burst of drooping fronds, dates under the crown.
      const lean = v ? -1 : 1;
      const bark = ['#5a4026', '#7a5a36', '#9a7a4e'];
      const fronds = ['#2e5a24', '#3e742c', '#56903a', '#74ac4a'];
      let x = 12 - lean * 3;
      for (let y = 35; y >= 12; y--) {
        if ((35 - y) % 5 === 4) x += lean * 0.6;
        g.rect(Math.round(x) - 1, y, 3, 1, (35 - y) % 3 === 0 ? bark[0] : bark[1]);
        g.set(Math.round(x) - 1, y, bark[2]);
      }
      const cx = Math.round(x);
      const top = 11;
      // Each frond arcs out and droops, darker underneath.
      for (const [dx, dy, len] of [[-11, 3, 11], [-8, -3, 9], [-3, -6, 7], [3, -6, 7], [8, -3, 9], [11, 3, 11], [-6, 5, 8], [6, 5, 8]]) {
        for (let i = 0; i <= len; i++) {
          const t = i / len;
          const fx = cx + dx * t;
          const fy = top + dy * t + 5 * t * t;
          g.set(fx, fy, fronds[t < 0.5 ? 3 : 2]);
          g.set(fx, fy + 1, fronds[1]);
          if (i % 2 === 0) g.set(fx, fy + 2, fronds[0]);
        }
      }
      g.ball(cx, top + 1, 2.5, 2, fronds);
      for (const [ddx, ddy] of [[-1, 3], [1, 3], [0, 4], [2, 2]]) g.set(cx + ddx, top + ddy, '#a0582a');
      g.outline();
    },
  },
  cactus: {
    w: 13, h: 22,
    paint(g, v) {
      const green = ['#2e5230', '#3e6a3c', '#56844c', '#74a060'];
      if (v === 0) {
        // A saguaro: a ribbed column with two arms turned up.
        const column = (x: number, y0: number, y1: number) => {
          for (let y = y0; y <= y1; y++) {
            g.set(x - 1, y, green[3]);
            g.set(x, y, y % 2 ? green[2] : green[1]);
            g.set(x + 1, y, green[1]);
            g.set(x + 2, y, green[0]);
          }
        };
        column(5, 3, 21);
        g.rect(5, 2, 2, 1, green[2]);
        g.rect(1, 11, 4, 2, green[1]);
        column(1, 6, 12);
        g.rect(1, 5, 2, 1, green[2]);
        g.rect(8, 14, 3, 2, green[1]);
        column(10, 9, 15);
        g.rect(10, 8, 2, 1, green[2]);
        for (const [x, y] of [[5, 6], [6, 10], [5, 15], [1, 9]]) g.set(x, y, '#e8e0c0');
      } else {
        // A barrel cactus with a crown of pink flowers.
        g.ball(6.5, 17, 5.5, 4.6, green);
        for (const x of [3, 6, 9]) g.line(x, 13, x, 21, green[0]);
        for (const [x, y, c] of [[5, 12, '#e86aa0'], [7, 12, '#f498c0'], [6, 11, '#f498c0'], [8, 13, '#e86aa0'], [4, 13, '#e86aa0']] as const) g.set(x, y, c);
      }
      g.outline();
    },
  },
  stone_arch: {
    w: 41, h: 46,
    paint(g, _v, rand) {
      // A wind-carved sandstone arch: two weathered legs under a span, banded like the mesas.
      const rock = ['#6e3a24', '#8e4c2e', '#ac643c', '#c88050', '#dc9a64'];
      const shadeAt = (t: number, y: number) => (y % 7 === 3 ? rock[1] : t < 0.25 ? rock[4] : t < 0.6 ? rock[3] : t < 0.85 ? rock[2] : rock[1]);
      // Legs: thick, leaning slightly inwards, flaring into talus at the foot.
      for (let y = 8; y < 46; y++) {
        const flare = Math.max(0, y - 36) * 0.6;
        for (const [x0, x1] of [[2, 11], [29, 38]]) {
          const wobble = Math.round(Math.sin(y * 0.9 + x0) * 0.6);
          for (let x = Math.round(x0 - flare) + wobble; x <= Math.round(x1 + flare) + wobble; x++) g.set(x, y, shadeAt((x - x0) / (x1 - x0), y));
        }
      }
      // The span: thick at the shoulders, thin at the crown, with a clear opening beneath.
      for (let x = 2; x <= 38; x++) {
        const t = (x - 20) / 18;
        const over = Math.round(1 + 3 * t * t);
        const under = Math.round(9 + 9 * (1 - t * t));
        for (let y = over; y <= under; y++) g.set(x, y, y === over ? rock[4] : y === under ? rock[0] : shadeAt(0.4 + 0.3 * t, y));
      }
      // Pits and cracks on the rock only, never in the opening.
      for (let i = 0; i < 18; i++) {
        const x = 2 + Math.floor(rand() * 37);
        const y = 2 + Math.floor(rand() * 42);
        if (g.get(x, y)) g.set(x, y, rock[1]);
      }
      g.outline();
    },
  },
  ice_hut: {
    w: 25, h: 29,
    paint(g) {
      // A little fishing hut out on the ice: red board walls, a snow-laden roof, a stovepipe,
      // a lit window, an auger by the wall, and the hole it fishes through, a rod set over it.
      const walls = ['#5e1e18', '#8a2c20', '#a83a28', '#c4503a'];
      const snow = ['#c8d6e2', '#e2ecf4', '#f6fafd'];
      g.rect(4, 12, 17, 13, walls[2]);
      for (let x = 4; x < 21; x += 3) g.rect(x, 12, 1, 13, walls[1]);
      g.rect(4, 12, 2, 13, walls[3]);
      g.rect(18, 12, 3, 13, walls[0]);
      g.rect(4, 24, 17, 1, walls[0]);
      // Door and window: the window glows by night.
      g.rect(8, 16, 5, 9, '#3a2418');
      g.rect(8, 16, 5, 1, WOOD[2]);
      g.set(11, 20, '#c9a24a');
      g.rect(15, 15, 3, 3, '#ffd88a', true);
      g.rect(15, 15, 3, 1, '#ffeec0', true);
      // Roof: a ridge with eaves, heaped with snow that overhangs a little.
      for (let r = 0; r < 7; r++) g.rect(Math.round(12 - r * 1.7 - 1), 5 + r, Math.round(r * 3.4 + 3), 1, r < 5 ? snow[r > 2 ? 1 : 2] : snow[0]);
      g.rect(1, 11, 23, 1, snow[0]);
      g.rect(2, 10, 21, 1, snow[1]);
      for (const x of [3, 9, 15, 21]) g.set(x, 12, snow[1]);
      g.rect(17, 1, 2, 7, IRON[1]);
      g.rect(17, 1, 1, 7, IRON[2]);
      g.rect(16, 1, 4, 1, IRON[0]);
      // The fishing hole: dark water in a rim of broken ice, a rod propped over it.
      for (const [x0, x1, y] of [[1, 5, 25], [0, 6, 26], [1, 5, 27]]) g.rect(x0, y, x1 - x0 + 1, 1, '#1c3046');
      g.rect(2, 26, 2, 1, '#2e4c68');
      for (const [x, y] of [[0, 25], [6, 25], [0, 27], [6, 27], [3, 24], [3, 28]]) g.set(x, y, '#e8f2f8');
      g.line(7, 22, 2, 19, WOOD[2]);
      g.line(2, 19, 2, 26, '#c8d0d8');
      g.line(22, 14, 23, 25, '#9aa0a8');
      g.rect(21, 13, 3, 1, '#d4a030');
      g.outline();
    },
  },
  snow_rock: {
    w: 15, h: 12,
    paint(g, v) {
      // A boulder under a cap of snow, its shaded side showing bare rock.
      g.ball(7.5, 7, 6.8, 4.8, STONE);
      if (v) g.ball(12, 9, 2.8, 2.2, STONE);
      const caps = ['#c8d6e2', '#e2ecf4', '#f6fafd'];
      for (let x = 1; x < 14; x++) {
        const depth = Math.round(2.2 - Math.abs(x - 6) * 0.22 + (x % 3 === 0 ? 1 : 0));
        let top = 0;
        while (top < 12 && !g.get(x, top)) top++;
        for (let k = 0; k < depth; k++) g.set(x, top + k, caps[Math.min(2, k + (x < 7 ? 1 : 0))]);
      }
      g.outline();
    },
  },
  bothy: {
    w: 31, h: 28,
    paint(g, _v, rand) {
      // A shepherd's bothy: rough dry-stone walls, a turf-and-slate roof, a chimney with a
      // wisp of peat smoke, a low door and one small window glowing in the dusk.
      const stone = ['#4a4840', '#66625a', '#807c72', '#9c988c'];
      const roof = ['#3a3e3a', '#4c524c', '#5e665e', '#6e785e'];
      g.rect(3, 13, 25, 13, stone[2]);
      for (let y = 13; y < 26; y += 3) {
        for (let x = 3 + ((y / 3) & 1) * 2; x < 28; x += 4 + Math.floor(rand() * 2)) {
          g.rect(x, y, 3, 2, rand() < 0.3 ? stone[3] : stone[2]);
          g.set(x + 3, y, stone[0]);
          g.rect(x, y + 2, 4, 1, stone[1]);
        }
      }
      g.rect(3, 13, 2, 13, stone[3]);
      g.rect(25, 13, 3, 13, stone[1]);
      g.rect(9, 17, 5, 9, '#2a2018');
      g.rect(9, 17, 5, 1, stone[0]);
      g.rect(18, 17, 3, 3, '#ffc070', true);
      g.set(18, 17, '#ffe0a8', true);
      // Roof: slate courses with turf along the ridge.
      for (let r = 0; r < 7; r++) g.rect(Math.round(15 - r * 2.2), 6 + r, Math.round(r * 4.4 + 2), 1, r === 0 ? roof[3] : r % 2 ? roof[1] : roof[2]);
      g.rect(1, 12, 29, 1, roof[0]);
      g.rect(5, 6, 21, 1, roof[3]);
      // Chimney and smoke.
      g.rect(21, 2, 3, 6, stone[1]);
      g.rect(21, 2, 1, 6, stone[3]);
      for (const [x, y] of [[23, 0], [24, 0], [22, 1]]) g.set(x, y, '#b8b0a8');
      g.outline();
    },
  },
  sheep: {
    w: 13, h: 10,
    paint(g, v) {
      // A grazing ewe: a fleecy body, dark face and legs; one has her head down in the grass.
      const fleece = ['#a8a296', '#ccc6b8', '#e6e0d2', '#f6f2e8'];
      g.rect(3, 7, 1, 3, '#2a2622');
      g.rect(9, 7, 1, 3, '#2a2622');
      g.ball(6.5, 5, 5, 3.4, fleece);
      for (const [x, y] of [[4, 3], [7, 2], [9, 4], [5, 6]]) g.set(x, y, fleece[3]);
      if (v === 0) {
        g.rect(10, 3, 3, 3, '#2e2a26');
        g.set(11, 3, '#4a4440');
      } else {
        g.rect(10, 6, 3, 3, '#2e2a26');
        g.set(12, 9, '#2e2a26');
      }
      g.outline(0.55);
    },
  },
  gorse: {
    w: 15, h: 11,
    paint(g, v, rand) {
      // A spiny gorse bush, dark green and spattered with yellow flowers.
      const leaves = ['#2a3a1e', '#3a4c26', '#4c602e', '#5e7238'];
      g.ball(7.5, 6.5, 7, 4.6, leaves);
      if (v) g.ball(11.5, 7.5, 3.5, 3, leaves);
      for (let i = 0; i < 16; i++) {
        const x = 1 + Math.floor(rand() * 13);
        const y = 2 + Math.floor(rand() * 8);
        if (g.get(x, y)) g.set(x, y, rand() < 0.35 ? '#fff0a0' : '#f4c430');
      }
      g.outline();
    },
  },
  boat: {
    w: 27, h: 26,
    paint(g, v) {
      // Moored at the quay: a clinker-built rowing boat with its oars shipped, or a small
      // fishing smack with a furled sail on its mast. Its waterline sits on the sprite's foot.
      const hull = v ? ['#2c3a52', '#3e5272', '#567094', '#7a94b4'] : ['#4a2c1c', '#6a3e26', '#8a5634', '#a87048'];
      for (let r = 0; r < 6; r++) {
        const inset = Math.round(r * r * 0.35);
        g.rect(1 + inset, 18 + r, 25 - 2 * inset, 1, r === 0 ? hull[3] : r < 3 ? hull[2] : hull[1]);
      }
      g.rect(2, 17, 23, 1, hull[0]);
      for (const x of [6, 12, 18]) g.rect(x, 17, 1, 2, hull[0]);
      g.rect(3, 24, 21, 1, '#1e3446');
      g.rect(5, 25, 17, 1, '#2e4c60');
      if (v === 0) {
        g.line(7, 16, 1, 22, WOOD[2]);
        g.line(19, 16, 25, 22, WOOD[2]);
        g.rect(11, 15, 5, 2, WOOD[1]);
      } else {
        g.rect(13, 2, 1, 15, WOOD[1]);
        g.rect(13, 2, 1, 15, WOOD[2]);
        g.line(13, 4, 22, 15, '#c8c0a8');
        for (let y = 5; y < 15; y++) g.rect(14, y, Math.max(1, Math.round((y - 5) * 0.7)), 1, y % 3 ? '#d8cfb4' : '#bfb69c');
        g.rect(11, 15, 2, 2, '#c84a2a');
      }
      g.outline(0.55);
    },
  },
  lighthouse: {
    w: 19, h: 50,
    paint(g) {
      // A harbour lighthouse: a tapering white tower banded in red, a lantern room that glows,
      // a black cap and a gallery rail; a stone footing where it meets the mole.
      const white = ['#9aa0a6', '#c8ccd0', '#e6e8ea', '#f6f6f4'];
      const red = ['#6a1c18', '#962a22', '#b83a2c'];
      for (let y = 12; y < 46; y++) {
        const half = 4 + (y - 12) * 0.08;
        const band = Math.floor((y - 12) / 7) % 2 === 1;
        for (let x = Math.round(9.5 - half); x <= Math.round(9.5 + half); x++) {
          const t = (x - (9.5 - half)) / (2 * half);
          const ramp = band ? red : white;
          g.set(x, y, t < 0.25 ? ramp[ramp.length - 1] : t < 0.7 ? ramp[ramp.length - 2] : ramp[ramp.length - 3]);
        }
      }
      g.rect(7, 30, 2, 3, '#2a3440');
      g.rect(10, 20, 2, 3, '#2a3440');
      // Gallery, lantern and cap.
      g.rect(3, 11, 14, 1, IRON[2]);
      g.rect(3, 10, 1, 1, IRON[1]);
      g.rect(16, 10, 1, 1, IRON[1]);
      g.rect(6, 5, 8, 6, '#fff0b0', true);
      g.rect(7, 6, 2, 4, '#ffffe0', true);
      for (const x of [6, 9, 13]) g.rect(x, 5, 1, 6, IRON[1]);
      for (let r = 0; r < 4; r++) g.rect(6 - r + 3, 4 - r, 2 + 2 * (r < 3 ? 3 - r : 0) + (r === 3 ? 0 : 0), 1, IRON[0]);
      g.rect(5, 4, 10, 1, IRON[0]);
      g.rect(7, 2, 6, 2, IRON[0]);
      g.rect(9, 0, 2, 2, IRON[1]);
      g.rect(2, 45, 16, 5, STONE[2]);
      g.rect(2, 45, 16, 1, STONE[3]);
      for (const x of [5, 10, 15]) g.rect(x, 46, 1, 4, STONE[1]);
      g.outline();
    },
  },
  net_rack: {
    w: 21, h: 17,
    paint(g, _v, rand) {
      // Fishing nets hung to dry between two posts, sagging, with cork floats along the top line.
      g.rect(1, 2, 2, 15, WOOD[1]);
      g.rect(18, 2, 2, 15, WOOD[1]);
      g.rect(1, 2, 1, 15, WOOD[2]);
      g.rect(0, 2, 21, 1, WOOD[0]);
      for (let x = 3; x < 18; x++) {
        const sag = Math.round(Math.sin(((x - 3) / 15) * Math.PI) * 2);
        for (let y = 3; y < 12 + sag; y++) if ((x + y) % 2 === 0 || rand() < 0.15) g.set(x, y, (x + y) % 4 === 0 ? '#8a7a5a' : '#a49470');
        if (x % 3 === 0) g.set(x, 3, '#d8a040');
      }
      g.outline(0.6);
    },
  },
  gazebo: {
    w: 37, h: 44,
    paint(g) {
      // A white garden gazebo: slender columns on a round stone plinth, a scalloped eave and a
      // green copper dome with a gilded finial.
      const white = ['#9aa0a4', '#c4c8ca', '#e2e4e2', '#f6f6f2'];
      const copper = ['#2e5a4c', '#3e7462', '#56907a', '#78ac92'];
      g.ball(18.5, 39, 17, 4.5, STONE);
      g.rect(2, 37, 33, 3, STONE[2]);
      g.rect(2, 37, 33, 1, STONE[3]);
      for (const [x, lit] of [[5, 3], [12, 3], [18, 2], [24, 1], [31, 1]] as const) {
        g.rect(x, 18, 2, 19, white[lit]);
        g.set(x, 18, white[3]);
        g.rect(x - 1, 36, 4, 1, white[1]);
      }
      // Shade inside, so the far columns read as further back.
      g.rect(7, 22, 23, 14, '#4a5a4e');
      for (const x of [9, 15, 21, 27]) g.rect(x, 22, 2, 14, white[1]);
      // Eave: a band with a scalloped valance underneath.
      g.rect(1, 15, 35, 3, white[2]);
      g.rect(1, 15, 35, 1, white[3]);
      for (let x = 1; x < 36; x += 3) g.rect(x, 18, 2, 1, white[1]);
      // Dome and finial.
      g.ball(18.5, 13, 15, 8, copper);
      g.rect(3, 13, 31, 2, copper[1]);
      g.rect(18, 1, 1, 4, '#d8b040');
      g.ball(18.5, 4.5, 1.6, 1.6, ['#8a6a20', '#c89a30', '#f0d060']);
      g.outline();
    },
  },
  topiary: {
    w: 11, h: 21,
    paint(g, v) {
      // Clipped yew in a stone planter: a cone, or two balls stacked on a stem.
      const leaves = ['#1e3e1c', '#2a5226', '#3a6a30', '#4e823e'];
      g.rect(2, 17, 7, 4, STONE[2]);
      g.rect(2, 17, 7, 1, STONE[3]);
      g.rect(8, 17, 1, 4, STONE[1]);
      if (v === 0) {
        for (let r = 0; r < 15; r++) {
          const hw = Math.round(((r + 1) / 15) * 4.5);
          for (let x = -hw; x <= hw; x++) g.set(5 + x, 2 + r, x < -hw / 3 ? leaves[3] : x > hw / 2 ? leaves[0] : leaves[1 + ((r + x) & 1)]);
        }
      } else {
        g.rect(5, 9, 1, 8, WOOD[1]);
        g.ball(5.5, 12.5, 4.6, 4, leaves);
        g.ball(5.5, 4.5, 3.4, 3.2, leaves);
      }
      g.outline();
    },
  },
  statue: {
    w: 13, h: 28,
    paint(g, v) {
      // Weathered marble on a plinth: a knight leaning on his sword, or an urn spilling ivy.
      const marble = ['#7e8282', '#a6aaa8', '#c8cac6', '#e4e4de'];
      g.rect(1, 20, 11, 8, STONE[2]);
      g.rect(1, 20, 11, 1, STONE[3]);
      g.rect(0, 26, 13, 2, STONE[1]);
      g.rect(10, 21, 2, 5, STONE[1]);
      if (v === 0) {
        g.ball(6.5, 3, 2, 2.2, marble);
        g.rect(4, 5, 5, 8, marble[2]);
        g.rect(4, 5, 2, 8, marble[3]);
        g.rect(8, 5, 1, 8, marble[1]);
        g.rect(4, 13, 2, 7, marble[2]);
        g.rect(7, 13, 2, 7, marble[1]);
        g.line(10, 7, 10, 19, marble[3]);
        g.rect(9, 9, 3, 1, marble[1]);
        g.line(9, 7, 7, 9, marble[1]);
      } else {
        g.ball(6.5, 14, 4.5, 4.5, marble);
        g.rect(4, 8, 5, 2, marble[2]);
        g.rect(3, 7, 7, 1, marble[3]);
        g.rect(5, 18, 3, 2, marble[1]);
        for (const [x, y] of [[3, 9], [2, 11], [2, 13], [9, 10], [10, 12], [3, 15]]) g.set(x, y, '#3e6a30');
      }
      g.outline();
    },
  },
  gatehouse: {
    w: 47, h: 60,
    paint(g, _v, rand) {
      // A river gatehouse: two round towers under slate cones, a crenellated wall between them
      // pierced by an arched gateway with its portcullis raised, arrow slits, and a banner.
      const stone = ['#4e4a44', '#6a655d', '#857f75', '#a29c90'];
      const slate = ['#2a2e38', '#3a404c', '#4e5664', '#626c7c'];
      const tower = (cx: number) => {
        for (let y = 22; y < 58; y++) {
          for (let x = cx - 8; x <= cx + 8; x++) {
            const t = (x - (cx - 8)) / 16;
            const course = (y - 22) % 5 === 4 || ((x + (Math.floor((y - 22) / 5) & 1) * 3) % 6 === 0 && (y - 22) % 5 !== 0);
            g.set(x, y, course ? stone[0] : t < 0.2 ? stone[3] : t < 0.65 ? stone[2] : stone[1]);
          }
        }
        // Crenellations, then the conical roof.
        for (let x = cx - 9; x <= cx + 9; x += 3) g.rect(x, 19, 2, 3, stone[2]);
        g.rect(cx - 9, 21, 19, 1, stone[0]);
        for (let r = 0; r < 18; r++) {
          const hw = Math.round(((r + 1) / 18) * 9);
          for (let x = -hw; x <= hw; x++) g.set(cx + x, 2 + r, x < -hw / 3 ? slate[3] : x > hw / 3 ? slate[0] : slate[1 + (r & 1)]);
        }
        g.rect(cx, 0, 1, 3, IRON[1]);
        for (const y of [30, 42]) g.rect(cx - 1, y, 2, 5, '#1c1a18');
      };
      tower(9);
      tower(37);
      // The curtain wall and its arched gateway.
      for (let y = 26; y < 58; y++) for (let x = 17; x <= 29; x++) g.set(x, y, (y - 26) % 5 === 4 ? stone[0] : x < 20 ? stone[3] : stone[2]);
      for (let x = 17; x <= 29; x += 3) g.rect(x, 23, 2, 3, stone[2]);
      for (let y = 38; y < 58; y++) {
        const arch = y < 43 ? Math.round(Math.sqrt(Math.max(0, 25 - (43 - y) ** 2))) : 5;
        for (let x = 23 - arch; x <= 23 + arch; x++) g.set(x, y, y < 41 ? '#3a3026' : '#2a221c');
      }
      // The portcullis, raised: its spiked foot just shows under the arch.
      for (let x = 19; x <= 27; x += 2) g.rect(x, 38, 1, 3, IRON[1]);
      g.rect(18, 40, 11, 1, IRON[0]);
      for (let x = 19; x <= 27; x += 2) g.set(x, 41, IRON[2]);
      // A banner over the gate.
      g.rect(21, 28, 5, 8, '#9a2a24');
      g.rect(21, 28, 5, 1, '#d8b040');
      g.rect(23, 31, 1, 3, '#d8b040');
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(rand() * 47);
        const y = 24 + Math.floor(rand() * 33);
        if (g.get(x, y) && g.get(x, y) !== '#2a221c') g.set(x, y, stone[0]);
      }
      g.outline();
    },
  },
  maypole: {
    w: 27, h: 56,
    paint(g, _v, rand) {
      // The maypole: a tall white pole under a crown of flowers, its ribbons wound halfway down
      // in a spiral and the loose ends pegged out to the ground, as if the dance has just stopped.
      const ribbons = ['#d83a3a', '#f0c030', '#3a7ad8', '#f4f0e8', '#4aa84a'];
      g.rect(12, 6, 3, 50, '#e8e4d8');
      g.rect(12, 6, 1, 50, '#f8f6f0');
      g.rect(14, 6, 1, 50, '#b8b2a4');
      for (let y = 10; y < 32; y++) {
        const k = Math.floor((y - 10) / 2) % ribbons.length;
        g.rect(12 + ((y >> 1) & 1), y, 2, 1, ribbons[k]);
      }
      g.ball(13.5, 6, 6, 3.4, ['#2e5a26', '#3e7430', '#56903e', '#6aa64a']);
      for (let i = 0; i < 12; i++) g.set(8 + Math.floor(rand() * 12), 3 + Math.floor(rand() * 6), ribbons[i % 4]);
      g.rect(13, 0, 1, 3, '#d8b040');
      // Loose ribbon ends fanning out from the crown to pegs on the ground.
      for (const [x1, k] of [[0, 0], [5, 1], [22, 2], [26, 4]] as const) {
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const x = 13 + (x1 - 13) * t;
          const y = 9 + 46 * t - 6 * Math.sin(t * Math.PI);
          g.set(x, y, ribbons[k]);
        }
        g.rect(x1 - 1 + (x1 === 0 ? 1 : 0), 54, 2, 2, WOOD[1]);
      }
      g.outline(0.5);
    },
  },
  fair_tent: {
    w: 31, h: 32,
    paint(g, v) {
      // A striped fair tent: a peaked canvas roof over walls with the front flap tied open,
      // a pennant on the king pole. Red and white, blue and yellow, or green and cream.
      const [a, b] = [['#b8302a', '#f2ece0'], ['#2e5aa8', '#f0c84a'], ['#3e8a44', '#efe6c8']][v];
      const shade = (c: string, k: number) => {
        const n = parseInt(c.slice(1), 16);
        const ch = [n >> 16, (n >> 8) & 255, n & 255].map((x) => Math.round(x * k).toString(16).padStart(2, '0'));
        return '#' + ch.join('');
      };
      // Walls.
      for (let y = 16; y < 31; y++) for (let x = 2; x < 29; x++) g.set(x, y, Math.floor((x - 2) / 3) % 2 ? shade(b, x > 20 ? 0.82 : 1) : shade(a, x > 20 ? 0.82 : 1));
      g.rect(2, 30, 27, 1, '#5a4a3a');
      // The open flap: dark inside, the canvas tied back.
      for (let y = 20; y < 30; y++) {
        const w = Math.round((y - 20) * 0.45);
        g.rect(15 - w, y, 2 * w + 1, 1, '#3a2a22');
      }
      // Peaked roof with a scalloped valance.
      for (let r = 0; r < 12; r++) {
        const hw = Math.round(((r + 1) / 12) * 15);
        for (let x = -hw; x <= hw; x++) {
          const stripe = Math.floor((x + 30) / 3) % 2 ? b : a;
          g.set(15 + x, 4 + r, shade(stripe, x > hw * 0.4 ? 0.8 : x < -hw * 0.4 ? 1.08 : 0.95));
        }
      }
      for (let x = 0; x < 31; x += 3) g.rect(x, 16, 2, 1, x % 6 ? a : b);
      g.rect(15, 0, 1, 5, WOOD[0]);
      g.rect(16, 0, 4, 2, a);
      g.outline();
    },
  },
  bunting: {
    w: 33, h: 20,
    paint(g) {
      // A string of bunting between two poles: little triangular flags along a sagging line.
      const flags = ['#d83a3a', '#f0c030', '#3a7ad8', '#f4f0e8', '#4aa84a'];
      g.rect(1, 2, 2, 18, WOOD[1]);
      g.rect(30, 2, 2, 18, WOOD[1]);
      g.rect(1, 2, 1, 18, WOOD[2]);
      for (let x = 3; x < 30; x++) {
        const y = 3 + Math.round(Math.sin(((x - 3) / 27) * Math.PI) * 4);
        g.set(x, y, '#e8e0cc');
        if ((x - 3) % 4 === 1) {
          const c = flags[((x - 3) >> 2) % flags.length];
          g.rect(x, y + 1, 3, 1, c);
          g.rect(x, y + 2, 2, 1, c);
          g.set(x, y + 3, c);
        }
      }
      g.outline(0.55);
    },
  },
  locomotive: {
    w: 48, h: 36,
    paint(g, _v, rand) {
      // A preserved steam engine on a stone plinth: green boiler banded in brass, a black
      // smokebox and chimney at the front, the cab behind, and big red driving wheels.
      const green = ['#173a26', '#235436', '#2f6e46', '#4a8c5e'];
      const brass = '#d8b040';
      const black = ['#16161a', '#24252a', '#3a3c42'];
      const red = ['#6a1a16', '#9a2a22', '#c4402e'];
      // Plinth, with a short length of track along its top.
      g.rect(1, 31, 46, 5, STONE[2]);
      g.rect(1, 31, 46, 1, STONE[3]);
      g.rect(38, 32, 9, 4, STONE[1]);
      g.rect(1, 30, 46, 1, '#4a3a2c');
      g.rect(1, 29, 46, 1, '#c8ccd0');
      // Footplate and red buffer beam.
      g.rect(3, 22, 42, 2, black[1]);
      g.rect(2, 21, 3, 4, red[1]);
      g.rect(0, 22, 2, 2, black[2]);
      // Boiler, a cylinder lit from above, with brass bands.
      for (let y = 10; y < 22; y++) {
        const t = (y - 10) / 12;
        g.rect(9, y, 24, 1, t < 0.2 ? green[3] : t < 0.55 ? green[2] : t < 0.85 ? green[1] : green[0]);
      }
      for (const x of [16, 23, 30]) g.rect(x, 10, 1, 12, brass);
      // Smokebox and chimney at the front, a brass dome on top.
      for (let y = 10; y < 22; y++) g.rect(4, y, 5, 1, y < 13 ? black[2] : black[1]);
      g.rect(5, 3, 3, 7, black[1]);
      g.rect(4, 2, 5, 2, black[2]);
      g.rect(5, 3, 1, 7, black[2]);
      g.ball(20, 9.5, 2.6, 2.2, ['#8a6a20', '#c89a30', '#f0d060']);
      g.rect(26, 7, 2, 3, black[1]);
      // The cab: windows, a curved roof, and the coal bunker behind.
      g.rect(33, 7, 11, 15, green[2]);
      g.rect(33, 7, 1, 15, green[3]);
      g.rect(42, 7, 2, 15, green[1]);
      g.rect(32, 5, 13, 2, black[2]);
      g.rect(35, 9, 3, 4, '#3c4c60');
      g.rect(39, 9, 3, 4, '#3c4c60');
      g.set(35, 9, '#7f97ad');
      g.set(39, 9, '#7f97ad');
      g.rect(34, 15, 8, 1, brass);
      g.rect(44, 12, 3, 10, black[1]);
      for (let i = 0; i < 6; i++) g.set(44 + Math.floor(rand() * 3), 11 + Math.floor(rand() * 2), black[2]);
      // Cylinder at the front, then three driving wheels and a small leading wheel.
      g.rect(5, 19, 7, 4, black[2]);
      g.rect(5, 19, 7, 1, '#55585f');
      const wheel = (cx: number, r: number) => {
        for (let y = -r; y <= r; y++) {
          for (let x = -r; x <= r; x++) {
            const d = Math.hypot(x, y);
            if (d > r + 0.3) continue;
            const rim = d > r - 1.2;
            const spoke = (x === 0 || y === 0 || x === y || x === -y) && d < r - 1;
            g.set(cx + x, 28 - r + y, rim ? black[0] : spoke ? red[2] : d < 1.2 ? red[0] : red[1]);
          }
        }
      };
      wheel(8, 3);
      for (const cx of [17, 26, 35]) wheel(cx, 5);
      g.line(17, 24, 35, 24, '#8a8c92');
      g.outline();
    },
  },
  bus_shelter: {
    w: 25, h: 24,
    paint(g) {
      // A glass bus shelter: a steel frame, panes catching the light, a bench inside, the
      // timetable on the end panel and the stop's sign on a pole beside it.
      const frame = ['#3a3c43', '#55585f', '#8a8e96'];
      g.rect(1, 3, 19, 2, frame[1]);
      g.rect(1, 3, 19, 1, frame[2]);
      for (const x of [1, 10, 19]) g.rect(x, 5, 1, 19, frame[1]);
      for (let y = 5; y < 23; y++) {
        for (let x = 2; x < 19; x++) {
          if (x === 10) continue;
          const glint = (x + y) % 9 === 0 || (x + y) % 9 === 1;
          g.set(x, y, glint ? '#d8e8f0' : y > 19 ? '#7e939c' : '#a6bcc6');
        }
      }
      g.rect(3, 16, 15, 2, WOOD[2]);
      g.rect(3, 16, 15, 1, WOOD[3]);
      g.rect(4, 18, 1, 4, frame[0]);
      g.rect(16, 18, 1, 4, frame[0]);
      g.rect(12, 7, 5, 6, '#f2f0e8');
      for (let y = 8; y < 12; y += 1) g.rect(13, y, 3, 1, y % 2 ? '#9aa0a8' : '#4a4e56');
      g.rect(1, 23, 19, 1, frame[0]);
      // The sign: a red disc on a pole.
      g.rect(22, 4, 1, 20, frame[1]);
      g.ball(22.5, 3, 2.6, 2.6, ['#7a1a16', '#c4302a', '#e85a48']);
      g.rect(21, 2, 3, 1, '#f2f0e8');
      g.outline();
    },
  },
  bike_rack: {
    w: 17, h: 11,
    paint(g) {
      // Steel hoops with a bicycle leaning on one.
      const steel = ['#55585f', '#8a8e96', '#c4c8ce'];
      for (const x of [1, 6, 11]) {
        g.rect(x, 2, 1, 9, steel[1]);
        g.rect(x + 3, 2, 1, 9, steel[0]);
        g.rect(x, 1, 4, 1, steel[2]);
      }
      // The bike: two wheels, a red frame and a saddle.
      const wheel = (cx: number) => {
        for (let a = 0; a < 16; a++) g.set(cx + Math.cos((a / 16) * Math.PI * 2) * 3, 7 + Math.sin((a / 16) * Math.PI * 2) * 3, '#24252a');
      };
      wheel(4);
      wheel(13);
      g.line(4, 7, 8, 4, '#c4302a');
      g.line(8, 4, 13, 7, '#c4302a');
      g.line(8, 4, 8, 7, '#c4302a');
      g.line(8, 7, 4, 7, '#9a2a22');
      g.rect(7, 3, 3, 1, '#24252a');
      g.line(12, 3, 13, 7, '#55585f');
      g.rect(11, 2, 3, 1, '#55585f');
      g.outline(0.55);
    },
  },
  buffer_stop: {
    w: 15, h: 12,
    paint(g) {
      // The end of the line: a steel frame with a beam striped red and white, two buffers.
      g.line(1, 11, 5, 4, '#3a3c43');
      g.line(13, 11, 9, 4, '#3a3c43');
      g.rect(3, 9, 9, 2, '#24252a');
      for (let x = 1; x < 14; x++) g.rect(x, 3, 1, 3, Math.floor((x - 1) / 2) % 2 ? '#f2f0e8' : '#c4302a');
      g.rect(1, 6, 13, 1, '#55585f');
      for (const x of [2, 11]) {
        g.rect(x, 7, 2, 2, '#24252a');
        g.rect(x, 7, 2, 1, '#55585f');
      }
      g.outline();
    },
  },
  station_clock: {
    w: 15, h: 30,
    paint(g) {
      // A platform clock: a dark green column with a bracket arm holding a white-faced clock.
      const post = ['#16301e', '#24442c', '#3a5e40'];
      g.rect(3, 8, 2, 20, post[1]);
      g.rect(3, 8, 1, 20, post[2]);
      g.rect(2, 26, 4, 4, post[0]);
      g.rect(2, 26, 1, 4, post[1]);
      g.rect(3, 7, 7, 1, post[1]);
      g.line(4, 11, 8, 8, post[1]);
      g.rect(9, 6, 1, 2, post[0]);
      // The clock face: a black rim, white dial and hands at ten to two.
      g.ball(9.5, 13, 5, 5, ['#16161a', '#24252a', '#3a3c42']);
      g.ball(9.5, 13, 4, 4, ['#c8c4b8', '#e8e4d8', '#f8f6ee']);
      for (const [x, y] of [[9, 9], [13, 13], [9, 16], [6, 13]]) g.set(x, y, '#24252a');
      g.line(9, 13, 7, 11, '#16161a');
      g.line(9, 13, 12, 12, '#16161a');
      g.set(9, 13, '#c4302a');
      g.outline();
    },
  },
  playground: {
    w: 46, h: 34,
    paint(g) {
      // A playground: a red A-frame swing set with two seats on the left, and on the right a
      // little tower with a green roof, a ladder up and a yellow slide down.
      const red = ['#6a1a16', '#a42e24', '#d04a36'];
      const chain = '#8a8e96';
      // Swing frame: two A-legs and the top bar.
      for (const x0 of [2, 20]) {
        g.line(x0, 33, x0 + 3, 6, red[1]);
        g.line(x0 + 6, 33, x0 + 3, 6, red[0]);
      }
      g.rect(4, 5, 19, 2, red[1]);
      g.rect(4, 5, 19, 1, red[2]);
      // The tower: posts, a deck, a pitched green roof.
      const wood = ['#5a3e26', '#7a5636', '#9c7448'];
      g.rect(28, 12, 2, 22, wood[1]);
      g.rect(38, 12, 2, 22, wood[0]);
      g.rect(27, 20, 14, 2, wood[2]);
      g.rect(27, 22, 14, 1, wood[0]);
      for (let x = 30; x < 38; x += 2) g.rect(x, 15, 1, 5, wood[1]);
      for (let r = 0; r < 7; r++) g.rect(34 - r - 1, 6 + r, 2 * r + 3, 1, r < 2 ? '#5e9a48' : r & 1 ? '#3e7430' : '#4a8838');
      // The slide, curving down to the right, and the ladder on the left of the tower.
      for (let i = 0; i <= 12; i++) {
        const x = 40 + i * 0.45;
        const y = 21 + i;
        g.rect(x, y, 3, 1, i < 2 ? '#f8d850' : '#e8b828');
        g.set(x + 3, y, '#b88a18');
      }
      g.rect(45, 33, 1, 1, '#b88a18');
      for (let y = 22; y < 34; y += 3) g.rect(25, y, 3, 1, wood[2]);
      g.rect(24, 21, 1, 13, wood[1]);
      g.rect(27, 21, 1, 13, wood[0]);
      g.outline();
      // The swings go on after the outline, so it doesn't fill the gaps between their chains.
      for (const x of [8, 15]) {
        g.rect(x, 7, 1, 17, chain);
        g.rect(x + 4, 7, 1, 17, chain);
        g.rect(x - 1, 24, 7, 2, '#24252a');
        g.rect(x - 1, 24, 7, 1, '#3a5ab0');
      }
    },
  },
  picnic_table: {
    w: 17, h: 11,
    paint(g) {
      // A wooden picnic table with a bench along each side.
      const wood = ['#5a3e26', '#7a5636', '#9c7448', '#b48c5a'];
      g.rect(2, 2, 13, 3, wood[2]);
      g.rect(2, 2, 13, 1, wood[3]);
      g.rect(0, 6, 17, 2, wood[2]);
      g.rect(0, 6, 17, 1, wood[3]);
      for (const x of [3, 13]) {
        g.line(x, 5, x - 1, 10, wood[0]);
        g.line(x, 5, x + 1, 10, wood[1]);
      }
      g.outline();
    },
  },
  washing_line: {
    w: 21, h: 26,
    paint(g) {
      // A rotary washing line: a steel pole, the lines strung out from its arms, and a load of
      // laundry pegged out to dry.
      const steel = ['#55585f', '#8a8e96', '#c4c8ce'];
      g.rect(10, 4, 1, 22, steel[1]);
      g.rect(11, 4, 1, 22, steel[0]);
      g.line(10, 4, 1, 8, steel[1]);
      g.line(11, 4, 20, 8, steel[0]);
      g.line(1, 8, 20, 8, steel[2]);
      g.line(4, 6, 17, 6, steel[2]);
      const clothes: [number, number, number, number, string][] = [[2, 9, 3, 5, '#e85a48'], [6, 9, 4, 3, '#f4f0e8'], [13, 9, 3, 6, '#4a7ac8'], [17, 9, 3, 4, '#f0c84a'], [6, 7, 3, 4, '#5aa858'], [13, 7, 2, 3, '#f4f0e8']];
      for (const [x, y, w, h, c] of clothes) {
        g.rect(x, y, w, h, c);
        g.rect(x, y, w, 1, '#f8f8f4');
      }
      g.rect(9, 25, 4, 1, steel[0]);
      g.outline(0.55);
    },
  },
  ducks: {
    w: 15, h: 7,
    paint(g) {
      // A mallard drake and a brown duck paddling, a ripple behind each.
      g.ball(4.5, 4, 3.4, 2, ['#5a4632', '#7a6448', '#9a8460']);
      g.rect(6, 1, 2, 2, '#2e6a3a');
      g.set(8, 2, '#e0b030');
      g.set(6, 3, '#f4f0e8');
      g.ball(11.5, 4.5, 3, 1.8, ['#6a5034', '#8a6a44', '#a88a5e']);
      g.rect(12, 2, 2, 2, '#7a5c3a');
      g.set(14, 3, '#d8a030');
      g.rect(0, 6, 3, 1, '#c8e0ec');
      g.rect(8, 6, 2, 1, '#c8e0ec');
      g.outline(0.6);
    },
  },
  lock_gate: {
    w: 24, h: 18,
    paint(g) {
      // A canal lock gate: oak planks braced across, a walkway rail along the top, and the long
      // black-and-white balance beam that swings it open, reaching out over the bank.
      const oak = ['#3a2a1c', '#4e3826', '#664a32', '#7e5e40'];
      for (let y = 5; y < 18; y++) for (let x = 6; x < 20; x++) g.set(x, y, x % 4 === 2 ? oak[0] : y < 7 ? oak[3] : y > 14 ? oak[1] : oak[2]);
      g.line(7, 16, 18, 6, oak[0]);
      g.rect(6, 15, 14, 3, '#1e3446');
      g.rect(6, 15, 14, 1, '#4f7f9c');
      // Walkway rail.
      g.rect(6, 2, 1, 3, IRON[1]);
      g.rect(19, 2, 1, 3, IRON[1]);
      g.rect(6, 2, 14, 1, IRON[2]);
      // Balance beam, white-tipped.
      g.rect(0, 4, 20, 2, '#24252a');
      g.rect(0, 4, 20, 1, '#3a3c42');
      g.rect(0, 4, 3, 2, '#f4f0e8');
      g.outline(0.55);
    },
  },
  bollard: {
    w: 7, h: 8,
    paint(g) {
      // A cast-iron mooring bollard, its cap flared to hold a rope.
      g.rect(2, 3, 3, 5, IRON[1]);
      g.rect(2, 3, 1, 5, IRON[2]);
      g.rect(1, 1, 5, 2, IRON[1]);
      g.rect(1, 1, 5, 1, IRON[2]);
      g.rect(1, 7, 5, 1, IRON[0]);
      g.outline();
    },
  },
  mill_chimney: {
    w: 19, h: 100,
    paint(g, _v, rand) {
      // The mill chimney: a tall square shaft of red brick, tapering towards a corbelled cap,
      // with a band of pale brick near the top and the mill's arched flue door at its foot.
      const brick = ['#5e2a1e', '#7e3a28', '#a04a34', '#b85e44'];
      for (let y = 6; y < 94; y++) {
        const hw = 4 + Math.round(((y - 6) / 88) * 3);
        for (let x = -hw; x <= hw; x++) {
          const t = (x + hw) / (2 * hw);
          let c = t < 0.25 ? brick[3] : t < 0.6 ? brick[2] : t < 0.85 ? brick[1] : brick[0];
          if (y % 3 === 0 && rand() < 0.5) c = brick[0];
          if (y >= 16 && y < 20) c = t < 0.5 ? '#e0d4bc' : '#c4b89c';
          g.set(9 + x, y, c);
        }
      }
      // Corbelled cap, stepping out at the top, sooty at the rim.
      g.rect(3, 4, 13, 2, brick[2]);
      g.rect(4, 2, 11, 2, brick[3]);
      g.rect(4, 1, 11, 1, '#2a2420');
      g.rect(3, 4, 13, 1, brick[3]);
      g.rect(5, 0, 9, 1, '#3a3430');
      // The plinth in dressed stone, with the arched door.
      g.rect(0, 92, 19, 8, STONE[2]);
      g.rect(0, 92, 19, 1, STONE[3]);
      g.rect(14, 93, 5, 7, STONE[1]);
      for (let y = 94; y < 100; y++) {
        const w = y < 95 ? 1 : 2;
        g.rect(9 - w, y, 2 * w + 1, 1, '#2a221c');
      }
      g.outline();
    },
  },
  clock_tower: {
    w: 25, h: 92,
    paint(g, _v, rand) {
      // The town clock tower: a square shaft of pale stone on an arcaded base, a white clock
      // face on its belfry stage, and a slate spire topped by a gilded weathervane.
      const stone = ['#8a8070', '#a89e8a', '#c4baa4', '#dcd4c0'];
      const slate = ['#2a2e38', '#3a404c', '#4e5664', '#626c7c'];
      const shaft = (y0: number, y1: number, hw: number) => {
        for (let y = y0; y < y1; y++) {
          for (let x = -hw; x <= hw; x++) {
            const t = (x + hw) / (2 * hw);
            const course = (y - y0) % 4 === 3 && rand() < 0.7;
            g.set(12 + x, y, course ? stone[0] : t < 0.25 ? stone[3] : t < 0.62 ? stone[2] : stone[1]);
          }
        }
      };
      // Base with an open arch, shaft, belfry stage.
      shaft(70, 92, 10);
      for (let y = 76; y < 92; y++) {
        const half = y < 80 ? Math.round(Math.sqrt(Math.max(0, 16 - (80 - y) ** 2))) : 4;
        g.rect(12 - half, y, 2 * half + 1, 1, '#3a3026');
      }
      g.rect(1, 69, 23, 2, stone[3]);
      shaft(40, 69, 7);
      for (const y of [48, 58]) g.rect(11, y, 2, 5, '#2a2420');
      g.rect(3, 38, 19, 2, stone[3]);
      shaft(22, 38, 8);
      // The clock: black rim, white dial, gilt hands at four o'clock.
      g.ball(12.5, 30, 6, 6, ['#16161a', '#24252a', '#3a3c42']);
      g.ball(12.5, 30, 5, 5, ['#d8d4c8', '#ece8dc', '#faf8f0']);
      for (const [x, y] of [[12, 26], [16, 30], [12, 34], [8, 30]]) g.set(x, y, '#24252a');
      g.line(12, 30, 12, 26, '#a07a20');
      g.line(12, 30, 15, 32, '#a07a20');
      g.rect(3, 21, 19, 1, stone[0]);
      // The spire, and the weathervane on its tip.
      for (let r = 0; r < 18; r++) {
        const hw = Math.round(((r + 1) / 18) * 9);
        for (let x = -hw; x <= hw; x++) g.set(12 + x, 3 + r, x < -hw / 3 ? slate[3] : x > hw / 3 ? slate[0] : slate[1 + (r & 1)]);
      }
      g.rect(12, 0, 1, 4, '#d8b040');
      g.rect(10, 1, 5, 1, '#d8b040');
      g.outline();
    },
  },
  phone_box: {
    w: 11, h: 24,
    paint(g) {
      // A red telephone kiosk: domed roof, a white TELEPHONE strip, and windows of small panes.
      const red = ['#6a1210', '#9a1c18', '#c42a22', '#e04a3a'];
      g.rect(1, 4, 9, 20, red[2]);
      g.rect(1, 4, 1, 20, red[3]);
      g.rect(8, 4, 2, 20, red[1]);
      g.rect(0, 22, 11, 2, red[1]);
      for (let r = 0; r < 3; r++) g.rect(1 + r, 3 - r, 9 - 2 * r, 1, r ? red[2] : red[3]);
      g.rect(2, 4, 7, 2, '#f2f0e8');
      for (let x = 3; x < 8; x += 2) g.set(x, 5, '#24252a');
      for (let y = 7; y < 20; y++) for (let x = 2; x < 8; x++) g.set(x, y, (y - 7) % 3 === 2 || x === 4 || x === 6 ? red[2] : y < 11 ? '#a6bcc6' : '#7e939c');
      g.rect(2, 20, 6, 2, red[1]);
      g.outline();
    },
  },
  post_box: {
    w: 9, h: 14,
    paint(g) {
      // A red pillar box: a domed cap, the letter slot, a black plinth.
      const red = ['#7a1410', '#a41e18', '#c42a22', '#e04a3a'];
      g.rect(1, 3, 7, 9, red[2]);
      g.rect(1, 3, 2, 9, red[3]);
      g.rect(6, 3, 2, 9, red[1]);
      g.ball(4.5, 3, 4, 2.4, red);
      g.rect(0, 3, 9, 1, red[1]);
      g.rect(3, 5, 3, 1, '#16161a');
      g.rect(3, 8, 3, 2, '#f2f0e8');
      g.rect(1, 12, 7, 2, '#24252a');
      g.outline();
    },
  },
  belisha: {
    w: 7, h: 24,
    paint(g) {
      // A Belisha beacon: an amber globe on a black-and-white striped pole.
      for (let y = 6; y < 24; y++) g.rect(3, y, 1, 1, Math.floor((y - 6) / 3) % 2 ? '#f2f0e8' : '#24252a');
      g.ball(3.5, 3, 3, 3, ['#c8701a', '#f0a030', '#ffd070'], true);
      g.rect(2, 23, 3, 1, '#24252a');
      g.outline();
    },
  },
  cafe_table: {
    w: 19, h: 21,
    paint(g, v) {
      // A café table on the pavement: a round top, two chairs, a striped parasol over it.
      const canvas = v ? ['#2e6a3a', '#f2ece0'] : ['#c4302a', '#f2ece0'];
      g.rect(9, 6, 1, 11, IRON[2]);
      g.ball(9.5, 14, 5, 1.3, ['#8a8e96', '#c4c8ce', '#e8eaee']);
      g.rect(9, 15, 1, 6, IRON[1]);
      g.rect(7, 20, 5, 1, IRON[1]);
      for (const x of [1, 15]) {
        g.rect(x, 12, 1, 5, IRON[1]);
        g.rect(x, 16, 4, 1, IRON[1]);
        g.rect(x + 3, 16, 1, 5, IRON[1]);
        g.rect(x, 20, 1, 1, IRON[1]);
      }
      for (let r = 0; r < 5; r++) {
        const hw = 3 + r * 1.6;
        for (let x = -hw; x <= hw; x++) g.set(9.5 + x, 1 + r, Math.floor((x + 12) / 3) % 2 ? canvas[1] : canvas[0]);
      }
      g.rect(9, 0, 1, 1, IRON[1]);
      g.outline();
    },
  },
  billboard: {
    w: 50, h: 72,
    paint(g) {
      // A rooftop-sized billboard on steel legs: a catwalk under the panel, and a glowing advert
      // for a noodle bar, a steaming bowl with chopsticks and a line of characters on hot pink.
      for (const x of [13, 35]) {
        g.rect(x, 30, 3, 42, IRON[1]);
        g.rect(x, 30, 1, 42, IRON[2]);
        for (let y = 36; y < 70; y += 8) g.line(x + 3, y, x + 8, y + 6, IRON[0]);
      }
      g.rect(2, 30, 46, 2, IRON[2]);
      g.rect(2, 32, 46, 1, IRON[0]);
      // The panel: frame, then the advert.
      g.rect(0, 2, 50, 28, '#14121c');
      for (let y = 4; y < 28; y++) for (let x = 2; x < 48; x++) g.set(x, y, y < 12 ? '#ff4aa8' : y < 20 ? '#e8308e' : '#c02078', true);
      g.ball(16, 19, 9, 5, ['#e8e0d0', '#f8f4ea', '#ffffff'], true);
      g.rect(7, 18, 19, 2, '#f8f4ea', true);
      g.rect(9, 17, 15, 2, '#f0b040', true);
      g.line(22, 7, 29, 16, '#3a2a22', true);
      g.line(24, 7, 30, 15, '#3a2a22', true);
      for (const x of [12, 16, 20]) {
        g.set(x, 13, '#ffffff', true);
        g.set(x + 1, 11, '#ffffff', true);
        g.set(x, 9, '#ffffff', true);
      }
      for (let k = 0; k < 4; k++) {
        const x0 = 32 + k * 4;
        g.rect(x0, 8, 3, 1, '#ffe86a', true);
        g.rect(x0 + 1, 8, 1, 6, '#ffe86a', true);
        g.rect(x0, 11 + (k & 1), 3, 1, '#ffe86a', true);
        g.rect(x0, 18, 3, 6, k & 1 ? '#7ff0ff' : '#ffffff', true);
      }
      // Lamps on the frame, shining down on it.
      for (const x of [8, 24, 40]) {
        g.rect(x, 0, 3, 2, IRON[1]);
        g.set(x + 1, 1, '#fff4c0', true);
      }
      g.outline(0.5);
    },
  },
  sign_gantry: {
    w: 58, h: 46,
    paint(g) {
      // An overhead sign gantry: steel posts either side of the carriageway and a lattice beam
      // carrying two green direction signs with white arrows and lettering.
      for (const x of [1, 54]) {
        g.rect(x, 6, 3, 40, IRON[1]);
        g.rect(x, 6, 1, 40, IRON[2]);
        g.rect(x - 1, 44, 5, 2, IRON[0]);
      }
      g.rect(0, 4, 58, 2, IRON[2]);
      g.rect(0, 9, 58, 1, IRON[1]);
      for (let x = 0; x < 58; x += 4) g.line(x, 5, x + 3, 9, IRON[0]);
      for (const x0 of [7, 31]) {
        g.rect(x0, 11, 20, 14, '#1e6a3e');
        g.rect(x0, 11, 20, 1, '#f2f0e8');
        g.rect(x0, 24, 20, 1, '#f2f0e8');
        g.rect(x0, 11, 1, 14, '#f2f0e8');
        g.rect(x0 + 19, 11, 1, 14, '#f2f0e8');
        for (let k = 0; k < 3; k++) g.rect(x0 + 3, 14 + k * 3, 9 - k * 2, 1, '#f2f0e8');
        // The arrow: up for straight on, or bending off to the right for the exit.
        g.rect(x0 + 15, 14, 1, 8, '#f2f0e8');
        g.rect(x0 + 14, 15, 3, 1, '#f2f0e8');
        g.rect(x0 + 13, 16, 5, 1, '#f2f0e8');
        g.rect(x0 + 15, 10, 1, 1, IRON[1]);
        g.rect(x0 + 4, 10, 1, 1, IRON[1]);
      }
      g.outline(0.5);
    },
  },
  jersey_barrier: {
    w: 19, h: 9,
    paint(g) {
      // Concrete crash barriers set out for road works, a red and white stripe along the top.
      const concrete = ['#7a7c80', '#9a9ca0', '#b8bac0', '#d0d2d6'];
      for (let y = 0; y < 9; y++) {
        const inset = y < 5 ? 1 : 0;
        g.rect(inset, y, 19 - 2 * inset, 1, y < 2 ? concrete[3] : y < 5 ? concrete[2] : concrete[1]);
      }
      for (let x = 1; x < 18; x++) g.set(x, 2, Math.floor((x - 1) / 3) % 2 ? '#f2f0e8' : '#d0302a');
      g.rect(9, 0, 1, 9, concrete[0]);
      g.outline();
    },
  },
  traffic_cone: {
    w: 13, h: 9,
    paint(g) {
      // A pair of traffic cones, orange with white reflective bands, on black bases.
      for (const cx of [3, 9]) {
        for (let y = 0; y < 7; y++) {
          const hw = Math.floor(y / 2);
          g.rect(cx - hw, y, 2 * hw + 1, 1, y === 3 || y === 4 ? '#f2f0e8' : y < 2 ? '#ff8a3a' : '#e8601e');
        }
        g.rect(cx - 3, 7, 7, 2, '#24252a');
      }
      g.outline();
    },
  },
  highway_lamp: {
    w: 13, h: 36,
    paint(g) {
      // A tall highway lamp: a grey pole curving over into a sodium lamp that glows orange.
      g.rect(2, 6, 2, 30, '#6a6c72');
      g.rect(2, 6, 1, 30, '#8a8c92');
      g.line(3, 6, 6, 2, '#6a6c72');
      g.rect(6, 1, 6, 2, '#55585f');
      g.rect(6, 3, 6, 2, '#ffb050', true);
      g.rect(7, 3, 4, 1, '#ffe0a0', true);
      g.rect(1, 34, 4, 2, '#3a3c42');
      g.outline();
    },
  },
  neon_sign: {
    w: 50, h: 58,
    paint(g) {
      // A big rooftop sign on steel scaffolding: a lightning bolt over ARCADE in pink neon,
      // framed by a cyan tube, all glowing against the night.
      for (const x of [8, 40]) {
        g.rect(x, 30, 2, 28, IRON[1]);
        g.rect(x, 30, 1, 28, IRON[2]);
      }
      for (let y = 34; y < 56; y += 7) {
        g.line(9, y, 40, y + 6, IRON[0]);
        g.line(40, y, 9, y + 6, IRON[0]);
      }
      g.rect(2, 2, 46, 28, '#120e1c');
      const cyan = '#6ff4ff';
      for (let x = 3; x < 47; x++) {
        g.set(x, 3, cyan, true);
        g.set(x, 28, cyan, true);
      }
      for (let y = 3; y < 29; y++) {
        g.set(3, y, cyan, true);
        g.set(46, y, cyan, true);
      }
      // The bolt.
      for (const [x, y] of [[26, 5], [25, 6], [24, 7], [23, 8], [22, 9], [23, 9], [24, 9], [25, 9], [26, 9], [25, 10], [24, 11], [23, 12], [22, 13]] as const) g.rect(x, y, 2, 1, '#ffe85a', true);
      // ARCADE in a 3x5 pixel font.
      const glyphs: Record<string, string[]> = {
        A: ['010', '101', '111', '101', '101'],
        R: ['110', '101', '110', '101', '101'],
        C: ['011', '100', '100', '100', '011'],
        D: ['110', '101', '101', '101', '110'],
        E: ['111', '100', '110', '100', '111'],
      };
      // Each font pixel is drawn 2x2, so the letters are big enough to read at a glance.
      [...'ARCADE'].forEach((ch, i) => {
        glyphs[ch].forEach((row, y) => [...row].forEach((on, x) => {
          if (on === '1') g.rect(4 + i * 7 + x * 2, 16 + y * 2, 2, 2, '#ff5fb8', true);
        }));
      });
      g.outline(0.45);
    },
  },
  arcade_cabinet: {
    w: 11, h: 19,
    paint(g, v) {
      // An arcade cabinet: a lit marquee on top, the glowing screen, a control panel with a
      // stick and buttons, and the coin door.
      const [body, side] = v ? ['#2a2a6a', '#3e3e92'] : ['#6a1e4a', '#922a66'];
      g.rect(1, 0, 9, 19, body);
      g.rect(1, 0, 2, 19, side);
      g.rect(1, 0, 9, 3, v ? '#ffe86a' : '#7ff0ff', true);
      g.rect(3, 4, 6, 6, v ? '#4ac8ff' : '#7aff9a', true);
      g.set(4, 6, '#ffffff', true);
      g.rect(5, 7, 2, 1, '#ff5fa8', true);
      g.rect(0, 11, 11, 2, '#24252a');
      g.set(3, 10, '#d02a2a');
      g.set(6, 11, '#f0c030', true);
      g.set(8, 11, '#40c0ff', true);
      g.rect(4, 14, 3, 3, '#16161a');
      g.set(5, 15, '#ff8a3a', true);
      g.outline();
    },
  },
  claw_machine: {
    w: 13, h: 21,
    paint(g) {
      // A claw machine: a glass case lit pink, a heap of plush toys inside, the claw hanging over
      // them, and a light-up sign on top.
      g.rect(0, 0, 13, 21, '#5a1e4e');
      g.rect(0, 0, 13, 3, '#ffd84a', true);
      for (let x = 1; x < 12; x += 2) g.set(x, 1, '#ff5fa8', true);
      g.rect(1, 4, 11, 10, '#f0b8e0', true);
      g.rect(1, 4, 11, 1, '#ffffff', true);
      g.rect(6, 4, 1, 4, IRON[1]);
      g.rect(5, 8, 3, 1, IRON[2]);
      for (const [x, c] of [[2, '#f0c040'], [4, '#7ad0ff'], [7, '#ff7a7a'], [9, '#9aff9a'], [3, '#ffffff'], [8, '#c08aff']] as const) g.ball(x + 0.5, x % 2 ? 12 : 11.5, 1.6, 1.4, [shade(c, 0.7), c, shade(c, 1.15)]);
      g.rect(1, 14, 11, 2, '#24252a');
      g.rect(5, 17, 3, 3, '#16161a');
      g.set(6, 18, '#ffd84a', true);
      g.outline();
    },
  },
  water_tank: {
    w: 19, h: 32,
    paint(g) {
      // A rooftop water tank: a timber barrel bound with iron hoops under a conical cap, raised
      // on a steel frame.
      for (const x of [2, 15]) g.rect(x, 20, 2, 12, IRON[1]);
      g.line(3, 22, 15, 30, IRON[0]);
      g.line(15, 22, 3, 30, IRON[0]);
      g.rect(1, 19, 17, 2, IRON[2]);
      for (let y = 7; y < 19; y++) {
        for (let x = 2; x < 17; x++) {
          const t = (x - 2) / 15;
          g.set(x, y, x % 3 === 0 ? WOOD[0] : t < 0.3 ? WOOD[3] : t < 0.7 ? WOOD[2] : WOOD[1]);
        }
      }
      for (const y of [9, 13, 17]) g.rect(2, y, 15, 1, IRON[1]);
      for (let r = 0; r < 6; r++) g.rect(9 - r * 1.5, 1 + r, 1 + r * 3, 1, r < 2 ? '#5a5e66' : '#4a4e56');
      g.outline();
    },
  },
  ac_unit: {
    w: 17, h: 12,
    paint(g) {
      // A rooftop air-conditioning unit: a steel box with louvred sides and a fan grille on top.
      const steel = ['#6a6e76', '#8a8e96', '#a6aab2', '#c4c8ce'];
      g.rect(0, 4, 17, 8, steel[1]);
      g.rect(0, 4, 4, 8, steel[2]);
      for (let y = 6; y < 11; y += 2) g.rect(5, y, 11, 1, steel[0]);
      g.rect(0, 2, 17, 2, steel[3]);
      g.ball(10.5, 2.5, 4.5, 1.6, ['#24252a', '#3a3c42', '#55585f']);
      g.outline();
    },
  },
  string_lights: {
    w: 35, h: 20,
    paint(g) {
      // Festoon lights strung between two posts, warm bulbs along a sagging wire.
      g.rect(1, 2, 2, 18, IRON[1]);
      g.rect(32, 2, 2, 18, IRON[1]);
      for (let x = 3; x < 32; x++) {
        const y = 3 + Math.round(Math.sin(((x - 3) / 29) * Math.PI) * 5);
        g.set(x, y, '#24252a');
        if ((x - 3) % 4 === 2) {
          g.set(x, y + 1, '#ffd890', true);
          g.set(x, y + 2, '#fff0c0', true);
        }
      }
      g.outline(0.55);
    },
  },
  gantry_crane: {
    w: 76, h: 124,
    paint(g) {
      // A ship-to-shore container crane: a portal frame on four legs straddling the quay, the
      // long boom reaching out over the ship with its trolley and spreader, the A-frame apex
      // with its stays, the driver's cab, and red warning lights at the top.
      const blue = ['#1a3a6a', '#24508c', '#3a6aaa', '#5a8ac8'];
      // Legs and the sill beams on the rails.
      for (const x of [16, 52]) {
        g.rect(x, 44, 4, 78, blue[1]);
        g.rect(x, 44, 1, 78, blue[3]);
        g.rect(x + 3, 44, 1, 78, blue[0]);
      }
      g.rect(12, 120, 46, 4, blue[0]);
      g.rect(12, 120, 46, 1, blue[2]);
      for (let y = 56; y < 116; y += 20) {
        g.line(20, y, 52, y + 12, blue[0]);
        g.line(52, y, 20, y + 12, blue[0]);
      }
      g.rect(14, 76, 44, 3, blue[2]);
      // The boom along the top, out to the left over the ship, with its trolley and cab.
      g.rect(0, 38, 76, 4, blue[2]);
      g.rect(0, 38, 76, 1, blue[3]);
      g.rect(0, 42, 76, 2, blue[0]);
      for (let x = 2; x < 76; x += 6) g.line(x, 38, x + 3, 43, blue[1]);
      g.rect(8, 44, 8, 4, '#d8d4c8');
      g.rect(10, 48, 1, 14, IRON[2]);
      g.rect(14, 48, 1, 14, IRON[2]);
      g.rect(7, 62, 11, 2, '#f0c040');
      g.rect(30, 44, 9, 7, '#e8e4d8');
      g.rect(31, 46, 7, 3, '#ffe2a0', true);
      // The apex frame and its stays out to the boom tips.
      g.line(18, 38, 30, 6, blue[1]);
      g.line(54, 38, 42, 6, blue[1]);
      g.rect(29, 4, 14, 3, blue[2]);
      g.line(30, 6, 0, 38, IRON[1]);
      g.line(42, 6, 75, 38, IRON[1]);
      g.line(33, 6, 6, 38, IRON[1]);
      for (const x of [29, 42]) g.rect(x, 1, 2, 2, '#ff3a2a', true);
      g.rect(0, 36, 2, 2, '#ff3a2a', true);
      g.outline(0.5);
    },
  },
  floodlight: {
    w: 13, h: 62,
    paint(g) {
      // A floodlight mast: a tall tapering steel pole with a ladder, crowned by a bank of lamps.
      for (let y = 8; y < 60; y++) {
        const hw = y < 30 ? 1 : 2;
        g.rect(6 - hw, y, 2 * hw, 1, '#6a6c72');
        g.set(6 - hw, y, '#8a8c92');
      }
      for (let y = 10; y < 58; y += 3) g.set(8, y, '#3a3c42');
      g.rect(3, 59, 7, 3, '#3a3c42');
      g.rect(0, 2, 13, 6, '#3a3c42');
      for (let x = 1; x < 12; x += 3) {
        g.rect(x, 3, 2, 2, '#fff8e8', true);
        g.rect(x, 5, 2, 2, '#ffe8c0', true);
      }
      g.outline();
    },
  },
  torii: {
    w: 33, h: 36,
    paint(g) {
      // A vermilion torii: two round pillars on black footings, the tie beam through them, and
      // the black-capped top beam sweeping up at its ends, a name plaque between.
      const red = ['#8a1e14', '#b82a1c', '#e0442a', '#f0684a'];
      for (const x of [6, 24]) {
        g.rect(x, 8, 3, 25, red[1]);
        g.rect(x, 8, 1, 25, red[3]);
        g.rect(x + 2, 8, 1, 25, red[0]);
        g.rect(x - 1, 32, 5, 4, '#1e1a1a');
      }
      g.rect(3, 12, 27, 2, red[2]);
      g.rect(3, 14, 27, 1, red[0]);
      for (let x = 0; x < 33; x++) {
        const lift = Math.round(Math.pow(Math.abs(x - 16) / 16, 2.5) * 3);
        g.rect(x, 3 - lift, 1, 2, '#1e1a1a');
        g.rect(x, 5 - lift, 1, 2, red[2]);
      }
      g.rect(14, 7, 5, 5, '#1e1a1a');
      g.rect(15, 8, 3, 3, '#d8b040');
      g.outline(0.5);
    },
  },
  stone_lantern: {
    w: 11, h: 19,
    paint(g) {
      // A stone lantern: a footing and post, the firebox with its light glowing through, and a
      // broad cap with a little finial.
      g.rect(2, 16, 7, 3, STONE[1]);
      g.rect(2, 16, 7, 1, STONE[2]);
      g.rect(4, 10, 3, 6, STONE[2]);
      g.rect(4, 10, 1, 6, STONE[3]);
      g.rect(2, 9, 7, 1, STONE[1]);
      g.rect(3, 5, 5, 4, STONE[2]);
      g.rect(4, 6, 3, 2, '#ffc060', true);
      g.set(5, 6, '#fff0b0', true);
      for (let r = 0; r < 3; r++) g.rect(r, 4 - r, 11 - 2 * r, 1, r ? STONE[2] : STONE[1]);
      g.rect(5, 0, 1, 2, STONE[3]);
      g.outline();
    },
  },
  sakura: {
    w: 27, h: 30,
    paint(g, v, rand) {
      // A cherry tree in bloom: a dark, twisting trunk under clouds of pink blossom, petals
      // drifting down.
      const bloom = v ? ['#c86a8a', '#e08aa8', '#f4b0c8', '#ffd8e6'] : ['#c87a9a', '#e698b4', '#f8bcd2', '#ffe2ec'];
      g.rect(12, 16, 3, 14, '#3a2420');
      g.rect(12, 16, 1, 14, '#5a3a30');
      g.line(13, 20, 7, 14, '#3a2420');
      g.line(14, 18, 20, 12, '#3a2420');
      const blobs = v ? [[13.5, 9, 9, 6.5], [6, 12, 5.5, 4.5], [21, 12, 5.5, 4.5], [13, 4, 6, 4]] : [[13.5, 10, 10, 6], [5.5, 13, 5, 4], [21.5, 12, 5, 4.5], [14, 5, 6.5, 4.5]];
      for (const [cx, cy, rx, ry] of blobs) g.ball(cx, cy, rx, ry, bloom);
      for (let i = 0; i < 6; i++) g.set(2 + Math.floor(rand() * 23), 20 + Math.floor(rand() * 9), bloom[2]);
      g.outline();
    },
  },
  shrine: {
    w: 80, h: 72,
    paint(g) {
      // The shrine hall, drawn big enough to dwarf the torii: a stone base and steps, a raised
      // timber floor, vermilion posts with white walls between, and a great sweeping roof of dark
      // copper with gilded ridge ends. At the front, the straw rope with its paper streamers,
      // the bell and its rope, the offering box, and two lit lanterns.
      const red = ['#8a1e14', '#b82a1c', '#e0442a'];
      const roof = ['#1e2a2a', '#2a3a38', '#3a4e4a', '#4e6660'];
      g.rect(4, 64, 72, 8, STONE[2]);
      g.rect(4, 64, 72, 1, STONE[3]);
      g.rect(62, 65, 14, 7, STONE[1]);
      g.rect(31, 61, 18, 3, STONE[3]);
      g.rect(8, 56, 64, 5, WOOD[1]);
      g.rect(8, 56, 64, 1, WOOD[3]);
      for (let x = 13; x < 68; x++) for (let y = 30; y < 56; y++) g.set(x, y, x > 56 ? '#d4cebe' : '#ece6d8');
      g.rect(28, 36, 24, 20, '#2a1c16');
      for (const x of [11, 26, 52, 66]) {
        g.rect(x, 28, 3, 28, red[1]);
        g.rect(x, 28, 1, 28, red[2]);
      }
      g.rect(11, 30, 58, 2, red[0]);
      // The roof, flaring out at the eaves.
      for (let r = 0; r < 26; r++) {
        const hw = 16 + Math.round(r * 0.6) + (r > 20 ? Math.round((r - 20) * 1.4) : 0);
        for (let x = -hw; x <= hw; x++) g.set(40 + x, 3 + r, x < -hw / 2 ? roof[3] : x > hw / 2 ? roof[0] : roof[1 + (r & 1)]);
      }
      g.rect(0, 26, 3, 2, roof[3]);
      g.rect(77, 26, 3, 2, roof[0]);
      g.rect(16, 1, 48, 3, roof[0]);
      g.rect(13, 0, 5, 4, '#d8b040');
      g.rect(62, 0, 5, 4, '#d8b040');
      // The straw rope and its paper zigzags; the bell, its rope, and the offering box.
      g.rect(25, 35, 30, 3, '#c8b070');
      g.rect(25, 35, 30, 1, '#e0cc90');
      for (const x of [30, 38, 46]) {
        g.set(x, 38, '#ffffff');
        g.set(x + 1, 39, '#ffffff');
        g.set(x, 40, '#ffffff');
        g.set(x + 1, 41, '#ffffff');
      }
      g.ball(40, 39, 2.6, 2, ['#8a6a20', '#c89a30', '#f0d060']);
      g.rect(39, 41, 2, 11, '#c83a2a');
      g.rect(32, 51, 16, 5, WOOD[2]);
      g.rect(32, 51, 16, 1, WOOD[3]);
      for (let x = 33; x < 47; x += 2) g.set(x, 53, WOOD[0]);
      for (const x of [19, 60]) {
        g.rect(x, 32, 1, 3, '#1e1a1a');
        g.ball(x + 0.5, 40, 3.4, 4.4, ['#c03020', '#ff6a40', '#ffb070'], true);
        g.rect(x - 1, 35, 3, 1, '#1e1a1a');
        g.rect(x - 1, 45, 3, 1, '#1e1a1a');
      }
      g.outline();
    },
  },
  obelisk: {
    w: 17, h: 96,
    paint(g, _v, rand) {
      // A granite obelisk on a stepped plinth: a tall tapering shaft carved with columns of
      // hieroglyphs, its pyramidion tip capped in gold.
      const granite = ['#6a4a3c', '#8a6450', '#a67c62', '#c09478'];
      g.rect(0, 90, 17, 6, STONE[2]);
      g.rect(0, 90, 17, 1, STONE[3]);
      g.rect(2, 87, 13, 3, STONE[3]);
      for (let y = 10; y < 87; y++) {
        const hw = 3 + Math.round(((y - 10) / 77) * 2.5);
        for (let x = -hw; x <= hw; x++) {
          const t = (x + hw) / (2 * hw);
          g.set(8 + x, y, t < 0.3 ? granite[3] : t < 0.65 ? granite[2] : granite[1]);
        }
      }
      // Carved glyphs down the lit face.
      for (let y = 14; y < 84; y += 3) {
        if (rand() < 0.75) g.set(7, y, granite[0]);
        if (rand() < 0.5) g.rect(6, y + 1, 2, 1, granite[0]);
        if (rand() < 0.4) g.set(9, y, granite[0]);
      }
      for (let r = 0; r < 7; r++) g.rect(8 - Math.floor(r / 2), 3 + r, 1 + 2 * Math.floor(r / 2), 1, r < 3 ? '#f0d060' : '#c89a30');
      g.outline();
    },
  },
  ram_sphinx: {
    w: 25, h: 20,
    paint(g) {
      // A ram-headed sphinx on its plinth: a lion's body lying down with its forepaws out in
      // front, the ram's head raised, its horn curling round past the ear.
      const sand = ['#8a7048', '#b0905c', '#ccac74', '#e0c48c'];
      g.rect(0, 15, 25, 5, STONE[2]);
      g.rect(0, 15, 25, 1, STONE[3]);
      g.rect(20, 16, 5, 4, STONE[1]);
      g.ball(15.5, 11, 8, 4, sand);
      g.ball(20.5, 10.5, 3.6, 4, sand);
      g.rect(1, 12, 10, 3, sand[2]);
      g.rect(1, 12, 10, 1, sand[3]);
      for (const x of [3, 7]) g.set(x, 14, sand[0]);
      g.rect(7, 6, 4, 7, sand[1]);
      g.ball(7, 5.5, 3.6, 4, sand);
      g.rect(2, 5, 3, 3, sand[2]);
      g.set(2, 7, sand[0]);
      // The curled horn.
      for (const [x, y] of [[8, 2], [9, 2], [10, 3], [10, 4], [10, 5], [9, 6], [8, 6], [7, 5], [8, 4]] as const) g.set(x, y, sand[0]);
      g.set(5, 4, '#3a2a1c');
      g.rect(23, 12, 2, 1, sand[1]);
      g.outline();
    },
  },
  colossal_head: {
    w: 31, h: 26,
    paint(g) {
      // The head of a fallen colossus, half sunk in the sand: a pharaoh's striped headdress,
      // the calm carved face, the nose long since broken off.
      const stone = ['#7a5e3e', '#a08058', '#bc9a6c', '#d4b484'];
      g.ball(15.5, 13, 12, 12, stone);
      for (let y = 4; y < 22; y += 3) for (let x = 4; x < 28; x++) if (g.get(x, y) && (x < 9 || x > 22)) g.set(x, y, '#3a5a8a');
      g.rect(10, 9, 11, 13, stone[3]);
      g.rect(10, 9, 11, 1, stone[2]);
      g.rect(11, 12, 3, 1, stone[0]);
      g.rect(17, 12, 3, 1, stone[0]);
      g.rect(15, 13, 1, 4, stone[1]);
      g.rect(13, 19, 5, 1, stone[0]);
      // Sand drifted up round it.
      for (let y = 20; y < 26; y++) {
        const hw = 8 + (y - 20) * 3;
        g.rect(15.5 - hw, y, 2 * hw, 1, y < 22 ? '#e0c890' : '#d4bc84');
      }
      g.outline();
    },
  },
  column: {
    w: 13, h: 42,
    paint(g, v, rand) {
      // A temple column: a fluted shaft on a moulded base, under a carved capital, streaked
      // with moss. The second has lost its top, broken off jagged.
      const stone = ['#6a6a5a', '#8a8a76', '#a8a690', '#c4c2aa'];
      const top = v ? 16 : 5;
      g.rect(0, 38, 13, 4, stone[2]);
      g.rect(0, 38, 13, 1, stone[3]);
      g.rect(1, 36, 11, 2, stone[1]);
      for (let y = top + 3; y < 36; y++) {
        for (let x = 2; x < 11; x++) g.set(x, y, x % 2 ? (x < 6 ? stone[3] : stone[1]) : x < 6 ? stone[2] : stone[0]);
      }
      if (v) {
        for (let x = 2; x < 11; x++) for (let y = top + 3 - Math.floor(rand() * 4); y < top + 3; y++) g.set(x, y, stone[2]);
      } else {
        g.rect(0, top, 13, 3, stone[2]);
        g.rect(0, top, 13, 1, stone[3]);
        g.rect(1, top - 3, 11, 3, stone[1]);
        g.rect(1, top - 3, 11, 1, stone[3]);
      }
      for (let i = 0; i < 10; i++) {
        const x = 2 + Math.floor(rand() * 9);
        const y = top + 4 + Math.floor(rand() * 26);
        g.rect(x, y, 1, 1 + Math.floor(rand() * 3), rand() < 0.5 ? '#4e6a34' : '#6a8a42');
      }
      g.outline();
    },
  },
  stone_idol: {
    w: 60, h: 65,
    paint(g, _v, rand) {
      // Drawn on a 46x50 layout and scaled up by K, so the face dwarfs the columns around it.
      const K = 1.3;
      const k = (v: number) => Math.round(v * K);
      // A colossal stone face rising from the sanctuary: a serene carved face with closed eyes
      // and a faint smile under a tiered crown, the stone mossy and hung with vines.
      const stone = ['#5a5a4a', '#7a7a64', '#9a987e', '#b8b498'];
      // Stepped base.
      g.rect(k(1), k(44), k(44), k(6), stone[1]);
      g.rect(k(1), k(44), k(44), k(1), stone[3]);
      g.rect(k(5), k(40), k(36), k(4), stone[2]);
      g.rect(k(5), k(40), k(36), k(1), stone[3]);
      // The head: broad and rounded, lit from the upper left.
      g.ball(k(23), k(26), k(16), k(16), stone);
      g.rect(k(9), k(26), k(28), k(14), stone[2]);
      for (let y = k(26); y < k(40); y++) for (let x = k(27); x < k(37); x++) if (g.get(x, y)) g.set(x, y, stone[1]);
      // Tiered crown.
      for (let r = 0; r < 4; r++) g.rect(k(14 + r * 2), k(2 + r * 3), k(18 - r * 4), k(3), r & 1 ? stone[2] : stone[3]);
      g.rect(k(10), k(12), k(26), k(2), stone[0]);
      // Face: brows, closed eyes, broad nose, smiling lips.
      g.rect(k(13), k(20), k(7), k(1), stone[0]);
      g.rect(k(26), k(20), k(7), k(1), stone[0]);
      g.rect(k(14), k(23), k(5), k(1), stone[0]);
      g.rect(k(27), k(23), k(5), k(1), stone[0]);
      g.rect(k(21), k(22), k(4), k(9), stone[3]);
      g.rect(k(20), k(30), k(6), k(2), stone[1]);
      g.rect(k(17), k(34), k(12), k(1), stone[0]);
      g.set(k(16), k(33), stone[0]);
      g.set(k(29), k(33), stone[0]);
      g.rect(k(18), k(35), k(10), k(1), stone[3]);
      // Ears with long lobes.
      g.rect(k(6), k(20), k(3), k(12), stone[1]);
      g.rect(k(37), k(20), k(3), k(12), stone[0]);
      // Moss and hanging vines.
      for (let i = 0; i < 46; i++) {
        const x = k(6) + Math.floor(rand() * k(34));
        const y = k(8) + Math.floor(rand() * k(34));
        if (g.get(x, y)) g.set(x, y, rand() < 0.5 ? '#4e6a34' : '#6a8a42');
      }
      for (const x of [9, 12, 35, 38]) {
        const len = k(8 + Math.floor(rand() * 14));
        for (let y = k(12); y < k(12) + len; y++) g.set(k(x) + (y % 5 === 0 ? 1 : 0), y, y % 3 ? '#3e5a2c' : '#5e8a3a');
      }
      g.outline();
    },
  },
  lilies: {
    w: 17, h: 8,
    paint(g, v) {
      // Water lilies: round pads with their notch, and a flower open on one.
      const pads = ['#2e5a2a', '#3e7434', '#56903e'];
      g.ball(5, 4, 4.5, 2.2, pads);
      g.ball(12.5, 5, 3.6, 1.8, pads);
      g.set(5, 4, '#1e3a1c');
      g.set(6, 3, '#1e3a1c');
      if (v) g.ball(13.5, 3.5, 3, 1.6, pads);
      const petal = v ? ['#e8a0c0', '#f8d0e0'] : ['#f0f0e8', '#ffffff'];
      g.rect(4, 1, 3, 2, petal[0]);
      g.set(5, 0, petal[1]);
      g.set(5, 2, '#f0d040');
      g.outline(0.6);
    },
  },
  gladiator: {
    w: 23, h: 50,
    paint(g) {
      // A bronze gladiator on a marble plinth, gone green with age: a crested helmet, a round
      // shield on one arm, the sword raised in the other, one foot forward.
      const bronze = ['#24453a', '#346050', '#4a7e68', '#6aa08a'];
      g.rect(2, 40, 19, 10, '#c8c4b8');
      g.rect(2, 40, 19, 1, '#e4e0d4');
      g.rect(16, 41, 5, 9, '#a8a498');
      g.rect(4, 47, 15, 1, '#a8a498');
      // Legs, one forward, and the kilt.
      g.rect(8, 30, 3, 10, bronze[2]);
      g.rect(13, 31, 3, 9, bronze[1]);
      g.rect(7, 26, 10, 5, bronze[1]);
      g.rect(7, 26, 10, 1, bronze[3]);
      // Torso, the shield arm, the raised sword.
      g.rect(8, 15, 8, 11, bronze[2]);
      g.rect(8, 15, 3, 11, bronze[3]);
      g.ball(5, 22, 4.5, 5, bronze);
      g.set(5, 22, '#c89a30');
      g.rect(16, 10, 2, 7, bronze[1]);
      g.rect(17, 1, 1, 10, '#8aa898');
      g.rect(15, 10, 5, 1, bronze[0]);
      // Helmet with its crest.
      g.ball(12, 11, 3.4, 3.6, bronze);
      g.rect(10, 11, 4, 2, bronze[0]);
      for (let x = 9; x < 15; x++) g.set(x, 7 - Math.round(Math.sin(((x - 9) / 5) * Math.PI) * 2), bronze[3]);
      g.outline();
    },
  },
  cypress: {
    w: 9, h: 32,
    paint(g, v) {
      // An Italian cypress: a tall, narrow flame of dark green on a short trunk.
      const leaves = v ? ['#1a3420', '#24442a', '#305636', '#406a44'] : ['#1c3622', '#26462c', '#325a38', '#446e48'];
      g.rect(4, 27, 1, 5, WOOD[1]);
      for (let y = 1; y < 28; y++) {
        const hw = Math.round(Math.sin(Math.min(1, y / 22) * Math.PI * 0.62) * 3.6);
        for (let x = -hw; x <= hw; x++) g.set(4 + x, y, x < -hw / 3 ? leaves[3] : x > hw / 3 ? leaves[0] : leaves[1 + (y & 1)]);
      }
      g.outline();
    },
  },
  standing_stone: {
    w: 13, h: 28,
    paint(g, v, rand) {
      // A sarsen standing stone, roughly dressed: taller than a person twice over, grey and
      // weathered, splotched with lichen.
      const stone = ['#5e5c56', '#7c7a72', '#9a978c', '#b4b0a4'];
      const top = v ? 3 : 0;
      for (let y = top; y < 28; y++) {
        const hw = 4 + (y > 20 ? 1 : 0) - (y < top + 3 ? 1 : 0);
        for (let x = -hw; x <= hw; x++) {
          const t = (x + hw) / (2 * hw);
          g.set(6 + x + (v && y < 8 ? 1 : 0), y, t < 0.3 ? stone[3] : t < 0.7 ? stone[2] : stone[1]);
        }
      }
      for (let i = 0; i < 12; i++) {
        const x = 3 + Math.floor(rand() * 7);
        const y = top + 2 + Math.floor(rand() * 22);
        if (g.get(x, y)) g.set(x, y, rand() < 0.5 ? '#a8a870' : '#c8c49a');
      }
      for (let y = top + 4; y < 26; y += 6) g.set(7, y, stone[0]);
      g.outline();
    },
  },
  trilithon: {
    w: 27, h: 38,
    paint(g, _v, rand) {
      // A trilithon: two great sarsen uprights capped by a lintel laid across their tops.
      const stone = ['#5e5c56', '#7c7a72', '#9a978c', '#b4b0a4'];
      for (const x0 of [2, 16]) {
        for (let y = 8; y < 38; y++) for (let x = x0; x < x0 + 9; x++) g.set(x, y, x < x0 + 3 ? stone[3] : x < x0 + 6 ? stone[2] : stone[1]);
      }
      g.rect(0, 2, 27, 6, stone[2]);
      g.rect(0, 2, 27, 2, stone[3]);
      g.rect(0, 7, 27, 1, stone[0]);
      for (let i = 0; i < 16; i++) {
        const x = Math.floor(rand() * 27);
        const y = 2 + Math.floor(rand() * 36);
        if (g.get(x, y)) g.set(x, y, rand() < 0.5 ? '#a8a870' : '#c8c49a');
      }
      g.outline();
    },
  },
  great_trilithon: {
    w: 31, h: 52,
    paint(g, _v, rand) {
      // The great trilithon at the head of the horseshoe, tallest of all: two towering uprights,
      // one leaning a little, under a heavy lintel.
      const stone = ['#5a5852', '#78766e', '#969388', '#b0ac9e'];
      for (const [x0, lean] of [[2, 0], [19, 1]] as const) {
        for (let y = 9; y < 52; y++) {
          const dx = lean && y < 20 ? 1 : 0;
          for (let x = x0; x < x0 + 10; x++) g.set(x + dx, y, x < x0 + 3 ? stone[3] : x < x0 + 7 ? stone[2] : stone[1]);
        }
      }
      g.rect(0, 2, 31, 7, stone[2]);
      g.rect(0, 2, 31, 2, stone[3]);
      g.rect(0, 8, 31, 1, stone[0]);
      g.set(15, 4, stone[0]);
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(rand() * 31);
        const y = 2 + Math.floor(rand() * 50);
        if (g.get(x, y)) g.set(x, y, rand() < 0.5 ? '#a8a870' : '#c8c49a');
      }
      g.outline();
    },
  },
  crystal_cluster: {
    w: 19, h: 24,
    paint(g, v) {
      // A cluster of glowing crystals: hexagonal prisms jutting up at angles from a rock base,
      // each with a lit face, a dark face and a bright tip. Cyan, violet or rose.
      const ramp = [['#14405a', '#2a8aaa', '#5ad8f0', '#d0faff'], ['#3a1a6a', '#6a3ab0', '#a87ae8', '#ecdcff'], ['#5a1a3a', '#a83a6a', '#e87aa8', '#ffdcec']][v];
      const prism = (x0: number, y1: number, len: number, w: number, lean: number) => {
        for (let i = 0; i < len; i++) {
          const y = y1 - i;
          const x = x0 + Math.round(i * lean);
          const tip = i > len - 3;
          const hw = tip ? Math.max(0, w - (i - (len - 3)) - 1) : w;
          for (let dx = -hw; dx <= hw; dx++) g.set(x + dx, y, tip ? ramp[3] : dx < 0 ? ramp[2] : dx === 0 ? ramp[3] : ramp[1], true);
        }
      };
      prism(9, 21, 20, 2, 0.05);
      prism(5, 21, 12, 2, -0.3);
      prism(14, 21, 13, 2, 0.35);
      prism(11, 22, 7, 1, 0.6);
      g.ball(9.5, 21.5, 9, 2.5, ['#1e1c24', '#2c2a34', '#3c3a46']);
      g.outline(0.5);
    },
  },
  crystal_spire: {
    w: 38, h: 84,
    paint(g) {
      // The crystal spire: a towering violet crystal, taller than any column above, ringed by
      // lesser shards and bedded in a broken dome of rock, all of it glowing.
      const ramp = ['#2a1050', '#5a2aa0', '#9a6ae8', '#e8d8ff'];
      const cyan = ['#14405a', '#2a8aaa', '#5ad8f0', '#d0faff'];
      const prism = (x0: number, y1: number, len: number, w: number, lean: number, r: string[]) => {
        for (let i = 0; i < len; i++) {
          const y = y1 - i;
          const x = x0 + Math.round(i * lean);
          const tip = i > len - w - 2;
          const hw = tip ? Math.max(0, Math.round(w * (len - i) / (w + 2))) : w;
          for (let dx = -hw; dx <= hw; dx++) g.set(x + dx, y, dx < -hw / 3 ? r[2] : dx <= 0 ? r[3] : dx < hw / 2 ? r[1] : r[0], true);
        }
      };
      prism(19, 76, 76, 5, 0, ramp);
      prism(10, 76, 40, 3, -0.18, ramp);
      prism(28, 76, 46, 3, 0.15, ramp);
      prism(5, 78, 20, 2, -0.4, cyan);
      prism(33, 78, 24, 2, 0.35, cyan);
      prism(15, 78, 14, 2, -0.1, cyan);
      g.ball(19, 79, 18, 5, ['#1a1820', '#262430', '#363442', '#46445a']);
      g.outline(0.5);
    },
  },
  stalagmite: {
    w: 11, h: 24,
    paint(g, v) {
      // A stalagmite: a tapering cone of wet rock, ribbed with drip lines.
      const rock = ['#24222c', '#3a3844', '#545260', '#6e6c7a'];
      const h = v ? 24 : 17;
      for (let y = 24 - h; y < 24; y++) {
        const hw = Math.round(((y - (24 - h)) / h) * 4.6) + 0.5;
        for (let x = -hw; x <= hw; x++) {
          const t = (x + hw) / (2 * hw + 0.01);
          g.set(5 + x, y, (x + y) % 4 === 0 ? rock[0] : t < 0.3 ? rock[3] : t < 0.65 ? rock[2] : rock[1]);
        }
      }
      g.outline();
    },
  },
  glow_mushroom: {
    w: 15, h: 11,
    paint(g, v) {
      // A clump of glowcaps: pale stalks under caps that shine in the dark, cyan or green.
      const cap = v ? ['#1a6a4a', '#3ac88a', '#a0ffd0'] : ['#1a5a6a', '#3ab0d0', '#a8f0ff'];
      for (const [x, y, r] of [[4, 5, 3], [10, 3, 3.6], [7, 7, 2]] as const) {
        g.rect(x, y, 1, 11 - y, '#d8d4c4');
        g.ball(x + 0.5, y, r, r * 0.6, cap, true);
      }
      g.outline(0.55);
    },
  },
  snag: {
    w: 13, h: 22,
    paint(g, v) {
      // A drowned tree: grey, barkless, its top snapped off, with moss creeping up from the water.
      const wood = ['#3a3630', '#5a5246', '#7a7262'];
      const top = v ? 8 : 3;
      g.rect(5, top, 3, 22 - top, wood[1]);
      g.rect(5, top, 1, 22 - top, wood[2]);
      g.rect(7, top, 1, 22 - top, wood[0]);
      g.set(6, top - 1, wood[1]);
      g.set(5, top - 1, wood[2]);
      g.line(5, 12, 1, v ? 9 : 6, wood[1]);
      g.line(7, v ? 12 : 9, 11, v ? 8 : 4, wood[1]);
      g.line(9, v ? 10 : 6, 10, v ? 7 : 2, wood[0]);
      for (const [x, y] of [[5, 21], [6, 21], [7, 21], [5, 20], [7, 19], [5, 18], [6, 17]]) g.set(x, y, y > 19 ? '#4e6a30' : '#6a8a3e');
      g.outline(0.6);
    },
  },
};

export interface SpriteCell {
  /** UV rectangle of the first frame in the sheet (v0 = bottom). */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Size in px. */
  w: number;
  h: number;
  /** Animation: frame count, frames per second, and the u offset from one frame to the next. */
  frames: number;
  fps: number;
  stride: number;
}

export interface PropSheet {
  texture: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  cell(prop: PropId, variant: number): SpriteCell;
}

function nearestTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Paints every prop variant into one sheet (shelf-packed), plus a matching sheet of what glows. */
/**
 * The sprite sheet keeps a fixed size and is packed in PROP_IDS order, so a sprite added at
 * the end never moves the ones before it (or shifts their texels on screen).
 */
const SHEET_W = 512;
const SHEET_H = 1024;

/**
 * Transparent rows above every shelf of sprites. The snow-cap shader (SpriteField) looks up to
 * four texels above a pixel for the sprite's top edge, so it must never see the sprite above.
 */
const SKY_ROWS = 5;

export function buildPropSheet(): PropSheet {
  const PAD = 1;
  const items = PROP_IDS.flatMap((id) => Array.from({ length: PROPS[id].variants }, (_, variant) => ({ id, variant, art: ART[id] })));
  const placed = new Map<string, { x: number; y: number; w: number; h: number }>();
  let x = 0;
  let y = SKY_ROWS;
  let rowH = 0;
  // Each variant's frames sit side by side in one strip.
  const span = (art: SpriteArt) => (art.frames ?? 1) * (art.w + PAD) - PAD;
  for (const { id, variant, art } of items) {
    if (x + span(art) > SHEET_W) {
      x = 0;
      y += rowH + SKY_ROWS;
      rowH = 0;
    }
    placed.set(`${id}/${variant}`, { x, y, w: art.w, h: art.h });
    x += span(art) + PAD;
    rowH = Math.max(rowH, art.h);
  }
  if (y + rowH > SHEET_H) throw new Error('The prop sprite sheet is full: raise SHEET_H.');
  const height = SHEET_H;
  const canvas = document.createElement('canvas');
  const glowCanvas = document.createElement('canvas');
  canvas.width = glowCanvas.width = SHEET_W;
  canvas.height = glowCanvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const glowCtx = glowCanvas.getContext('2d')!;
  glowCtx.fillStyle = '#000';
  glowCtx.fillRect(0, 0, SHEET_W, height);

  for (const { id, variant, art } of items) {
    const at = placed.get(`${id}/${variant}`)!;
    for (let frame = 0; frame < (art.frames ?? 1); frame++) {
      const g = new Gfx(art.w, art.h);
      // Same random stream every frame, so only what the frame animates changes.
      art.paint(g, variant, mulberry32(PROP_IDS.indexOf(id) * 131 + variant * 17 + 7), frame);
      const x0 = at.x + frame * (art.w + PAD);
      g.color.forEach((c, i) => {
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x0 + (i % art.w), at.y + Math.floor(i / art.w), 1, 1);
        if (!g.glow[i]) return;
        glowCtx.fillStyle = c;
        glowCtx.fillRect(x0 + (i % art.w), at.y + Math.floor(i / art.w), 1, 1);
      });
    }
  }

  return {
    texture: nearestTexture(canvas),
    glow: nearestTexture(glowCanvas),
    cell(prop, variant) {
      const at = placed.get(`${prop}/${variant}`)!;
      const art = ART[prop];
      // CanvasTexture is flipped: canvas y = 0 is v = 1.
      return {
        u0: at.x / SHEET_W, u1: (at.x + at.w) / SHEET_W, v0: 1 - (at.y + at.h) / height, v1: 1 - at.y / height, w: at.w, h: at.h,
        frames: art.frames ?? 1, fps: art.fps ?? 0, stride: (at.w + PAD) / SHEET_W,
      };
    },
  };
}
