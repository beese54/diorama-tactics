import { tileStats } from '../map/terrain';
import type { MapFile } from '../map/types';
import { unused, type Card, type Hand } from './cards';
import { resolveClash, type ClashSetup } from './clash';
import { isOpen, moveRange, pathTo, stopsIn } from './movement';
import { battleSkill, canFire } from './skills';
import { unionOf, unionShape } from './union';
import { applyDamage, markFought, type Side, type Unit } from './units';

/**
 * The foes' AI (B7): it plans a whole turn under exactly the player's rules (the card's shared
 * MOV pool, one move a unit, one attack a turn, Unions, skills), so every move it makes is one the
 * rules accept. Pure: it works on copies, and the skirmish plays the plan out.
 *
 * Easy is bold and simple: it heads straight for the nearest ally and takes whatever fight in
 * reach deals the most Morale. Hard is cautious and sharp: it seeks strong ground, lines up a
 * Union behind its attacker, and only attacks when its forecast says it will win.
 */
export type Difficulty = 'easy' | 'hard';

/** The turn the foes will play: the card, each move in the order walked, and the attack (or none). */
export interface Plan {
  card: Card;
  moves: { unit: Unit; path: number[] }[];
  attack: { unit: Unit; target: Unit } | null;
}

/** What a fight is forecast to bring, over a few fixed seeds: the chance it pays off, and the Morale each side loses on average. */
export interface Forecast {
  win: number;
  dealt: number;
  taken: number;
}

/** Hard attacks only at or above this forecast chance of coming out ahead. */
export const HARD_NERVE = 0.6;
const FORECAST_SEEDS = 8;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const living = (units: readonly Unit[], side: Side) => units.filter((u) => u.side === side && u.morale > 0);
const clone = (units: readonly Unit[]): Unit[] => units.map((u) => ({ ...u, stats: { ...u.stats } }));
const defenceAt = (map: MapFile, u: Unit) => tileStats(map.tiles[u.y * map.width + u.x]).defense;

/**
 * Forecasts `attacker`'s Union attack on `target` (both among `units`), played to the end by the
 * rules over a few fixed seeds, with any skill its members could fire with `card` fired. It
 * "pays off" when the target loses more than the Union does: the Morale lost, and a unit that
 * falls counted as its whole Morale again. The units aren't touched.
 */
export function forecast(map: MapFile, units: readonly Unit[], attacker: Unit, target: Unit, card: Card): Forecast {
  let wins = 0;
  let dealt = 0;
  let taken = 0;
  for (let s = 0; s < FORECAST_SEEDS; s++) {
    const copy = clone(units);
    const lead = copy.find((u) => u.id === attacker.id)!;
    const foe = copy.find((u) => u.id === target.id)!;
    const [before, members] = [foe.morale, unionOf(lead, copy)];
    const lost = members.reduce((sum, m) => sum + m.morale, 0);
    // The same chain the battle plays (fightUnion), run here without waiting on a screen.
    for (const [i, m] of members.entries()) {
      if (foe.morale <= 0) break;
      if (m.morale <= 0) continue;
      const skill = canFire(m, card) ? battleSkill(card) : null;
      const setup: ClashSetup = {
        attacker: m, defender: foe, pow: card.pow, seed: 7919 * (s + 1) + i * 104729,
        attackerDefense: defenceAt(map, m), defenderDefense: defenceAt(map, foe), ...(skill ? { fire: { attacker: skill } } : {}),
      };
      const { winner, damage } = resolveClash(setup);
      applyDamage(winner === 'attacker' ? foe : m, damage);
      markFought(m, foe);
    }
    // A unit that falls is lost whole, not just the Morale it had left: since a battle starts at full
    // strength whatever the Morale, a unit near its end would otherwise risk next to nothing.
    const fell = (u: Unit) => (u.morale <= 0 ? u.maxMorale : 0);
    const d = before - foe.morale + (before > 0 ? fell(foe) : 0);
    const t = lost - members.reduce((sum, m) => sum + m.morale, 0) + members.reduce((sum, m) => sum + fell(m), 0);
    if (d > t) wins++;
    dealt += d;
    taken += t;
  }
  return { win: wins / FORECAST_SEEDS, dealt: dealt / FORECAST_SEEDS, taken: taken / FORECAST_SEEDS };
}

/**
 * How far every tile is from the nearest of `targets` on foot: the move cost of the cheapest walk
 * there over open ground (around cliffs, water and blocking props). Units are left out: they
 * move. A straight-line count would lead a foe into a corner a cliff cuts off.
 */
export function travelField(map: MapFile, targets: readonly Unit[]): Float64Array {
  const field = new Float64Array(map.width * map.height).fill(Infinity);
  const open: number[] = [];
  for (const t of targets) {
    const i = t.y * map.width + t.x;
    field[i] = 0;
    open.push(i);
  }
  while (open.length) {
    let k = 0;
    for (let j = 1; j < open.length; j++) if (field[open[j]] < field[open[k]]) k = j;
    const here = open.splice(k, 1)[0];
    const [hx, hy] = [here % map.width, Math.floor(here / map.width)];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const [x, y] = [hx + dx, hy + dy];
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const next = y * map.width + x;
      if (!isOpen(map.tiles[next])) continue;
      const cost = field[here] + tileStats(map.tiles[next]).moveCost;
      if (cost < field[next]) {
        if (field[next] === Infinity) open.push(next);
        field[next] = cost;
      }
    }
  }
  return field;
}

/** Whether, with `pool` MOV, some foe in `units` could end its move beside an ally of the other side. */
function canReach(map: MapFile, units: readonly Unit[], side: Side, pool: number): boolean {
  const them = living(units, side === 'enemy' ? 'player' : 'enemy');
  return living(units, side).some((f) => {
    if (them.some((a) => dist(f, a) === 1)) return true;
    return stopsIn(moveRange(map, units, f, pool)).some((i) => them.some((a) => dist({ x: i % map.width, y: Math.floor(i / map.width) }, a) === 1));
  });
}

/** The card to play. Easy: the most POW that can reach a fight, else the most MOV. Hard: also counts a skill a full-gauge foe could fire. */
export function chooseCard(map: MapFile, units: readonly Unit[], hand: Hand, side: Side, difficulty: Difficulty): Card {
  const cards = unused(hand);
  const reaching = cards.filter((c) => canReach(map, units, side, c.mov));
  if (!reaching.length) return cards.reduce((a, c) => (c.mov > a.mov ? c : a));
  const score = (c: Card) => c.pow + (difficulty === 'hard' && living(units, side).some((f) => canFire(f, c)) ? 30 : 0);
  return reaching.reduce((a, c) => (score(c) > score(a) ? c : a));
}

/**
 * Plans the turn for `side` (the foes) on `map`: the card from `hand`, the moves, the attack. The
 * plan's units are the ones passed in; nothing is changed (the skirmish plays it out).
 */
export function planTurn(map: MapFile, units: readonly Unit[], hand: Hand, side: Side, difficulty: Difficulty): Plan {
  const card = chooseCard(map, units, hand, side, difficulty);
  const sim = clone(units);
  const real = (u: Unit) => units.find((o) => o.id === u.id)!;
  const theirs = side === 'enemy' ? 'player' : 'enemy';
  let pool = card.mov;
  const moves: Plan['moves'] = [];
  const at = (i: number) => ({ x: i % map.width, y: Math.floor(i / map.width) });
  /** Walks `unit` (a copy) to tile `index` if the pool allows it; records the move. */
  const walk = (unit: Unit, index: number): boolean => {
    const range = moveRange(map, sim, unit, pool);
    const path = pathTo(range, index);
    if (path.length < 2) return false;
    pool -= range.get(index)!.cost;
    Object.assign(unit, at(index));
    moves.push({ unit: real(unit), path });
    return true;
  };
  const nearest = (u: Unit) => Math.min(...living(sim, theirs).map((a) => dist(u, a)));
  // How far each tile is from the nearest ally on foot: what the foes steer by.
  const field = travelField(map, living(sim, theirs));
  const away = (i: number) => field[i];
  const here = (u: Unit) => u.y * map.width + u.x;
  const mine = () => living(sim, side).sort((a, b) => away(here(a)) - away(here(b)));

  if (difficulty === 'hard') {
    // The best fight it could set up this turn: an attacker on the strongest ground beside a target.
    let best: { unit: Unit; target: Unit; spot: number; f: Forecast } | null = null;
    for (const f of mine()) {
      const spots = [f.y * map.width + f.x, ...stopsIn(moveRange(map, sim, f, pool))];
      for (const target of living(sim, theirs)) {
        const beside = spots.filter((i) => dist(at(i), target) === 1);
        if (!beside.length) continue;
        const spot = beside.reduce((a, i) => (tileStats(map.tiles[i]).defense > tileStats(map.tiles[a]).defense ? i : a));
        const trial = clone(sim);
        Object.assign(trial.find((u) => u.id === f.id)!, at(spot));
        const fc = forecast(map, trial, trial.find((u) => u.id === f.id)!, trial.find((u) => u.id === target.id)!, card);
        if (fc.win >= HARD_NERVE && (!best || fc.dealt - fc.taken > best.f.dealt - best.f.taken)) best = { unit: f, target, spot, f: fc };
      }
    }
    if (best) {
      if (best.spot !== best.unit.y * map.width + best.unit.x) walk(best.unit, best.spot);
      // The others fill the attacker's Union shape where they can reach it.
      for (const [dx, dy] of unionShape(best.unit)) {
        const [x, y] = [best.unit.x + dx, best.unit.y + dy];
        if (x < 0 || y < 0 || x >= map.width || y >= map.height || sim.some((u) => u.morale > 0 && u.x === x && u.y === y)) continue;
        const helper = mine().find((h) => h !== best!.unit && !moves.some((m) => m.unit.id === h.id) && moveRange(map, sim, h, pool).get(y * map.width + x)?.stop);
        if (helper) walk(helper, y * map.width + x);
      }
    } else {
      // No fight worth taking: close in together on strong ground, out of the allies' reach of a
      // blow, each foe on an even share of the pool.
      const movers = mine();
      for (const [k, f] of movers.entries()) {
        const share = Math.floor(pool / (movers.length - k));
        const options = stopsIn(moveRange(map, sim, f, share)).filter((i) => living(sim, theirs).every((a) => dist(at(i), a) > 1));
        const score = (i: number) => -away(i) * 2 + tileStats(map.tiles[i]).defense / 10;
        const pick = options.reduce((a, i) => (score(i) > score(a) ? i : a), f.y * map.width + f.x);
        if (pick !== f.y * map.width + f.x) walk(f, pick);
      }
    }
  } else {
    // Easy: a foe that can reach a fight this turn goes for it (the nearest such, on the cheapest
    // spot beside its target); then the rest advance together on even shares of what is left,
    // each heading for the tile closest to its nearest ally (staying put if already beside one).
    if (!mine().some((f) => nearest(f) === 1)) {
      for (const f of mine()) {
        const range = moveRange(map, sim, f, pool);
        const beside = stopsIn(range).filter((i) => living(sim, theirs).some((a) => dist(at(i), a) === 1));
        if (!beside.length) continue;
        walk(f, beside.reduce((a, i) => (range.get(i)!.cost < range.get(a)!.cost ? i : a)));
        break;
      }
    }
    const movers = mine().filter((f) => nearest(f) > 1 && !moves.some((m) => m.unit.id === f.id));
    for (const [k, f] of movers.entries()) {
      const range = moveRange(map, sim, f, Math.floor(pool / (movers.length - k)));
      const pick = stopsIn(range).reduce((a, i) => {
        const [da, di] = [away(a), away(i)];
        return di < da || (di === da && range.get(i)!.cost < range.get(a)!.cost) ? i : a;
      }, f.y * map.width + f.x);
      if (pick !== f.y * map.width + f.x) walk(f, pick);
    }
  }

  // The attack, from where everyone now stands.
  let attack: Plan['attack'] = null;
  let bestScore = -Infinity;
  for (const f of living(sim, side)) {
    for (const target of living(sim, theirs).filter((a) => dist(f, a) === 1)) {
      const fc = forecast(map, sim, f, target, card);
      if (difficulty === 'hard' && fc.win < HARD_NERVE) continue;
      const score = difficulty === 'hard' ? fc.dealt - fc.taken : fc.dealt;
      if (score > bestScore) [bestScore, attack] = [score, { unit: real(f), target: real(target) }];
    }
  }
  return { card, moves, attack };
}
