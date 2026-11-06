import type { Unit } from '../game/units';

/** How long the burst plays (ms): the pillar shoots up, the words rise, then all fades. */
export const ALL_IN_MS = 1800;
/** Each unit's pillar starts this long after the one before (ms), so they ripple through the side. */
const STAGGER_MS = 90;

/** Where a unit stands on screen: its feet and the top of its head, in CSS px within the UI. */
export interface Standing {
  feet: { x: number; y: number };
  head: { x: number; y: number };
}

/**
 * All In's animation on the map (B8, the one card skill that acts as it is played): a pillar of
 * gold light shoots up through every unit whose gauge it filled, one after another, and "SKILL
 * FULL" rises once, over the highest of them (units stand crowded: a word each piled up unread).
 * Drawn in the map's own UI (its pixel font and scale), and kept on the units as the camera moves.
 */
export class AllInFx {
  private readonly el = document.createElement('div');
  private bursts: { unit: Unit; el: HTMLElement }[] = [];
  private started = -Infinity;

  constructor(parent: HTMLElement) {
    this.el.id = 'all-in';
    parent.appendChild(this.el);
  }

  /** Plays the burst over `units`, now. */
  play(units: readonly Unit[]): void {
    this.el.replaceChildren();
    this.bursts = units.map((unit, i) => {
      const el = document.createElement('div');
      el.className = `burst ${unit.side}`;
      el.style.setProperty('--all-in', `${ALL_IN_MS}ms`);
      el.style.setProperty('--delay', `${i * STAGGER_MS}ms`);
      el.innerHTML = '<i class="pillar"></i><i class="ring"></i><b>SKILL FULL</b>';
      this.el.append(el);
      return { unit, el };
    });
    this.started = performance.now();
  }

  /** How many bursts are playing now (for checks). */
  get playing(): number {
    return this.bursts.length;
  }

  /** Keeps each burst on its unit (`at` says where it stands now, or null if it can't be seen); clears them once played. */
  place(at: (unit: Unit) => Standing | null): void {
    if (!this.bursts.length) return;
    if (performance.now() - this.started > ALL_IN_MS + STAGGER_MS * this.bursts.length) {
      this.el.replaceChildren();
      this.bursts = [];
      return;
    }
    let lead: { el: HTMLElement; y: number } | null = null;
    for (const b of this.bursts) {
      const s = at(b.unit);
      b.el.hidden = !s;
      if (!s) continue;
      b.el.style.left = `${s.feet.x}px`;
      b.el.style.top = `${s.feet.y}px`;
      b.el.style.setProperty('--tall', `${Math.max(0, s.feet.y - s.head.y)}px`);
      if (!lead || s.head.y < lead.y) lead = { el: b.el, y: s.head.y };
    }
    for (const b of this.bursts) b.el.classList.toggle('lead', b.el === lead?.el);
  }
}
