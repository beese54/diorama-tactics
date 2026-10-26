import { buildColumnRange, joinColumns, type ColumnData } from './columns';
import { composeGround, paintGround, paintLiquids, type GroundImage, type LandImage, type LiquidLayer } from './ground';
import { ALL_FRAMES } from './liquid';
import { isFlat } from './surface';
import type { MapFile } from './types';

/** Work for one board worker: the land, some of the liquid frames, or a run of columns. */
export type BoardJob = { id: number; map: MapFile; wild: boolean } & (
  | { kind: 'land' }
  | { kind: 'liquids'; frames: number[] }
  | { kind: 'frames'; frames: number[]; land: LandImage }
  | { kind: 'columns'; from: number; to: number }
);
export interface BoardResult {
  id: number;
  land?: LandImage;
  liquids?: LiquidLayer[];
  columns?: ColumnData;
  /** Whole ground frames (and their glow), for the frames asked for, in that order. */
  frames?: { rgba: Uint8Array[]; glow: Uint8Array[] | null };
  /** When the worker started and finished the job (epoch ms), for the load timeline. */
  took?: [number, number];
}

/** One job of the last board, in ms since the page opened: when it was posted, run and received. */
export interface JobTiming {
  kind: BoardJob['kind'];
  posted: number;
  started: number;
  finished: number;
  received: number;
}
/** The id a worker sends once it has loaded and is listening. */
export const READY = 0;

/**
 * Before a board appears: the land, the liquids' first frame, and the columns in COLUMN_JOBS
 * runs, each on its own worker. After: the other frames in REST_JOBS runs. More workers than
 * this ran slower on a laptop, whose cores then share power and whose slower cores join in.
 */
const COLUMN_JOBS = 3;
const REST_JOBS = 3;
/** One worker per job when the machine has the cores, leaving two for the page. */
const workerCount = () => Math.min(2 + COLUMN_JOBS, Math.max(0, (navigator.hardwareConcurrency || 2) - 2));
/** Rough cost of building a tile's column: a rounded top has many more vertices than a flat one. */
const ROUNDED_COST = 6;

/** Splits `n` items into `parts` runs in order, as even as they go: [from, to) pairs. */
export function shareRuns(n: number, parts: number): [number, number][] {
  return Array.from({ length: parts }, (_, k) => [Math.round((k * n) / parts), Math.round(((k + 1) * n) / parts)]);
}

/** Splits items into `parts` runs in order, with about equal total weight in each: [from, to) pairs. */
export function weightedRuns(weights: readonly number[], parts: number): [number, number][] {
  const total = weights.reduce((a, b) => a + b, 0);
  const cuts = [0];
  let sum = 0;
  weights.forEach((w, i) => {
    sum += w;
    if (cuts.length < parts && sum >= (total * cuts.length) / parts) cuts.push(i + 1);
  });
  while (cuts.length < parts) cuts.push(weights.length);
  return cuts.map((from, k) => [from, k + 1 < parts ? cuts[k + 1] : weights.length]);
}

/** Splits the loop's frames into `n` runs in order, as even as they go. */
export const shareFrames = (n: number): number[][] => shareRuns(ALL_FRAMES.length, n).map(([a, b]) => ALL_FRAMES.slice(a, b));

/**
 * Builds the heavy parts of a board on worker threads: one paints the land, one the liquids'
 * first frame, and others build runs of columns; the rest of the liquid loop follows once the
 * board is up. The results are the same as building them on the main thread, which is what
 * happens when workers aren't available.
 */
export class BoardWorkers {
  /**
   * Resolves once every worker has loaded. A browser starts a worker with the main thread's
   * help, so await this before a long stretch of main-thread work, or the workers wait for it to end.
   */
  readonly ready: Promise<void>;
  private readonly workers: Worker[] = [];
  private readonly waiting = new Map<number, { done: (r: BoardResult) => void; fail: (e: unknown) => void }>();
  private nextId = READY;
  /** Spreads jobs over the workers in turn. */
  private turn = 0;
  /** The jobs of the boards built so far, for the load timeline (dev hooks). */
  readonly timeline: JobTiming[] = [];
  /** Set when a worker fails to load or crashes; everything is then built on the main thread. */
  private broken = false;

  constructor() {
    const loads: Promise<void>[] = [];
    try {
      for (let i = 0; i < workerCount(); i++) {
        const worker = new Worker(new URL('./board.worker.ts', import.meta.url), { type: 'module' });
        loads.push(new Promise((loaded) => {
          worker.onmessage = (e: MessageEvent<BoardResult>) => (e.data.id === READY ? loaded() : this.settle(e.data.id)?.done(e.data));
          worker.onerror = (e) => {
            e.preventDefault();
            this.broken = true;
            loaded();
            for (const id of [...this.waiting.keys()]) this.settle(id)?.fail(e.message);
          };
        }));
        this.workers.push(worker);
      }
    } catch {
      this.workers.length = 0;
    }
    this.ready = Promise.all(loads).then(() => undefined);
  }

  private get usable(): boolean {
    return this.workers.length > 1 && !this.broken;
  }

  /**
   * The ground image for `map` with its first frame, and `rest`, which paints the other frames
   * into it. Call `rest` once the board is up: until then the liquids hold still on frame 0.
   */
  async paintGround(map: MapFile, wild: boolean): Promise<{ ground: GroundImage; rest: () => Promise<void> }> {
    const nothing = async () => {};
    if (!this.usable) return { ground: paintGround(map, wild), rest: nothing };
    try {
      const [{ land }, { liquids }] = await Promise.all([
        this.run({ id: 0, map, wild, kind: 'land' }),
        this.run({ id: 0, map, wild, kind: 'liquids', frames: [0] }),
      ]);
      const ground = composeGround(land!, liquids!, [0]);
      const rest = async () => {
        const later = shareRuns(ALL_FRAMES.length - 1, REST_JOBS).map(([a, b]) => ALL_FRAMES.slice(1 + a, 1 + b));
        try {
          // Each worker paints its frames and lays them over the land, so this thread only files them.
          const parts = await Promise.all(later.map((frames) => this.run({ id: 0, map, wild, kind: 'frames', frames, land: land! })));
          parts.forEach(({ frames }, k) => later[k].forEach((f, i) => {
            ground.frames[f] = frames!.rgba[i];
            if (ground.glow && frames!.glow) ground.glow[f] = frames!.glow[i];
          }));
        } catch {
          composeGround(land!, paintLiquids(map, wild, ALL_FRAMES.slice(1)), ALL_FRAMES.slice(1), ground);
        }
      };
      return { ground, rest };
    } catch {
      return { ground: paintGround(map, wild), rest: nothing };
    }
  }

  /** Every column of `map`, built in runs of tiles and joined. */
  async buildColumns(map: MapFile): Promise<ColumnData> {
    if (!this.usable) return buildColumnRange(map);
    try {
      const weights = map.tiles.map((t) => (isFlat(map, t) ? 1 : ROUNDED_COST));
      const parts = await Promise.all(weightedRuns(weights, COLUMN_JOBS).map(([from, to]) => this.run({ id: 0, map, wild: false, kind: 'columns', from, to })));
      return joinColumns(parts.map((p) => p.columns!));
    } catch {
      return buildColumnRange(map);
    }
  }

  private run(job: BoardJob): Promise<BoardResult> {
    const id = ++this.nextId;
    const worker = this.workers[this.turn++ % this.workers.length];
    const posted = performance.now();
    const since = (epoch: number) => epoch - performance.timeOrigin;
    return new Promise((done, fail) => {
      this.waiting.set(id, {
        done: (r) => {
          const [started, finished] = r.took ?? [NaN, NaN];
          this.timeline.push({ kind: job.kind, posted, started: since(started), finished: since(finished), received: performance.now() });
          done(r);
        },
        fail,
      });
      worker.postMessage({ ...job, id });
    });
  }

  private settle(id: number) {
    const waiter = this.waiting.get(id);
    this.waiting.delete(id);
    return waiter;
  }
}
