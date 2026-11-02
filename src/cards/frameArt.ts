/**
 * The card's frame, text and back, painted on 2D canvases at twice the design size
 * (cards.md, Part 1: "Card format", "The back"). Each side is painted twice by the same code:
 * once in colour, and once as a metal mask (white where the gold is) that the card's shader
 * uses for the foil and the embossed highlights. The face leaves its art window transparent.
 */
import type { Card } from '../game/cards';
import type { Side } from '../game/units';
import { mulberry32 } from '../util/rng';
import { ACE_LABEL, ART, CARD_H, CARD_RADIUS, CARD_W, MEDAL, cardNumber, rarity } from './layout';

/** Canvas pixels per design unit. */
export const PAINT_SCALE = 2;

type Mode = 'colour' | 'metal';

interface Scheme {
  stock: [string, string];
  /** The metal's gradient, light to dark to light: gold for the player, dark silver for the foes. */
  metal: string[];
  /** Text that isn't metal: the skill line. */
  ink: string;
  pow: [string, string];
  mov: [string, string];
  movRim: string[];
}

const SCHEMES: Record<Side, Scheme> = {
  player: {
    stock: ['#1b2b55', '#0b132b'],
    metal: ['#fff3c4', '#e7bf62', '#a9771f', '#f3d27e', '#b98a2c'],
    ink: '#efe3c4',
    pow: ['#e0473f', '#6d0d16'],
    mov: ['#4aa0ee', '#0f3570'],
    movRim: ['#ffffff', '#d3dbe6', '#7f8a9b', '#eef2f7', '#98a3b3'],
  },
  enemy: {
    stock: ['#4a1019', '#14070a'],
    metal: ['#f6f7fa', '#bfc5cf', '#5d6470', '#e0e4ea', '#7c8390'],
    ink: '#ead7d2',
    pow: ['#e0473f', '#6d0d16'],
    mov: ['#4aa0ee', '#0f3570'],
    movRim: ['#ffffff', '#d3dbe6', '#7f8a9b', '#eef2f7', '#98a3b3'],
  },
};

export interface CardPaint {
  face: HTMLCanvasElement;
  faceMetal: HTMLCanvasElement;
  back: HTMLCanvasElement;
  backMetal: HTMLCanvasElement;
}

/** The fonts the card prints in, loaded before painting (they come from Google Fonts in index.html). */
export async function loadCardFonts(): Promise<void> {
  await Promise.all(
    ['700 40px Cinzel', '600 40px Cinzel', 'italic 600 40px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"'].map((f) =>
      document.fonts.load(f).catch(() => []),
    ),
  );
}

/** The backs painted so far, by side and scale: every card on a side shares one back. */
const backs = new Map<string, Pick<CardPaint, 'back' | 'backMetal'>>();

/**
 * Paints `card`'s face, and its side's back, at `scale` canvas pixels per design unit: 2 for the
 * full-screen showcase, less for the hand's smaller cards (the canvases are uploaded as
 * textures, and eight cards at full scale would be most of a gigabyte).
 */
export function paintCard(card: Card, side: Side, scale = PAINT_SCALE): CardPaint {
  const scheme = SCHEMES[side];
  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(CARD_W * scale);
    c.height = Math.round(CARD_H * scale);
    return c;
  };
  const face = { face: canvas(), faceMetal: canvas() };
  for (const [c, mode] of [[face.face, 'colour'], [face.faceMetal, 'metal']] as const) new Painter(c, mode, scheme, scale).face(card);
  const key = `${side}:${scale}`;
  let back = backs.get(key);
  if (!back) {
    back = { back: canvas(), backMetal: canvas() };
    for (const [c, mode] of [[back.back, 'colour'], [back.backMetal, 'metal']] as const) new Painter(c, mode, scheme, scale).back();
    backs.set(key, back);
  }
  return { ...face, ...back };
}

class Painter {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, private readonly mode: Mode, private readonly scheme: Scheme, private readonly scale: number) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(scale, scale);
  }

  face(card: Card): void {
    this.stock();
    this.borders();
    this.title(card.name, card.skill.name);
    this.artWindow();
    this.divider(ART.y + ART.size + 62);
    this.skillText(card.skill.text);
    this.medal(MEDAL.inset, 'POW', card.pow, this.scheme.pow, this.scheme.metal);
    this.medal(CARD_W - MEDAL.inset, 'MOV', card.mov, this.scheme.mov, this.scheme.movRim);
    this.ace(card.ace);
    this.footer(card);
  }

  back(): void {
    this.stock();
    this.lattice();
    this.borders();
    this.crest(CARD_W / 2, 610, 560);
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 66px Cinzel';
    ctx.letterSpacing = '8px';
    this.shadowed(() => {
      ctx.fillStyle = this.metalFill(1000, 1080);
      ctx.fillText('DIORAMA', CARD_W / 2, 1040);
      ctx.fillText('TACTICS', CARD_W / 2, 1120);
    });
    ctx.letterSpacing = '0px';
    this.divider(1190);
  }

  // ---- paint helpers -------------------------------------------------------------------------

  private get colour(): boolean {
    return this.mode === 'colour';
  }

  /** The metal's fill: a gradient across [y0, y1] in colour, plain white in the mask. */
  private metalFill(y0: number, y1: number, stops = this.scheme.metal, x0 = 0, x1 = 0): string | CanvasGradient {
    if (!this.colour) return '#ffffff';
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  }

  /** Not metal: its colour, or black in the mask. */
  private plain(colour: string | CanvasGradient): string | CanvasGradient {
    return this.colour ? colour : '#000000';
  }

  /** Draws with a soft dark drop shadow under it (colour only), so gold reads as raised. */
  private shadowed(draw: () => void, blur = 6, dy = 3): void {
    const ctx = this.ctx;
    ctx.save();
    if (this.colour) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = blur * this.scale;
      ctx.shadowOffsetY = dy * this.scale;
    }
    draw();
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
  }

  // ---- the card's parts ----------------------------------------------------------------------

  /** The card stock: a deep gradient with a fine linen weave. */
  private stock(): void {
    const ctx = this.ctx;
    this.roundRect(0, 0, CARD_W, CARD_H, CARD_RADIUS);
    ctx.save();
    ctx.clip();
    if (!this.colour) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.restore();
      return;
    }
    const g = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.4, 100, CARD_W / 2, CARD_H * 0.5, CARD_H * 0.75);
    g.addColorStop(0, this.scheme.stock[0]);
    g.addColorStop(1, this.scheme.stock[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    // Linen: faint threads both ways, each a little lighter or darker than the stock.
    const rand = mulberry32(7);
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 2 * CARD_H; i += 2.2) {
      const light = rand() < 0.5;
      ctx.strokeStyle = light ? `rgba(255, 255, 255, ${0.012 + rand() * 0.025})` : `rgba(0, 0, 0, ${0.04 + rand() * 0.05})`;
      ctx.beginPath();
      if (i < CARD_H) {
        ctx.moveTo(0, i);
        ctx.lineTo(CARD_W, i + rand() * 2 - 1);
      } else {
        const x = (i - CARD_H) * (CARD_W / CARD_H);
        ctx.moveTo(x, 0);
        ctx.lineTo(x + rand() * 2 - 1, CARD_H);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A faint diamond lattice over the back's stock. */
  private lattice(): void {
    if (!this.colour) return;
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(40, 40, CARD_W - 80, CARD_H - 80, 24);
    ctx.clip();
    ctx.strokeStyle = 'rgba(231, 191, 98, 0.07)';
    ctx.lineWidth = 2;
    for (let k = -CARD_H; k < CARD_W + CARD_H; k += 56) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + CARD_H, CARD_H);
      ctx.moveTo(k, CARD_H);
      ctx.lineTo(k + CARD_H, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The double border and the filigree in each corner. */
  private borders(): void {
    const ctx = this.ctx;
    this.shadowed(() => {
      ctx.strokeStyle = this.metalFill(0, CARD_H, this.scheme.metal, 0, CARD_W);
      ctx.lineWidth = 9;
      this.roundRect(16, 16, CARD_W - 32, CARD_H - 32, CARD_RADIUS - 14);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      this.roundRect(31, 31, CARD_W - 62, CARD_H - 62, CARD_RADIUS - 24);
      ctx.stroke();
      for (const [x, y, sx, sy] of [[31, 31, 1, 1], [CARD_W - 31, 31, -1, 1], [31, CARD_H - 31, 1, -1], [CARD_W - 31, CARD_H - 31, -1, -1]]) {
        this.filigree(x, y, sx, sy);
      }
    }, 4, 2);
  }

  /** A scroll of gold in a corner: a curl along each edge and a diamond at the point. */
  private filigree(x: number, y: number, sx: number, sy: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.strokeStyle = this.metalFill(0, 120, this.scheme.metal, 0, 120);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 96);
    ctx.bezierCurveTo(12, 44, 44, 12, 96, 12);
    // A curl along the top edge, and its mirror down the side.
    ctx.moveTo(96, 12);
    ctx.bezierCurveTo(132, 12, 156, 26, 150, 44);
    ctx.bezierCurveTo(145, 58, 124, 56, 126, 41);
    ctx.bezierCurveTo(127, 33, 137, 32, 138, 38);
    ctx.moveTo(12, 96);
    ctx.bezierCurveTo(12, 132, 26, 156, 44, 150);
    ctx.bezierCurveTo(58, 145, 56, 124, 41, 126);
    ctx.bezierCurveTo(33, 127, 32, 137, 38, 138);
    // An inner sweep and a small leaf on each.
    ctx.moveTo(30, 70);
    ctx.bezierCurveTo(34, 46, 46, 34, 70, 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.lineTo(42, 21);
    ctx.lineTo(54, 30);
    ctx.lineTo(42, 39);
    ctx.closePath();
    ctx.moveTo(30, 30);
    ctx.lineTo(21, 42);
    ctx.lineTo(30, 54);
    ctx.lineTo(39, 42);
    ctx.closePath();
    ctx.fill();
    for (const [lx, ly, a] of [[170, 20, 0.2], [20, 170, Math.PI / 2 - 0.2]]) {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** The name, embossed in gold, and the skill's name in italic beneath it. */
  private title(name: string, skill: string): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let size = 64;
    ctx.letterSpacing = '3px';
    do {
      ctx.font = `700 ${size}px Cinzel`;
      size -= 2;
    } while (ctx.measureText(name.toUpperCase()).width > 760 && size > 40);
    this.shadowed(() => {
      ctx.fillStyle = this.metalFill(62, 118);
      ctx.fillText(name.toUpperCase(), CARD_W / 2, 116);
    });
    ctx.letterSpacing = '1px';
    ctx.font = 'italic 600 38px "Cormorant Garamond"';
    ctx.fillStyle = this.plain('#e9dcb6');
    ctx.fillText(skill, CARD_W / 2, 156);
    ctx.letterSpacing = '0px';
  }

  /** Clears the art window (the art shows through it) and frames it in metal. */
  private artWindow(): void {
    const ctx = this.ctx;
    const { x, y, size } = ART;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    this.roundRect(x, y, size, size, 12);
    ctx.fill();
    ctx.restore();
    this.shadowed(() => {
      ctx.strokeStyle = this.metalFill(y, y + size, this.scheme.metal, x, x + size);
      ctx.lineWidth = 7;
      this.roundRect(x - 3, y - 3, size + 6, size + 6, 14);
      ctx.stroke();
    }, 8, 2);
    ctx.strokeStyle = this.plain('rgba(0, 0, 0, 0.55)');
    ctx.lineWidth = 2;
    this.roundRect(x + 1, y + 1, size - 2, size - 2, 11);
    ctx.stroke();
  }

  /** A thin metal rule with a diamond in the middle. */
  private divider(y: number): void {
    const ctx = this.ctx;
    const cx = CARD_W / 2;
    ctx.fillStyle = this.metalFill(y - 10, y + 10);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 250, y);
    ctx.lineTo(cx - 22, y);
    ctx.moveTo(cx + 22, y);
    ctx.lineTo(cx + 250, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, y - 11);
    ctx.lineTo(cx + 13, y);
    ctx.lineTo(cx, y + 11);
    ctx.lineTo(cx - 13, y);
    ctx.closePath();
    ctx.fill();
  }

  /** The skill's line, in italic serif, wrapped between the medallions. */
  private skillText(text: string): void {
    const ctx = this.ctx;
    ctx.font = 'italic 500 46px "Cormorant Garamond"';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.plain(this.scheme.ink);
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > 560 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    const top = ART.y + ART.size + 140 - (lines.length - 1) * 26;
    lines.forEach((l, i) => ctx.fillText(l, CARD_W / 2, top + i * 52));
  }

  /** A stat medallion: a metal rim, an enamel face, its label and its numeral. */
  private medal(x: number, label: string, value: number, enamel: [string, string], rim: string[]): void {
    const ctx = this.ctx;
    const { r, y } = MEDAL;
    this.shadowed(() => {
      ctx.fillStyle = this.metalFill(y - r, y + r, rim, x - r, x + r);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }, 14, 6);
    const face = this.colour ? ctx.createRadialGradient(x - 18, y - 24, 6, x, y, r * 0.86) : null;
    face?.addColorStop(0, enamel[0]);
    face?.addColorStop(1, enamel[1]);
    ctx.fillStyle = this.plain(face ?? '#000');
    ctx.beginPath();
    ctx.arc(x, y, r - 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.metalFill(y - r, y + r, rim);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r - 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '700 19px Cinzel';
    ctx.letterSpacing = '4px';
    ctx.fillStyle = this.colour ? 'rgba(255, 244, 214, 0.9)' : '#ffffff';
    ctx.fillText(label, x + 2, y - 26);
    ctx.letterSpacing = '0px';
    ctx.font = '700 60px Cinzel';
    this.shadowed(() => {
      ctx.fillStyle = this.metalFill(y - 10, y + 40, ['#ffffff', '#fff1c9', '#f2d28a']);
      ctx.fillText(String(value), x, y + 34);
    }, 4, 2);
  }

  /** The ACE badge at the art window's top right: the weapon, labelled ACE beneath. */
  private ace(ace: Card['ace']): void {
    const ctx = this.ctx;
    const x = ART.x + ART.size - 64;
    const y = ART.y + 66;
    this.shadowed(() => {
      ctx.fillStyle = this.metalFill(y - 48, y + 48);
      ctx.beginPath();
      ctx.arc(x, y, 48, 0, Math.PI * 2);
      ctx.fill();
    }, 10, 4);
    const inner = this.colour ? ctx.createRadialGradient(x, y - 10, 4, x, y, 40) : null;
    inner?.addColorStop(0, this.scheme.stock[0]);
    inner?.addColorStop(1, this.scheme.stock[1]);
    ctx.fillStyle = this.plain(inner ?? '#000');
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = this.metalFill(-30, 30);
    ctx.strokeStyle = ctx.fillStyle;
    weapon(ctx, ace, 0.78);
    ctx.restore();
    // The ribbon beneath.
    this.shadowed(() => {
      ctx.fillStyle = this.metalFill(y + 44, y + 74);
      this.roundRect(x - 62, y + 42, 124, 32, 7);
      ctx.fill();
    }, 6, 2);
    ctx.fillStyle = this.colour ? this.scheme.stock[1] : '#000000';
    ctx.font = '700 18px Cinzel';
    ctx.letterSpacing = '1.5px';
    ctx.textAlign = 'center';
    ctx.fillText(`ACE ${ACE_LABEL[ace]}`, x + 1, y + 65);
    ctx.letterSpacing = '0px';
  }

  /** Rarity diamonds, the set's crest and the card's number. */
  private footer(card: Card): void {
    const ctx = this.ctx;
    const y = CARD_H - 74;
    ctx.fillStyle = this.metalFill(y - 10, y + 10);
    for (let i = 0; i < rarity(card.pow); i++) {
      const dx = 196 + i * 30;
      ctx.beginPath();
      ctx.moveTo(dx, y - 11);
      ctx.lineTo(dx + 9, y);
      ctx.lineTo(dx, y + 11);
      ctx.lineTo(dx - 9, y);
      ctx.closePath();
      ctx.fill();
    }
    this.crest(CARD_W / 2, y - 2, 56);
    ctx.font = '600 22px Cinzel';
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'right';
    ctx.fillStyle = this.metalFill(y - 10, y + 10);
    ctx.fillText(cardNumber(card), CARD_W - 190, y + 8);
    ctx.letterSpacing = '0px';
  }

  /** The set's crest: a tower over two crossed blades, in a laurel (in a 100-unit box). */
  private crest(cx: number, cy: number, size: number): void {
    const ctx = this.ctx;
    const s = size / 100;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    const metal = this.metalFill(-50, 50);
    const hollow = this.colour ? this.scheme.stock[1] : '#000000';
    this.shadowed(() => {
      ctx.fillStyle = metal;
      ctx.strokeStyle = metal;
      // The laurel: two branches rising from a knot below, pointed leaves in pairs along each.
      for (const side of [-1, 1]) {
        const at = (k: number) => {
          const a = Math.PI / 2 + side * (0.2 + k * 2.15);
          return { x: Math.cos(a) * 45, y: Math.sin(a) * 45 - 1, a };
        };
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let k = 0; k <= 1.0001; k += 0.05) {
          const p = at(k);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const k = 0.04 + i * 0.08;
          const p = at(k);
          // Along the branch toward its tip, then turned out or in.
          const tangent = p.a + side * (Math.PI / 2);
          const len = 12 - i * 0.45;
          for (const turn of [-0.6, 0.6]) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(tangent + turn);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
            ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      ctx.beginPath();
      ctx.arc(0, 45, 3.2, 0, Math.PI * 2);
      ctx.fill();
      // The crossed blades, behind the tower.
      for (const a of [-Math.PI / 4, Math.PI / 4]) {
        ctx.save();
        ctx.rotate(a);
        slimSword(ctx);
        ctx.restore();
      }
      // The tower: a plinth, a body narrowing upward, corbels, a crenellated parapet and a pennant.
      ctx.fillRect(-17, 27, 34, 5);
      ctx.beginPath();
      ctx.moveTo(-13, 28);
      ctx.lineTo(-10.5, -8);
      ctx.lineTo(-14, -14);
      ctx.lineTo(14, -14);
      ctx.lineTo(10.5, -8);
      ctx.lineTo(13, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-14, -20, 28, 7);
      for (const mx of [-14, -6.3, 1.3, 9]) ctx.fillRect(mx, -26, 5, 7);
      ctx.fillRect(-0.8, -42, 1.6, 17);
      ctx.beginPath();
      ctx.moveTo(0.8, -42);
      ctx.quadraticCurveTo(7, -41, 13, -37.5);
      ctx.quadraticCurveTo(7, -35, 0.8, -33.5);
      ctx.closePath();
      ctx.fill();
    }, 3, 1.5);
    // Cut into the tower: the door, two arrow slits and a course line.
    ctx.fillStyle = hollow;
    ctx.beginPath();
    ctx.moveTo(-4.5, 27);
    ctx.lineTo(-4.5, 18);
    ctx.arc(0, 18, 4.5, Math.PI, 0);
    ctx.lineTo(4.5, 27);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-5.5, -3, 2, 8);
    ctx.fillRect(3.5, -3, 2, 8);
    ctx.fillRect(-11.6, 9, 23.2, 1);
    ctx.fillRect(-13, -14.6, 26, 0.9);
    ctx.restore();
  }
}

/** A slender sword, pointing up, centred on the origin: about 92 units from pommel to tip. */
function slimSword(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(3, -42);
  ctx.lineTo(3, 22);
  ctx.lineTo(-3, 22);
  ctx.lineTo(-3, -42);
  ctx.closePath();
  ctx.moveTo(-13, 22);
  ctx.quadraticCurveTo(0, 19, 13, 22);
  ctx.lineTo(13, 25.5);
  ctx.quadraticCurveTo(0, 23, -13, 25.5);
  ctx.closePath();
  ctx.rect(-1.8, 25.5, 3.6, 13);
  ctx.moveTo(3.4, 41.5);
  ctx.arc(0, 41.5, 3.4, 0, Math.PI * 2);
  ctx.fill();
}

/** A weapon glyph, about 76 units long, centred on the origin, pointing up and to the right. */
function weapon(ctx: CanvasRenderingContext2D, kind: Card['ace'], scale: number): void {
  ctx.save();
  ctx.scale(scale, scale);
  if (kind === 'all') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 13 : 32;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  if (kind !== 'bow') ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  switch (kind) {
    case 'sword':
      ctx.moveTo(0, -38);
      ctx.lineTo(4.5, -31);
      ctx.lineTo(4.5, 14);
      ctx.lineTo(-4.5, 14);
      ctx.lineTo(-4.5, -31);
      ctx.closePath();
      ctx.rect(-15, 14, 30, 5.5);
      ctx.rect(-2.8, 19.5, 5.6, 13);
      ctx.moveTo(4.5, 36);
      ctx.arc(0, 36, 4.5, 0, Math.PI * 2);
      break;
    case 'spear':
      ctx.moveTo(0, -40);
      ctx.quadraticCurveTo(9, -26, 0, -14);
      ctx.quadraticCurveTo(-9, -26, 0, -40);
      ctx.rect(-2.2, -14, 4.4, 54);
      break;
    case 'lance':
      ctx.moveTo(0, -40);
      ctx.lineTo(7, 12);
      ctx.lineTo(-7, 12);
      ctx.closePath();
      ctx.ellipse(0, 14, 13, 4, 0, 0, Math.PI * 2);
      ctx.rect(-2.5, 16, 5, 22);
      break;
    case 'axe':
      ctx.rect(-2.4, -34, 4.8, 74);
      ctx.moveTo(2, -30);
      ctx.quadraticCurveTo(28, -34, 30, -12);
      ctx.quadraticCurveTo(26, 4, 2, -2);
      ctx.closePath();
      break;
    case 'staff':
      ctx.rect(-2.4, -18, 4.8, 58);
      ctx.moveTo(0, -42);
      ctx.lineTo(8, -30);
      ctx.lineTo(0, -18);
      ctx.lineTo(-8, -30);
      ctx.closePath();
      ctx.moveTo(10, -30);
      ctx.arc(0, -30, 10, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(0, -30, 13, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    case 'bow':
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.arc(-30, 0, 38, -Math.PI / 3.2, Math.PI / 3.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.moveTo(-30 + 38 * Math.cos(Math.PI / 3.2), -38 * Math.sin(Math.PI / 3.2));
      ctx.lineTo(-30 + 38 * Math.cos(Math.PI / 3.2), 38 * Math.sin(Math.PI / 3.2));
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-26, -1.6, 50, 3.2);
      ctx.moveTo(32, 0);
      ctx.lineTo(22, -6);
      ctx.lineTo(22, 6);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.restore();
}
