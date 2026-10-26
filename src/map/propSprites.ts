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
