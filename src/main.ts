import * as THREE from 'three';
import { PixelPipeline, samplesFor } from './render/PixelPipeline';
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
import { GpuTimer } from './render/GpuTimer';
import { Skirmish } from './units/Skirmish';
import { animTest } from './battle/animTest';
import { battlePreview } from './battle/preview';
import { BattleScene } from './battle/BattleScene';

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
  // The battle scene draws on its own, at full resolution, without the map's pixel pipeline.
  if (new URLSearchParams(location.search).get('mode') === 'battle') return battlePreview();
  // The round 2 animation test: pose images against Flow video, side by side.
  if (new URLSearchParams(location.search).get('mode') === 'anim') return animTest();
  const stage = document.getElementById('stage')!;
  const pipeline = createPipeline(stage);
  if (!pipeline) return;

  // Crisp shadows (no blur), as befits pixel art; LightRig keeps them subtle.
  pipeline.renderer.shadowMap.enabled = true;
  pipeline.renderer.shadowMap.type = THREE.BasicShadowMap;
  // Only the board casts shadows, and it never moves, so the shadow map is redrawn only when
  // the sun moves or the board changes (see the frame loop), not every frame.
  pipeline.renderer.shadowMap.autoUpdate = false;

  const theme = themeFromUrl(location.search);
  /** The map viewer shows the board alone; otherwise the map opens straight into a skirmish. */
  const viewer = new URLSearchParams(location.search).get('mode') === 'view';
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
  rig.fitBoard(Math.max(board.map.width, board.map.height));
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
    startSkirmish();
    void next.rest();
    rig.panLimit = Math.max(map.width, map.height) / 2;
    rig.fitBoard(Math.max(map.width, map.height));
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
    // A new map keeps the weather, time, board size and mode picked for the last one.
    const params = new URLSearchParams(location.search);
    const keep = ['weather', 'time', 'size', 'mode'].filter((k) => params.has(k)).map((k) => `&${k}=${params.get(k)}`).join('');
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
  const modes = [{ id: 'skirmish', name: 'Mode: Skirmish' }, { id: 'view', name: 'Mode: Map viewer' }];
  const pickMode = (id: string) => {
    const params = new URLSearchParams(location.search);
    if (id === 'view') params.set('mode', 'view');
    else params.delete('mode');
    location.search = `?${params}`;
  };
  const askedTime = new URLSearchParams(location.search).get('time');
  const hud = new Hud(ui, {
    maps, current: theme.id, pick, weathers, weather: WEATHER_KINDS.find((k) => k === asked) ?? 'auto', pickWeather,
    times, time: [...TIMES, 'cycle'].find((t) => t === askedTime) ?? 'own', pickTime,
    ...(generated ? { sizes, size: String(board.map.width), pickSize: (id: string) => void pickSize(id) } : {}),
    modes, mode: viewer ? 'view' : 'skirmish', pickMode,
    newMap: generated ? () => void newMap() : undefined, save, load,
  });
  hud.setTitle(theme.name, theme.seed);

  /** The skirmish on the board (none in the map viewer); a new board starts a new one. */
  let skirmish: Skirmish | null = null;
  /** Whether a battle is open over the board: the map neither draws nor takes keys meanwhile. */
  let battling = false;
  function startSkirmish(): void {
    if (skirmish) {
      scene.remove(skirmish.group);
      disposeTree(skirmish.group);
      skirmish.dispose();
    }
    skirmish = null;
    keyTile = null;
    if (viewer) return;
    const { mesh } = board;
    skirmish = new Skirmish(board.map, {
      surfacePoint: (tile, u, v) => mesh.surfacePoint(tile, u, v),
      focus: (point) => rig.focusOn(point),
      say: (text) => hud.say(text),
      battle: (setup) => {
        battling = true;
        return new Promise((resolve) => {
          void BattleScene.open(setup, {
            onLeave: (outcome) => {
              battling = false;
              resolve(outcome);
            },
          });
        });
      },
    }, ui);
    scene.add(skirmish.group);
    // The opening view looks over the allies, as a battle opens on your own army.
    const allies = skirmish.units.filter((u) => u.side === 'player');
    const [cx, cy] = [allies.reduce((s, u) => s + u.x, 0) / allies.length, allies.reduce((s, u) => s + u.y, 0) / allies.length];
    const near = allies.reduce((a, u) => (Math.hypot(u.x - cx, u.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? u : a));
    rig.setPose(45, 60, theme.zoom, mesh.tileCenter(tileAt(board.map, near.x, near.y)!));
  }
  /** The tile the arrow keys have put the cursor on, while the mouse rests. */
  let keyTile: Tile | null = null;
  startSkirmish();

  window.addEventListener('keydown', (e) => {
    if (battling || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyR' && generated) void newMap();
    if (e.code === 'KeyE') save();
    if (!skirmish) return;
    if (skirmish.key(e.code)) return e.preventDefault();
    if (e.code === 'KeyC') skirmish.toggleHand();
    if (e.code === 'KeyZ') skirmish.click(keyTile ?? hovered);
    if (e.code === 'KeyX') skirmish.cancel();
    if (e.code === 'Enter') skirmish.endTurn();
    const arrow = ({ ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, [number, number]>)[e.code];
    if (arrow) {
      e.preventDefault();
      keyTile = stepOnScreen(keyTile ?? hovered ?? (skirmish.selected && tileAt(board.map, skirmish.selected.x, skirmish.selected.y)) ?? tileAt(board.map, skirmish.units[0].x, skirmish.units[0].y)!, arrow);
      rig.focusOn(board.mesh.tileCenter(keyTile));
    }
  });
  /** The neighbour of `tile` lying most nearly in the screen direction `[right, up]`. */
  function stepOnScreen(tile: Tile, [sx, sy]: [number, number]): Tile {
    const right = new THREE.Vector3().setFromMatrixColumn(rig.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(rig.camera.matrixWorld, 1);
    // Screen up, laid on the ground, points away from the camera.
    const want = new THREE.Vector2(right.x * sx + up.x * sy, right.z * sx + up.z * sy);
    const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = steps.reduce((a, b) => (b[0] * want.x + b[1] * want.y > a[0] * want.x + a[1] * want.y ? b : a));
    return tileAt(board.map, tile.x + dx, tile.y + dy) ?? tile;
  }
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) void load(file);
  });

  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pointerInside = false;
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    pointerInside = true;
    keyTile = null;
  });
  // A click is a press and release without dragging (a drag turns the camera).
  let pressedAt: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => (pressedAt = e.button === 0 ? [e.clientX, e.clientY] : null));
  canvas.addEventListener('pointerup', (e) => {
    if (pressedAt && e.button === 0 && Math.hypot(e.clientX - pressedAt[0], e.clientY - pressedAt[1]) < 5 && skirmish) {
      // Picked from where the click landed, not the last frame's hover: the two can differ on a quick click.
      const rect = canvas.getBoundingClientRect();
      const at = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(at, rig.camera);
      keyTile = null;
      skirmish.click(board.mesh.pick(raycaster));
    }
    pressedAt = null;
  });
  canvas.addEventListener('pointerleave', () => (pointerInside = false));

  const timer = new THREE.Timer();
  /** Fixed animation time in seconds, for headless captures; null = real time. */
  let frozenTime: number | null = null;
  let lastElapsed = 0;
  /** How dark it is now (0 day to 1 night), for checks. */
  let nightNow = 0;
  /** Where the sun stood, and which board was up, when the shadow map was last drawn. */
  const shadowSun = new THREE.Vector3(NaN, NaN, NaN);
  let shadowBoard: Board | null = null;
  /** GPU time per frame, measured in dev builds only. */
  const gpuTimer = import.meta.env.DEV ? new GpuTimer(pipeline.renderer.getContext() as WebGL2RenderingContext) : null;
  /** Off only for before/after captures (dev hooks): zoomed out, draw at one sample per pixel. */
  let supersampling = true;
  /** CPU milliseconds spent in each recent frame (for scripts/bench.mjs). */
  const frameCpu: number[] = [];
  pipeline.renderer.setAnimationLoop((time) => {
    // A battle has the screen: the board waits, camera and all, exactly as it was left.
    if (battling) return;
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
    if (!sun.position.equals(shadowSun) || shadowBoard !== board) {
      shadowSun.copy(sun.position);
      shadowBoard = board;
      pipeline.renderer.shadowMap.needsUpdate = true;
    }
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

    if (keyTile) {
      hovered = keyTile;
    } else if (pointerInside) {
      raycaster.setFromCamera(pointer, rig.camera);
      hovered = board.mesh.pick(raycaster);
    } else {
      hovered = null;
    }
    skirmish?.hover(hovered);
    skirmish?.update(elapsed, frozenTime === null ? timer.getDelta() : 1 / 60, rig.camera);
    if (hovered !== cursorTile) {
      const tile = (cursorTile = hovered);
      const { mesh } = board;
      cursor.setTarget(tile && ((u, v) => mesh.surfacePoint(tile, u, v)));
    }
    cursor.update(elapsed);
    tileInfo.show(hovered);

    gpuTimer?.begin();
    pipeline.render(scene, rig.camera, supersampling ? samplesFor(rig.camera.zoom) : 1);
    gpuTimer?.end();
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
        liquidReady: () => board.mesh.liquidReady,
        floraCount: () => board.flora.count,
        propCount: () => board.props.count,
        theme: () => ({ id: theme.id, focus: theme.focus, width: board.map.width, zoom: theme.zoom }),
        themes: () => THEMES.map((t) => t.id),
        seed: () => board.map.seed,
        newMap: (seed?: number) => newMap(seed),
        setSize: (size: number) => pickSize(String(size)),
        setSupersampling: (on: boolean) => (supersampling = on),
        minZoom: () => rig.controls.minZoom,
        /** GPU ms of the frames since the last call (empty without timer queries). */
        takeGpuTimes: () => gpuTimer?.times.splice(0) ?? [],
        /** Hides or shows a layer, or the sun's shadows, to see what each costs (tasks/perf/gpu-attribution.mjs). */
        setLayer(name: string, on: boolean) {
          if (name === 'shadows') sun.castShadow = on;
          pipeline.renderer.shadowMap.needsUpdate = true;
          const group = { mesh: board.mesh.group, flora: board.flora.group, props: board.props.group, weather: weather.group, ambience: ambience.group, backdrop: backdrop.mesh }[name];
          if (group) group.visible = on;
        },
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
        /** The skirmish, for checks: units, the turn, the selection and what is marked. */
        units: () => skirmish?.units.map((u) => ({ id: u.id, name: u.name, side: u.side, cls: u.cls, x: u.x, y: u.y, morale: u.morale })) ?? null,
        /** The player's hand: its cards, which are used, and whether it is open on screen. */
        hand: () => skirmish?.handInfo(),
        turn: () => skirmish && { side: skirmish.turn.side, number: skirmish.turn.number, card: skirmish.turn.card, pool: skirmish.turn.pool, moved: [...skirmish.turn.moved], attacked: skirmish.turn.attacked },
        selected: () => skirmish?.selected?.id ?? null,
        marked: () => skirmish?.marked() ?? null,
        busy: () => skirmish?.busy ?? false,
        reachable: () => skirmish?.reachable() ?? [],
        camera: () => ({
          polarDeg: THREE.MathUtils.radToDeg(rig.controls.getPolarAngle()),
          zoom: rig.camera.zoom,
          target: rig.controls.target.toArray(),
          matrix: rig.camera.matrixWorld.toArray(),
        }),
        /** Whether a battle is open over the board. */
        battling: () => battling,
        /** Moves a unit or sets its Morale, for checks (a foe next to a unit, a battle that leaves one at 0). */
        setUnit(id: string, changes: { x?: number; y?: number; morale?: number }) {
          const unit = skirmish?.units.find((u) => u.id === id);
          if (unit) Object.assign(unit, changes);
        },
      },
    });
  }
}

void main();
