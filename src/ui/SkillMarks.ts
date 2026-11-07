import type { SkillMark } from '../game/skills';
import type { Unit } from '../game/units';

/** The sparkle, drawn in the map's own pixels (7×7): a four-pointed star. */
const STAR = ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'];
const SPARKLE =
  `<svg viewBox="0 0 7 7" shape-rendering="crispEdges">` +
  STAR.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('') +
  `<rect class="core" x="3" y="3" width="1" height="1"/></svg>`;

/**
 * SKILL READY on the map (B8): a gold sparkle twinkles beside the head of every unit whose skill
 * gauge is full, the foes' too, so the board shows who can fire a skill in their next battle. It
 * shines when the card its side has in play can fire the skill, and dims when that card can't
 * (another weapon's ACE, or All In); the unit window reads READY or SAVED. A sparkle, not a word: units stand
 * crowded, and words over each piled up unread (All In's lesson). Kept on the units as the camera moves.
 */
export class SkillMarks {
  private readonly el = document.createElement('div');
  private readonly marks = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.el.id = 'skill-marks';
    // First in the UI, so the map's windows and messages draw over the marks.
    parent.prepend(this.el);
  }

  /**
   * Draws the marks: `mark` says each unit's (null for none), `head` where its head is now in CSS
   * px within the UI (null if it can't be seen). `hidden` clears them for a while (All In's burst).
   */
  show(units: readonly Unit[], mark: (unit: Unit) => SkillMark | null, head: (unit: Unit) => { x: number; y: number } | null, hidden = false): void {
    const seen = new Set<string>();
    for (const unit of units) {
      const m = hidden ? null : mark(unit);
      const at = m && head(unit);
      if (!m || !at) continue;
      seen.add(unit.id);
      let el = this.marks.get(unit.id);
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = SPARKLE;
        this.el.append(el);
        this.marks.set(unit.id, el);
      }
      const cls = `mark ${unit.side} ${m}`;
      if (el.className !== cls) el.className = cls;
      el.style.left = `${at.x}px`;
      el.style.top = `${at.y}px`;
    }
    for (const [id, el] of this.marks) {
      if (seen.has(id)) continue;
      el.remove();
      this.marks.delete(id);
    }
  }

  /** How many marks show now, by kind (for checks). */
  count(): { ready: number; held: number } {
    const all = [...this.marks.values()];
    return { ready: all.filter((e) => e.classList.contains('ready')).length, held: all.filter((e) => e.classList.contains('held')).length };
  }
}
