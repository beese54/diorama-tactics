import { createTestMap } from '../map/testMap';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

/** The first map, kept as the baseline: river, lake, forest, swamp and mountain. */
export const meadow: Theme = {
  id: 'meadow',
  name: 'Meadow Vale',
  category: 'Wilds',
  map: () => createTestMap(),
  focus: [21, 10],
  zoom: 1,
  light: {
    background: '#0b0d14', sky: '#dfe6ff', bounce: '#3a2c20', ambient: 1.4,
    sun: '#fff1d6', sunIntensity: 2.2, sunFrom: [-4, 10, 6], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(11);
    far.sky([[0, '#5f97d2'], [150, '#a8cdea'], [215, '#d8ebf4'], [269, '#e4f0f6']]);
    far.sun(1500, 46, 9, '#fff7dc');
    far.ridge({ seed: 3, base: 205, amp: 70, period: 6, color: '#9fb4b8', shade: '#8ea4aa' });
    far.ridge({ seed: 5, base: 228, amp: 40, period: 9, color: '#7f9f84', shade: '#6f8f76' });
    far.treeline({ rand, base: 246, color: '#557a52', light: '#638a5c', kind: 'round', size: 9 });
    far.birds(rand, 10, '#3a4450', 60);
    return { far: far.toCanvas(), overlay: cloudLayer(12, 16, 25, 140) };
  },
};
