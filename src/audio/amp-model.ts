// The guitar amp's signal chain as data, so the live amp (Web Audio nodes, audio/amp.ts) and the
// offline one (AmpModel: the render tool and the smokes) are the same amp.
//
// Each sound is two clipping stages with filters round them, as a high-gain amp cascades gain
// stages: a high-pass that keeps the bass from flubbing up the drive, a boost that decides which
// frequencies distort first, the first stage, a low-pass and high-pass between, the second stage,
// then the tone stack, the cabinet and the level. What makes the sounds different is mostly where
// the boost sits, how hard each stage is driven, and the clipping curve: soft (tanh), tube (tanh
// with an offset, for even harmonics) or hard (a square knee, which is most of what fuzz is).
//
// Every sound has the same stages in the same order and knobs only move their settings, so the
// live amp builds its nodes once and a knob never rebuilds the graph.

import { AMP } from '../tuning.js';
import {
  type Biquad,
  highpass,
  highshelf,
  lowpass,
  lowshelf,
  peaking,
  step,
} from '../listen/filters.js';

export type AmpSound = keyof typeof AMP.sounds;
export const AMP_SOUNDS = Object.keys(AMP.sounds) as AmpSound[];
export type Curve = 'soft' | 'tube' | 'hard';

/** 0 to 1; 0.5 is the sound as voiced. */
export interface AmpKnobs {
  drive: number;
  bass: number;
  mid: number;
  treble: number;
}

export const FLAT: AmpKnobs = { drive: 0.5, bass: 0.5, mid: 0.5, treble: 0.5 };

export interface AmpSettings extends AmpKnobs {
  /** Whether the live guitar is heard through the amp. */
  monitor: boolean;
  sound: AmpSound;
}

/** Saved settings made whole: knobs saved without a sound (or out of range) start as voiced. */
export function ampSettings(saved: Partial<AmpSettings> | undefined): AmpSettings {
  const monitor = saved?.monitor === true;
  if (!saved?.sound || !AMP_SOUNDS.includes(saved.sound))
    return { monitor, sound: 'clean', ...FLAT };
  const knob = (k: keyof AmpKnobs) => {
    const v = saved[k];
    return typeof v === 'number' && v >= 0 && v <= 1 ? v : FLAT[k];
  };
  return {
    monitor,
    sound: saved.sound,
    drive: knob('drive'),
    bass: knob('bass'),
    mid: knob('mid'),
    treble: knob('treble'),
  };
}

export type FilterType = 'highpass' | 'lowpass' | 'peaking' | 'lowshelf' | 'highshelf';

export type Stage =
  | { kind: 'filter'; type: FilterType; f: number; q: number; db: number }
  | { kind: 'gain'; db: number }
  /** `db` is the drive into the curve. */
  | { kind: 'clip'; curve: Curve; db: number };

const filter = (type: FilterType, f: number, q = Math.SQRT1_2, db = 0): Stage => ({
  kind: 'filter',
  type,
  f,
  q,
  db,
});

export function ampStages(sound: AmpSound, k: AmpKnobs): Stage[] {
  const v = AMP.sounds[sound];
  const drive = (k.drive - 0.5) * 2;
  const turn = (knob: number) => (knob - 0.5) * 2 * AMP.knobDb;
  const [one, two] = v.stages;
  const driven = drive * (one.span + two.span);
  return [
    filter('highpass', v.tighten),
    filter('peaking', v.push[0], v.push[1], v.push[2]),
    { kind: 'clip', curve: one.curve, db: one.db + drive * one.span },
    filter('lowpass', v.smooth),
    filter('highpass', v.between),
    { kind: 'clip', curve: two.curve, db: two.db + drive * two.span },
    filter('lowshelf', v.bass[0], Math.SQRT1_2, v.bass[1] + turn(k.bass)),
    filter('peaking', v.mid[0], v.mid[1], v.mid[2] + turn(k.mid)),
    filter('highshelf', v.treble[0], Math.SQRT1_2, v.treble[1] + turn(k.treble)),
    filter('peaking', v.presence[0], v.presence[1], v.presence[2]),
    ...AMP.cabs[v.cab].map(([type, f, q, db]) => filter(type, f, q, db)),
    { kind: 'gain', db: v.level - driven * v.makeup },
  ];
}

/** Input spans ±AMP.curveSpan over the curve's ±1, so a stage's drive sets how far in it goes. */
function shape(curve: Curve, x: number): number {
  if (curve === 'soft') return Math.tanh(x);
  if (curve === 'hard')
    return x / Math.pow(1 + Math.pow(Math.abs(x), AMP.hardKnee), 1 / AMP.hardKnee);
  const bias = AMP.asymmetry;
  return Math.tanh(x + bias) - Math.tanh(bias);
}

const curves = new Map<Curve, Float32Array<ArrayBuffer>>();

/** The curve as a WaveShaper takes it, normalised so either end is ±1. */
export function clipCurve(curve: Curve): Float32Array<ArrayBuffer> {
  let c = curves.get(curve);
  if (c) return c;
  const span = AMP.curveSpan;
  const top = shape(curve, span);
  const bottom = -shape(curve, -span);
  c = new Float32Array(4097);
  for (let i = 0; i < c.length; i++) {
    const y = shape(curve, ((i / (c.length - 1)) * 2 - 1) * span);
    c[i] = y / (y >= 0 ? top : bottom);
  }
  curves.set(curve, c);
  return c;
}

/** A WaveShaper's lookup: linear between points, held at the ends. */
function lookup(curve: Float32Array, u: number): number {
  const pos = ((Math.max(-1, Math.min(1, u)) + 1) / 2) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(pos));
  return curve[i]! + (curve[i + 1]! - curve[i]!) * (pos - i);
}

const OVERSAMPLE = 4;
/** Q of each biquad in an eighth-order Butterworth. */
const BUTTERWORTH_8 = [0.5098, 0.6013, 0.9, 2.5629];

/** Runs the chain offline, oversampling the clipping as the live amp's WaveShapers do. */
export class AmpModel {
  constructor(
    private readonly rate: number,
    private readonly stages: readonly Stage[],
  ) {}

  process(input: Float32Array): Float32Array {
    let x: Float32Array = Float32Array.from(input);
    for (const s of this.stages) {
      if (s.kind === 'gain') {
        const g = Math.pow(10, s.db / 20);
        for (let i = 0; i < x.length; i++) x[i] = x[i]! * g;
      } else if (s.kind === 'filter') {
        const f = this.design(s);
        for (let i = 0; i < x.length; i++) x[i] = step(f, x[i]!);
      } else x = this.clip(x, s.curve, Math.pow(10, s.db / 20) / AMP.curveSpan);
    }
    return x;
  }

  private design(s: Extract<Stage, { kind: 'filter' }>): Biquad {
    switch (s.type) {
      case 'highpass':
        return highpass(s.f, this.rate, s.q);
      case 'lowpass':
        return lowpass(s.f, this.rate, s.q);
      case 'peaking':
        return peaking(s.f, this.rate, s.q, s.db);
      case 'lowshelf':
        return lowshelf(s.f, this.rate, s.db);
      case 'highshelf':
        return highshelf(s.f, this.rate, s.db);
    }
  }

  private clip(x: Float32Array, curve: Curve, scale: number): Float32Array {
    const table = clipCurve(curve);
    const fast = this.rate * OVERSAMPLE;
    const up = BUTTERWORTH_8.map((q) => lowpass(this.rate * 0.45, fast, q));
    const down = BUTTERWORTH_8.map((q) => lowpass(this.rate * 0.45, fast, q));
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      for (let k = 0; k < OVERSAMPLE; k++) {
        let v = k === 0 ? x[i]! * OVERSAMPLE : 0;
        for (const f of up) v = step(f, v);
        v = lookup(table, v * scale);
        for (const f of down) v = step(f, v);
        if (k === OVERSAMPLE - 1) out[i] = v;
      }
    }
    return out;
  }
}
