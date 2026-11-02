/**
 * The sound settings (B8): a master mute and two volumes, remembered between visits. Pure: the
 * storage is passed in (localStorage in the app, a plain object in tests).
 */
export interface AudioSettings {
  muted: boolean;
  /** 0 to 1. */
  music: number;
  effects: number;
}

export const DEFAULT_AUDIO: AudioSettings = { muted: false, music: 0.6, effects: 0.8 };
export const AUDIO_KEY = 'diorama.audio';

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** Settings read back from `raw` (stored JSON), anything missing or broken falling back to the defaults. */
export function parseAudio(raw: string | null): AudioSettings {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<AudioSettings>) : {};
    return {
      muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_AUDIO.muted,
      music: clamp01(o.music, DEFAULT_AUDIO.music),
      effects: clamp01(o.effects, DEFAULT_AUDIO.effects),
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

/** A minimal storage: localStorage, or a stand-in. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The settings from `store`, or the defaults if it can't be read (private windows, blocked storage). */
export function loadAudio(store: Store | null): AudioSettings {
  try {
    return parseAudio(store?.getItem(AUDIO_KEY) ?? null);
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

/** Keeps `settings` in `store`, if it can. */
export function saveAudio(store: Store | null, settings: AudioSettings): void {
  try {
    store?.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch {
    /* Storage blocked: the settings last this visit only. */
  }
}

/** The gain a channel plays at: its volume, or silence when muted. */
export const gainOf = (s: AudioSettings, channel: 'music' | 'effects'): number => (s.muted ? 0 : s[channel]);
