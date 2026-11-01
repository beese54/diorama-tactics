import * as THREE from 'three';
import { CARDS } from '../game/cards';
import { CARD_WORLD_H, CardView, DEFAULT_PARAMS, type CardParams } from './CardView';
import { loadCardFonts } from './frameArt';
import { ART, CARD_H } from './layout';

declare global {
  interface Window {
    __card?: {
      ready: boolean;
      id: string;
      loaded: Record<string, boolean>;
      flipped(): boolean;
      flip(): void;
      hover(on: boolean): void;
      hovered(): boolean;
      /** The card's tilt now (each axis -1 to 1). */
      tilt(): { x: number; y: number };
      clip(): { has: boolean; mix: number; time: number; playing: boolean };
      seekClip(seconds: number): void;
      /** The tilt goal while hovered (each axis -1 to 1). */
      aim(x: number, y: number): void;
      /** The card's on-screen box, in CSS pixels. */
      rect(): { x: number; y: number; width: number; height: number };
      params: CardParams;
    };
  }
}

/** Card height as a share of the screen's height (or width as a share of its width, if narrower). */
const FILL_H = 0.84;
const FILL_W = 0.86;
const FOV = 26;

/**
 * The card showcase (`?mode=card&id=<card id>&side=enemy`): one card, centred on a dark radial
 * backdrop, at full device resolution. It tilts toward the pointer (touch-drag and the phone's
 * gyroscope too), floats at rest, and a click or tap flips it. Hovering plays its clip.
 */
export async function cardShowcase(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const card = CARDS.find((c) => c.id === params.get('id')) ?? CARDS[0];
  const side = params.get('side') === 'enemy' ? 'enemy' : 'player';
  document.title = `${card.name} · Diorama Tactics`;
  document.getElementById('stage')!.hidden = true;
  document.body.style.background = 'radial-gradient(ellipse at 50% 42%, #2a3352 0%, #12162a 45%, #05060c 100%)';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.id = 'card-showcase';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', imageRendering: 'auto', touchAction: 'none' });
  document.body.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const live: CardParams = { ...DEFAULT_PARAMS };
  await loadCardFonts();

  /** The art window's size on screen in device pixels, so the art is drawn sharp but no larger. */
  const artPixels = () => {
    const h = Math.min(innerHeight * FILL_H, (innerWidth * FILL_W) * CARD_WORLD_H);
    return THREE.MathUtils.clamp(Math.ceil(((h * ART.size) / CARD_H) * devicePixelRatio * 1.15), 512, 2048);
  };
  const view = await CardView.create(card, side, live, artPixels());
  scene.add(view.group);

  const resize = () => {
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // Far enough that the card fills FILL_H of the height, or FILL_W of the width if that is less.
    const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const byHeight = CARD_WORLD_H / FILL_H / 2 / half;
    const byWidth = 1 / FILL_W / 2 / (half * camera.aspect);
    camera.position.set(0, 0, Math.max(byHeight, byWidth));
    camera.updateProjectionMatrix();
    view.stage.resize(artPixels());
  };
  resize();
  addEventListener('resize', resize);

  // ---- the pointer: hover tilts and plays the clip, a click or tap flips ----------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** Where the pointer is on the card's rest shape, each axis -1 to 1, or null if off it. */
  const onCard = (e: PointerEvent): THREE.Vector2 | null => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // Against the card's rest plane (z = 0), so the tilt itself doesn't move the target.
    const t = -ray.ray.origin.z / ray.ray.direction.z;
    const p = ray.ray.at(t, new THREE.Vector3());
    const x = p.x / 0.5;
    const y = p.y / (CARD_WORLD_H / 2);
    return Math.abs(x) <= 1.04 && Math.abs(y) <= 1.04 ? new THREE.Vector2(x, y) : null;
  };
  let down: { x: number; y: number; t: number } | null = null;
  canvas.addEventListener('pointermove', (e) => {
    const at = onCard(e);
    if (at) view.tiltGoal.set(THREE.MathUtils.clamp(at.x, -1, 1), THREE.MathUtils.clamp(at.y, -1, 1));
    if (!!at !== view.hovered) view.hover(!!at);
  });
  canvas.addEventListener('pointerleave', () => view.hover(false));
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    void askForGyro();
    const at = onCard(e);
    if (at && e.pointerType !== 'mouse') {
      view.tiltGoal.set(at.x, at.y);
      view.hover(true);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const tap = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 450;
    if (tap && onCard(e)) {
      view.flip();
      view.hover(e.pointerType === 'mouse' && !view.flipped);
    } else if (e.pointerType !== 'mouse') view.hover(false);
    down = null;
  });

  // ---- the gyroscope, on phones: the card tilts as the phone does, when not being touched ------
  let gyroAsked = false;
  let baseBeta: number | null = null;
  const gyro = new THREE.Vector2();
  let gyroOn = false;
  async function askForGyro(): Promise<void> {
    if (gyroAsked) return;
    gyroAsked = true;
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (D?.requestPermission) {
      try {
        if ((await D.requestPermission()) !== 'granted') return;
      } catch {
        return;
      }
    }
    addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      baseBeta ??= e.beta;
      gyro.set(THREE.MathUtils.clamp(e.gamma / 25, -1, 1), THREE.MathUtils.clamp((baseBeta - e.beta) / 25, -1, 1));
      gyroOn = true;
    });
  }

  // ---- dev controls ----------------------------------------------------------------------------
  if (import.meta.env.DEV && !params.has('clean')) devPanel(live, view);

  window.__card = {
    ready: false,
    id: card.id,
    loaded: view.stage.loaded,
    flipped: () => view.flipped,
    flip: () => view.flip(),
    hover: (on) => view.hover(on),
    hovered: () => view.hovered,
    tilt: () => ({ x: view.tilt.x, y: view.tilt.y }),
    clip: () => view.stage.clipState(),
    seekClip: (s) => view.stage.seekClip(s),
    aim: (x, y) => view.tiltGoal.set(x, y),
    rect: () => {
      const corners = [new THREE.Vector3(-0.5, -CARD_WORLD_H / 2, 0), new THREE.Vector3(0.5, CARD_WORLD_H / 2, 0)].map((v) => v.project(camera));
      const [a, b] = corners.map((v) => ({ x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }));
      return { x: a.x, y: b.y, width: b.x - a.x, height: a.y - b.y };
    },
    params: live,
  };

  // The loop runs on requestAnimationFrame's own clock, so a capture that steps frames by hand
  // steps the card's time with them.
  let last: number | null = null;
  const frame = (now: number) => {
    const time = now / 1000;
    const dt = last === null ? 1 / 60 : Math.min(0.1, time - last);
    last = time;
    if (gyroOn && !view.hovered) view.tiltGoal.copy(gyro);
    view.update(time, dt, renderer);
    renderer.render(scene, camera);
    window.__card!.ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Sliders for the card's settings, and which of its files loaded (dev builds only). */
function devPanel(live: CardParams, view: CardView): void {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '12px', right: '12px', padding: '10px 12px', background: 'rgba(8, 10, 20, 0.78)', color: '#e8e2cf',
    font: '12px/1.5 "Source Sans 3", sans-serif', borderRadius: '8px', zIndex: '10', width: '220px',
  });
  const sliders: [keyof CardParams, string, number, number, number][] = [
    ['maxTilt', 'Max tilt (°)', 0, 30, 1],
    ['spread', 'Layer spread', 0, 0.15, 0.005],
    ['depth', 'Depth strength', 0, 3, 0.1],
    ['foil', 'Foil', 0, 2, 0.05],
    ['light', 'Light effects', 0, 2, 0.05],
    ['clipStart', 'Clip start (s)', 0, 3, 0.1],
    ['crossfade', 'Crossfade (s)', 0.05, 2, 0.05],
  ];
  for (const [key, label, min, max, step] of sliders) {
    const row = document.createElement('label');
    row.style.display = 'block';
    const value = document.createElement('span');
    const input = Object.assign(document.createElement('input'), { type: 'range', min: String(min), max: String(max), step: String(step), value: String(live[key]) });
    input.style.width = '100%';
    const show = () => (value.textContent = ` ${live[key]}`);
    input.addEventListener('input', () => {
      live[key] = Number(input.value);
      show();
    });
    row.append(label, value, input);
    show();
    panel.appendChild(row);
  }
  const files = document.createElement('div');
  files.style.marginTop = '6px';
  files.innerHTML = Object.entries(view.stage.loaded)
    .map(([f, ok]) => `<div style="color:${ok ? '#9fd59b' : '#e59a8f'}">${ok ? '✓' : '✗'} ${f}</div>`)
    .join('');
  panel.appendChild(files);
  document.body.appendChild(panel);
}
