import { hash } from '../util/noise';

type RGB = [number, number, number];
type Rand = () => number;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

export const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Value noise that wraps around every `period` units, so ridgelines and skylines join up
 * seamlessly where the panorama's ends meet.
 */
function loopNoise(seed: number, x: number, period: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const at = (k: number) => hash(seed, ((k % period) + period) % period, 0);
  return at(i) + (at(i + 1) - at(i)) * s;
}

/**
 * A pixel-art panorama that wraps horizontally: everything drawn past either end continues
 * on the other side. Layers are painted back to front, each hazier the further away it is.
 */
export class Panorama {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  constructor(readonly width: number, readonly height: number, transparent = false) {
    this.data = new Uint8ClampedArray(width * height * 4);
    if (!transparent) for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
  }

  px(x: number, y: number, c: RGB, a = 1): void {
    x = ((Math.round(x) % this.width) + this.width) % this.width;
    y = Math.round(y);
    if (y < 0 || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    // Straight-alpha "over": transparent overlays take the colour as is, opaque layers blend.
    const below = d[i + 3] / 255;
    const out = a + below * (1 - a);
    if (out <= 0) return;
    for (let k = 0; k < 3; k++) d[i + k] = (c[k] * a + d[i + k] * below * (1 - a)) / out;
    d[i + 3] = out * 255;
  }

  /** Vertical gradient through colour stops [y, colour], quantised into dithered bands like the ground. */
  sky(stops: [number, string][], bands = 10): void {
    const cols = stops.map(([, c]) => rgb(c));
    for (let y = 0; y < this.height; y++) {
      let k = 0;
      while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
      const t = Math.min(1, Math.max(0, (y - stops[k][0]) / (stops[k + 1][0] - stops[k][0])));
      for (let x = 0; x < this.width; x++) {
        const q = Math.min(bands, Math.floor(t * bands + bayer(x, y)));
        this.px(x, y, mix(cols[k], cols[k + 1], q / bands));
      }
    }
  }

  /** A soft disc of light: sun or moon with a dithered halo. */
  sun(cx: number, cy: number, r: number, color: string, halo = 2.4): void {
    const c = rgb(color);
    for (let y = -r * halo; y <= r * halo; y++) {
      for (let x = -r * halo; x <= r * halo; x++) {
        const d = Math.hypot(x, y) / r;
        if (d <= 1) this.px(cx + x, cy + y, c);
        else if (d < halo && bayer(cx + x, cy + y) < 0.5 * (1 - (d - 1) / (halo - 1))) this.px(cx + x, cy + y, c, 0.35);
      }
    }
  }

  stars(rand: Rand, count: number, maxY: number): void {
    for (let i = 0; i < count; i++) {
      const x = rand() * this.width;
      const y = rand() * maxY;
      const b = 0.4 + rand() * 0.6;
      this.px(x, y, [255, 255, 255], b);
      if (b > 0.92) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.px(x + dx, y + dy, [255, 255, 255], 0.35);
    }
  }

  /**
   * A mountain or hill ridge filled down to the bottom: fractal wrapping noise for the
   * skyline, light on the left of each slope and shade on the right, optional snow above a line.
   */
  ridge(o: { seed: number; base: number; amp: number; period: number; color: string; shade?: string; snow?: { color: string; above: number }; jag?: number }): void {
    const c = rgb(o.color);
    const sh = rgb(o.shade ?? o.color);
    const top = (x: number) =>
      o.base -
      o.amp * (0.6 * loopNoise(o.seed, (x / this.width) * o.period, o.period) +
        0.3 * loopNoise(o.seed + 1, (x / this.width) * o.period * 3, o.period * 3) +
        (o.jag ?? 0.1) * loopNoise(o.seed + 2, (x / this.width) * o.period * 11, o.period * 11));
    for (let x = 0; x < this.width; x++) {
      const t = Math.round(top(x));
      const slope = top(x + 1) - top(x - 1); // > 0 where the ground falls away to the right
      for (let y = t; y < this.height; y++) {
        const snow = !!o.snow && y < o.snow.above + (hash(o.seed, x, 0) - 0.5) * 6 && y < t + 18;
        const lit = slope > 0.15 || (slope >= -0.15 && bayer(x, y) < 0.5);
        const snowColor = snow ? rgb(o.snow!.color) : c;
        this.px(x, y, snow ? (lit ? snowColor : mix(snowColor, [0, 0, 0], 0.14)) : lit ? c : sh);
      }
    }
  }

  /**
   * Flat-topped mesas and buttes standing on a filled band: steep sides, a lit left face and a
   * shaded right one, and darker strata running across them.
   */
  mesas(o: { rand: Rand; base: number; color: string; shade: string; strata: string; count: number; minH: number; maxH: number }): void {
    const c = rgb(o.color);
    const sh = rgb(o.shade);
    const st = rgb(o.strata);
    for (let k = 0; k < o.count; k++) {
      const cx = ((k + 0.2 + 0.6 * o.rand()) * this.width) / o.count;
      const h = o.minH + o.rand() * (o.maxH - o.minH);
      const half = h * (0.6 + o.rand() * 1.6);
      const top = o.base - h;
      for (let y = Math.round(top); y < o.base; y++) {
        // Sides flare out towards the foot in a talus slope.
        const flare = Math.max(0, y - (top + h * 0.6)) * 1.4;
        const w = half + flare + (hash(k, y, 1) < 0.3 ? 1 : 0);
        for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
          const band = (y - Math.round(top)) % 7 === 3 && hash(k, x >> 2, y) < 0.7;
          const color = x > cx + w * 0.35 ? sh : band ? st : c;
          this.px(x, y, color);
        }
      }
    }
    for (let y = o.base; y < this.height; y++) for (let x = 0; x < this.width; x++) this.px(x, y, c);
  }

  /** A row of tree crowns (round or conifer) standing on a filled band. */
  treeline(o: { rand: Rand; base: number; color: string; light?: string; kind: 'round' | 'pine'; size: number }): void {
    const c = rgb(o.color);
    const l = rgb(o.light ?? o.color);
    for (let x0 = 0; x0 < this.width;) {
      const s = o.size * (0.7 + o.rand() * 0.6);
      if (o.kind === 'pine') {
        const h = Math.round(s * 2.2);
        for (let r = 0; r < h; r++) {
          const hw = Math.round((r / h) * s * 0.55) + (r % 3 === 2 ? 1 : 0);
          for (let x = -hw; x <= hw; x++) this.px(x0 + x, o.base - h + r, x < 0 ? l : c);
        }
        x0 += Math.round(s * 0.7) + 1;
      } else {
        const r = Math.round(s / 2);
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) this.px(x0 + x, o.base - r + y, x + y < -r * 0.4 ? l : c);
        x0 += r + 1 + Math.floor(o.rand() * r);
      }
    }
    for (let y = o.base; y < this.height; y++) for (let x = 0; x < this.width; x++) this.px(x, y, c);
  }

  /** City blocks: flat-roofed buildings with window grids; at night windows glow and neon signs hang off them. */
  skyline(o: { rand: Rand; base: number; minH: number; maxH: number; colors: string[]; window: string; lit: number; neon?: string[]; roofline?: string }): void {
    for (let x0 = 0; x0 < this.width;) {
      const w = 14 + Math.floor(o.rand() * 26);
      const h = o.minH + Math.floor(o.rand() * (o.maxH - o.minH));
      const wall = rgb(o.colors[Math.floor(o.rand() * o.colors.length)]);
      const edge = mix(wall, [255, 255, 255], 0.08);
      for (let y = o.base - h; y < this.height; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, x === x0 ? edge : wall);
      if (o.roofline) for (let x = x0; x < x0 + w; x++) this.px(x, o.base - h, rgb(o.roofline));
      // Windows on a regular grid, some lit.
      for (let y = o.base - h + 4; y < this.height - 2; y += 5) {
        for (let x = x0 + 3; x < x0 + w - 3; x += 4) {
          if (o.rand() < o.lit) {
            this.px(x, y, rgb(o.window));
            this.px(x + 1, y, rgb(o.window));
            this.px(x, y + 1, rgb(o.window), 0.7);
            this.px(x + 1, y + 1, rgb(o.window), 0.7);
          }
        }
      }
      // Rooftop clutter: water tanks and antennas.
      if (o.rand() < 0.4) {
        const tx = x0 + 3 + Math.floor(o.rand() * (w - 8));
        for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) this.px(tx + x, o.base - h - 6 + y, mix(wall, [0, 0, 0], 0.15));
      } else if (o.rand() < 0.4) {
        const ax = x0 + Math.floor(w / 2);
        for (let y = 1; y < 10; y++) this.px(ax, o.base - h - y, mix(wall, [0, 0, 0], 0.2));
        if (o.neon) this.px(ax, o.base - h - 10, rgb(o.neon[0]));
      }
      if (o.neon && o.rand() < 0.55) {
        const nc = rgb(o.neon[Math.floor(o.rand() * o.neon.length)]);
        const sx = x0 + 2 + Math.floor(o.rand() * Math.max(1, w - 6));
        const sy = o.base - h + 6 + Math.floor(o.rand() * Math.max(1, h - 30));
        const vertical = o.rand() < 0.6;
        const [sw, shh] = vertical ? [3, 10 + Math.floor(o.rand() * 14)] : [8 + Math.floor(o.rand() * 8), 4];
        for (let y = -2; y < shh + 2; y++) for (let x = -2; x < sw + 2; x++) if (bayer(sx + x, sy + y) < 0.3) this.px(sx + x, sy + y, nc, 0.3);
        for (let y = 0; y < shh; y++) for (let x = 0; x < sw; x++) this.px(sx + x, sy + y, (x + y) % 4 === 0 ? mix(nc, [255, 255, 255], 0.5) : nc);
      }
      x0 += w + (o.rand() < 0.3 ? 2 + Math.floor(o.rand() * 4) : 0);
    }
  }

  /** Gabled village roofs with chimneys. */
  rooftops(o: { rand: Rand; base: number; walls: string[]; roofs: string[]; window: string }): void {
    for (let x0 = 0; x0 < this.width;) {
      const w = 16 + Math.floor(o.rand() * 18);
      const h = 10 + Math.floor(o.rand() * 14);
      const wall = rgb(o.walls[Math.floor(o.rand() * o.walls.length)]);
      const roof = rgb(o.roofs[Math.floor(o.rand() * o.roofs.length)]);
      for (let y = o.base - h; y < this.height; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, wall);
      // The gable rises to a point, overhanging the walls by a pixel; the chimney stands on its right slope.
      const peak = Math.round(w / 2);
      for (let r = 0; r <= peak; r++) for (let x = x0 + peak - r - 1; x <= x0 + w - peak + r; x++) this.px(x, o.base - h - peak + r, x < x0 + peak ? mix(roof, [255, 255, 255], 0.1) : roof);
      if (o.rand() < 0.6) for (let y = 3; y < 9; y++) for (let x = 0; x < 3; x++) this.px(x0 + w - 6 + x, o.base - h - y, mix(wall, [0, 0, 0], 0.3));
      for (let k = 0; k < 2; k++) if (o.rand() < 0.7) for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) this.px(x0 + 4 + k * 8 + x, o.base - h + 4 + y, rgb(o.window));
      x0 += w + 1;
    }
  }

  /** Castle towers and curtain walls with crenellations and pennants. */
  castle(o: { rand: Rand; base: number; color: string; shade: string; flag: string; at: number[] }): void {
    const c = rgb(o.color);
    const s = rgb(o.shade);
    const wallTop = o.base - 22;
    for (let x = 0; x < this.width; x++) {
      for (let y = wallTop; y < this.height; y++) this.px(x, y, c);
      if (x % 6 < 3) for (let y = wallTop - 4; y < wallTop; y++) this.px(x, y, c);
    }
    for (const tx of o.at) {
      const w = 18 + Math.floor(o.rand() * 8);
      const h = 50 + Math.floor(o.rand() * 30);
      for (let y = o.base - h; y < this.height; y++) for (let x = 0; x < w; x++) this.px(tx + x, y, x > w * 0.6 ? s : c);
      for (let x = 0; x < w; x++) if (x % 5 < 3) for (let y = 1; y <= 4; y++) this.px(tx + x, o.base - h - y, x > w * 0.6 ? s : c);
      for (let k = 0; k < 3; k++) for (let y = 0; y < 4; y++) this.px(tx + 5 + k * 5, o.base - h + 14 + k * 12 + y, mix(c, [0, 0, 0], 0.45));
      const fx = tx + Math.floor(w / 2);
      for (let y = 5; y < 16; y++) this.px(fx, o.base - h - y, mix(c, [0, 0, 0], 0.4));
      for (let y = 0; y < 4; y++) for (let x = 1; x < 8 - y * 1.5; x++) this.px(fx + x, o.base - h - 15 + y, rgb(o.flag));
    }
  }

  /** A volcano cone with glowing lava runnels down its flanks. */
  volcano(o: { cx: number; base: number; height: number; width: number; color: string; shade: string; lava: string; rand: Rand }): void {
    const c = rgb(o.color);
    const s = rgb(o.shade);
    const lava = rgb(o.lava);
    const crater = o.width * 0.12;
    for (let y = o.base - o.height; y < this.height; y++) {
      const t = (y - (o.base - o.height)) / o.height;
      const hw = crater + (o.width / 2 - crater) * Math.pow(t, 0.9);
      for (let x = -hw; x <= hw; x++) this.px(o.cx + x, y, x > hw * 0.15 ? s : c);
    }
    for (let k = 0; k < 5; k++) {
      let x = o.cx + (o.rand() - 0.5) * crater * 2;
      for (let y = o.base - o.height; y < o.base - o.height * (0.2 + o.rand() * 0.5); y++) {
        x += (o.rand() - 0.5) * 1.6 + (x - o.cx) * 0.012;
        this.px(x, y, lava);
        if (bayer(x, y) < 0.4) this.px(x + 1, y, lava, 0.5);
      }
    }
    for (let x = -crater; x <= crater; x++) {
      this.px(o.cx + x, o.base - o.height, mix(lava, [255, 240, 180], 0.4));
      this.px(o.cx + x, o.base - o.height - 1, lava, 0.6);
    }
  }

  /** A rising plume of smoke, widening and fading as it climbs. */
  plume(o: { x: number; base: number; height: number; color: string; drift: number; rand: Rand }): void {
    const c = rgb(o.color);
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const cx = o.x + o.drift * t * t * o.height;
      const cy = o.base - t * o.height;
      const r = 4 + t * 16;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d < 1 && bayer(cx + x, cy + y) < (1 - d) * (1 - t * 0.6)) this.px(cx + x, cy + y, c, 0.85);
      }
    }
  }

  /** Dense round canopy crowns, jungle style, with sunlit tops. */
  canopy(o: { rand: Rand; base: number; color: string; light: string; size: number }): void {
    const c = rgb(o.color);
    const l = rgb(o.light);
    for (let x0 = 0; x0 < this.width; x0 += Math.round(o.size * 0.8)) {
      const r = Math.round(o.size * (0.6 + o.rand() * 0.5));
      const cy = o.base - r * 0.6 - o.rand() * o.size * 0.6;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + r) continue;
        const lit = y < -r * 0.35 && x < r * 0.3 && bayer(x0 + x, cy + y) < 0.75;
        this.px(x0 + x, cy + y, lit ? l : c);
      }
    }
    for (let y = o.base; y < this.height; y++) for (let x = 0; x < this.width; x++) this.px(x, y, c);
  }

  /** Stepped temple silhouettes rising out of the forest. */
  temples(o: { base: number; color: string; at: number[] }): void {
    const c = rgb(o.color);
    for (const tx of o.at) {
      for (let step = 0; step < 6; step++) {
        const w = 44 - step * 7;
        for (let y = 0; y < 6; y++) for (let x = 0; x < w; x++) this.px(tx - w / 2 + x, o.base - step * 6 - y, c);
      }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) this.px(tx - 3 + x, o.base - 42 - y, c);
    }
  }

  /** A horizontal band of haze that thickens in the middle. */
  mist(y0: number, h: number, color: string, alpha: number): void {
    const c = rgb(color);
    for (let y = 0; y < h; y++) {
      const t = 1 - Math.abs(y - h / 2) / (h / 2);
      for (let x = 0; x < this.width; x++) if (bayer(x, y0 + y) < t * alpha) this.px(x, y0 + y, c);
    }
  }

  /** Small birds as dark ticks. */
  birds(rand: Rand, count: number, color: string, maxY: number): void {
    const c = rgb(color);
    for (let i = 0; i < count; i++) {
      const x = rand() * this.width;
      const y = 20 + rand() * maxY;
      this.px(x - 1, y - 1, c);
      this.px(x, y, c);
      this.px(x + 1, y - 1, c);
    }
  }

  /** Puffy clouds with flat, shaded bases (drawn on a transparent overlay). */
  clouds(rand: Rand, count: number, minY: number, maxY: number, color: string, shadow: string): void {
    const c = rgb(color);
    const s = rgb(shadow);
    for (let i = 0; i < count; i++) {
      const cx = rand() * this.width;
      const cy = minY + rand() * (maxY - minY);
      const puffs = 3 + Math.floor(rand() * 4);
      const size = 6 + rand() * 8;
      for (let p = 0; p < puffs; p++) {
        const r = size * (0.6 + rand() * 0.6);
        const px = cx + (p - puffs / 2) * size * 0.9;
        const py = cy - rand() * size * 0.5;
        for (let y = -r; y <= 0; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.px(px + x, py + y, y > -r * 0.3 ? s : c);
      }
    }
  }

  /** Dots for embers, snow or spores on a tiling overlay cell. */
  specks(rand: Rand, count: number, colors: string[]): void {
    for (let i = 0; i < count; i++) {
      const c = rgb(colors[Math.floor(rand() * colors.length)]);
      const x = rand() * this.width;
      const y = rand() * this.height;
      this.px(x, y, c);
      if (rand() < 0.3) this.px(x, y + 1, c, 0.6);
    }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.getContext('2d')!.putImageData(new ImageData(this.data, this.width, this.height), 0, 0);
    return canvas;
  }
}
