import * as THREE from 'three';
import type { SkillId } from '../game/clash';
import type { Weapon } from '../game/units';
import { dustTexture } from './cast';

/**
 * The battle effects (B8's art pass), drawn on each fighter like its dust, as a pure function of
 * the clock: where a blow lands, a burst of sparks, a ring and a flash (bigger on a crit); on the
 * charge, a trail of dust behind the runner; and while its side's skill is in play, a slow pulse
 * of light around it in the skill's colour. Additive light over the smooth art, at full resolution.
 */

/** How each weapon's blow sparks: its colour, how many sparks, how long they streak, how big the burst. */
const SPARK: Record<Weapon, { color: number; count: number; streak: number; size: number }> = {
  sword: { color: 0xfff0c0, count: 10, streak: 1, size: 1 },
  axe: { color: 0xffa040, count: 12, streak: 0.8, size: 1.3 },
  spear: { color: 0xe0f0ff, count: 8, streak: 1.8, size: 0.9 },
  lance: { color: 0xe0f0ff, count: 9, streak: 2, size: 1.1 },
  bow: { color: 0xffe6a0, count: 6, streak: 1, size: 0.6 },
  staff: { color: 0xc8a0ff, count: 10, streak: 0.6, size: 0.9 },
};

/** Each skill's light. */
export const AURA: Record<SkillId, number> = {
  'forced-march': 0x9fe0a0,
  'lance-charge': 0xffd070,
  volley: 0xc8f0ff,
  'blade-dance': 0x9fd8ff,
  'pike-wall': 0xdfe6f0,
  firestorm: 0xff7a2a,
  'hold-fast': 0xffe08a,
  rend: 0xff5a3a,
  parry: 0xa0c8ff,
  trample: 0xd09a50,
  executioner: 0xc0182a,
};

/** How long a blow's burst lasts, and a charge's dust puffs. */
const HIT_LIFE = 0.42;
export const TRAIL = { every: 0.07, life: 0.6, puffs: 12 };

let shared: { glow: THREE.Texture; ring: THREE.Texture; spark: THREE.Texture; star: THREE.Texture; dust: THREE.Texture } | null = null;

/** Over every fighter (their render orders run to about 10 000 by depth). */
const OVER = 100000;

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The pictures, drawn once: a soft glow, a thin ring, a spark's streak (white, tinted by the material), and dust. */
function textures() {
  shared ??= {
    glow: canvasTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }),
    ring: canvasTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }),
    spark: canvasTexture(64, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0.2)');
      ctx.fillStyle = g;
      ctx.fillRect(0, s * 0.4, s, s * 0.2);
    }),
    // A four-pointed star: the bright instant a blow lands.
    star: canvasTexture(256, (ctx, s) => {
      const c = s / 2;
      const glow = ctx.createRadialGradient(c, c, 0, c, c, c * 0.45);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, s, s);
      for (const [len, w, turn] of [[c, c * 0.09, 0], [c * 0.62, c * 0.06, Math.PI / 4]] as const) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(turn);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, -w);
          ctx.lineTo(len, 0);
          ctx.lineTo(0, w);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }),
    dust: dustTexture(),
  };
  return shared;
}

const quad = (map: THREE.Texture, additive: boolean, order: number) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  m.renderOrder = order;
  m.visible = false;
  return m;
};

/** A fixed pseudo-random number for spark `i` (and a salt): the same burst every time. */
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** One fighter's effects. The group goes in its figure's group (local units: design units, x toward its foe, y up from the ground). */
export class Impact {
  readonly group = new THREE.Group();
  private readonly sparks: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly flash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly star: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly puffs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly aura: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Bursts shown (a burst counts once, on the frame it starts), for checks. */
  bursts = 0;
  private lastBurst = -1;

  /** `height`: the fighter's standing height in design units (the burst sits at its chest). */
  constructor(private readonly height: number) {
    const t = textures();
    // The burst over every fighter; the dust and the aura under the figure, with its shadow.
    for (let i = 0; i < 14; i++) this.sparks.push(quad(t.spark, true, OVER + 2));
    this.ring = quad(t.ring, true, OVER);
    this.flash = quad(t.glow, true, OVER + 1);
    this.star = quad(t.star, false, OVER + 3);
    for (let i = 0; i < TRAIL.puffs; i++) this.puffs.push(quad(t.dust, false, 1));
    this.aura = quad(t.glow, true, 1);
    this.group.add(this.aura, ...this.puffs, this.ring, this.flash, ...this.sparks, this.star);
  }

  /**
   * A blow's burst `age` seconds after it landed (none if negative or over), at body `x` (the
   * fighter's own offset): its weapon's sparks, a ring and a flash, bigger on a crit; a blow
   * blocked only sparks. `start`: when it landed, to count each burst once.
   */
  hit(age: number, x: number, weapon: Weapon, crit: boolean, blocked: boolean, start: number): void {
    const on = age >= 0 && age < HIT_LIFE;
    for (const m of [...this.sparks, this.ring, this.flash, this.star]) m.visible = on;
    if (!on) return;
    if (start !== this.lastBurst) {
      this.lastBurst = start;
      this.bursts++;
    }
    const k = age / HIT_LIFE;
    const spec = SPARK[weapon];
    const big = (crit ? 1.6 : 1) * spec.size;
    const cx = x + this.height * 0.1;
    const cy = this.height * 0.52;
    const color = new THREE.Color(spec.color);
    this.sparks.forEach((m, i) => {
      m.visible = i < spec.count + (crit ? 2 : 0);
      if (!m.visible) return;
      // Fanned back the way the blow came (toward the fighter's own back), a little up and down.
      const a = Math.PI + (hash(i, 1) - 0.5) * 2.2 + (hash(i, 2) - 0.5) * 0.4;
      const speed = (360 + 480 * hash(i, 3)) * big;
      const d = speed * (1 - (1 - k) ** 2) * 0.4;
      const len = (60 + 70 * hash(i, 4)) * spec.streak * big * (1 - k * 0.7);
      m.position.set(cx + Math.cos(a) * d, cy + Math.sin(a) * d - 80 * k * k, 0);
      m.rotation.z = a;
      m.scale.set(Math.max(1, len), 14 * big * (1 - k * 0.5), 1);
      m.material.color.copy(color);
      m.material.opacity = 1 - k * k;
    });
    const ringK = Math.min(1, age / (HIT_LIFE * 0.8));
    this.ring.visible = !blocked;
    this.ring.position.set(cx, cy, 0);
    this.ring.scale.setScalar((40 + 200 * Math.sqrt(ringK)) * big);
    this.ring.material.color.copy(color);
    this.ring.material.opacity = 0.9 * (1 - ringK);
    const flashK = Math.min(1, age / 0.16);
    this.flash.position.set(cx, cy, 0);
    this.flash.scale.setScalar((blocked ? 140 : 260) * big * (0.6 + 0.4 * flashK));
    this.flash.material.color.copy(color);
    this.flash.material.opacity = (blocked ? 0.7 : 1) * (1 - flashK);
    // The star: white at its heart, the weapon's colour at its tips, gone in a blink.
    const starK = Math.min(1, age / 0.2);
    this.star.position.set(cx, cy, 0);
    this.star.rotation.z = hash(start * 7, 6) * Math.PI;
    this.star.scale.setScalar((blocked ? 150 : 240) * big * (1.15 - 0.45 * starK));
    this.star.material.color.copy(color).lerp(new THREE.Color(0xffffff), 0.6);
    this.star.material.opacity = 1 - starK * starK;
  }

  /** The charge's dust trail: puffs where the runner was, `x` in its own units, `age` since each was kicked up. */
  trail(puffs: readonly { x: number; age: number }[]): void {
    this.puffs.forEach((m, i) => {
      const p = puffs[i];
      m.visible = !!p && p.age >= 0 && p.age < TRAIL.life;
      if (!m.visible || !p) return;
      const k = p.age / TRAIL.life;
      const size = (40 + 70 * Math.sqrt(k)) * (this.height / 230);
      m.position.set(p.x - 30 * Math.sqrt(k), 10 + 30 * Math.sqrt(k) * hash(i, 5), 0);
      m.scale.set(size * 1.5, size, 1);
      m.material.opacity = 0.55 * (1 - k) * (1 - k);
    });
  }

  /** The skill's light around the fighter at `seconds`, or none; `alpha` fades it with the fighter. */
  glow(color: number | null, seconds: number, x: number, alpha: number): void {
    this.aura.visible = color !== null && alpha > 0;
    if (!this.aura.visible || color === null) return;
    const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 1.4);
    this.aura.position.set(x, this.height * 0.45, 0);
    this.aura.scale.set(this.height * (1.15 + 0.08 * pulse), this.height * (1.35 + 0.1 * pulse), 1);
    this.aura.material.color.set(color);
    this.aura.material.opacity = (0.4 + 0.25 * pulse) * alpha;
  }
}
