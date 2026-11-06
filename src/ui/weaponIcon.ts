import type { Weapon } from '../game/units';

/**
 * Each weapon type's symbol (B8, after the user "had troubles seeing which type is which type in
 * order to tell who has the upper hand"): a small inline SVG, cream with a dark edge, drawn on a
 * medallion in the type's colour. The triangle reads by colour as well: sword blue beats axe red,
 * axe red beats spear and lance green, spear and lance green beat sword blue; bow amber and staff
 * violet stand outside it.
 */
const PATHS: Record<Weapon, string> = {
  // A sword, point up, turned to the diagonal: blade, cross-guard, grip and pommel.
  sword: `<g transform="rotate(45 32 32)"><path d="M32 3 L36.5 10 L36.5 40 L27.5 40 L27.5 10 Z"/><rect x="19" y="40" width="26" height="5" rx="1.5"/><rect x="29.5" y="45" width="5" height="11"/><circle cx="32" cy="59" r="3.6"/></g>`,
  // A battle-axe: a long haft and two broad crescent blades.
  axe: `<g transform="rotate(30 32 32)"><rect x="29.5" y="4" width="5" height="58" rx="2"/><path d="M30 13 L17 5 C 8 12, 6 28, 15 38 L30 30 Z"/><path d="M34 13 L47 5 C 56 12, 58 28, 49 38 L34 30 Z"/></g>`,
  // A spear: a slender shaft and a leaf-shaped head.
  spear: `<g transform="rotate(45 32 32)"><rect x="30" y="20" width="4" height="43" rx="1.5"/><path d="M32 1 C 39 9, 39 16, 32 22 C 25 16, 25 9, 32 1 Z"/><rect x="28.5" y="21" width="7" height="4" rx="1"/></g>`,
  // A knight's lance: a long cone and its hand guard.
  lance: `<g transform="rotate(45 32 32)"><path d="M32 1 L38 42 L26 42 Z"/><path d="M21 42 L43 42 L37 49 L27 49 Z"/><rect x="29" y="49" width="6" height="13" rx="2"/></g>`,
  // A bow drawn with an arrow nocked.
  bow: `<path d="M22 5 Q 56 32 22 59" fill="none" stroke-width="6" stroke-linecap="round"/><path d="M22 5 Q 56 32 22 59" fill="none" stroke="#f6ecd0" stroke-width="3" stroke-linecap="round"/><line x1="22" y1="6" x2="22" y2="58" stroke-width="1.6"/><rect x="8" y="30.5" width="40" height="3"/><path d="M58 32 L47 26 L47 38 Z"/><path d="M8 32 L4 26 L13 26 L16 32 L13 38 L4 38 Z"/>`,
  // A mage's staff: a shaft crowned with an orb held in a claw.
  staff: `<g transform="rotate(30 32 32)"><rect x="29.5" y="20" width="5" height="42" rx="2"/><path d="M24 22 C 22 14, 26 8, 28 12 L 30 20 Z"/><path d="M40 22 C 42 14, 38 8, 36 12 L 34 20 Z"/><circle cx="32" cy="12" r="8"/></g>`,
};

/** The symbol of `weapon` as SVG markup, to sit in a medallion (its colour from `.w-<weapon>`). */
export function weaponIcon(weapon: Weapon): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#f6ecd0" stroke="#2a1c0c" stroke-width="2.2" stroke-linejoin="round">${PATHS[weapon]}</g></svg>`;
}
