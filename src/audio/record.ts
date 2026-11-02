import { SFX, type SfxName } from './sfx';

/**
 * Renders effects to a WAV offline (dev only): the soundtrack for a review video, since a page
 * recording carries no sound. `events` are effect names at seconds from the recording's start.
 * Returns the WAV as base64.
 */
export async function renderEffects(events: readonly { name: SfxName; at: number }[], seconds: number, volume = 0.8): Promise<string> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const e of events) if (e.at >= 0 && e.at < seconds) SFX[e.name](ctx, out, e.at, rand);
  const buffer = await ctx.startRendering();
  // 16-bit PCM WAV.
  const n = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  data.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 2, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 4, true);
  data.setUint16(32, 4, true);
  data.setUint16(34, 16, true);
  text(36, 'data');
  data.setUint32(40, n * 4, true);
  const [l, r] = [buffer.getChannelData(0), buffer.getChannelData(1)];
  for (let i = 0; i < n; i++) {
    data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
    data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
  }
  const bytes = new Uint8Array(data.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
