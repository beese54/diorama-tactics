import type { MapFile } from '../map/types';
import type { BackdropLayers } from '../render/Backdrop';

export interface Lighting {
  /** Clear colour behind everything (shows only if the backdrop doesn't cover the screen). */
  background: string;
  /** Hemisphere light: sky colour from above, bounce colour from below. */
  sky: string;
  bounce: string;
  ambient: number;
  sun: string;
  sunIntensity: number;
  /** Where the sun shines from (world direction, any length). */
  sunFrom: [number, number, number];
  /** Whether lamps, lanterns and fires cast light (dusk and night themes). */
  propLights: boolean;
}

/** A map category's look: its layout, its light and the scenery around the board. */
export interface Theme {
  id: string;
  name: string;
  category: string;
  map: () => MapFile;
  light: Lighting;
  backdrop: () => BackdropLayers;
  /** The landmark tile, for close-ups. */
  focus: [number, number];
  /** Starting zoom, so the whole board (tallest columns included) fits on screen. */
  zoom: number;
  /** Generated themes only: the seed their map grows from. */
  seed?: number;
}

/** Scenery is painted this wide: a full turn of the camera slides the whole strip past. */
export const PANORAMA_WIDTH = 1920;
