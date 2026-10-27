import { describe, expect, it } from 'vitest';
import { tileStats } from '../map/terrain';
import { THEMES } from '../themes';
import { mulberry32 } from '../util/rng';
import { isOpen, moveRange, pathTo, stopsIn } from './movement';
import { board } from './testBoard';
import { makeUnit, type Side } from './units';

const unit = (x: number, y: number, side: Side = 'player', id = `${side}${x},${y}`) =>
  makeUnit({ id, name: id, side, cls: 'sword', gender: 'female', x, y });

describe('moveRange', () => {
  it('reaches a diamond on open plains, the start included', () => {
    const map = board(Array(7).fill('.......'));
    const me = unit(3, 3);
    const range = moveRange(map, [me], me, 2);
    expect(stopsIn(range).length).toBe(13);
    for (const [i, step] of range) expect(step.cost).toBe(Math.abs((i % 7) - 3) + Math.abs(Math.floor(i / 7) - 3));
  });

  it('charges each tile its move cost, and a path costs what its tiles add up to', () => {
    const map = board(['.ffm.']);
    const me = unit(0, 0);
    const range = moveRange(map, [me], me, 7);
    expect(range.get(1)!.cost).toBe(2);
    expect(range.get(3)!.cost).toBe(7);
    expect(range.has(4)).toBe(false);
    expect(pathTo(range, 3)).toEqual([0, 1, 2, 3]);
  });

  it('never enters impassable ground or a blocking prop', () => {
    const map = board(['.#.', '.o.', '...']);
    const me = unit(0, 0);
    const range = moveRange(map, [me], me, 6);
    expect(range.has(1)).toBe(false);
    expect(range.has(4)).toBe(false);
    expect(range.get(2)!.cost).toBe(6);
  });

  it('is barred by enemies but passes through allies, without stopping on them', () => {
    const map = board(['.....']);
    const me = unit(0, 0);
    const ally = unit(1, 0);
    const foe = unit(3, 0, 'enemy');
    const range = moveRange(map, [me, ally, foe], me, 10);
    expect(range.get(1)!.stop).toBe(false);
    expect(range.get(2)!.stop).toBe(true);
    expect(pathTo(range, 2)).toEqual([0, 1, 2]);
    expect(pathTo(range, 1)).toEqual([]);
    expect(range.has(3)).toBe(false);
    expect(range.has(4)).toBe(false);
  });

  it('ignores defeated units', () => {
    const map = board(['...']);
    const me = unit(0, 0);
    const fallen = unit(1, 0, 'enemy');
    fallen.morale = 0;
    expect(moveRange(map, [me, fallen], me, 2).get(2)!.cost).toBe(2);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('%s: stays within the pool on legal tiles, by legal paths', (_, theme) => {
    const map = theme.map();
    const open = map.tiles.filter(isOpen);
    const rand = mulberry32(map.width * 31 + open.length);
    const pick = () => open[Math.floor(rand() * open.length)];
    const units = Array.from({ length: 10 }, (_, i) => {
      const t = pick();
      return unit(t.x, t.y, i < 5 ? 'player' : 'enemy', `u${i}`);
    }).filter((u, i, all) => all.findIndex((v) => v.x === u.x && v.y === u.y) === i);
    for (const mover of units) {
      const range = moveRange(map, units, mover, 12);
      const taken = new Set(units.filter((u) => u !== mover).map((u) => u.y * map.width + u.x));
      for (const end of stopsIn(range)) {
        expect(taken.has(end)).toBe(false);
        const path = pathTo(range, end);
        let cost = 0;
        for (const i of path.slice(1)) {
          expect(isOpen(map.tiles[i])).toBe(true);
          expect(units.some((u) => u.side !== mover.side && u.y * map.width + u.x === i)).toBe(false);
          cost += tileStats(map.tiles[i]).moveCost;
        }
        expect(cost).toBe(range.get(end)!.cost);
        expect(cost).toBeLessThanOrEqual(12);
      }
    }
  });
});
