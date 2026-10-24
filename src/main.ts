import * as THREE from 'three';
import { PixelPipeline } from './render/PixelPipeline';
import { CameraRig } from './render/CameraRig';
import { MapMesh } from './map/MapMesh';
import { Cursor } from './map/Cursor';
import { createTestMap } from './map/testMap';
import { tileAt, type Tile } from './map/types';
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d14);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2c20, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-4, 10, 6);
  scene.add(sun);

  const map = createTestMap();
  const mapMesh = new MapMesh(map);
  scene.add(mapMesh.group);

  const cursor = new Cursor();
  scene.add(cursor.group);

  const canvas = pipeline.renderer.domElement;
  const rig = new CameraRig(canvas, map.width / 2);
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

  const timer = new THREE.Timer();
  pipeline.renderer.setAnimationLoop((time) => {
    timer.update(time);
    rig.update();

    if (pointerInside) {
      raycaster.setFromCamera(pointer, rig.camera);
      hovered = mapMesh.pick(raycaster);
    } else {
      hovered = null;
    }
    cursor.setTarget(hovered ? mapMesh.tileCenter(hovered) : null);
    cursor.update(timer.getElapsed());
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
