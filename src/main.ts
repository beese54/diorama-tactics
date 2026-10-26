import * as THREE from 'three';
import { PixelPipeline } from './render/PixelPipeline';
import { CameraRig } from './render/CameraRig';
import { disposeTree } from './render/dispose';
import { columnShape, MapMesh, type MapShape } from './map/MapMesh';
import { Cursor } from './map/Cursor';
import { Flora, placeFlora } from './map/Flora';
import { generateMap, WORLD_SIZE } from './map/generator';
import type { GroundImage } from './map/ground';
import { BoardWorkers } from './map/BoardWorkers';
import { buildTerrainAtlas } from './map/textures';
import { parseMap, serializeMap } from './map/mapFile';
import { PropLayer } from './map/PropLayer';
import { tileAt, type MapFile, type Tile } from './map/types';
import { Backdrop } from './render/Backdrop';
import { THEMES, themeFromUrl } from './themes';
import { BOARD_SIZES, randomSeed } from './themes/world';
import { Hud } from './ui/Hud';
import { WeatherLayer } from './render/WeatherLayer';
import { AmbienceLayer } from './render/AmbienceLayer';
import { LightRig } from './render/LightRig';
import { dayAt, DayClock, TIME_NAMES, TIMES, type TimeChoice } from './render/daytime';
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

/** A map's columns and ground image, built but not yet shown; `rest` paints the ground's other frames once it is. */
interface Prepared {
  map: MapFile;
  shape: MapShape;
  ground: GroundImage;
  rest: () => Promise<void>;
}

/** Everything drawn for one map; rebuilt whole when the map changes. */
interface Board {
  map: MapFile;
  mesh: MapMesh;
  flora: Flora;
  props: PropLayer;
}

async function main(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const pipeline = createPipeline(stage);
  if (!pipeline) return;

  // Crisp shadows (no blur), as befits pixel art; LightRig keeps them subtle.
  pipeline.renderer.shadowMap.enabled = true;
  pipeline.renderer.shadowMap.type = THREE.BasicShadowMap;

  const theme = themeFromUrl(location.search);
  document.title = `${theme.name} · Diorama Tactics`;
  const { light } = theme;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(light.background);
  const hemi = new THREE.HemisphereLight(light.sky, light.bounce, light.ambient);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  sun.position.set(...light.sunFrom);
  scene.add(sun, sun.target);

  const backdrop = new Backdrop(theme.backdrop());
  scene.add(backdrop.mesh);

  const lights = new LightRig(hemi, sun, backdrop, {
    sky: light.ambient, sun: light.sunIntensity,
    skyColor: new THREE.Color(light.sky), groundColor: new THREE.Color(light.bounce), sunColor: new THREE.Color(light.sun),
    sunDir: new THREE.Vector3(...light.sunFrom).normalize(),
    litByDesign: light.propLights,
    // Mist and haze take the theme's sky colour, dimmer under a darker sun.
    fogColor: new THREE.Color(light.sky).multiplyScalar(0.55 + 0.25 * Math.min(1, light.sunIntensity / 2)),
  });
  const weather = new WeatherLayer();
  const ambience = new AmbienceLayer();
  scene.add(weather.group, ambience.group);
  const generated = theme.seed !== undefined;
  /** The time picked in the menu (kept in the URL), or the map's own: day on Wild Lands, the designed light on themed maps. */
  const timeChoice = (): TimeChoice => {
    const asked = new URLSearchParams(location.search).get('time');
    return ([...TIMES, 'cycle'] as const).find((t) => t === asked) ?? (generated ? 'day' : 'own');
  };
  const clock = new DayClock(timeChoice());
  /** The weather picked in the menu (kept in the URL), or the map's own: by seed on Wild Lands, clear on the themed maps. */
  const weatherFor = (map: MapFile): WeatherKind => {
    const asked = new URLSearchParams(location.search).get('weather');
    return WEATHER_KINDS.find((k) => k === asked) ?? (generated ? weatherForMap(map) : 'clear');
  };

  // Workers start loading now, while the first map is generated.
  const workers = new BoardWorkers();
  /** Workers paint the ground and build the columns; this thread paints the cliff atlas meanwhile. */
  const prepareBoard = async (map: MapFile): Promise<Prepared> => {
    await workers.ready;
    const painting = workers.paintGround(map, generated);
    const building = workers.buildColumns(map);
    performance.mark('board:posted');
    // Chrome passes the last of the workers' jobs on only once this thread yields.
    await new Promise((resolve) => setTimeout(resolve));
    const atlas = buildTerrainAtlas();
    performance.mark('board:atlas');
    const [{ ground, rest }, columns] = await Promise.all([painting, building]);
    performance.mark('board:parts');
    const shape = columnShape(columns, atlas);
    performance.mark('board:shape');
    return { map, shape, ground, rest };
  };
  const buildBoard = ({ map, shape, ground }: Prepared): Board => {
    const wild = theme.seed !== undefined;
    const mesh = new MapMesh(map, ground, shape);
    const surfacePoint = (tile: Tile, u: number, v: number) => mesh.surfacePoint(tile, u, v);
    // Generated maps get wild decor (reeds, pebbles, bushes, swamp murk); the themed maps stay as designed.
    const flora = new Flora(placeFlora(map, ground, wild), surfacePoint);
    const props = new PropLayer(map, surfacePoint, { lights: light.propLights });
    scene.add(mesh.group, flora.group, props.group);
    weather.setBoard({
      map,
      surfacePoint,
      setGround: (wet, snow) => (mesh.setWeather(wet, snow), flora.setSnow(snow), props.setSnow(snow)),
      setWind: (strength) => (flora.setWind(strength), props.setWind(strength)),
    });
    ambience.setBoard(map, surfacePoint);
    lights.setBoard(Math.max(map.width, map.height) / 2);
    return { map, mesh, flora, props };
  };
  const first = await prepareBoard(theme.map());
  let board = buildBoard(first);
  // When the first board was ready, for load-time measurements (works in production builds too).
  performance.mark('board-ready');
  void first.rest();
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

  /** The latest map asked for; a map that finishes preparing after a newer request is dropped. */
  let latest = 0;
  /** Swaps in a new map: the old board's meshes and textures are freed, and the cursor lets go of its tiles. */
  const showMap = async (map: MapFile) => {
    const ticket = ++latest;
    const next = await prepareBoard(map);
    if (ticket !== latest) {
      next.shape.geometry.dispose();
      next.shape.atlas.texture.dispose();
      next.shape.atlas.glow.dispose();
      return;
    }
    for (const { group } of [board.mesh, board.flora, board.props]) {
      scene.remove(group);
      disposeTree(group);
    }
    board = buildBoard(next);
    void next.rest();
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
  const newMap = async (seed = randomSeed()) => {
    setParam('map', 'world');
    setParam('seed', String(seed));
    await showMap(generateMap(seed, board.map.width));
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
  const loadText = async (text: string): Promise<string | null> => {
    try {
      await showMap(parseMap(text));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const load = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) return hud.say('That file is too large to be a map.');
    const error = await loadText(await file.text());
    hud.say(error ? `Couldn't load ${file.name}. ${error}` : `Loaded ${file.name}.`);
  };

  const maps = [...THEMES, { id: 'world', name: 'Wild Lands (random)' }];
  const pick = (id: string) => {
    // A new map keeps the weather, time and board size picked for the last one.
    const params = new URLSearchParams(location.search);
    const keep = ['weather', 'time', 'size'].filter((k) => params.has(k)).map((k) => `&${k}=${params.get(k)}`).join('');
    location.search = `?map=${id}${keep}`;
  };
  const weathers = [{ id: 'auto', name: 'Weather: the map\'s own' }, ...WEATHER_KINDS.map((k) => ({ id: k, name: WEATHER_NAMES[k] }))];
  const pickWeather = (id: string) => {
    setParam('weather', id === 'auto' ? null : id);
    weather.set(weatherFor(board.map));
  };
  const times = [{ id: 'own', name: 'Time: the map\'s own' }, ...[...TIMES, 'cycle' as const].map((t) => ({ id: t, name: TIME_NAMES[t] }))];
  const pickTime = (id: string) => {
    setParam('time', id === 'own' ? null : id);
    clock.set(timeChoice(), lastElapsed);
  };
  const sizes = BOARD_SIZES.map((n) => ({ id: String(n), name: `Board: ${n}×${n}${n === WORLD_SIZE ? ' (standard)' : ''}` }));
  /** The same seed grown again at another size, in place. */
  const pickSize = async (id: string) => {
    setParam('size', Number(id) === WORLD_SIZE ? null : id);
    await showMap(generateMap(board.map.seed, Number(id)));
    weather.set(weatherFor(board.map));
  };
  const asked = new URLSearchParams(location.search).get('weather');
  const askedTime = new URLSearchParams(location.search).get('time');
  const hud = new Hud(ui, {
    maps, current: theme.id, pick, weathers, weather: WEATHER_KINDS.find((k) => k === asked) ?? 'auto', pickWeather,
    times, time: [...TIMES, 'cycle'].find((t) => t === askedTime) ?? 'own', pickTime,
    ...(generated ? { sizes, size: String(board.map.width), pickSize: (id: string) => void pickSize(id) } : {}),
    newMap: generated ? () => void newMap() : undefined, save, load,
  });
  hud.setTitle(theme.name, theme.seed);

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyR' && generated) void newMap();
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
  let lastElapsed = 0;
  /** How dark it is now (0 day to 1 night), for checks. */
  let nightNow = 0;
  /** CPU milliseconds spent in each recent frame (for scripts/bench.mjs). */
  const frameCpu: number[] = [];
  pipeline.renderer.setAnimationLoop((time) => {
    const started = performance.now();
    timer.update(time);
    const elapsed = frozenTime ?? timer.getElapsed();
    lastElapsed = elapsed;
    rig.update();
    weather.update(elapsed);
    const hour = clock.hourAt(elapsed);
    const day = hour === null ? null : dayAt(hour);
    const look = weather.look;
    const { night, fogColor } = lights.apply(day, look, weather.flash);
    nightNow = night;
    weather.setLight(day ? 1 - 0.8 * night : Math.min(1, light.sunIntensity / 2.2), fogColor);
    board.mesh.setNightGlow(night);
    // Cloud shadows only on a bright day with broken cloud: not at night, not under rain, snow or fog.
    board.mesh.setClouds((1 - night) * (day ? day.sun : 1) * Math.max(0, 1 - 2 * (look.rain + look.snow + look.mist)));
    ambience.update(elapsed, night, look);
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
    if (import.meta.env.DEV && frameCpu.push(performance.now() - started) > 2000) frameCpu.splice(0, 1000);
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
        setSize: (size: number) => pickSize(String(size)),
        exportJson: () => serializeMap(board.map),
        loadJson: loadText,
        hudText: () => document.getElementById('hud')?.textContent ?? '',
        setWeather: (kind: WeatherKind, instant = true) => weather.set(kind, instant),
        weather: () => ({ kind: weather.kind, look: weather.look, skyLight: hemi.intensity }),
        setTimeOfDay: (choice: TimeChoice, instant = true) => clock.set(choice, lastElapsed, instant),
        pinHour: (hour: number | null) => clock.pin(hour),
        daylight: () => ({
          choice: clock.current, night: nightNow, sun: sun.intensity, sky: hemi.intensity, shadow: sun.shadow.intensity,
          sunAt: sun.position.toArray(), shadows: pipeline.renderer.shadowMap.enabled && sun.castShadow,
          fireflies: ambience.fireflyCount, chimneys: ambience.chimneyCount,
          shadowMap: !!sun.shadow.map, shadowCamera: [sun.shadow.camera.left, sun.shadow.camera.right, sun.shadow.camera.near, sun.shadow.camera.far], casters: (() => { let n = 0; scene.traverse((o) => { if (o.castShadow) n++; }); return n; })(),
        }),
        gpuMemory: () => ({ ...pipeline.renderer.info.memory }),
        renderInfo: () => ({ ...pipeline.renderer.info.render }),
        /** When each step of building the boards so far ran, in ms since the page opened (see tasks/perf/timeline.mjs). */
        loadTimeline: () => ({
          marks: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('board')).map((m) => [m.name, Math.round(m.startTime)]),
          jobs: workers.timeline.map((j) => ({ ...j, posted: Math.round(j.posted), started: Math.round(j.started), finished: Math.round(j.finished), received: Math.round(j.received) })),
        }),
        /** Triangles per layer, and how many of them also cast shadows (for scripts/bench.mjs). */
        triangles() {
          const layers = { mesh: board.mesh.group, flora: board.flora.group, props: board.props.group, weather: weather.group, ambience: ambience.group, cursor: cursor.group };
          return Object.fromEntries(Object.entries(layers).map(([name, group]) => {
            let tris = 0, casting = 0, objects = 0;
            group.traverse((o) => {
              const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
              if (!g || !(o as THREE.Mesh).isMesh) return;
              const n = ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((o as THREE.InstancedMesh).count ?? 1);
              tris += n; objects++;
              if (o.castShadow) casting += n;
            });
            return [name, { objects, tris: Math.round(tris), casting: Math.round(casting) }];
          }));
        },
        /** CPU frame times since the last call, in ms. */
        takeFrameCpu: () => frameCpu.splice(0),
        camera: () => ({
          polarDeg: THREE.MathUtils.radToDeg(rig.controls.getPolarAngle()),
          zoom: rig.camera.zoom,
          target: rig.controls.target.toArray(),
        }),
      },
    });
  }
}

void main();
