import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';
import { ClashSim, resolveClash, type ClashEvent, type ClashSetup, type SkillId } from './clash';
import { GAUGE_MAX } from './gauge';
import { battleSkill, canFire, onPlay, skillMark, skillOf, whyNot } from './skills';
import { makeUnit, type ClassId, type Side } from './units';

const card = (id: string) => CARDS.find((c) => c.id === id)!;
const unit = (cls: ClassId, side: Side = 'player', gauge = 0) => {
  const u = makeUnit({ id: `${side}-${cls}`, name: cls, side, cls, gender: 'female', x: 0, y: 0 });
  u.gauge = gauge;
  return u;
};
const setup = (seed: number, a: ClassId = 'sword', d: ClassId = 'axe', fire?: SkillId): ClashSetup => ({
  attacker: unit(a), defender: unit(d, 'enemy'), pow: 60, seed, ...(fire ? { fire: { attacker: fire } } : {}),
});
/** The first beat's events: the charge, with whatever a fired skill does there. */
const charge = (s: ClashSetup) => new ClashSim(s).step();
const strikes = (events: ClashEvent[], by: 'attacker' | 'defender') => events.filter((e): e is Extract<ClashEvent, { kind: 'strike' }> => e.kind === 'strike' && e.by === by);

describe('which card has which skill', () => {
  it('gives every card a skill, and only King\'s Wager acts on play', () => {
    for (const c of CARDS) expect(skillOf(c)).toBeTruthy();
    expect(CARDS.filter((c) => !battleSkill(c)).map((c) => c.id)).toEqual(['kings-wager']);
  });
});

describe('canFire', () => {
  it('fires only with a full gauge and the card\'s ACE (or a card for All)', () => {
    expect(canFire(unit('sword', 'player', GAUGE_MAX), card('open-field'))).toBe(true);
    expect(canFire(unit('sword', 'player', GAUGE_MAX - 1), card('open-field'))).toBe(false);
    expect(canFire(unit('axe', 'player', GAUGE_MAX), card('open-field'))).toBe(false);
    expect(canFire(unit('axe', 'player', GAUGE_MAX), card('long-road'))).toBe(true);
    expect(canFire(unit('knight', 'player', GAUGE_MAX), card('swift-banner'))).toBe(true);
    expect(canFire(unit('mage', 'player', GAUGE_MAX), card('ember-rite'))).toBe(true);
    expect(canFire(unit('sword', 'player', GAUGE_MAX), card('kings-wager'))).toBe(false);
  });

  it('says why not: charging, the wrong ACE, or a skill that acts on play', () => {
    expect(whyNot(unit('sword', 'player', 60), card('open-field'))).toEqual({ why: 'charging', gauge: 60 });
    expect(whyNot(unit('bow', 'player', GAUGE_MAX), card('open-field'))).toEqual({ why: 'ace', ace: 'sword' });
    expect(whyNot(unit('bow', 'player', GAUGE_MAX), card('kings-wager'))).toEqual({ why: 'on-play' });
  });
});

describe('skillMark: the marker over a unit on the map', () => {
  it('shows nothing below a full gauge, or once the unit has fallen', () => {
    expect(skillMark(unit('sword', 'player', GAUGE_MAX - 1), null)).toBeNull();
    const fallen = unit('sword', 'player', GAUGE_MAX);
    fallen.morale = 0;
    expect(skillMark(fallen, card('long-road'))).toBeNull();
  });
  it('is ready with a full gauge and no card in play yet, or a card whose skill the unit can fire', () => {
    expect(skillMark(unit('axe', 'enemy', GAUGE_MAX), null)).toBe('ready');
    expect(skillMark(unit('sword', 'player', GAUGE_MAX), card('long-road'))).toBe('ready');
    expect(skillMark(unit('knight', 'player', GAUGE_MAX), card('swift-banner'))).toBe('ready');
  });
  it("is held when the card in play can't fire it: another weapon's ACE, or All In, which acts on play", () => {
    expect(skillMark(unit('sword', 'player', GAUGE_MAX), card('swift-banner'))).toBe('held');
    expect(skillMark(unit('sword', 'player', GAUGE_MAX), card('kings-wager'))).toBe('held');
  });
});

describe('the gauge', () => {
  it('carries in from the unit, fills from what lands, and empties when a skill fires', () => {
    const s = setup(7);
    s.attacker.gauge = 50;
    const sim = new ClashSim(s);
    expect(sim.gauge('attacker')).toBe(50);
    sim.run();
    expect(sim.gauge('attacker')).toBeGreaterThan(50);
    const fired = new ClashSim({ ...s, fire: { attacker: 'rend' } });
    expect(fired.gauge('attacker')).toBe(0);
  });

  it('fires only before the first beat, and once a side', () => {
    const sim = new ClashSim(setup(3));
    expect(sim.fire('attacker', 'rend')).toBe(true);
    expect(sim.fire('attacker', 'parry')).toBe(false);
    sim.step();
    expect(sim.fire('defender', 'rend')).toBe(false);
  });

  it('opens the battle with the skill, for the scene\'s cut-in', () => {
    expect(charge(setup(3, 'sword', 'axe', 'rend'))[0]).toEqual({ kind: 'skill', side: 'attacker', skill: 'rend' });
  });
});

describe('each skill changes the battle as its card says', () => {
  it('Forced March: +3 edge for the whole battle', () => {
    const [plain, marched] = [new ClashSim(setup(1)), new ClashSim(setup(1, 'sword', 'axe', 'forced-march'))];
    expect(marched.edge('attacker')).toBe(plain.edge('attacker') + 3);
  });

  it('Lance Charge: the charge strikes twice', () => {
    const plain = strikes(charge(setup(2, 'knight', 'sword')), 'attacker').length;
    const twice = strikes(charge(setup(2, 'knight', 'sword', 'lance-charge')), 'attacker');
    expect(twice.length).toBe(plain * 2);
    expect(twice.slice(plain).every((e) => e.skill === 'lance-charge')).toBe(true);
  });

  it('Volley: every archer looses a second arrow', () => {
    const plain = strikes(charge(setup(4, 'bow', 'axe')), 'attacker').length;
    expect(strikes(charge(setup(4, 'bow', 'axe', 'volley')), 'attacker').length).toBe(plain * 2);
  });

  it('Blade Dance: each duel won fells a second foe', () => {
    const events = new ClashSim(setup(5, 'sword', 'axe', 'blade-dance')).run();
    const won = events.map((e, i) => [e, i] as const).filter(([e]) => e.kind === 'duel' && e.winner === 'attacker');
    expect(won.length).toBeGreaterThan(0);
    for (const [, i] of won) {
      const next = events[i + 1];
      // A second foe falls after every duel won, unless that duel felled the last one.
      if (next && next.kind !== 'end') expect(next).toMatchObject({ kind: 'flash', by: 'attacker', skill: 'blade-dance' });
    }
  });

  it("Pike Wall: the foe's charge and counter miss", () => {
    let countered = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const counter = strikes(new ClashSim(setup(seed, 'spear', 'sword', 'pike-wall')).run(), 'defender');
      countered += counter.length;
      expect(counter.every((e) => !e.hit && e.skill === 'pike-wall')).toBe(true);
    }
    expect(countered).toBeGreaterThan(0);
  });

  it('Firestorm: a blast strikes every foe at the charge', () => {
    const s = setup(6, 'mage', 'sword', 'firestorm');
    const foes = new ClashSim(s).defender.fighters.length;
    const blast = strikes(charge(s), 'attacker').filter((e) => e.skill === 'firestorm');
    expect(new Set(blast.map((e) => e.target)).size).toBe(foes);
    expect(blast.filter((e) => e.hit).length).toBeGreaterThan(foes / 2);
  });

  it('Hold Fast: lose only half the Morale if the battle is lost', () => {
    // A seed the attacker loses (the same battle either way: Hold Fast draws no dice).
    const seed = [...Array(40).keys()].find((n) => resolveClash(setup(n, 'sword', 'spear')).winner === 'defender')!;
    const full = resolveClash(setup(seed, 'sword', 'spear')).damage;
    const held = resolveClash(setup(seed, 'sword', 'spear', 'hold-fast'));
    expect(held.winner).toBe('defender');
    expect(held.damage).toBe(Math.ceil(full / 2));
  });

  it('Rend: +20 Morale damage on a win', () => {
    const seed = [...Array(40).keys()].find((n) => resolveClash(setup(n, 'axe', 'spear')).winner === 'attacker')!;
    const plain = resolveClash(setup(seed, 'axe', 'spear')).damage;
    expect(resolveClash(setup(seed, 'axe', 'spear', 'rend')).damage).toBe(plain + 20);
  });

  it('Parry: the first three blows at the leader miss', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new ClashSim(setup(seed, 'sword', 'spear', 'parry'));
      const events = sim.run();
      const atLeader = events.filter((e) => (e.kind === 'strike' && e.by === 'defender' && e.target === 0) || (e.kind === 'duel' && e.winner === 'defender' && e.attacker === 0));
      // Up to the third, every blow at the leader is turned aside; none of them harms it.
      const turned = atLeader.slice(0, 3);
      expect(turned.every((e) => e.kind === 'strike' && !e.hit && e.skill === 'parry')).toBe(true);
      expect(sim.attacker.parried).toBe(Math.min(3, atLeader.length));
    }
  });

  it('Trample: the charge fells the front rank', () => {
    const trampled = strikes(charge(setup(8, 'knight', 'sword', 'trample')), 'attacker').filter((e) => e.skill === 'trample');
    expect(trampled.map((e) => e.target)).toEqual([1, 2, 3]);
    expect(trampled.every((e) => e.felled)).toBe(true);
  });

  it("Executioner: a duel with the foe's leader is won outright", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const duels = new ClashSim(setup(seed, 'axe', 'sword', 'executioner')).run().filter((e) => e.kind === 'duel' && e.defender === 0);
      expect(duels.every((e) => e.kind === 'duel' && e.winner === 'attacker' && e.skill === 'executioner')).toBe(true);
    }
  });

  it('replays exactly with the same seed and skill', () => {
    const once = () => resolveClash(setup(9, 'sword', 'axe', 'blade-dance'));
    expect(once()).toEqual(once());
  });
});

describe("King's Wager: All In", () => {
  it("fills every living ally's gauge when played, and no one else's", () => {
    const [a, b, fallen, foe] = [unit('sword'), unit('bow'), unit('axe'), unit('spear', 'enemy')];
    fallen.morale = 0;
    expect(onPlay(card('kings-wager'), 'player', [a, b, fallen, foe]).length).toBe(2);
    expect([a.gauge, b.gauge, fallen.gauge, foe.gauge]).toEqual([GAUGE_MAX, GAUGE_MAX, 0, 0]);
    expect(onPlay(card('long-road'), 'player', [a])).toEqual([]);
  });
});
