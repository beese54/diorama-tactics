import { mulberry32 } from '../util/rng';
import { Panorama } from '../render/panorama';
import { BASE_HEIGHT } from '../render/PixelPipeline';
import type { BackdropLayers } from '../render/Backdrop';
import { PANORAMA_WIDTH } from './types';

type Overlay = NonNullable<BackdropLayers['overlay']>;

/** A blank full-width strip of scenery to paint on, and a seeded random source for it. */
export function scenery(seed: number): { far: Panorama; rand: () => number } {
  return { far: new Panorama(PANORAMA_WIDTH, BASE_HEIGHT), rand: mulberry32(seed) };
}

/** Clouds on a transparent strip, drifting slowly sideways (2 px a second). */
export function cloudLayer(seed: number, count: number, minY: number, maxY: number, color = '#ffffff', shadow = '#dfe7ef'): Overlay {
  const layer = new Panorama(PANORAMA_WIDTH, BASE_HEIGHT, true);
  layer.clouds(mulberry32(seed), count, minY, maxY, color, shadow);
  return { canvas: layer.toCanvas(), velocity: [2, 0] };
}

/** A tile of specks (embers, spores) drifting as a whole; 64 px a loop keeps 4 s GIFs seamless. */
export function speckLayer(seed: number, count: number, colors: string[], velocity: [number, number]): Overlay {
  const layer = new Panorama(64, 64, true);
  layer.specks(mulberry32(seed), count, colors);
  return { canvas: layer.toCanvas(), velocity };
}

/** A soft band of mist on a transparent strip, drifting sideways. */
export function mistLayer(y: number, h: number, color: string, alpha: number): Overlay {
  const layer = new Panorama(PANORAMA_WIDTH, BASE_HEIGHT, true);
  layer.mist(y, h, color, alpha);
  return { canvas: layer.toCanvas(), velocity: [6, 0] };
}
