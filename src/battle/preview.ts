import * as THREE from 'three';
import { CLASS_IDS, CLASSES, triangleEdge, type ClassId } from '../game/units';
import { BattleHud } from '../ui/BattleHud';
import { BattleView } from './BattleView';
import { ART, CHARACTERS } from './cast';
import { LEADERS } from './lineup';
import { SquadLayer } from './SquadLayer';

const pick = (name: string, fallback: ClassId): ClassId => {
  const asked = new URLSearchParams(location.search).get(name);
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
 * The battle scene (`?mode=battle&a=<class>&d=<class>`): the player's squad of class `a` (on the
 * left) faces the rival army's squad of class `d`, at full resolution on the meadow. Each side has
 * its leader and its soldiers in formation, the enemy's soldiers in red, all breathing at rest.
 */
export async function battlePreview(): Promise<void> {
  document.title = 'Battle · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  const view = new BattleView(document.body);
  const hud = new BattleHud(document.body);
  const [a, d] = [pick('a', 'sword'), pick('d', 'axe')];
  const [left, right] = await Promise.all([
    SquadLayer.load(view, 'player', a, 'left'),
    SquadLayer.load(view, 'enemy', d, 'right'),
    view.setBackdrop(`${ART}../meadow.jpg`),
  ]);
  view.add(left.group, right.group);
  const banner = (cls: ClassId, leader: string) => {
    const { name, morale, soldiers } = CLASSES[cls];
    return { name: title(leader), cls: name, morale, maxMorale: morale, standing: soldiers + 1, total: soldiers + 1 };
  };
  hud.show(banner(a, LEADERS.player[a]), banner(d, LEADERS.enemy[d]), matchup(a, d));

  const draw = (seconds: number) => {
    left.idle(seconds);
    right.idle(seconds);
    view.render();
  };
  // Captures fix the clock with __battle.at(seconds); otherwise it runs in real time.
  let fixed: number | null = null;
  const clock = new THREE.Clock();
  view.renderer.setAnimationLoop(() => fixed === null && draw(clock.getElapsedTime()));
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __battle: {
        ready: true,
        /** The drawing buffer against the canvas's size on the page, and the pixel ratio. */
        canvas: () => ({ w: view.canvas.width, h: view.canvas.height, cssW: view.canvas.clientWidth, cssH: view.canvas.clientHeight, dpr: window.devicePixelRatio }),
        at: (seconds: number) => draw((fixed = seconds)),
        /** Every character the scene could cast, for checks. */
        characters: Object.keys(CHARACTERS),
      },
    });
  }
}
