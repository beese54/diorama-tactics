import { gainOf, loadAudio, saveAudio, type AudioSettings } from './settings';
import { SFX, type SfxName } from './sfx';

/** The music tracks (B8): the user generates them; the manifest lists those that exist. */
export type Track = 'map' | 'battle' | 'victory' | 'defeat';
const LOOPS: ReadonlySet<Track> = new Set(['map', 'battle']);
/** Seconds a music change crossfades over. */
const FADE = 1.2;

const store = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/**
 * The game's sound (B8): one audio context, made on the first click, tap or key (browsers allow
 * sound only after one), a master mute and the Music and Effects volumes, remembered between
 * visits. Effects are synthesised (sfx.ts); music plays from the user's own tracks, those the
 * manifest at public/audio/music/index.json lists, so nothing is asked for that isn't there.
 */
class AudioEngine {
  settings: AudioSettings = loadAudio(store());
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private readonly counts = new Map<SfxName, number>();
  private readonly listeners = new Set<() => void>();
  private manifest: Promise<Set<string>> | null = null;
  private readonly buffers = new Map<Track, Promise<AudioBuffer | null>>();
  private playing: { track: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** The track wanted now, kept until the context exists (before the first input). */
  private wanted: Track | null = null;
  private seed = 1;

  constructor() {
    const unlock = () => {
      this.unlock();
      for (const e of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(e, unlock, true);
    };
    for (const e of ['pointerdown', 'keydown', 'touchstart']) addEventListener(e, unlock, true);
  }

  /** Whether the audio context exists yet (it does from the first input on). */
  get ready(): boolean {
    return this.ctx !== null;
  }

  private unlock(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.apply();
    void this.ctx.resume();
    if (this.wanted) void this.music(this.wanted);
  }

  /** Changes some settings, keeps them, and applies them at once. */
  set(changes: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...changes };
    saveAudio(store(), this.settings);
    this.apply();
    for (const l of this.listeners) l();
  }

  /** M: mutes everything, or brings it back. */
  toggleMute(): void {
    this.set({ muted: !this.settings.muted });
  }

  /** Called whenever the settings change (the menu's controls follow them). */
  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private apply(): void {
    const t = this.ctx?.currentTime ?? 0;
    this.musicGain?.gain.setTargetAtTime(gainOf(this.settings, 'music'), t, 0.05);
    this.sfxGain?.gain.setTargetAtTime(gainOf(this.settings, 'effects'), t, 0.05);
  }

  /** Plays the effect `name` now (counted for checks, even before the context exists). */
  play(name: SfxName, delay = 0): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const rand = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);
    SFX[name](this.ctx, this.sfxGain, this.ctx.currentTime + 0.005 + delay, rand);
  }

  /** How many times each effect has been asked for, for checks. */
  played(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  /** The tracks the manifest lists (none until the user's music is added). */
  private tracks(): Promise<Set<string>> {
    this.manifest ??= fetch(`${import.meta.env.BASE_URL}audio/music/index.json`)
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((m: { tracks?: string[] }) => new Set(m.tracks ?? []))
      .catch(() => new Set<string>());
    return this.manifest;
  }

  private buffer(track: Track): Promise<AudioBuffer | null> {
    let b = this.buffers.get(track);
    if (!b) {
      b = this.tracks().then(async (have) => {
        if (!have.has(track) || !this.ctx) return null;
        try {
          const data = await (await fetch(`${import.meta.env.BASE_URL}audio/music/${track}.mp3`)).arrayBuffer();
          return await this.ctx.decodeAudioData(data);
        } catch {
          return null;
        }
      });
      this.buffers.set(track, b);
    }
    return b;
  }

  /**
   * Plays `track`, crossfading from whatever plays now: the map and battle tracks loop, victory
   * and defeat play once. A track the manifest doesn't list is silence.
   */
  async music(track: Track): Promise<void> {
    this.wanted = track;
    if (!this.ctx || !this.musicGain) return;
    if (this.playing?.track === track) return;
    const ctx = this.ctx;
    const out = this.musicGain;
    const t = ctx.currentTime;
    const old = this.playing;
    if (old) {
      old.gain.gain.setTargetAtTime(0, t, FADE / 4);
      old.src.stop(t + FADE * 1.5);
      this.playing = null;
    }
    const buffer = await this.buffer(track);
    if (!buffer || this.wanted !== track) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = LOOPS.has(track);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE / 4);
    src.connect(gain);
    gain.connect(out);
    src.start();
    this.playing = { track, src, gain };
  }

  /** The state for checks: the context, the settings, the effects asked for, the music wanted and playing. */
  state(): { ready: boolean; settings: AudioSettings; played: Record<string, number>; wanted: Track | null; playing: Track | null } {
    return { ready: this.ready, settings: { ...this.settings }, played: this.played(), wanted: this.wanted, playing: this.playing?.track ?? null };
  }
}

/** The one sound engine for the app. */
export const audio = new AudioEngine();
