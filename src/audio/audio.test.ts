import { describe, expect, it } from 'vitest';
import { AUDIO_KEY, DEFAULT_AUDIO, gainOf, loadAudio, parseAudio, saveAudio, type Store } from './settings';
import { SFX } from './sfx';

describe('the sound settings', () => {
  it('fall back to the defaults when nothing (or nonsense) is stored', () => {
    expect(parseAudio(null)).toEqual(DEFAULT_AUDIO);
    expect(parseAudio('not json')).toEqual(DEFAULT_AUDIO);
    expect(parseAudio('{"music": "loud", "muted": 1}')).toEqual(DEFAULT_AUDIO);
  });

  it('keep volumes between 0 and 1', () => {
    expect(parseAudio('{"music": 3, "effects": -1}')).toMatchObject({ music: 1, effects: 0 });
  });

  it('are kept in the store and read back', () => {
    const data: Record<string, string> = {};
    const store: Store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
    saveAudio(store, { muted: true, music: 0.25, effects: 0.5 });
    expect(data[AUDIO_KEY]).toBeTruthy();
    expect(loadAudio(store)).toEqual({ muted: true, music: 0.25, effects: 0.5 });
  });

  it('survive a store that throws (blocked storage), and no store at all', () => {
    const broken: Store = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadAudio(broken)).toEqual(DEFAULT_AUDIO);
    expect(() => saveAudio(broken, DEFAULT_AUDIO)).not.toThrow();
    expect(loadAudio(null)).toEqual(DEFAULT_AUDIO);
  });

  it('silence both channels when muted', () => {
    const s = { muted: true, music: 0.7, effects: 0.9 };
    expect([gainOf(s, 'music'), gainOf(s, 'effects')]).toEqual([0, 0]);
    expect(gainOf({ ...s, muted: false }, 'effects')).toBe(0.9);
  });
});

/** A stand-in audio context: every node and parameter the recipes use, recording what is started. */
function stubContext() {
  const started: string[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = (kind: string) => ({
    connect() {}, start() { started.push(kind); }, stop() {}, frequency: param(), gain: param(), Q: param(), type: '', buffer: null,
  });
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    createGain: () => node('gain'),
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, started };
}

describe('the sound effects', () => {
  for (const [name, recipe] of Object.entries(SFX)) {
    it(`"${name}" builds and starts its sound`, () => {
      const { ctx, started } = stubContext();
      let s = 1;
      recipe(ctx, ctx.createGain(), 0, () => ((s = (s * 16807) % 2147483647) / 2147483647));
      expect(started.length).toBeGreaterThan(0);
    });
  }
});
