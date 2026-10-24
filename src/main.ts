import * as THREE from 'three';
import { BASE_HEIGHT, BASE_WIDTH, PixelPipeline } from './render/PixelPipeline';
import { earthSide, grassTop } from './map/textures';

const STEP_HEIGHT = 0.5;
/** Internal pixels per world unit for this test view. */
const PIXELS_PER_UNIT = 48;

function createPipeline(): PixelPipeline | null {
  try {
    return new PixelPipeline(document.body);
  } catch {
    const msg = document.createElement('p');
    msg.id = 'fallback';
    msg.textContent = 'WebGL is not available in this browser.';
    document.body.appendChild(msg);
    return null;
  }
}

/** One stepped column: grass top, earth strata repeated once per height step. */
function createColumn(steps: number, top: THREE.Texture, side: THREE.Texture): THREE.Mesh {
  const sideTex = side.clone();
  sideTex.repeat.set(1, steps);
  sideTex.needsUpdate = true;

  const sideMat = new THREE.MeshLambertMaterial({ map: sideTex });
  const topMat = new THREE.MeshLambertMaterial({ map: top });
  const bottomMat = new THREE.MeshLambertMaterial({ color: 0x2a1e14 });

  const height = steps * STEP_HEIGHT;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), [
    sideMat, sideMat, topMat, bottomMat, sideMat, sideMat,
  ]);
  mesh.position.y = height / 2;
  return mesh;
}

function createIsoCamera(): THREE.OrthographicCamera {
  const halfW = BASE_WIDTH / PIXELS_PER_UNIT / 2;
  const halfH = BASE_HEIGHT / PIXELS_PER_UNIT / 2;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);

  const azimuth = THREE.MathUtils.degToRad(45);
  const elevation = THREE.MathUtils.degToRad(30);
  const distance = 20;
  camera.position.set(
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(0, 0.75, 0);
  return camera;
}

function main(): void {
  const pipeline = createPipeline();
  if (!pipeline) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d14);

  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2c20, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-4, 10, 6);
  scene.add(sun);

  // M0 test: three stepped columns (h1, h2, h3) to check crisp texels and strata tiling.
  const top = grassTop();
  const side = earthSide();
  [1, 2, 3].forEach((steps, i) => {
    const column = createColumn(steps, top, side);
    column.position.x = i - 1;
    scene.add(column);
  });

  const camera = createIsoCamera();
  pipeline.renderer.setAnimationLoop(() => pipeline.render(scene, camera));
}

main();
