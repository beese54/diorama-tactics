import * as THREE from 'three';
import { CLASSES, type ClassId, type Side } from '../game/units';
import { DESIGN_H, type BattleView } from './BattleView';
import { CHARACTERS, Dust, Figure, loadSet, type Character, type Effect, type Frame } from './cast';
import { formation, type Place } from './formation';
import { lineup } from './lineup';
import { sample, type Beat } from './poseClip';

/** The stance held still, breathing. */
const IDLE: Beat[] = [{ pose: 'stance', seconds: 1.6, breathe: true }];
/** A place's scale is relative to the head's (1.06): a character's height is its size there. */
const HEAD_PLACE = 1.06;

/** One fighter on the field: its figure, its character and poses, its weapon effect and dust, and where it stands. */
export interface FighterView {
  figure: Figure;
  character: Character;
  frames: Map<string, Frame>;
  effect: Effect;
  dust: Dust;
  place: Place;
  /** Its scale against the character's own size (the far ranks stand smaller). */
  scale: number;
}

/**
 * One side's squad in the battle scene: the leader and the soldiers, each a figure with its own
 * poses, standing in formation on its half of the field (the attacker on the left, facing right;
 * the defender mirrored on the right). Fighters are listed in the rules' order: the head first.
 */
export class SquadLayer {
  readonly group = new THREE.Group();

  private constructor(readonly fighters: FighterView[]) {
    // Farther ranks are drawn first (by render order); each fighter's parts keep their order among themselves.
    for (const f of fighters) {
      this.group.add(f.figure.group);
      f.figure.group.traverse((o) => (o.renderOrder += Math.round(f.place.y * 1000) * 10));
    }
  }

  /** Loads the poses for a squad of `cls` on `side` and stands it in formation on the `at` half of the field. */
  static async load(view: BattleView, side: Side, cls: ClassId, at: 'left' | 'right'): Promise<SquadLayer> {
    const { soldiers, large } = CLASSES[cls];
    const cast = lineup(side, cls, soldiers);
    const ids = [cast.leader, ...cast.soldiers];
    const sets = new Map(
      await Promise.all([...new Set(ids)].map(async (id) => [id, await loadSet(view, CHARACTERS[id].set, CHARACTERS[id].height)] as const)),
    );
    const dir = at === 'left' ? -1 : 1;
    const fighters: FighterView[] = [];
    for (const place of formation(soldiers, large)) {
      const id = ids[place.fighter];
      const character = CHARACTERS[id];
      const { k, frames } = sets.get(id)!;
      const scale = place.scale / HEAD_PLACE;
      const figure = new Figure(k * scale, character.height * scale, cast.red && place.fighter > 0);
      // Farther ranks take a touch of the sky's haze.
      figure.shade = 1 - (1 - place.scale) * 0.35;
      const effect = character.effect();
      effect.mesh.scale.setScalar(k * scale);
      figure.body.add(effect.mesh);
      const dust = new Dust();
      figure.group.add(dust.group);
      figure.group.position.set(dir * place.x * view.width, DESIGN_H / 2 - place.y * DESIGN_H, 0);
      // The art faces right; the right-hand squad is mirrored to face left.
      figure.group.scale.x = -dir;
      fighters[place.fighter] = { figure, character, frames, effect, dust, place, scale };
    }
    return new SquadLayer(fighters);
  }

  /** Everyone at rest, breathing out of step with each other. */
  idle(seconds: number): void {
    for (const [i, f] of this.fighters.entries()) {
      const s = sample(IDLE, seconds + i * 0.37);
      f.figure.show(f.frames.get(s.pose)!, s.body);
      f.figure.tint(0);
      f.effect.update(-1, 0);
      f.dust.update(-1, 0);
    }
  }
}
