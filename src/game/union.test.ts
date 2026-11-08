import { describe, expect, it } from 'vitest';
import { resolveClash, soldiersFor, type ClashSetup } from './clash';
import { canAttack, fightUnion, handOn, unionOf } from './union';
import { applyDamage, CLASSES, freshTurn, isDefeated, makeUnit, triangleEdge, type Gender, type Side } from './units';

const unit = (x: number, y: number, side: Side = 'player', gender: Gender = 'female') =>
  makeUnit({ id: `${side}${x},${y}`, name: `${x},${y}`, side, cls: 'sword', gender, x, y });

/** Units on every tile of a 3×3 block around (1, 1), the centre one the leader. */
const block = (gender: Gender) => {
  const all = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) all.push(unit(x, y, 'player', x === 1 && y === 1 ? gender : 'male'));
  return all;
};
/** Units on every tile of a 5×5 block around (2, 2), the leader at index 12. */
const wide = (gender: Gender) => {
  const all = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) all.push(unit(x, y, 'player', x === 2 && y === 2 ? gender : 'male'));
  return all;
};

describe('unionOf', () => {
  it('draws a + for a woman, clockwise from the top', () => {
    const all = block('female');
    expect(unionOf(all[4], all).map((u) => [u.x, u.y])).toEqual([[1, 1], [1, 0], [2, 1], [1, 2], [0, 1]]);
  });

  it('draws an x for a man, clockwise from the top right', () => {
    const all = block('male');
    expect(unionOf(all[4], all).map((u) => [u.x, u.y])).toEqual([[1, 1], [2, 0], [2, 2], [0, 2], [0, 0]]);
  });

  it('takes only living allies', () => {
    const all = block('female');
    all[1].side = 'enemy';
    all[3].morale = 0;
    expect(unionOf(all[4], all).map((u) => [u.x, u.y])).toEqual([[1, 1], [2, 1], [1, 2]]);
  });

  it("reaches two tiles out: a woman's + and a man's x, the near ring first, never more than nine", () => {
    const her = wide('female');
    expect(unionOf(her[12], her).map((u) => [u.x, u.y])).toEqual([[2, 2], [2, 1], [3, 2], [2, 3], [1, 2], [2, 0], [4, 2], [2, 4], [0, 2]]);
    const him = wide('male');
    expect(unionOf(him[12], him).map((u) => [u.x, u.y])).toEqual([[2, 2], [3, 1], [3, 3], [1, 3], [1, 1], [4, 0], [4, 4], [0, 4], [0, 0]]);
  });

  it('takes an ally two tiles out with nobody between, and nobody off its shape', () => {
    const lead = unit(2, 2);
    const far = unit(2, 0, 'player', 'male');
    expect(unionOf(lead, [lead, far, unit(3, 0), unit(4, 3), unit(2, 5)])).toEqual([lead, far]);
  });

  it('stands alone with nobody on its shape', () => {
    const lone = unit(1, 1, 'player', 'male');
    expect(unionOf(lone, [lone, unit(1, 0), unit(2, 1)])).toEqual([lone]);
  });
});

describe('canAttack', () => {
  it('reaches an enemy on an edge neighbour only', () => {
    const me = unit(1, 1);
    expect(canAttack(me, unit(1, 0, 'enemy'))).toBe(true);
    expect(canAttack(me, unit(2, 2, 'enemy'))).toBe(false);
    expect(canAttack(me, unit(1, 3, 'enemy'))).toBe(false);
    expect(canAttack(me, unit(1, 0))).toBe(false);
  });
});

describe('units', () => {
  it('runs the weapon triangle both ways, with bows and staves outside it', () => {
    expect(triangleEdge('sword', 'axe')).toBe(2);
    expect(triangleEdge('axe', 'sword')).toBe(-2);
    expect(triangleEdge('axe', 'spear')).toBe(2);
    expect(triangleEdge('spear', 'axe')).toBe(-2);
    expect(triangleEdge('spear', 'sword')).toBe(2);
    expect(triangleEdge('lance', 'sword')).toBe(2);
    expect(triangleEdge('sword', 'lance')).toBe(-2);
    expect(triangleEdge('sword', 'sword')).toBe(0);
    for (const w of ['sword', 'spear', 'axe', 'lance', 'bow', 'staff'] as const) {
      expect(triangleEdge('bow', w)).toBe(0);
      expect(triangleEdge(w, 'staff')).toBe(0);
    }
  });

  it('starts at full Morale and is defeated at zero, never below', () => {
    const u = makeUnit({ id: 'k', name: 'k', side: 'enemy', cls: 'knight', gender: 'male', x: 0, y: 0 });
    expect(u.morale).toBe(CLASSES.knight.morale);
    applyDamage(u, 150);
    expect(isDefeated(u)).toBe(false);
    applyDamage(u, 999);
    expect(u.morale).toBe(0);
    expect(isDefeated(u)).toBe(true);
  });
});

describe('fightUnion', () => {
  it('wears the foe down a soldier a battle down the chain, and a new turn brings it back to full', async () => {
    const members = [unit(1, 1), unit(0, 1), unit(2, 1)];
    const foe = unit(1, 2, 'enemy');
    const brought: number[][] = [];
    await fightUnion(members, foe, (attacker) => {
      brought.push([soldiersFor(attacker), soldiersFor(foe)]);
      return { winner: 'attacker', damage: 1 };
    });
    // Each member comes fresh; the foe brings 7, then 6, then 5.
    expect(brought).toEqual([[7, 7], [7, 6], [7, 5]]);
    freshTurn([...members, foe]);
    expect(soldiersFor(foe)).toBe(7);
  });

  /** A woman at (1, 1) with allies above and to her right (a Union of 3), and a foe below her. */
  const scene = () => {
    const leader = unit(1, 1);
    const all = [leader, unit(1, 0, 'player', 'male'), unit(2, 1, 'player', 'male'), unit(1, 2, 'enemy', 'male')];
    return { leader, all, members: unionOf(leader, all), foe: all[3] };
  };
  /** The rules' own battle, seeded per member, as the game sets it up. */
  const rules = (foe: ReturnType<typeof unit>) => (attacker: ReturnType<typeof unit>, i: number) => {
    const setup: ClashSetup = { attacker, defender: foe, pow: 60, seed: 1000 + i * 7, attackerDefense: 0, defenderDefense: 0 };
    return resolveClash(setup);
  };

  it("plays one battle per member, in the Union's order", async () => {
    const { members, foe } = scene();
    foe.morale = foe.maxMorale = 10_000;
    const fought = await fightUnion(members, foe, rules(foe));
    expect(fought.map((b) => b.attacker.id)).toEqual(members.map((m) => m.id));
  });

  it("carries the foe's losses from one battle to the next", async () => {
    const { members, foe } = scene();
    foe.morale = foe.maxMorale = 10_000;
    const startedOn: number[] = [];
    const fought = await fightUnion(members, foe, (a, i) => {
      startedOn.push(foe.morale);
      return rules(foe)(a, i);
    });
    // Each battle starts on what the one before left the foe (or the member) with.
    for (let i = 1; i < fought.length; i++) expect(startedOn[i]).toBe(fought[i - 1].foeMorale);
    const lost = fought.filter((b) => b.winner === 'attacker').reduce((s, b) => s + b.damage, 0);
    expect(foe.morale).toBe(10_000 - lost);
  });

  it("stops once the foe falls: the later members don't fight", async () => {
    const { members, foe } = scene();
    const fought = await fightUnion(members, foe, () => ({ winner: 'attacker', damage: 999 }));
    expect(fought.length).toBe(1);
    expect(foe.morale).toBe(0);
  });

  it('lets a lone unit fight one battle, as before Unions', async () => {
    const lone = unit(5, 5);
    const foe = unit(5, 6, 'enemy');
    const fought = await fightUnion(unionOf(lone, [lone, foe]), foe, rules(foe));
    expect(fought.length).toBe(1);
  });

  it('passes over a member who has fallen by its turn, and goes on', async () => {
    const { members, foe } = scene();
    foe.morale = foe.maxMorale = 10_000;
    // The first battle is lost heavily by the leader; the second member has already fallen.
    members[1].morale = 0;
    const fought = await fightUnion(members, foe, (a) => (a === members[0] ? { winner: 'defender', damage: 999 } : { winner: 'attacker', damage: 5 }));
    expect(fought.map((b) => b.attacker.id)).toEqual([members[0].id, members[2].id]);
    expect(members[0].morale).toBe(0);
  });

  it("hands the skill gauge down the chain: each member starts on the last one's added to its own", async () => {
    const { members, foe } = scene();
    foe.morale = foe.maxMorale = 10_000;
    [members[0].gauge, members[1].gauge, members[2].gauge] = [0, 20, 30];
    const startedOn: number[] = [];
    // Each battle ends 40 up on what it started with (as a Passive battle might).
    await fightUnion(members, foe, (a) => {
      startedOn.push(a.gauge);
      return { winner: 'attacker', damage: 1, gauges: { attacker: Math.min(100, a.gauge + 40), defender: 10 } };
    });
    // 0 -> 40, handed on: 40 + 20 = 60 -> 100, handed on: 100 + 30, at most 100.
    expect(startedOn).toEqual([0, 60, 100]);
    // Each gauge handed on is spent; the last to fight keeps what is left; the foe keeps its own.
    expect(members.map((m) => m.gauge)).toEqual([0, 0, 100]);
    expect(foe.gauge).toBe(10);
  });

  it('hands on an empty gauge after a skill fired, so the next starts on its own', async () => {
    const { members, foe } = scene();
    foe.morale = foe.maxMorale = 10_000;
    [members[0].gauge, members[1].gauge] = [100, 30];
    const startedOn: number[] = [];
    await fightUnion(members.slice(0, 2), foe, (a) => {
      startedOn.push(a.gauge);
      return { winner: 'attacker', damage: 1, gauges: { attacker: a === members[0] ? 0 : a.gauge, defender: 0 } };
    });
    expect(startedOn).toEqual([100, 30]);
  });

  it('hands the gauge past a member who has fallen by its turn: that one keeps its own', async () => {
    const { members, foe } = scene();
    foe.morale = foe.maxMorale = 10_000;
    [members[0].gauge, members[1].gauge, members[2].gauge] = [50, 70, 10];
    members[1].morale = 0;
    const startedOn: number[] = [];
    await fightUnion(members, foe, (a) => {
      startedOn.push(a.gauge);
      return { winner: 'attacker', damage: 1, gauges: { attacker: a.gauge, defender: 0 } };
    });
    expect(startedOn).toEqual([50, 60]);
    expect(members[1].gauge).toBe(70);
  });

  it("handOn adds the two gauges, at most full, and spends the giver's", () => {
    const [a, b] = [unit(0, 0), unit(1, 0)];
    [a.gauge, b.gauge] = [70, 50];
    handOn(a, b);
    expect([a.gauge, b.gauge]).toEqual([0, 100]);
  });

  it('replays exactly with the same seeds', async () => {
    const once = async () => {
      const { members, foe } = scene();
      foe.morale = foe.maxMorale = 10_000;
      return (await fightUnion(members, foe, rules(foe))).map((b) => [b.winner, b.damage, b.foeMorale]);
    };
    expect(await once()).toEqual(await once());
  });
});
