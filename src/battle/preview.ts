import * as THREE from 'three';
import { ClashSim, resolveClash, type ClashSetup, type Stance } from '../game/clash';
import { CLASS_IDS, CLASSES, makeUnit, triangleEdge, type ClassId, type Side } from '../game/units';
import { BattleHud } from '../ui/BattleHud';
import { BattleView } from './BattleView';
import { ART, CHARACTERS } from './cast';
import { Director, LEAD } from './Director';
import { LEADERS } from './lineup';
import { BattleScript } from './script';
import { SquadLayer } from './SquadLayer';

const params = new URLSearchParams(location.search);
const pick = (name: string, fallback: ClassId): ClassId => {
  const asked = params.get(name);
  return CLASS_IDS.find((c) => c === asked) ?? fallback;
};

/** The leader's name as the HUD shows it. */
const title = (id: string) => id[0].toUpperCase() + id.slice(1);

/** The matchup's line under the banners: who has the weapon triangle's edge, if anyone. */
function matchup(a: ClassId, d: ClassId): string {
  const [wa, wd] = [CLASSES[a].weapon, CLASSES[d].weapon];
  const edge = triangleEdge(wa, wd);
  if (edge > 0) return `Advantage ${title(LEADERS.player[a])} · ${wa} beats ${wd}`;
  if (edge < 0) return `Advantage ${title(LEADERS.enemy[d])} · ${wd} beats ${wa}`;
  return `Even match · ${wa} against ${wd}`;
}

/**
 * The battle scene (`?mode=battle&a=<class>&d=<class>&seed=<n>`, with `&am=`/`&dm=` for each
 * side's Morale and `&at=<seconds>` to open it still): the player's squad of class `a` (on the
 * left) attacks the rival army's squad of class `d`, at full resolution on the meadow. The rules
 * decide the battle (seeded, POW 60) and the director plays it: the charge, the counter, the
 * duels, the falls, and the Morale lost. Space skips to the result; A, S and D set the stance.
 */
export async function battlePreview(): Promise<void> {
  document.title = 'Battle · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  const view = new BattleView(document.body);
  const hud = new BattleHud(document.body);
  const [a, d] = [pick('a', 'sword'), pick('d', 'axe')];
  const seed = Number(params.get('seed')) || 1;
  // A gender only shapes a Union on the map; it plays no part in a battle. `?am=` and `?dm=` set
  // each side's Morale (full by default), and with it the soldiers it brings.
  const unit = (side: Side, cls: ClassId, morale: string | null) => {
    const u = makeUnit({ id: `${side}-${cls}`, name: title(LEADERS[side][cls]), side, cls, gender: 'female', x: 0, y: 0 });
    if (morale) u.morale = Math.min(u.maxMorale, Math.max(1, Number(morale) || u.maxMorale));
    return u;
  };
  const setup: ClashSetup = { attacker: unit('player', a, params.get('am')), defender: unit('enemy', d, params.get('dm')), pow: 60, seed };
  const sim = new ClashSim(setup);
  const sizes = { attacker: sim.attacker.fighters.length, defender: sim.defender.fighters.length };
  const [left, right] = await Promise.all([
    SquadLayer.load(view, 'player', a, 'left', sizes.attacker - 1),
    SquadLayer.load(view, 'enemy', d, 'right', sizes.defender - 1),
    view.setBackdrop(`${ART}../meadow.jpg`),
  ]);
  view.add(left.group, right.group);
  const names = { attacker: title(LEADERS.player[a]), defender: title(LEADERS.enemy[d]) };
  const script = new BattleScript({ attacker: a, defender: d }, sizes);
  const director = new Director(view, { attacker: left, defender: right }, sim, script, hud, names, matchup(a, d));

  const draw = (seconds: number) => {
    director.draw(seconds);
    view.render();
  };
  // Captures fix the clock with __battle.at(seconds), or open with it fixed (`?at=<seconds>`), so
  // no beat is fought before they ask; otherwise it runs in real time, from `skew` (Space jumps
  // it to the result).
  let fixed: number | null = params.has('at') ? Number(params.get('at')) || 0 : null;
  let skew = 0;
  const clock = new THREE.Clock();
  const now = () => clock.getElapsedTime() + skew;
  view.renderer.setAnimationLoop(() => fixed === null && draw(now()));
  if (fixed !== null) draw(fixed);
  // Space skips to the result; A, S and D set the player's stance, from the next beat. The enemy
  // keeps neutral until it has an AI (B7).
  const STANCE_KEYS: Record<string, Stance> = { KeyA: 'aggressive', KeyS: 'neutral', KeyD: 'passive' };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      skew += Math.max(0, director.length() - now());
    } else if (STANCE_KEYS[e.code]) {
      sim.attacker.stance = STANCE_KEYS[e.code];
      if (fixed !== null) draw(fixed);
    }
  });
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __battle: {
        ready: true,
        /** The drawing buffer against the canvas's size on the page, and the pixel ratio. */
        canvas: () => ({ w: view.canvas.width, h: view.canvas.height, cssW: view.canvas.clientWidth, cssH: view.canvas.clientHeight, dpr: window.devicePixelRatio }),
        at: (seconds: number) => draw((fixed = seconds)),
        /** When the battle opens and when it ends, in seconds. */
        lead: LEAD,
        length: () => director.length(),
        /** The rules' own result for this battle, for checks against what the scene shows. */
        rules: () => {
          const { winner, damage } = resolveClash(setup);
          return { winner, damage, morale: { attacker: setup.attacker.morale, defender: setup.defender.morale } };
        },
        /** Every character the scene could cast, for checks. */
        characters: Object.keys(CHARACTERS),
      },
    });
  }
}
