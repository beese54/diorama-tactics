import * as THREE from 'three';
import { PixelPipeline } from './render/PixelPipeline';
import { CameraRig } from './render/CameraRig';
import { disposeTree } from './render/dispose';
import { MapMesh } from './map/MapMesh';
import { Cursor } from './map/Cursor';
import { Flora, placeFlora } from './map/Flora';
import { generateMap } from './map/generator';
import { paintGround } from './map/ground';
import { parseMap, serializeMap } from './map/mapFile';
import { PropLayer } from './map/PropLayer';
import { tileAt, type MapFile, type Tile } from './map/types';
import { Backdrop } from './render/Backdrop';
import { THEMES, themeFromUrl } from './themes';
import { randomSeed } from './themes/world';
import { Hud } from './ui/Hud';
import { WeatherLayer } from './render/WeatherLayer';
import { WEATHER_KINDS, WEATHER_NAMES, weatherForMap, type WeatherKind } from './render/weather';
import { TileInfo } from './ui/TileInfo';

/** Map files larger than this are refused unread; a full 64×64 map is well under it. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

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

/** Everything drawn for one map; rebuilt whole when the map changes. */
interface Board {
  map: MapFile;
  mesh: MapMesh;
  flora: Flora;
  props: PropLayer;
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
  const hemi = new THREE.HemisphereLight(light.sky, light.bounce, light.ambient);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(...light.sunFrom);
  scene.add(sun);

  const backdrop = new Backdrop(theme.backdrop());
  scene.add(backdrop.mesh);

  // Mist and haze take the theme's sky colour, dimmer under a darker sun.
  const fogColor = new THREE.Color(light.sky).multiplyScalar(0.55 + 0.25 * Math.min(1, light.sunIntensity / 2));
  const weather = new WeatherLayer({ hemi, sun, backdrop, fogColor, daylight: light.sunIntensity / 2.2 });
  scene.add(weather.group);
  const generated = theme.seed !== undefined;
  /** The weather picked in the menu (kept in the URL), or the map's own: by seed on Wild Lands, clear on the themed maps. */
  const weatherFor = (map: MapFile): WeatherKind => {
    const asked = new URLSearchParams(location.search).get('weather');
    return WEATHER_KINDS.find((k) => k === asked) ?? (generated ? weatherForMap(map) : 'clear');
  };

  const buildBoard = (map: MapFile): Board => {
    const wild = theme.seed !== undefined;
    const ground = paintGround(map, wild);
    const mesh = new MapMesh(map, ground);
    const surfacePoint = (tile: Tile, u: number, v: number) => mesh.surfacePoint(tile, u, v);
    // Generated maps get wild decor (reeds, pebbles, bushes, swamp murk); the themed maps stay as designed.
    const flora = new Flora(placeFlora(map, ground, wild), surfacePoint);
    const props = new PropLayer(map, surfacePoint, { lights: light.propLights });
    scene.add(mesh.group, flora.group, props.group);
    weather.setBoard({
      map,
      surfacePoint,
      setGround: (wet, snow) => (mesh.setWeather(wet, snow), flora.setSnow(snow)),
      setWind: (strength) => (flora.setWind(strength), props.setWind(strength)),
    });
    return { map, mesh, flora, props };
  };
  let board = buildBoard(theme.map());
  weather.set(weatherFor(board.map), true);

  const cursor = new Cursor();
  scene.add(cursor.group);

  const canvas = pipeline.renderer.domElement;
  const rig = new CameraRig(canvas, board.map.width / 2);
  rig.setPose(45, 60, theme.zoom);
  const ui = document.getElementById('ui')!;
  const tileInfo = new TileInfo(ui);

  let hovered: Tile | null = null;
  let cursorTile: Tile | null = null;

  /** Swaps in a new map: the old board's meshes and textures are freed, and the cursor lets go of its tiles. */
  const showMap = (map: MapFile) => {
    for (const { group } of [board.mesh, board.flora, board.props]) {
      scene.remove(group);
      disposeTree(group);
    }
    board = buildBoard(map);
    rig.panLimit = Math.max(map.width, map.height) / 2;
    hovered = cursorTile = null;
    cursor.setTarget(null);
    hud.setTitle(theme.name, theme.seed === undefined ? undefined : map.seed);
  };

  /** Rewrites one URL parameter in place (no reload), keeping the rest. */
  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(location.search);
    if (value === null) params.delete(key);
    else params.set(key, value);
    history.replaceState(null, '', `?${params}`);
  };
  const newMap = (seed = randomSeed()) => {
    setParam('map', 'world');
    setParam('seed', String(seed));
    showMap(generateMap(seed));
    weather.set(weatherFor(board.map));
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([serializeMap(board.map)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${theme.id}-${board.map.seed}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  /** Loads map text; returns null on success, or what's wrong with it. */
  const loadText = (text: string): string | null => {
    try {
      showMap(parseMap(text));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const load = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) return hud.say('That file is too large to be a map.');
    const error = loadText(await file.text());
    hud.say(error ? `Couldn't load ${file.name}. ${error}` : `Loaded ${file.name}.`);
  };

  const maps = [...THEMES, { id: 'world', name: 'Wild Lands (random)' }];
  const pick = (id: string) => {
    const keep = new URLSearchParams(location.search).get('weather');
    location.search = `?map=${id}${keep ? `&weather=${keep}` : ''}`;
  };
  const weathers = [{ id: 'auto', name: 'Weather: the map\'s own' }, ...WEATHER_KINDS.map((k) => ({ id: k, name: WEATHER_NAMES[k] }))];
  const pickWeather = (id: string) => {
    setParam('weather', id === 'auto' ? null : id);
    weather.set(weatherFor(board.map));
  };
  const asked = new URLSearchParams(location.search).get('weather');
  const hud = new Hud(ui, {
    maps, current: theme.id, pick, weathers, weather: WEATHER_KINDS.find((k) => k === asked) ?? 'auto', pickWeather,
    newMap: generated ? () => newMap() : undefined, save, load,
  });
  hud.setTitle(theme.name, theme.seed);

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyR' && generated) newMap();
    if (e.code === 'KeyE') save();
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) void load(file);
  });

  const pointer = new THREE.Vector2();
  let pointerInside = false;
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    pointerInside = true;
  });
  canvas.addEventListener('pointerleave', () => (pointerInside = false));

  const raycaster = new THREE.Raycaster();
  const timer = new THREE.Timer();
  /** Fixed animation time in seconds, for headless captures; null = real time. */
  let frozenTime: number | null = null;
  pipeline.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const elapsed = frozenTime ?? timer.getElapsed();
    rig.update();
    weather.update(elapsed);
    backdrop.update(elapsed, rig.controls.getAzimuthalAngle(), rig.controls.getPolarAngle());
    board.mesh.update(elapsed);
    board.flora.update(elapsed);
    board.props.update(elapsed);

    if (pointerInside) {
      raycaster.setFromCamera(pointer, rig.camera);
      hovered = board.mesh.pick(raycaster);
    } else {
      hovered = null;
    }
    if (hovered !== cursorTile) {
      const tile = (cursorTile = hovered);
      const { mesh } = board;
      cursor.setTarget(tile && ((u, v) => mesh.surfacePoint(tile, u, v)));
    }
    cursor.update(elapsed);
    tileInfo.show(hovered);

    pipeline.render(scene, rig.camera);
  });

  if (import.meta.env.DEV) {
    // Hooks for scripts/check.mjs (headless verification); stripped from production builds.
    Object.assign(window, {
      __map: {
        tile: (x: number, y: number) => tileAt(board.map, x, y),
        hovered: () => hovered,
        tileScreenPos(x: number, y: number) {
          const t = tileAt(board.map, x, y)!;
          const p = board.mesh.tileCenter(t).project(rig.camera);
          const rect = canvas.getBoundingClientRect();
          return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
        },
        setPose(azimuthDeg: number, polarDeg: number, zoom: number, x?: number, y?: number) {
          const t = x === undefined || y === undefined ? undefined : tileAt(board.map, x, y);
          rig.setPose(azimuthDeg, polarDeg, zoom, t && board.mesh.tileCenter(t));
        },
        setTime: (seconds: number | null) => (frozenTime = seconds),
        waterFrame: () => board.mesh.waterFrame,
        floraCount: () => board.flora.count,
        propCount: () => board.props.count,
        theme: () => ({ id: theme.id, focus: theme.focus, width: board.map.width, zoom: theme.zoom }),
        themes: () => THEMES.map((t) => t.id),
        seed: () => board.map.seed,
        newMap: (seed?: number) => newMap(seed),
        exportJson: () => serializeMap(board.map),
        loadJson: loadText,
        hudText: () => document.getElementById('hud')?.textContent ?? '',
        setWeather: (kind: WeatherKind, instant = true) => weather.set(kind, instant),
        weather: () => ({ kind: weather.kind, look: weather.look, skyLight: hemi.intensity }),
        gpuMemory: () => ({ ...pipeline.renderer.info.memory }),
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
