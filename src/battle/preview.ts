import type { ClashSetup } from '../game/clash';
import { FIXED_POW } from '../game/turn';
import { CLASS_IDS, makeUnit, type ClassId, type Side } from '../game/units';
import { BattleScene } from './BattleScene';
import { LEADERS } from './lineup';

const params = new URLSearchParams(location.search);
const pick = (name: string, fallback: ClassId): ClassId => {
  const asked = params.get(name);
  return CLASS_IDS.find((c) => c === asked) ?? fallback;
};

/** The leader's name as the HUD shows it. */
const title = (id: string) => id[0].toUpperCase() + id.slice(1);

/**
 * The battle scene on its own (`?mode=battle&a=<class>&d=<class>&seed=<n>`, with `&am=`/`&dm=`
 * for each side's Morale and `&at=<seconds>` to open it still): the player's squad of class `a`
 * attacks the rival army's squad of class `d`. With no map behind it, a finished battle
 * stays on its result.
 */
export async function battlePreview(): Promise<void> {
  document.title = 'Battle · Diorama Tactics';
  document.getElementById('stage')!.hidden = true;
  // A gender only shapes a Union on the map; it plays no part in a battle. `?am=` and `?dm=` set
  // each side's Morale (full by default), and with it the soldiers it brings.
  const unit = (side: Side, cls: ClassId, morale: string | null) => {
    const u = makeUnit({ id: `${side}-${cls}`, name: title(LEADERS[side][cls]), side, cls, gender: 'female', x: 0, y: 0 });
    if (morale) u.morale = Math.min(u.maxMorale, Math.max(1, Number(morale) || u.maxMorale));
    return u;
  };
  const setup: ClashSetup = {
    attacker: unit('player', pick('a', 'sword'), params.get('am')),
    defender: unit('enemy', pick('d', 'axe'), params.get('dm')),
    pow: FIXED_POW,
    seed: Number(params.get('seed')) || 1,
  };
  await BattleScene.open(setup, { at: params.has('at') ? Number(params.get('at')) || 0 : null });
}
