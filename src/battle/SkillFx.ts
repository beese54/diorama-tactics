import * as THREE from 'three';
import type { ClashSide, SkillId } from '../game/clash';
import { mulberry32 } from '../util/rng';
import type { Who } from './script';
import type { SkillBlow } from './skillBlows';

/**
 * Each fired skill's own animation, at the moment it acts (B8, after the user asked for "special
 * animations" when a card's skill is used): drawn over the battle at full resolution, and a pure
 * function of the clock like the rest of the battle. Fire, arrows and the crescent are drawn in
 * their own colours (light added to the bright sky would wash them out white); only their hot
 * cores and glints add light.
 *
 *  - Firestorm: a flaming bolt falls from the caster's side onto every foe, bursting in a fireball
 *    with a ring, embers and flames at the feet, and the field washes orange.
 *  - Volley: a second sky of arrows arcs over and rains down on the foes, each landing in a glint.
 *  - Lance Charge: speed lines rush past the riders, and each second blow lands in a golden
 *    crescent with a ring of dust thrown up round the foe's feet.
 *  - Forced March: gold chevrons rise over every marcher's head as the charge sets off.
 *  - Blade Dance: a flurry of blue slashes across the second foe, and blue petals whirling up.
 *  - Pike Wall: glowing pikes spring up before the struck soldier in a blue wall, angled at the
 *    striker, the blow glancing off them with a clang of sparks.
 *  - Parry: the leader's blades cross in a gold X, and a gold arc turns the blow aside.
 *  - Executioner: the field darkens, a crimson blade drops through the foe's leader and leaves a
 *    crimson X on it.
 *  - Rend: three crimson claws tear across the beaten leader as the battle ends.
 *  - Hold Fast: a golden shield rises over the beaten leader, and holds.
 *  - Trample: the ground bursts under each trampled soldier: a shockwave, dust and stones.
 */

/** Every battle skill has its own animation (All In acts on the map, as its card is played). */
export const ANIMATED: readonly SkillId[] = [
  'firestorm', 'volley', 'lance-charge', 'forced-march', 'blade-dance', 'pike-wall', 'parry', 'executioner', 'rend', 'hold-fast', 'trample',
];
export type { SkillBlow };

/** Where a fighter stands now: its feet (design units) and its height. */
export interface Spot {
  x: number;
  y: number;
  h: number;
}

/** Over every fighter and the blows' bursts. */
const OVER = 100010;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  [c.width, c.height] = [w, h];
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Textures = Record<'glow' | 'ring' | 'streak' | 'arrow' | 'crescent' | 'slash' | 'pike' | 'shield' | 'chevron' | 'rock', THREE.Texture>;
let shared: Textures | null = null;

/**
 * The pictures, drawn once: a soft glow, a ring, a streak, an arrow, a crescent slash and a
 * tapered slash (white, tinted by the material); a pike, a shield, a chevron and a stone (in their
 * own colours, with dark edges to read on a bright field).
 */
function textures() {
  shared ??= {
    glow: canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }),
    ring: canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 38, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }),
    streak: canvasTexture(128, 16, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 6, 128, 4);
    }),
    // An arrow flying to the right: a fading shaft, a bright head, the fletching at the tail.
    arrow: canvasTexture(128, 16, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 7, 120, 2);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.moveTo(128, 8);
      ctx.lineTo(114, 3);
      ctx.lineTo(114, 13);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(4, 4, 10, 2);
      ctx.fillRect(4, 10, 10, 2);
    }),
    // A crescent slash, bright along its outer edge and thinning to points.
    crescent: canvasTexture(256, 256, (ctx) => {
      ctx.translate(128, 128);
      for (let i = 0; i < 24; i++) {
        const k = i / 23;
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + 0.9 * k * k})`;
        ctx.lineWidth = 3 + 14 * (1 - k);
        ctx.beginPath();
        ctx.arc(0, 0, 70 + 44 * k, -Math.PI * 0.8, Math.PI * 0.05);
        ctx.stroke();
      }
    }),
    // A blade's cut: thick in the middle, tapering to points (pointing along x).
    slash: canvasTexture(256, 32, (ctx) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.quadraticCurveTo(128, -14, 256, 16);
      ctx.quadraticCurveTo(128, 46, 0, 16);
      ctx.fill();
    }),
    // A pike pointing along x: an ash shaft, an iron cross-piece, a bright leaf blade.
    pike: canvasTexture(256, 32, (ctx) => {
      ctx.fillStyle = '#3a2614';
      ctx.fillRect(0, 12, 200, 8);
      ctx.fillStyle = '#9a7048';
      ctx.fillRect(0, 14, 200, 4);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(190, 6, 8, 20);
      ctx.beginPath();
      ctx.moveTo(196, 16);
      ctx.quadraticCurveTo(222, 0, 256, 16);
      ctx.quadraticCurveTo(222, 32, 196, 16);
      ctx.fillStyle = '#e8eef8';
      ctx.fill();
      ctx.strokeStyle = '#30343c';
      ctx.lineWidth = 2;
      ctx.stroke();
    }),
    // A heater shield in gold, a dark rim and a pale cross.
    shield: canvasTexture(128, 128, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(14, 12);
      ctx.lineTo(114, 12);
      ctx.lineTo(114, 58);
      ctx.quadraticCurveTo(110, 100, 64, 122);
      ctx.quadraticCurveTo(18, 100, 14, 58);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 12, 0, 122);
      g.addColorStop(0, '#fff3b8');
      g.addColorStop(1, '#d89a28');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#6a4208';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,252,236,0.9)';
      ctx.fillRect(56, 24, 16, 80);
      ctx.fillRect(30, 46, 68, 14);
    }),
    // An upward chevron, dark-edged.
    chevron: canvasTexture(128, 64, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(8, 56);
      ctx.lineTo(64, 8);
      ctx.lineTo(120, 56);
      ctx.lineTo(94, 56);
      ctx.lineTo(64, 31);
      ctx.lineTo(34, 56);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,40,10,0.9)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }),
    // A broken stone.
    rock: canvasTexture(32, 32, (ctx) => {
      ctx.beginPath();
      [[6, 10], [14, 3], [26, 7], [29, 18], [22, 28], [9, 27], [3, 18]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }),
  };
  return shared;
}

function quad(map: THREE.Texture | null, order: number, additive = true): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  m.renderOrder = order;
  m.visible = false;
  m.frustumCulled = false;
  return m;
}

/** Shows `m` at (x, y), `w` by `h`, turned `angle`, in `color` at `alpha`; hides it at alpha 0. */
function put(m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, x: number, y: number, w: number, h: number, color: number, alpha: number, angle = 0): void {
  m.visible = alpha > 0.002 && w !== 0 && h !== 0;
  if (!m.visible) return;
  m.position.set(x, y, 0);
  m.scale.set(w, h, 1);
  m.rotation.z = angle;
  m.material.color.setHex(color);
  m.material.opacity = alpha;
}

/** One skill blow's animation: its meshes, and how they look at a moment. */
interface Show {
  blow: SkillBlow;
  draw(seconds: number, target: Spot, from: Spot): void;
}

/** How long before its blow lands a show begins, and how long after it lingers. */
const SPAN: Record<SkillId, { before: number; after: number }> = {
  firestorm: { before: 0.6, after: 1.5 },
  volley: { before: 0.6, after: 0.5 },
  'lance-charge': { before: 0.45, after: 0.6 },
  'forced-march': { before: 0, after: 1.3 },
  'blade-dance': { before: 0.02, after: 0.9 },
  'pike-wall': { before: 0.08, after: 0.6 },
  parry: { before: 0.04, after: 0.5 },
  executioner: { before: 0.4, after: 0.9 },
  rend: { before: 0, after: 1 },
  'hold-fast': { before: 0, after: 1.7 },
  trample: { before: 0, after: 1 },
};

/** Forward for a side: right for the attacker (on the left), left for the defender. */
const fwd = (side: ClashSide) => (side === 'attacker' ? 1 : -1);

export class SkillFx {
  readonly group = new THREE.Group();
  /**
   * Two layers. three.js sorts by the nearest group's render order before a mesh's own, and each
   * fighter's figure is a group ordered by its rank: so the ground's pieces (rings and dust at the
   * feet, the field's wash, the speed lines) go in `back`, drawn before the fighters, and the rest
   * in `front`, drawn over every one of them.
   */
  private readonly back = new THREE.Group();
  private readonly front = new THREE.Group();
  private readonly shows: Show[] = [];
  /** The field's wash while a Firestorm burns; the speed lines while a Lance Charge rides. */
  private readonly wash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly lines: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(private readonly width: () => number, private readonly height: number) {
    const t = textures();
    this.wash = quad(t.glow, OVER - 1, false);
    for (let i = 0; i < 22; i++) this.lines.push(quad(t.streak, OVER - 1, false));
    this.front.renderOrder = OVER;
    this.group.add(this.back, this.front);
    this.back.add(this.wash, ...this.lines);
  }

  /** How many shows are scheduled, and how many draw now (for checks). */
  get count(): { shows: number; lit: number } {
    return { shows: this.shows.length, lit: [...this.back.children, ...this.front.children].filter((m) => m.visible).length };
  }

  /** Schedules the animation of a skill's blow; skills without one are passed over. */
  add(blow: SkillBlow): void {
    const n = this.shows.length;
    const make: Record<SkillId, (b: SkillBlow, n: number) => Show> = {
      firestorm: this.firestorm, volley: this.volley, 'lance-charge': this.lanceCharge, 'forced-march': this.forcedMarch, 'blade-dance': this.bladeDance,
      'pike-wall': this.pikeWall, parry: this.parry, executioner: this.executioner, rend: this.rend, 'hold-fast': this.holdFast, trample: this.trample,
    };
    this.shows.push(make[blow.skill].call(this, blow, n));
  }

  /** Draws every show as it is at `seconds`; `where` says where a fighter stands now. */
  draw(seconds: number, where: (w: Who) => Spot): void {
    for (const s of this.shows) {
      const span = SPAN[s.blow.skill];
      if (seconds < s.blow.at - span.before || seconds > s.blow.at + span.after) s.draw(-Infinity, where(s.blow.target), where(s.blow.fighter));
      else s.draw(seconds, where(s.blow.target), where(s.blow.fighter));
    }
    this.drawWash(seconds);
    this.drawLines(seconds, where);
  }

  /** The orange wash over the field while any Firestorm burns: in as the bolts fall, out after the last blast. */
  private drawWash(seconds: number): void {
    const fires = this.shows.filter((s) => s.blow.skill === 'firestorm').map((s) => s.blow.at);
    if (!fires.length) return put(this.wash, 0, 0, 0, 0, 0, 0);
    const [first, last] = [Math.min(...fires), Math.max(...fires)];
    const up = smooth(clamp01((seconds - (first - 0.6)) / 0.5));
    const down = 1 - smooth(clamp01((seconds - (last + 0.4)) / 1));
    put(this.wash, 0, 0, this.width() * 2.6, this.height * 2.6, 0xff4a10, 0.3 * up * down);
  }

  /** Speed lines streaming past while a Lance Charge rides in: against the charge, across the riders' band. */
  private drawLines(seconds: number, where: (w: Who) => Spot): void {
    const charges = this.shows.filter((s) => s.blow.skill === 'lance-charge');
    if (!charges.length) {
      for (const l of this.lines) l.visible = false;
      return;
    }
    const at = charges.map((s) => s.blow.at);
    const [first, last] = [Math.min(...at), Math.max(...at)];
    const t = seconds - (first - 0.5);
    const alpha = clamp01(t / 0.15) * (1 - clamp01((seconds - last) / 0.25));
    const dir = charges[0].blow.by === 'attacker' ? 1 : -1;
    const target = where(charges[0].blow.target);
    const w = this.width();
    const rand = mulberry32(911);
    for (const l of this.lines) {
      const [y, speed, len, phase] = [target.y + (rand() - 0.2) * target.h * 1.4, 2600 + rand() * 1800, 160 + rand() * 260, rand()];
      // Each line sweeps across the screen against the charge, over and over.
      const x = dir * (w / 2 - (((t * speed) / w + phase) % 1.2) * w * 1.2 + w * 0.1);
      put(l, x, y, len, 8, 0xfff8ec, alpha * 0.8, dir > 0 ? Math.PI : 0);
    }
  }

  /** A flaming bolt from the caster's side onto the foe, bursting in a fireball, a ring, embers and flames at the feet. */
  private firestorm(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(7919 * (n + 1));
    const trail = Array.from({ length: 10 }, () => quad(t.glow, OVER + 1, false));
    const core = quad(t.glow, OVER + 2);
    const fireball = quad(t.glow, OVER + 1, false);
    const heart = quad(t.glow, OVER + 2);
    const ring = quad(t.ring, OVER, false);
    const flash = quad(t.glow, OVER + 3);
    const embers = Array.from({ length: 18 }, () => ({ m: quad(t.glow, OVER + 2, false), vx: (rand() - 0.5) * 640, vy: 300 + rand() * 620, size: 12 + rand() * 16 }));
    const flames = Array.from({ length: 6 }, (_, i) => ({ m: quad(t.glow, OVER, false), dx: (i - 2.5) * 30 + (rand() - 0.5) * 14, phase: rand() * 6 }));
    // A miss still falls, a little off the mark, and bursts smaller.
    const off = blow.hit ? 0 : (rand() - 0.5) * 120;
    const big = blow.hit ? 1 : 0.6;
    const delay = rand() * 0.08;
    this.back.add(ring);
    this.front.add(...trail, core, fireball, heart, flash, ...embers.map((e) => e.m), ...flames.map((f) => f.m));
    const dir = blow.by === 'attacker' ? 1 : -1;
    return {
      blow,
      draw: (seconds, target) => {
        const age = seconds - blow.at - delay;
        const [tx, ty] = [target.x + off, target.y + target.h * 0.35];
        // The bolt: down from high on the caster's side, landing as the blow does.
        const fall = 0.55;
        const pos = (a: number) => {
          const k = clamp01((a + fall) / fall);
          return { x: tx - dir * 520 * (1 - k), y: ty + 1000 * (1 - k) * (1 - k * 0.25), k };
        };
        const falling = age > -fall && age < 0;
        const p = pos(age);
        put(core, p.x, p.y, 110 * big, 110 * big, 0xffe8b0, falling ? 1 : 0);
        trail.forEach((m, i) => {
          const q = pos(age - (i + 1) * 0.03);
          const s = (150 - i * 11) * big;
          put(m, q.x, q.y, s, s, i < 2 ? 0xffa020 : i < 5 ? 0xff5a10 : 0xb02808, falling && q.k > 0 ? 0.95 * (1 - i / trail.length) : 0);
        });
        // The burst.
        const b = age >= 0 ? age : -1;
        put(flash, tx, ty, 420 * big, 420 * big, 0xffffff, b >= 0 ? 0.9 * (1 - clamp01(b / 0.15)) : 0);
        const swell = (160 + 380 * smooth(clamp01(b / 0.35))) * big;
        put(fireball, tx, ty, swell, swell, b < 0.25 ? 0xff7a10 : 0xd03808, b >= 0 ? 0.95 * (1 - clamp01((b - 0.2) / 0.6)) : 0);
        put(heart, tx, ty, swell * 0.5, swell * 0.5, 0xffd060, b >= 0 ? 1 - clamp01(b / 0.4) : 0);
        put(ring, tx, target.y + 6, 640 * smooth(clamp01(b / 0.45)) * big, 180 * smooth(clamp01(b / 0.45)) * big, 0xff5a10, b >= 0 ? 0.85 * (1 - clamp01(b / 0.5)) : 0);
        for (const e of embers) {
          const life = 1.1;
          const k = b / life;
          const [x, y] = [tx + e.vx * b, ty + e.vy * b - 520 * b * b];
          put(e.m, x, y, e.size * big, e.size * big, k < 0.3 ? 0xffc030 : k < 0.6 ? 0xff6010 : 0x902008, b >= 0 && k < 1 ? 1 - k * k : 0);
        }
        // Flames licking at the feet, guttering out.
        for (const f of flames) {
          const flick = 0.75 + 0.25 * Math.sin(seconds * 23 + f.phase) * Math.sin(seconds * 11 + f.phase * 2);
          const k = clamp01(b / 1.4);
          const h = 210 * flick * (1 - k) * big;
          put(f.m, target.x + off + f.dx, target.y + h * 0.4, 60 * big, h, f.phase > 3 ? 0xff7a10 : 0xff4a08, b >= 0.05 ? 0.9 * (1 - k) : 0);
        }
      },
    };
  }

  /** A second sky of arrows: a sheaf arcs over from the archers and rains down round the foe, each landing in a glint. */
  private volley(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(104729 * (n + 1));
    const arrows = Array.from({ length: 7 }, () => ({ m: quad(t.arrow, OVER + 1, false), glint: quad(t.glow, OVER + 2), dx: (rand() - 0.5) * 170, dy: (rand() - 0.5) * 40, lag: (rand() - 0.5) * 0.14, height: 260 + rand() * 160 }));
    this.front.add(...arrows.flatMap((a) => [a.m, a.glint]));
    const dir = blow.by === 'attacker' ? 1 : -1;
    return {
      blow,
      draw: (seconds, target, from) => {
        for (const a of arrows) {
          const flight = 0.55;
          const age = seconds - (blow.at + a.lag);
          const k = (age + flight) / flight;
          const [x0, y0] = [from.x + dir * 40, from.y + from.h * 0.7];
          const [x1, y1] = [target.x + a.dx, target.y + 10 + a.dy];
          // A high arc: up from the bow and steeply down onto the foe.
          const at = (q: number) => ({ x: x0 + (x1 - x0) * q, y: y0 + (y1 - y0) * q + a.height * 4 * q * (1 - q) });
          const flying = k > 0 && k < 1;
          if (flying) {
            const [p, q] = [at(k), at(Math.min(1, k + 0.02))];
            put(a.m, p.x, p.y, 190, 22, 0x2a1c10, 1, Math.atan2(q.y - p.y, q.x - p.x));
          } else put(a.m, 0, 0, 0, 0, 0, 0);
          const g = age >= 0 ? age : -1;
          put(a.glint, x1, y1 + 8, 110, 110, 0xfff0c0, g >= 0 ? 1 - clamp01(g / 0.3) : 0);
        }
      },
    };
  }

  /** The second blow of a Lance Charge: a golden crescent across the foe and a ring of dust thrown up round its feet. */
  private lanceCharge(blow: SkillBlow, n: number): Show {
    const t = textures();
    const crescent = quad(t.crescent, OVER + 2, false);
    const glow = quad(t.glow, OVER + 1);
    const dust = quad(t.ring, OVER, false);
    const tilt = (n % 2 ? 0.5 : -0.35) + 0.15 * Math.sin(n * 2.3);
    this.back.add(dust);
    this.front.add(crescent, glow);
    const dir = blow.by === 'attacker' ? 1 : -1;
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const live = b >= -0.04;
        const k = clamp01((b + 0.04) / 0.32);
        const size = (300 + 220 * smooth(k)) * (blow.hit ? 1 : 0.7);
        const [x, y] = [target.x, target.y + target.h * 0.5];
        const c = put.bind(null, crescent);
        c(x, y, size * dir, size, 0xffb020, live ? 1 - k * k : 0, tilt * dir);
        put(glow, x, y, 340, 340, 0xffe0a0, live ? 0.9 * (1 - clamp01(b / 0.2)) : 0);
        const d = clamp01(b / 0.55);
        put(dust, x, target.y + 4, 160 + 620 * smooth(d), 50 + 150 * smooth(d), 0xb89060, b >= 0 ? 0.85 * (1 - d) : 0);
      },
    };
  }

  /** Forced March: gold chevrons rising over the marcher's head as the charge sets off, a glow underfoot. */
  private forcedMarch(blow: SkillBlow, n: number): Show {
    const t = textures();
    const chevrons = Array.from({ length: 3 }, () => quad(t.chevron, OVER + 1, false));
    const ground = quad(t.glow, OVER - 1, false);
    this.back.add(ground);
    this.front.add(...chevrons);
    const delay = (n % 8) * 0.05;
    return {
      blow,
      draw: (seconds, me) => {
        const b = seconds - blow.at - delay;
        chevrons.forEach((c, i) => {
          const k = (b - i * 0.16) / 0.8;
          const y = me.y + me.h * (0.55 + 0.75 * smooth(clamp01(k)));
          put(c, me.x, y, 150, 75, 0xffe23a, k >= 0 && k < 1 ? Math.min(1, k * 5) * (1 - k * k * k) : 0);
        });
        put(ground, me.x, me.y + 6, 300, 80, 0xfff09a, b >= 0 ? 0.8 * (1 - clamp01(b / 1.1)) : 0);
      },
    };
  }

  /** Blade Dance: a flurry of five blue slashes across the second foe, one after another, and blue petals whirling up. */
  private bladeDance(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(31337 * (n + 1));
    const cuts = Array.from({ length: 5 }, (_, i) => ({ m: quad(t.slash, OVER + 1, false), core: quad(t.slash, OVER + 2), angle: [0.55, -0.6, 1.35, -1.25, 0.1][i] + (rand() - 0.5) * 0.3, dx: (rand() - 0.5) * 50, dy: (rand() - 0.5) * 70 }));
    const petals = Array.from({ length: 12 }, (_, i) => ({ m: quad(t.glow, OVER + 2, false), turn: rand() * Math.PI * 2, spin: 4 + rand() * 4, rise: 220 + rand() * 200, light: i % 2 === 0 }));
    this.front.add(...cuts.flatMap((c) => [c.m, c.core]), ...petals.map((p) => p.m));
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const [cx, cy] = [target.x, target.y + target.h * 0.5];
        cuts.forEach((c, i) => {
          const a = b - i * 0.045;
          const grow = smooth(clamp01(a / 0.06));
          const alpha = a >= 0 ? 1 - clamp01((a - 0.06) / 0.3) : 0;
          put(c.m, cx + c.dx, cy + c.dy, 480 * grow, 50, 0x2f9cff, alpha, c.angle);
          put(c.core, cx + c.dx, cy + c.dy, 450 * grow, 14, 0xffffff, alpha, c.angle);
        });
        for (const p of petals) {
          const k = clamp01(b / 0.85);
          const angle = p.turn + b * p.spin;
          const r = 50 + 200 * smooth(k);
          put(p.m, cx + Math.cos(angle) * r, cy - 40 + p.rise * k + Math.sin(angle) * r * 0.35, 32, 20, p.light ? 0xd8f0ff : 0x3aa8ff, b >= 0.05 ? 1 - k * k : 0, angle);
        }
      },
    };
  }

  /** Pike Wall: pikes spring up before the struck soldier, angled at the striker, a pale wall behind them, and the blow glancing off in sparks. */
  private pikeWall(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(4243 * (n + 1));
    // Three pikes a blow: a whole charge turned aside lands many blows at once, and the wall must not hide the squad.
    const pikes = Array.from({ length: 3 }, () => ({ m: quad(t.pike, OVER + 1, false), halo: quad(t.slash, OVER, false) }));
    const wall = quad(t.glow, OVER - 1, false);
    const core = quad(t.glow, OVER);
    const ring = quad(t.ring, OVER + 2, false);
    const clang = quad(t.glow, OVER + 3);
    const sparks = Array.from({ length: 10 }, () => ({ m: quad(t.glow, OVER + 2, false), vx: 200 + rand() * 420, vy: 140 + rand() * 420 }));
    this.front.add(wall, core, ...pikes.flatMap((p) => [p.halo, p.m]), ring, clang, ...sparks.map((s) => s.m));
    // The striker comes on `d`: the wall stands on the struck soldier's side facing it.
    const d = fwd(blow.by);
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const wx = target.x - d * 90;
        const up = smooth(clamp01((b + 0.08) / 0.1));
        const alpha = b >= -0.08 ? 1 - clamp01((b - 0.2) / 0.25) : 0;
        // Each pike leans out at the striker: up and towards it.
        const angle = d > 0 ? Math.PI - 0.95 : 0.95;
        const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
        pikes.forEach((p, i) => {
          const len = target.h * 1.1 * up;
          const [bx, by] = [wx + d * (i - 1) * 34, target.y + (i % 2) * 16];
          const [mx, my] = [bx + (ux * len) / 2, by + (uy * len) / 2];
          put(p.halo, mx, my, len * 1.05, 52, 0x4a98ff, 0.6 * alpha, angle);
          put(p.m, mx, my, len, 34, 0xffffff, alpha, angle);
        });
        put(wall, wx, target.y + target.h * 0.6, 200, target.h * 1.6, 0x5a9cff, 0.45 * alpha * up);
        put(core, wx, target.y + target.h * 0.6, 70, target.h * 1.3, 0xcfe4ff, 0.4 * alpha * up);
        const [ix, iy] = [wx - d * 30, target.y + target.h * 0.6];
        const r = clamp01(b / 0.25);
        put(ring, ix, iy, 80 + 260 * smooth(r), 80 + 260 * smooth(r), 0xbfe0ff, b >= 0 ? 0.95 * (1 - r) : 0);
        put(clang, ix, iy, 260, 260, 0xffffff, b >= 0 ? 0.9 * (1 - clamp01(b / 0.12)) : 0);
        for (const s of sparks) {
          const k = clamp01(b / 0.45);
          put(s.m, ix - d * s.vx * b, iy + s.vy * b - 900 * b * b, 20, 20, 0xffc840, b >= 0 && k < 1 ? 1 - k : 0);
        }
      },
    };
  }

  /** Parry: the leader's blades cross in a gold X, a gold arc turns the blow aside, and sparks fly back at the striker. */
  private parry(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(6007 * (n + 1));
    const blades = Array.from({ length: 2 }, () => ({ edge: quad(t.slash, OVER + 1, false), m: quad(t.slash, OVER + 2, false), core: quad(t.slash, OVER + 3) }));
    const arc = quad(t.crescent, OVER + 1, false);
    const sparks = Array.from({ length: 9 }, () => ({ m: quad(t.glow, OVER + 2, false), vx: 260 + rand() * 420, vy: 160 + rand() * 460 }));
    this.front.add(arc, ...blades.flatMap((b) => [b.edge, b.m, b.core]), ...sparks.map((s) => s.m));
    const d = fwd(blow.by);
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const [px, py] = [target.x - d * 40, target.y + target.h * 0.6];
        const grow = smooth(clamp01((b + 0.04) / 0.08));
        const alpha = b >= -0.04 ? 1 - clamp01((b - 0.12) / 0.3) : 0;
        blades.forEach((bl, i) => {
          const angle = (i ? -1 : 1) * (0.75 + 0.15 * smooth(clamp01(b / 0.3)));
          // Gold on a dark edge: it has to read over the leader's armour and the blows' white trails.
          put(bl.edge, px, py, 330 * grow, 58, 0x141a2c, 0.85 * alpha, angle);
          put(bl.m, px, py, 305 * grow, 36, 0xffc630, alpha, angle);
          put(bl.core, px, py, 270 * grow, 9, 0xffffff, alpha, angle);
        });
        const k = clamp01(b / 0.35);
        put(arc, px - d * 30, py, -d * (260 + 160 * smooth(k)), 260 + 160 * smooth(k), 0xffd860, b >= 0 ? 1 - k : 0);
        for (const s of sparks) {
          const q = clamp01(b / 0.45);
          put(s.m, px - d * s.vx * b, py + s.vy * b - 1000 * b * b, 15, 15, 0xfff0b0, b >= 0 && q < 1 ? 1 - q : 0);
        }
      },
    };
  }

  /** Executioner: the field darkens, a crimson blade drops through the foe's leader, leaving a crimson X, and red shards burst from the blow. */
  private executioner(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(9001 * (n + 1));
    const dark = quad(null, OVER - 2, false);
    const blade = quad(t.slash, OVER + 2, false);
    const edge = quad(t.slash, OVER + 3);
    const mark = Array.from({ length: 2 }, () => ({ m: quad(t.slash, OVER + 2, false), core: quad(t.slash, OVER + 3, false) }));
    const flash = quad(t.glow, OVER + 3);
    const crack = quad(t.ring, OVER, false);
    const shards = Array.from({ length: 12 }, () => ({ m: quad(t.slash, OVER + 2, false), vx: (rand() - 0.5) * 900, vy: 200 + rand() * 500, spin: (rand() - 0.5) * 14 }));
    // The dark falls on the field behind the fighters: they stand out lit against it.
    this.back.add(dark, crack);
    this.front.add(blade, edge, ...mark.flatMap((x) => [x.m, x.core]), flash, ...shards.map((s) => s.m));
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const ty = target.y + target.h * 0.5;
        const dim = smooth(clamp01((b + 0.4) / 0.25)) * (1 - smooth(clamp01((b - 0.35) / 0.5)));
        put(dark, 0, 0, this.width() * 1.2, this.height * 1.2, 0x10040a, 0.55 * dim);
        // The blade falls through the last 0.22 s and cuts on down through the leader, gone in a blink.
        const fall = clamp01((b + 0.22) / 0.22);
        const y = b < 0 ? ty + 900 * (1 - fall * fall) : ty - 420 * smooth(clamp01(b / 0.12));
        const alpha = b >= -0.22 ? 1 - clamp01(b / 0.14) : 0;
        put(blade, target.x, y, 760, 90, 0xa00c1e, alpha, Math.PI / 2);
        put(edge, target.x, y, 640, 12, 0xffb0b0, alpha, Math.PI / 2);
        // The doom left on the leader: a crimson X, struck at once and slow to fade.
        mark.forEach((x, i) => {
          const a = b - 0.03 - i * 0.05;
          const grow = smooth(clamp01(a / 0.07));
          const fade = a >= 0 ? 1 - clamp01((a - 0.45) / 0.4) : 0;
          const angle = i ? -0.8 : 0.8;
          put(x.m, target.x, ty, 460 * grow, 64, 0xb3102a, fade, angle);
          put(x.core, target.x, ty, 420 * grow, 16, 0x2a0006, fade, angle);
        });
        put(flash, target.x, ty, 520, 520, 0xff5050, b >= 0 ? 0.9 * (1 - clamp01(b / 0.2)) : 0);
        const r = clamp01(b / 0.5);
        put(crack, target.x, target.y + 6, 120 + 700 * smooth(r), 40 + 180 * smooth(r), 0x70101c, b >= 0 ? 0.9 * (1 - r) : 0);
        for (const s of shards) {
          const k = clamp01(b / 0.7);
          put(s.m, target.x + s.vx * b, ty + s.vy * b - 900 * b * b, 70, 14, 0xc0102a, b >= 0 && k < 1 ? 1 - k : 0, s.spin * b);
        }
      },
    };
  }

  /** Rend: three crimson claws tear across the beaten leader one after another, and red drops fall from the tears. */
  private rend(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(2711 * (n + 1));
    const claws = Array.from({ length: 3 }, () => ({ m: quad(t.slash, OVER + 1, false), core: quad(t.slash, OVER + 2, false) }));
    const glow = quad(t.glow, OVER);
    const drops = Array.from({ length: 12 }, () => ({ m: quad(t.glow, OVER + 2, false), x: (rand() - 0.5) * 260, y: (rand() - 0.5) * 200, vy: rand() * 120 }));
    this.front.add(glow, ...claws.flatMap((c) => [c.m, c.core]), ...drops.map((d) => d.m));
    const d = fwd(blow.by);
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const [cx, cy] = [target.x, target.y + target.h * 0.55];
        const angle = d * -0.85;
        const [nx, ny] = [-Math.sin(angle), Math.cos(angle)];
        claws.forEach((c, i) => {
          const a = b - i * 0.07;
          const grow = smooth(clamp01(a / 0.09));
          const alpha = a >= 0 ? 1 - clamp01((a - 0.45) / 0.4) : 0;
          const off = (i - 1) * 46;
          put(c.m, cx + nx * off, cy + ny * off, 460 * grow, 40, 0xc8142a, alpha, angle);
          put(c.core, cx + nx * off, cy + ny * off, 420 * grow, 12, 0x3a0008, alpha, angle);
        });
        put(glow, cx, cy, 420, 420, 0xff3020, b >= 0 ? 0.7 * (1 - clamp01(b / 0.3)) : 0);
        for (const p of drops) {
          const k = clamp01((b - 0.1) / 0.8);
          put(p.m, cx + p.x, cy + p.y - p.vy * k - 420 * k * k, 14, 20, 0x9a0818, b > 0.1 && k < 1 ? 1 - k : 0);
        }
      },
    };
  }

  /** Hold Fast: a golden shield rises over the beaten leader and holds, glinting, a glow behind it. */
  private holdFast(blow: SkillBlow, n: number): Show {
    const t = textures();
    const shield = quad(t.shield, OVER + 1, false);
    const halo = quad(t.glow, OVER);
    const dome = quad(t.ring, OVER, false);
    const glints = Array.from({ length: 6 }, () => quad(t.glow, OVER + 2));
    this.front.add(halo, dome, shield, ...glints);
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        // Over the leader's head, clear of its face.
        const [x, y] = [target.x, target.y + target.h * 1.05];
        // Up with a little overshoot, held, then gone.
        const k = clamp01(b / 0.25);
        const pop = k < 1 ? smooth(k) * (1 + 0.25 * Math.sin(Math.PI * k)) : 1;
        const alpha = b >= 0 ? 1 - clamp01((b - 1.1) / 0.5) : 0;
        put(shield, x, y + 30 * pop, 260 * pop, 260 * pop, 0xffffff, alpha);
        put(halo, x, y + 30 * pop, 480 * pop, 480 * pop, 0xffe090, 0.8 * alpha);
        put(dome, x, target.y + target.h * 0.45, 600 * pop, 520 * pop, 0xffd050, 0.6 * alpha);
        glints.forEach((g, i) => {
          const a = (i / glints.length) * Math.PI * 2 + b * 2.4 + n;
          put(g, x + Math.cos(a) * 170 * pop, y + 30 + Math.sin(a) * 150 * pop, 50, 50, 0xfff4c0, alpha * (0.6 + 0.4 * Math.sin(b * 12 + i)));
        });
      },
    };
  }

  /** Trample: the ground bursts under the trampled soldier: a shockwave ring, a crack, dust clouds and stones flung up. */
  private trample(blow: SkillBlow, n: number): Show {
    const t = textures();
    const rand = mulberry32(5153 * (n + 1));
    const wave = quad(t.ring, OVER, false);
    const crack = quad(t.slash, OVER, false);
    const dust = Array.from({ length: 5 }, () => ({ m: quad(t.glow, OVER + 1, false), dx: (rand() - 0.5) * 220, rise: 60 + rand() * 120, size: 220 + rand() * 160 }));
    const stones = Array.from({ length: 10 }, () => ({ m: quad(t.rock, OVER + 2, false), vx: (rand() - 0.5) * 760, vy: 380 + rand() * 520, size: 18 + rand() * 22, spin: (rand() - 0.5) * 18 }));
    this.back.add(wave, crack);
    this.front.add(...dust.map((d) => d.m), ...stones.map((s) => s.m));
    return {
      blow,
      draw: (seconds, target) => {
        const b = seconds - blow.at;
        const live = b >= 0;
        const w = clamp01(b / 0.45);
        put(wave, target.x, target.y + 4, 140 + 900 * smooth(w), 50 + 260 * smooth(w), 0x5a3e1e, live ? 0.95 * (1 - w) : 0);
        const c = clamp01(b / 0.12);
        put(crack, target.x, target.y + 2, 520 * smooth(c), 24, 0x24180c, live ? 0.95 * (1 - clamp01((b - 0.45) / 0.5)) : 0, 0.05);
        for (const d of dust) {
          const k = clamp01(b / 0.95);
          const s = d.size * 1.4 * (0.4 + 0.6 * smooth(k));
          put(d.m, target.x + d.dx * (0.5 + k), target.y + 50 + d.rise * k, s, s * 0.7, 0x9a7c52, live ? 0.85 * (1 - k) : 0);
        }
        for (const s of stones) {
          const k = clamp01(b / 0.9);
          const y = target.y + 20 + s.vy * b - 1700 * b * b;
          put(s.m, target.x + s.vx * b, y, s.size * 1.6, s.size * 1.6, 0x5a4228, live && k < 1 && y > target.y - 10 ? 1 : 0, s.spin * b);
        }
      },
    };
  }
}
