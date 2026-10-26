// Paints part of a ground image off the main thread (see GroundPainter.ts).
import { paintLand, paintLiquids } from './ground';
import { READY, type GroundJob, type GroundResult } from './GroundPainter';

onmessage = (e: MessageEvent<GroundJob>) => {
  const job = e.data;
  const result: GroundResult =
    job.kind === 'land' ? { id: job.id, land: paintLand(job.map) } : { id: job.id, liquids: paintLiquids(job.map, job.wild, job.frames) };
  // Hand the pixels over rather than copying them.
  const buffers = [
    ...(result.land ? [result.land.material.buffer, result.land.rgba.buffer] : []),
    ...(result.liquids ?? []).flatMap((l) => l.frames.map((f) => f.buffer)),
  ] as ArrayBuffer[];
  postMessage(result, { transfer: buffers });
};

// Loaded and listening.
postMessage({ id: READY } satisfies GroundResult);
