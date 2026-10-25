import * as THREE from 'three';
import { PixelPipeline } from './render/PixelPipeline';
import { CameraRig } from './render/CameraRig';
import { MapMesh } from './map/MapMesh';
import { Cursor } from './map/Cursor';
import { Flora, placeFlora } from './map/Flora';
import { paintGround } from './map/ground';
import { PropLayer } from './map/PropLayer';
import { tileAt, type Tile } from './map/types';
import { Backdrop } from './render/Backdrop';
import { THEMES, themeFromUrl } from './themes';
import { TileInfo } from './ui/TileInfo';

function createPipeline(stage: HTMLElement): PixelPipeline | null {
  try {
    return new PixelPipeline(stage);
  } catch {
    const msg = document.createElement('p');
    msg.id = 'fallback';
    msg.textContent = 'WebGL is not available in this browser.';
    document.body.appendChild(msg);
    return null;
  }
}

function main(): void {
  const stage = document.getElementById('stage')!;
  const pipeline = createPipeline(stage);
  if (!pipeline) return;

  const theme = themeFromUrl(location.search);
  document.title = `${theme.name} · Diorama Tactics`;
  const { light } = theme;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(light.background);
  scene.add(new THREE.HemisphereLight(light.sky, light.bounce, light.ambient));
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(...light.sunFrom);
  scene.add(sun);

  const backdrop = new Backdrop(theme.backdrop());
  scene.add(backdrop.mesh);

  const map = theme.map();
  const ground = paintGround(map);
  const mapMesh = new MapMesh(map, ground);
  scene.add(mapMesh.group);
  const surfacePoint = (tile: Tile, u: number, v: number) => mapMesh.surfacePoint(tile, u, v);
  const flora = new Flora(placeFlora(map, ground), surfacePoint);
  scene.add(flora.group);
  const props = new PropLayer(map, surfacePoint, { lights: light.propLights });
  scene.add(props.group);

  const cursor = new Cursor();
  scene.add(cursor.group);

  const canvas = pipeline.renderer.domElement;
  const rig = new CameraRig(canvas, map.width / 2);
  rig.setPose(45, 60, theme.zoom);
  const tileInfo = new TileInfo(document.getElementById('ui')!);

  const pointer = new THREE.Vector2();
  let pointerInside = false;
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    pointerInside = true;
  });
  canvas.addEventListener('pointerleave', () => (pointerInside = false));

  const raycaster = new THREE.Raycaster();
  let hovered: Tile | null = null;
  let cursorTile: Tile | null = null;

  const timer = new THREE.Timer();
  /** Fixed animation time in seconds, for headless captures; null = real time. */
  let frozenTime: number | null = null;
  pipeline.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const elapsed = frozenTime ?? timer.getElapsed();
    rig.update();
    backdrop.update(elapsed, rig.controls.getAzimuthalAngle(), rig.controls.getPolarAngle());
    mapMesh.update(elapsed);
    flora.update(elapsed);
    props.update(elapsed);

    if (pointerInside) {
      raycaster.setFromCamera(pointer, rig.camera);
      hovered = mapMesh.pick(raycaster);
    } else {
      hovered = null;
    }
    if (hovered !== cursorTile) {
      const tile = (cursorTile = hovered);
      cursor.setTarget(tile && ((u, v) => mapMesh.surfacePoint(tile, u, v)));
    }
    cursor.update(elapsed);
    tileInfo.show(hovered);

    pipeline.render(scene, rig.camera);
  });

  if (import.meta.env.DEV) {
    // Hooks for scripts/check.mjs (headless verification); stripped from production builds.
    Object.assign(window, {
      __map: {
        tile: (x: number, y: number) => tileAt(map, x, y),
        hovered: () => hovered,
        tileScreenPos(x: number, y: number) {
          const t = tileAt(map, x, y)!;
          const p = mapMesh.tileCenter(t).project(rig.camera);
          const rect = canvas.getBoundingClientRect();
          return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
        },
        setPose(azimuthDeg: number, polarDeg: number, zoom: number, x?: number, y?: number) {
          const t = x === undefined || y === undefined ? undefined : tileAt(map, x, y);
          rig.setPose(azimuthDeg, polarDeg, zoom, t && mapMesh.tileCenter(t));
        },
        setTime: (seconds: number | null) => (frozenTime = seconds),
        waterFrame: () => mapMesh.waterFrame,
        floraCount: () => flora.count,
        propCount: () => props.count,
        theme: () => ({ id: theme.id, focus: theme.focus, width: map.width, zoom: theme.zoom }),
        themes: () => THEMES.map((t) => t.id),
        camera: () => ({
          polarDeg: THREE.MathUtils.radToDeg(rig.controls.getPolarAngle()),
          zoom: rig.camera.zoom,
          target: rig.controls.target.toArray(),
        }),
      },
    });
  }
}

main();
