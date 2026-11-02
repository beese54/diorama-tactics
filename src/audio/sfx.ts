/**
 * The game's sound effects (B8), synthesised with Web Audio: oscillators, filtered noise and
 * envelopes, no sound files. Each recipe schedules its sound on `out` at time `t`; `rand` gives
 * each play a slight variation, so repeats don't sound mechanical.
 */
export type SfxName =
  | 'clash' | 'hit' | 'crit' | 'arrow' | 'spell' | 'charge'
  | 'cutin' | 'card' | 'tick' | 'click' | 'victory' | 'defeat' | 'wipe';

export type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number, rand: () => number) => void;

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A second of white noise, made once per context. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noises.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = b.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < data.length; i++) data[i] = ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    noises.set(ctx, b);
  }
  return b;
}

/** A gain node with an attack-decay envelope: up to `peak` in `attack` s, down to silence over `decay` s. */
function envelope(ctx: BaseAudioContext, out: AudioNode, t: number, attack: number, decay: number, peak: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

/** A tone: `type`, gliding from `from` to `to` Hz, with an envelope. */
function tone(ctx: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType, from: number, to: number, dur: number, peak: number, attack = 0.005): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.connect(envelope(ctx, out, t, attack, dur, peak));
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

/** A burst of filtered noise: `kind` filter at `from` Hz gliding to `to`, with an envelope. */
function noise(ctx: BaseAudioContext, out: AudioNode, t: number, kind: BiquadFilterType, from: number, to: number, dur: number, peak: number, attack = 0.003, q = 1): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  src.connect(f);
  f.connect(envelope(ctx, out, t, attack, dur, peak));
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
}

/** A little pitch variation: within ±`spread` of 1. */
const vary = (rand: () => number, spread = 0.06) => 1 + (rand() * 2 - 1) * spread;

export const SFX: Record<SfxName, Recipe> = {
  // Steel on steel: bright detuned partials ringing out over a short scrape.
  clash: (ctx, out, t, rand) => {
    const k = vary(rand);
    for (const [f, p] of [[2110, 0.09], [3330, 0.06], [4720, 0.04]] as const) tone(ctx, out, t, 'triangle', f * k, f * k * 0.98, 0.28, p);
    noise(ctx, out, t, 'highpass', 3500, 2500, 0.06, 0.12);
  },
  // A blow landing: a low thump and a muffled crunch.
  hit: (ctx, out, t, rand) => {
    const k = vary(rand, 0.1);
    tone(ctx, out, t, 'sine', 150 * k, 55, 0.18, 0.5);
    noise(ctx, out, t, 'lowpass', 1400, 400, 0.09, 0.25);
  },
  // A crit: a heavier blow with steel ringing over it.
  crit: (ctx, out, t, rand) => {
    SFX.hit(ctx, out, t, rand);
    tone(ctx, out, t, 'sine', 90, 40, 0.3, 0.5);
    for (const f of [1580, 2370]) tone(ctx, out, t + 0.01, 'triangle', f * vary(rand), f * 0.97, 0.5, 0.06);
  },
  // An arrow: air rushing past, falling in pitch.
  arrow: (ctx, out, t, rand) => noise(ctx, out, t, 'bandpass', 3200 * vary(rand), 700, 0.24, 0.3, 0.02, 4),
  // A spell: a rising bloom with crackle.
  spell: (ctx, out, t, rand) => {
    tone(ctx, out, t, 'sine', 220 * vary(rand), 880, 0.55, 0.12, 0.05);
    tone(ctx, out, t, 'triangle', 330 * vary(rand), 1320, 0.5, 0.05, 0.05);
    noise(ctx, out, t + 0.05, 'bandpass', 1800, 900, 0.45, 0.12, 0.02, 2);
  },
  // The charge: a roll of drums under a short horn call.
  charge: (ctx, out, t, rand) => {
    for (let i = 0; i < 7; i++) {
      tone(ctx, out, t + i * 0.075, 'sine', 120 * vary(rand, 0.04), 60, 0.12, 0.25 + i * 0.03);
      noise(ctx, out, t + i * 0.075, 'lowpass', 900, 300, 0.06, 0.12);
    }
    tone(ctx, out, t + 0.08, 'sawtooth', 196, 196, 0.7, 0.07, 0.08);
    tone(ctx, out, t + 0.08, 'sawtooth', 294, 294, 0.7, 0.05, 0.08);
  },
  // A skill's cut-in: a rising whoosh, then a bright chime.
  cutin: (ctx, out, t) => {
    noise(ctx, out, t, 'bandpass', 400, 4200, 0.45, 0.25, 0.08, 1.5);
    for (const [f, d] of [[1318.5, 1.1], [1760, 1.2], [2637, 1.3]] as const) tone(ctx, out, t + 0.32, 'sine', f, f, d, 0.08);
  },
  // A card played: a quick swish.
  card: (ctx, out, t, rand) => noise(ctx, out, t, 'highpass', 1200 * vary(rand), 4800, 0.17, 0.18, 0.02),
  // A card focused: a soft tick.
  tick: (ctx, out, t, rand) => tone(ctx, out, t, 'sine', 1800 * vary(rand, 0.03), 1700, 0.035, 0.07),
  // The wipe into a battle: a long blade's rush of air.
  wipe: (ctx, out, t) => noise(ctx, out, t, 'bandpass', 300, 2600, 0.42, 0.22, 0.12, 0.8),
  // A menu click.
  click: (ctx, out, t) => tone(ctx, out, t, 'square', 900, 880, 0.04, 0.04),
  // Victory: a rising arpeggio landing on a held major chord.
  victory: (ctx, out, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, out, t + i * 0.12, 'triangle', f, f, 0.3, 0.14));
    for (const f of [523.25, 659.25, 783.99, 1046.5]) tone(ctx, out, t + 0.5, 'triangle', f, f, 1.4, 0.07, 0.03);
  },
  // Defeat: a slow minor fall over a low drone.
  defeat: (ctx, out, t) => {
    [440, 349.23, 293.66].forEach((f, i) => tone(ctx, out, t + i * 0.4, 'sine', f, f * 0.99, 0.6, 0.12, 0.04));
    tone(ctx, out, t, 'triangle', 73.42, 73.42, 2, 0.1, 0.3);
  },
};
