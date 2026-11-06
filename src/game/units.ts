/** Units and their classes. Pure data and rules: nothing here knows about three.js. */

export type Side = 'player' | 'enemy';
/** Sets the Union shape a unit leads: a woman's is a + of her four edge neighbours, a man's an x of his four corners. */
export type Gender = 'female' | 'male';
export type Weapon = 'sword' | 'spear' | 'axe' | 'bow' | 'staff' | 'lance';
export type ClassId = 'sword' | 'spear' | 'axe' | 'bow' | 'mage' | 'knight';
export const CLASS_IDS: readonly ClassId[] = ['sword', 'spear', 'axe', 'bow', 'mage', 'knight'];

/** ATK wins the melee duels; TEC strikes in the charge and counter; GEN guards against them; LUK gives crits and flash attacks. */
export interface Stats {
  atk: number;
  tec: number;
  gen: number;
  luk: number;
}

export interface ClassDef {
  name: string;
  weapon: Weapon;
  /** Soldiers behind the head in battle. */
  soldiers: number;
  /** Large soldiers (a knight's) take two blows to fell and count double in the result. */
  large: boolean;
  morale: number;
  stats: Stats;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  sword:  { name: 'Swordfighter', weapon: 'sword', soldiers: 7, large: false, morale: 160, stats: { atk: 10, tec: 10, gen: 10, luk: 8 } },
  spear:  { name: 'Spearfighter', weapon: 'spear', soldiers: 7, large: false, morale: 160, stats: { atk: 11, tec: 9,  gen: 11, luk: 6 } },
  axe:    { name: 'Axefighter',   weapon: 'axe',   soldiers: 7, large: false, morale: 170, stats: { atk: 14, tec: 6,  gen: 9,  luk: 7 } },
  bow:    { name: 'Archer',       weapon: 'bow',   soldiers: 7, large: false, morale: 140, stats: { atk: 8,  tec: 12, gen: 7,  luk: 9 } },
  mage:   { name: 'Mage',         weapon: 'staff', soldiers: 7, large: false, morale: 130, stats: { atk: 7,  tec: 15, gen: 6,  luk: 9 } },
  knight: { name: 'Knight',       weapon: 'lance', soldiers: 3, large: true,  morale: 200, stats: { atk: 12, tec: 8,  gen: 14, luk: 5 } },
};

export interface Unit {
  id: string;
  name: string;
  side: Side;
  cls: ClassId;
  gender: Gender;
  x: number;
  y: number;
  morale: number;
  maxMorale: number;
  stats: Stats;
  /** The skill gauge, 0 to GAUGE_MAX: filled by fighting, carried from battle to battle, spent when a card's skill fires (B6). */
  gauge: number;
  /** Battles fought this turn: each one already behind it this turn costs it a soldier in the next (see soldiersFor). */
  fought?: number;
}

export function makeUnit(o: { id: string; name: string; side: Side; cls: ClassId; gender: Gender; x: number; y: number }): Unit {
  const def = CLASSES[o.cls];
  return { ...o, morale: def.morale, maxMorale: def.morale, stats: { ...def.stats }, gauge: 0, fought: 0 };
}

/** Counts a battle for each of `units` (both sides of it): the next one this turn, they bring a soldier fewer. */
export function markFought(...units: Unit[]): void {
  for (const u of units) u.fought = (u.fought ?? 0) + 1;
}

/** A new turn: every unit comes to its next battle at full strength again. */
export function freshTurn(units: readonly Unit[]): void {
  for (const u of units) u.fought = 0;
}

/** Morale is a unit's life: at zero it is defeated and leaves the map. */
export const isDefeated = (unit: Unit): boolean => unit.morale <= 0;

/** Takes `damage` off the unit's Morale, never below zero. */
export function applyDamage(unit: Unit, damage: number): void {
  unit.morale = Math.max(0, unit.morale - Math.max(0, damage));
}

/** Who beats whom: sword beats axe, axe beats spear (and lance), spear (and lance) beat sword. */
const BEATS: Partial<Record<Weapon, Weapon[]>> = { sword: ['axe'], axe: ['spear', 'lance'], spear: ['sword'], lance: ['sword'] };

/** The weapon triangle's edge for `a` fighting `b`: +2 if a's weapon beats b's, −2 if it loses to it, else 0. Bows and staves stand outside it. */
export function triangleEdge(a: Weapon, b: Weapon): number {
  if (BEATS[a]?.includes(b)) return 2;
  if (BEATS[b]?.includes(a)) return -2;
  return 0;
}
