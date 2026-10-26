import { composeGround, paintGround, type GroundImage, type LandImage, type LiquidLayer } from './ground';
import { ALL_FRAMES } from './liquid';
import type { MapFile } from './types';

/** Work for one ground worker: the land, or some of the liquid frames. */
export type GroundJob = { id: number; map: MapFile; wild: boolean } & ({ kind: 'land' } | { kind: 'liquids'; frames: number[] });
export interface GroundResult {
  id: number;
  land?: LandImage;
  liquids?: LiquidLayer[];
}
/** The id a worker sends once it has loaded and is listening. */
export const READY = 0;

/** Workers that share the liquid frames: up to three, leaving a core for the page and one for the land. */
const liquidWorkers = () => Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 2));

/** Splits the loop's frames into `n` runs in order, as even as they go. */
export function shareFrames(n: number): number[][] {
  return Array.from({ length: n }, (_, k) =>
    ALL_FRAMES.slice(Math.round((k * ALL_FRAMES.length) / n), Math.round(((k + 1) * ALL_FRAMES.length) / n)));
}

/**
 * Paints ground images on worker threads: one worker paints the land while the others
 * share the liquid frames, and the main thread stays free to build the mesh meanwhile.
 * The pixels are the same as paintGround's. Without workers it paints on the main thread.
 */
export class GroundPainter {
  /**
   * Resolves once every worker has loaded. A browser starts a worker with the main thread's
   * help, so await this before a long stretch of main-thread work, or the workers wait for it to end.
   */
  readonly ready: Promise<void>;
  private readonly workers: Worker[] = [];
  private readonly waiting = new Map<number, { done: (r: GroundResult) => void; fail: (e: unknown) => void }>();
  private nextId = READY;
  /** Set when a worker fails to load or crashes; painting then stays on the main thread. */
  private broken = false;

  constructor() {
    const loads: Promise<void>[] = [];
    try {
      for (let i = 0; i <= liquidWorkers(); i++) {
        const worker = new Worker(new URL('./ground.worker.ts', import.meta.url), { type: 'module' });
        loads.push(new Promise((loaded) => {
          worker.onmessage = (e: MessageEvent<GroundResult>) => (e.data.id === READY ? loaded() : this.settle(e.data.id)?.done(e.data));
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

  /** The ground image for `map`. Starts the workers at once; resolves when every part is back. */
  async paint(map: MapFile, wild: boolean): Promise<GroundImage> {
    const [landWorker, ...frameWorkers] = this.workers;
    if (!frameWorkers.length || this.broken) return paintGround(map, wild);
    const shares = shareFrames(frameWorkers.length);
    try {
      const [{ land }, ...parts] = await Promise.all([
        this.run(landWorker, { id: 0, map, wild, kind: 'land' }),
        ...shares.map((frames, k) => this.run(frameWorkers[k], { id: 0, map, wild, kind: 'liquids', frames })),
      ]);
      // Each part holds a run of frames per liquid; joined in order they make the whole loop.
      const liquids = parts[0].liquids!.map((layer, l) => ({ ...layer, frames: parts.flatMap((p) => p.liquids![l].frames) }));
      return composeGround(land!, liquids);
    } catch {
      return paintGround(map, wild);
    }
  }

  private run(worker: Worker, job: GroundJob): Promise<GroundResult> {
    const id = ++this.nextId;
    return new Promise((done, fail) => {
      this.waiting.set(id, { done, fail });
      worker.postMessage({ ...job, id });
    });
  }

  private settle(id: number) {
    const waiter = this.waiting.get(id);
    this.waiting.delete(id);
    return waiter;
  }
}
