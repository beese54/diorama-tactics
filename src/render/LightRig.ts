import * as THREE from 'three';
import type { Backdrop } from './Backdrop';
import type { DayLook } from './daytime';
import type { WeatherLook } from './weather';
import { skyShadow } from './skyShadow';

/**
 * Shadows at full sun: they block this share of the sun and this share of the sky light
 * (see skyShadow.ts). Subtle, so the ground in shadow still reads clearly.
 */
const SHADOW_SUN = 0.85;
const SHADOW_SKY = 0.32;
/** How far from the board's middle the sun sits (any distance outside the board will do). */
const SUN_DISTANCE = 40;
const SHADOW_MAP = 2048;

/** The theme's own light, which time and weather scale and tint. */
export interface BaseLight {
  sky: number;
  sun: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  sunColor: THREE.Color;
  /** Unit vector toward the theme's own sun, used when the map keeps its own time. */
  sunDir: THREE.Vector3;
  /** Whether the theme is lit at dusk or night by design (its windows and lamps glow). */
  litByDesign: boolean;
  /** Mist and haze colour in the theme's own light. */
  fogColor: THREE.Color;
}

/**
 * The one place that sets the lights: the theme's own light, times the time of day (or the
 * theme's designed light when the map keeps its own time), times the weather. The sun moves
 * with the hour and casts crisp, subtle shadows across the board; at night the moon takes
 * over with a faint cold light. The scenery behind is tinted to match, with stars on clear nights.
 */
export class LightRig {
  constructor(
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
    private readonly backdrop: Backdrop,
    private readonly base: BaseLight,
  ) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    // Biases tuned so rounded tops don't shadow themselves (no acne) and walls still meet their shadow.
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.target.position.set(0, 0, 0);
  }

  /** Fits the shadow camera around a board of this half-width (in tiles). */
  setBoard(half: number): void {
    const camera = this.sun.shadow.camera;
    const reach = half * 1.5 + 4;
    Object.assign(camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: SUN_DISTANCE * 2 + 20 });
    camera.updateProjectionMatrix();
  }

  /**
   * Lights the scene for a time of day (null: the theme's own light) and a weather, with a
   * lightning flash (0-1). Returns how dark it is (0 day to 1 night) and the mist colour.
   */
  apply(day: DayLook | null, weather: WeatherLook, flash: number): { night: number; fogColor: THREE.Color } {
    const { base, hemi, sun } = this;
    const night = day ? day.night : base.litByDesign ? 1 : 0;
    // Lightning washes the storm's blue-grey out to white for a moment.
    const tint = new THREE.Color(...weather.tint).lerp(new THREE.Color(1, 1, 1), flash);
    const skyTint = day ? new THREE.Color(...day.skyTint) : new THREE.Color(1, 1, 1);
    const sunTint = day ? new THREE.Color(...day.sunColor) : new THREE.Color(1, 1, 1);

    hemi.intensity = base.sky * (day?.sky ?? 1) * (weather.sky + 1.6 * flash);
    hemi.color.copy(base.skyColor).multiply(skyTint).multiply(tint);
    hemi.groundColor.copy(base.groundColor).multiply(skyTint).multiply(tint);
    sun.intensity = base.sun * (day?.sun ?? 1) * (weather.sun + 0.8 * flash);
    sun.color.copy(base.sunColor).multiply(sunTint).multiply(tint);
    const dir = day ? new THREE.Vector3(...day.lightDir) : base.sunDir;
    sun.position.copy(dir).multiplyScalar(SUN_DISTANCE);
    // Overcast weather softens shadows along with the sun; moonlight casts faint ones.
    const strength = (day?.shadow ?? 1) * Math.min(1, weather.sun);
    sun.shadow.intensity = SHADOW_SUN * strength;
    skyShadow.value = SHADOW_SKY * strength;

    const backdropTint = (day ? new THREE.Color(...day.backdrop) : new THREE.Color(1, 1, 1)).multiply(tint).multiplyScalar(weather.sky);
    const fogColor = base.fogColor.clone().multiply(day ? new THREE.Color(...day.backdrop) : new THREE.Color(1, 1, 1));
    // Stars only on a clear night.
    const clear = 1 - Math.min(1, weather.rain + weather.snow + weather.mist + weather.haze);
    this.backdrop.setWeather(backdropTint, fogColor, weather.haze, flash, (day?.night ?? 0) * clear);
    return { night, fogColor };
  }
}
