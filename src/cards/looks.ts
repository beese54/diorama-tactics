/**
 * Each card's own look (cards.md, Part 3): the light and particles the code draws over its art,
 * and the palette that tints them and the card's empty art window. Pure data.
 */

export type LightKind = 'sunbeams' | 'daylight' | 'mist' | 'bloom' | 'storm-break' | 'aura' | 'rim' | 'firelight' | 'torchlight' | 'lightning' | 'moonbeams' | 'candlelight';
export type ParticleKind = 'dust' | 'petals' | 'leaves' | 'drizzle' | 'embers' | 'rain' | 'sparks' | 'ash' | 'gold-dust';

export interface Look {
  light: LightKind;
  particles: ParticleKind;
  /** The light's colour, and the particles'. */
  glow: string;
  mote: string;
  /** Where the light comes from, in the art window (0..1, from the top left). */
  source: [number, number];
  /** The art window's own colours when the card has no art yet: top and bottom. */
  sky: [string, string];
}

export const LOOKS: Record<string, Look> = {
  'long-road': { light: 'sunbeams', particles: 'dust', glow: '#ffc979', mote: '#ffe2b0', source: [0.79, 0.35], sky: ['#f5b46a', '#5d7a4a'] },
  'swift-banner': { light: 'daylight', particles: 'petals', glow: '#fff3d6', mote: '#ffffff', source: [0.7, 0.1], sky: ['#7fb6e8', '#c9b27a'] },
  'scouts-path': { light: 'mist', particles: 'leaves', glow: '#e6efe9', mote: '#e0a24a', source: [0.3, 0.05], sky: ['#9fb1b4', '#4d5b4c'] },
  'open-field': { light: 'bloom', particles: 'petals', glow: '#fffbe8', mote: '#fff6c2', source: [0.5, 0.05], sky: ['#cfe6f7', '#a7c46a'] },
  'iron-column': { light: 'storm-break', particles: 'drizzle', glow: '#e9f1ff', mote: '#cfdcf0', source: [0.6, 0.1], sky: ['#5d6878', '#3b4048'] },
  'ember-rite': { light: 'aura', particles: 'embers', glow: '#ff9a3c', mote: '#ffb35c', source: [0.5, 0.45], sky: ['#e2794a', '#3d2c3e'] },
  'steady-line': { light: 'rim', particles: 'rain', glow: '#d5e2f0', mote: '#b9c8d8', source: [0.2, 0.15], sky: ['#76828f', '#4a4038'] },
  'cleavers-oath': { light: 'firelight', particles: 'sparks', glow: '#ff7a2e', mote: '#ffc06a', source: [0.5, 0.85], sky: ['#1d1830', '#5a2418'] },
  'shield-wall': { light: 'torchlight', particles: 'dust', glow: '#ffb04f', mote: '#ffd9a0', source: [0.15, 0.3], sky: ['#3a3040', '#5e4632'] },
  'thunder-hoof': { light: 'lightning', particles: 'rain', glow: '#d9d2ff', mote: '#c9c6e8', source: [0.6, 0.0], sky: ['#3d3858', '#2a2630'] },
  'grave-toll': { light: 'moonbeams', particles: 'ash', glow: '#bcd2ff', mote: '#c8cdd8', source: [0.75, 0.1], sky: ['#26314d', '#1a1d26'] },
  'kings-wager': { light: 'candlelight', particles: 'gold-dust', glow: '#ffcf7a', mote: '#ffe39a', source: [0.3, 0.5], sky: ['#4a2e22', '#2a1a14'] },
};
