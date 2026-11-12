// The piano's effects as data: their settings and ranges, and everything about them that is
// arithmetic rather than Web Audio (the EQ's filters and the curve they draw, the drive's curve and
// make-up gain, the echo's time, the reverb's impulse), so the smokes can check it in Node.
//
// The reverb is a convolution with an impulse made here: noise decaying to -60 dB over the size,
// through a lowpass that closes as it fades (a room's air and walls take the treble first), and
// building up over a time that grows with the size, as a bigger room's first reflections come
// later. The noise is scaled against the lowpass, so the tone colours the tail without shortening
// it, and the whole impulse is normalised to unit energy, so a longer one is longer, not louder.

import { FX } from '../tuning.js';
import {
  type Biquad,
  dbOf,
  highpass,
  highshelf,
  lowpass,
  lowshelf,
  peaking,
} from '../listen/filters.js';

/** Note lengths the echo can follow the tempo at; `1/8.` is dotted and `t` a triplet. */
export const DIVISIONS = ['1/2', '1/4', '1/8.', '1/4t', '1/8', '1/8t', '1/16'] as const;
export type Division = (typeof DIVISIONS)[number];
const BEATS: Record<Division, number> = {
  '1/2': 2,
  '1/4': 1,
  '1/8.': 0.75,
  '1/4t': 2 / 3,
  '1/8': 0.5,
  '1/8t': 1 / 3,
  '1/16': 0.25,
};

export interface FxSettings {
  /** The whole chain; off is the dry piano, with every effect's settings kept. */
  on: boolean;
  drive: { on: boolean; amount: number };
  /** Bands in dB, frequencies in Hz; a cut at its outer end is off. */
  eq: {
    on: boolean;
    low: number;
    mid: number;
    midHz: number;
    high: number;
    lowCut: number;
    highCut: number;
    steep: boolean;
  };
  chorus: { on: boolean; rate: number; depth: number; mix: number };
  /** `pan` moves the sound between the speakers instead of up and down in level. */
  tremolo: { on: boolean; rate: number; depth: number; pan: boolean };
  /** `ms` is used while `sync` is 'free'; otherwise the time follows the tempo. */
  echo: {
    on: boolean;
    sync: Division | 'free';
    ms: number;
    repeats: number;
    tone: number;
    mix: number;
    pingPong: boolean;
  };
  /** Size in seconds to fall 60 dB, pre-delay in ms. */
  reverb: { on: boolean; size: number; preDelay: number; tone: number; mix: number };
}

/** In the order the sound passes through them. */
export const FX_KINDS = ['drive', 'eq', 'chorus', 'tremolo', 'echo', 'reverb'] as const;
export type FxKind = (typeof FX_KINDS)[number];

export interface Range {
  min: number;
  max: number;
  /** Sliders move along a log scale (frequencies, times), and values keep three figures. */
  log: boolean;
  step: number;
}

const lin = (min: number, max: number, step: number): Range => ({ min, max, log: false, step });
const log = ([min, max]: readonly [number, number]): Range => ({ min, max, log: true, step: 0 });
const db = lin(-FX.eq.range, FX.eq.range, 0.5);
const unit = lin(0, 1, 0.01);

export const RANGES: { [K in FxKind]: Record<string, Range> } = {
  drive: { amount: unit },
  eq: {
    low: db,
    mid: db,
    midHz: log(FX.eq.midHz),
    high: db,
    lowCut: log(FX.eq.lowCut),
    highCut: log(FX.eq.highCut),
  },
  chorus: { rate: log(FX.chorus.rate), depth: unit, mix: unit },
  tremolo: { rate: log(FX.tremolo.rate), depth: unit },
  echo: { ms: log(FX.echo.ms), repeats: unit, tone: unit, mix: unit },
  reverb: {
    size: log(FX.reverb.size),
    preDelay: lin(...FX.reverb.preDelay, 1),
    tone: unit,
    mix: unit,
  },
};

/** Every effect off, each set where it sounds good once turned on. */
export const DRY: FxSettings = {
  on: true,
  drive: { on: false, amount: 0.3 },
  eq: {
    on: false,
    low: 0,
    mid: 0,
    midHz: 1000,
    high: 0,
    lowCut: FX.eq.lowCut[0],
    highCut: FX.eq.highCut[1],
    steep: false,
  },
  chorus: { on: false, rate: 0.8, depth: 0.4, mix: 0.5 },
  tremolo: { on: false, rate: 4.5, depth: 0.5, pan: false },
  echo: { on: false, sync: '1/8.', ms: 350, repeats: 0.4, tone: 0.6, mix: 0.3, pingPong: true },
  reverb: { on: false, size: 2.2, preDelay: 20, tone: 0.5, mix: 0.3 },
};

/** A value as a slider leaves it: in range, and rounded so saved settings compare equal. */
export function snap(value: number, r: Range): number {
  const v = Math.max(r.min, Math.min(r.max, value));
  if (r.log) return Math.max(r.min, Math.min(r.max, Number(v.toPrecision(3))));
  // Dividing by a whole number lands on the same double as the decimal written out: 57 / 100 is
  // 0.57, where 57 * 0.01 is 0.5700000000000001.
  const per = Math.round(1 / r.step);
  return Math.round(v * per) / per;
}

/** Saved settings made whole: anything missing, mistyped or out of range takes DRY's value. */
export function fxSettings(saved: unknown): FxSettings {
  const src = record(saved);
  const out = { on: typeof src['on'] === 'boolean' ? src['on'] : DRY.on } as FxSettings;
  for (const kind of FX_KINDS) {
    const from = record(src[kind]);
    const section: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(DRY[kind])) {
      const v = from[key];
      const range = RANGES[kind][key];
      if (range)
        section[key] = typeof v === 'number' && Number.isFinite(v) ? snap(v, range) : fallback;
      else if (typeof fallback === 'boolean') section[key] = typeof v === 'boolean' ? v : fallback;
      else section[key] = v === 'free' || DIVISIONS.includes(v as Division) ? v : fallback;
    }
    (out as unknown as Record<string, unknown>)[kind] = section;
  }
  return out;
}

const record = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' ? (x as Record<string, unknown>) : {};

/** Whether two settings sound the same: the same effects on, set the same. */
export function sameSound(a: FxSettings, b: FxSettings): boolean {
  return FX_KINDS.every((k) => {
    if (a[k].on !== b[k].on) return false;
    return !a[k].on || JSON.stringify(a[k]) === JSON.stringify(b[k]);
  });
}

/** Whether anything is changing the sound. */
export const fxActive = (fx: FxSettings): boolean => fx.on && FX_KINDS.some((k) => fx[k].on);

/** Dry and wet levels for a mix of 0 (dry) to 1 (wet), at equal power. */
export function mixGains(mix: number): [dry: number, wet: number] {
  return [Math.cos((mix * Math.PI) / 2), Math.sin((mix * Math.PI) / 2)];
}

export function echoSeconds(echo: FxSettings['echo'], bpm: number): number {
  if (echo.sync === 'free') return echo.ms / 1000;
  return Math.min(FX.echo.longest, (BEATS[echo.sync] * 60) / bpm);
}

export const echoFeedback = (echo: FxSettings['echo']): number => echo.repeats * FX.echo.feedback;

/** Between a [dark, bright] pair, on a log scale. */
export const toneHz = ([dark, bright]: readonly [number, number], tone: number): number =>
  dark * Math.pow(bright / dark, tone);

/** The drive's curve in input units: unit slope through zero, tanh with an offset beyond. */
function driveShape(x: number): number {
  const b = FX.drive.asymmetry;
  const slope = 1 - Math.tanh(b) ** 2;
  return (Math.tanh(x + b) - Math.tanh(b)) / slope;
}

let curve: Float32Array<ArrayBuffer> | null = null;

/** The curve as a WaveShaper takes it, over ±FX.drive.span of input. */
export function driveCurve(): Float32Array<ArrayBuffer> {
  if (curve) return curve;
  curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    curve[i] = driveShape(((i / (curve.length - 1)) * 2 - 1) * FX.drive.span);
  }
  return curve;
}

/**
 * Gain into the shaper (which reads ±1 as ±span) and after it. The make-up holds a signal at the
 * reference level where it was, so turning the drive up changes the sound more than the level.
 */
export function driveGains(amount: number): { pre: number; post: number } {
  const g = Math.pow(10, (FX.drive.from + (FX.drive.to - FX.drive.from) * amount) / 20);
  const r = FX.drive.reference;
  return { pre: g / FX.drive.span, post: r / driveShape(r * g) };
}

export type FilterType = 'highpass' | 'lowpass' | 'lowshelf' | 'peaking' | 'highshelf';
export interface Filter {
  type: FilterType;
  f: number;
  q: number;
  db: number;
}

/**
 * The EQ as seven biquads in a fixed order (two for each cut, then the three bands), so the live
 * chain builds them once. A stage that's off is a highpass at 0 Hz or a lowpass at Nyquist, which
 * Web Audio passes straight through.
 */
export function eqFilters(eq: FxSettings['eq'], rate: number): Filter[] {
  const nyquist = rate / 2;
  const qs = eq.steep ? FX.eq.steepQ : FX.eq.gentleQ;
  const lowOn = eq.lowCut > FX.eq.lowCut[0];
  const highOn = eq.highCut < FX.eq.highCut[1];
  const cut = (type: 'highpass' | 'lowpass', on: boolean, f: number, i: number): Filter => {
    const q = qs[i];
    if (!on || q === undefined) return { type, f: type === 'highpass' ? 0 : nyquist, q: 1, db: 0 };
    return { type, f, q, db: 0 };
  };
  return [
    cut('highpass', lowOn, eq.lowCut, 0),
    cut('highpass', lowOn, eq.lowCut, 1),
    { type: 'lowshelf', f: FX.eq.lowHz, q: Math.SQRT1_2, db: eq.low },
    { type: 'peaking', f: eq.midHz, q: FX.eq.midQ, db: eq.mid },
    { type: 'highshelf', f: FX.eq.highHz, q: Math.SQRT1_2, db: eq.high },
    cut('lowpass', highOn, eq.highCut, 0),
    cut('lowpass', highOn, eq.highCut, 1),
  ];
}

function biquadOf(f: Filter, rate: number): Biquad | null {
  if (f.type === 'highpass') return f.f <= 0 ? null : highpass(f.f, rate, f.q);
  if (f.type === 'lowpass') return f.f >= rate / 2 ? null : lowpass(f.f, rate, f.q);
  if (f.type === 'lowshelf') return lowshelf(f.f, rate, f.db);
  if (f.type === 'highshelf') return highshelf(f.f, rate, f.db);
  return peaking(f.f, rate, f.q, f.db);
}

function gainAt(b: Biquad, hz: number, rate: number): number {
  const w = (2 * Math.PI * hz) / rate;
  const [c1, s1, c2, s2] = [Math.cos(w), Math.sin(w), Math.cos(2 * w), Math.sin(2 * w)];
  const nr = b.b0 + b.b1 * c1 + b.b2 * c2;
  const ni = -(b.b1 * s1 + b.b2 * s2);
  const dr = 1 + b.a1 * c1 + b.a2 * c2;
  const di = -(b.a1 * s1 + b.a2 * s2);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

/** The EQ's response in dB at each frequency: what the panel draws. */
export function eqCurve(eq: FxSettings['eq'], rate: number, freqs: readonly number[]): number[] {
  const biquads = eqFilters(eq, rate)
    .map((f) => biquadOf(f, rate))
    .filter((b) => b !== null);
  return freqs.map((hz) => biquads.reduce((sum, b) => sum + dbOf(gainAt(b, hz, rate)), 0));
}

/** Deterministic xorshift, so an impulse is the same every time it's made. */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A stereo impulse with a different random tail on each side, normalised to unit energy. */
export function reverbImpulse(
  rate: number,
  size: number,
  tone: number,
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.ceil(rate * size);
  const fall = Math.exp(-6.91 / (size * rate));
  const startHz = toneHz(FX.reverb.startHz, tone);
  const endHz = toneHz(FX.reverb.endHz, tone);
  const closing = size * 0.3;
  const [small, large] = FX.reverb.size;
  const span = Math.log(size / small) / Math.log(large / small);
  const onset = FX.reverb.onset[0] + (FX.reverb.onset[1] - FX.reverb.onset[0]) * span;

  const channels = [0, 1].map((ch) => {
    const data = new Float32Array(length);
    const rand = noise(9973 + ch * 7919);
    let lp = 0;
    let k = 0;
    let lift = 1;
    let env = 1;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      if ((i & 63) === 0) {
        const hz = Math.min(rate * 0.45, endHz + (startHz - endHz) * Math.exp(-t / closing));
        k = 1 - Math.exp((-2 * Math.PI * hz) / rate);
        // A one-pole lowpass passes k / (2 - k) of white noise's power; give it back.
        lift = 1 / Math.sqrt(k / (2 - k));
      }
      lp += k * (rand() - lp);
      const build = Math.min(1, t / onset);
      data[i] = lp * lift * env * build * build;
      env *= fall;
    }
    const fade = Math.min(length, Math.round(rate * 0.05));
    for (let i = 0; i < fade; i++) data[length - 1 - i]! *= i / fade;
    return data;
  });

  let energy = 0;
  for (const data of channels) for (const x of data) energy += x * x;
  const g = 1 / Math.sqrt(energy / 2 || 1);
  for (const data of channels) for (let i = 0; i < data.length; i++) data[i]! *= g;
  return [channels[0]!, channels[1]!];
}
