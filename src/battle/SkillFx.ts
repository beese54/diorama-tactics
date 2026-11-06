import * as THREE from 'three';
import type { ClashSide, SkillId } from '../game/clash';
import { mulberry32 } from '../util/rng';
import type { Who } from './script';

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
 */

/** The skills with an animation of their own (the rest keep the cut-in and the light). */
export const ANIMATED: readonly SkillId[] = ['firestorm', 'volley', 'lance-charge'];

/** A blow a fired skill caused: when it lands, by whom, on whom. */
export interface SkillBlow {
  skill: SkillId;
  by: ClashSide;
  at: number;
  fighter: Who;
  target: Who;
  hit: boolean;
}

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

let shared: { glow: THREE.Texture; ring: THREE.Texture; streak: THREE.Texture; arrow: THREE.Texture; crescent: THREE.Texture } | null = null;

/** The pictures, drawn once: a soft glow, a ring, a streak, an arrow, and a crescent slash (all white, tinted by the material). */
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
  };
  return shared;
}

function quad(map: THREE.Texture, order: number, additive = true): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
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
const SPAN: Partial<Record<SkillId, { before: number; after: number }>> = {
  firestorm: { before: 0.6, after: 1.5 },
  volley: { before: 0.6, after: 0.5 },
  'lance-charge': { before: 0.45, after: 0.6 },
};

export class SkillFx {
  readonly group = new THREE.Group();
  private readonly shows: Show[] = [];
  /** The field's wash while a Firestorm burns; the speed lines while a Lance Charge rides. */
  private readonly wash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly lines: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(private readonly width: () => number, private readonly height: number) {
    const t = textures();
    this.wash = quad(t.glow, OVER - 1, false);
    for (let i = 0; i < 22; i++) this.lines.push(quad(t.streak, OVER - 1, false));
    this.group.add(this.wash, ...this.lines);
  }

  /** How many shows are scheduled, and how many draw now (for checks). */
  get count(): { shows: number; lit: number } {
    return { shows: this.shows.length, lit: this.group.children.filter((m) => m.visible).length };
  }

  /** Schedules the animation of a skill's blow; skills without one are passed over. */
  add(blow: SkillBlow): void {
    if (!ANIMATED.includes(blow.skill)) return;
    const n = this.shows.length;
    const show = blow.skill === 'firestorm' ? this.firestorm(blow, n) : blow.skill === 'volley' ? this.volley(blow, n) : this.lanceCharge(blow, n);
    this.shows.push(show);
  }

  /** Draws every show as it is at `seconds`; `where` says where a fighter stands now. */
  draw(seconds: number, where: (w: Who) => Spot): void {
    for (const s of this.shows) {
      const span = SPAN[s.blow.skill]!;
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
    this.group.add(...trail, core, fireball, heart, ring, flash, ...embers.map((e) => e.m), ...flames.map((f) => f.m));
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
    this.group.add(...arrows.flatMap((a) => [a.m, a.glint]));
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
    this.group.add(crescent, glow, dust);
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
}
