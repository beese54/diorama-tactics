import { CLASSES } from '../game/units';
import { BattleHud } from '../ui/BattleHud';
import { BattleView } from './BattleView';

/** Where the processed battle art is served from (public/battle). */
const ART = `${import.meta.env.BASE_URL}battle/`;

/**
 * The battle style frame (`?mode=battle`): one still battle at full resolution, from the first
 * round of Flow art: Aria's sword squad against a red one led by a man, men and women in both
 * ranks, on the meadow, before any animation.
 */
export async function battlePreview(): Promise<void> {
  document.title = 'Battle · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  const view = new BattleView(document.body);
  const hud = new BattleHud(document.body);
  const { soldiers, morale, name } = CLASSES.sword;
  await Promise.all([
    view.setBackdrop(`${ART}meadow.jpg`),
    view.setSquad('left', { head: `${ART}sword-leader-f.png`, soldier: [`${ART}sword-soldier-f.png`, `${ART}sword-soldier.png`], soldiers }),
    view.setSquad('right', { head: `${ART}sword-leader-red.png`, soldier: [`${ART}sword-soldier-red.png`, `${ART}sword-soldier-f-red.png`], soldiers }),
  ]);
  const banner = (who: string) => ({ name: who, cls: name, morale, maxMorale: morale, standing: soldiers + 1, total: soldiers + 1 });
  hud.show(banner('Aria'), banner('Roderic'), 'Even match · sword against sword');
  view.renderer.setAnimationLoop(() => view.render());
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __battle: {
        ready: true,
        /** The drawing buffer against the canvas's size on the page, and the pixel ratio. */
        canvas: () => ({ w: view.canvas.width, h: view.canvas.height, cssW: view.canvas.clientWidth, cssH: view.canvas.clientHeight, dpr: window.devicePixelRatio }),
      },
    });
  }
}
