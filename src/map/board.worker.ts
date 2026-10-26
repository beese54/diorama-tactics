// Builds part of a board off the main thread (see BoardWorkers.ts).
import { buildColumnRange } from './columns';
import { composeGround, paintLand, paintLiquids } from './ground';
import { READY, type BoardJob, type BoardResult } from './BoardWorkers';
import type { LandImage } from './ground';
import type { MapFile } from './types';

onmessage = (e: MessageEvent<BoardJob>) => {
  const job = e.data;
  const started = performance.timeOrigin + performance.now();
  const result: BoardResult =
    job.kind === 'land' ? { id: job.id, land: paintLand(job.map) }
    : job.kind === 'liquids' ? { id: job.id, liquids: paintLiquids(job.map, job.wild, job.frames) }
    : job.kind === 'frames' ? { id: job.id, frames: framesOver(job.land, job.map, job.wild, job.frames) }
    : { id: job.id, columns: buildColumnRange(job.map, job.from, job.to) };
  result.took = [started, performance.timeOrigin + performance.now()];
  // Hand the arrays over rather than copying them.
  const { land, liquids, columns, frames } = result;
  const buffers = [
    ...(frames ? [...frames.rgba, ...(frames.glow ?? [])].map((f) => f.buffer) : []),
    ...(land ? [land.material.buffer, land.rgba.buffer] : []),
    ...(liquids ?? []).flatMap((l) => l.frames.map((f) => f.buffer)),
    ...(columns ? [columns.positions, columns.normals, columns.uvs, columns.colors, ...columns.indices, ...columns.tiles].map((a) => a.buffer) : []),
  ] as ArrayBuffer[];
  postMessage(result, { transfer: buffers });
};

/** Whole frames of the ground image: the liquids painted for `which` and laid over the land. */
function framesOver(land: LandImage, map: MapFile, wild: boolean, which: number[]) {
  const image = composeGround(land, paintLiquids(map, wild, which), which);
  return { rgba: which.map((f) => image.frames[f]), glow: image.glow && which.map((f) => image.glow![f]) };
}

// Loaded and listening.
postMessage({ id: READY } satisfies BoardResult);
