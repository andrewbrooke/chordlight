// A plucked string by Karplus–Strong: a burst of noise circulating in a delay line one period long,
// losing a little treble each trip round. The loop's averaging filter delays half a sample and a
// first-order allpass supplies the rest of the fraction, or the top frets would be cents out. The
// burst is combed at the pick position and the output at the pickup's, which is most of what tells
// one plucked string from another.
//
// Pure, so the smokes can render notes and measure them.

import { PLUCK } from '../tuning.js';

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Seconds for the string to fall 60 dB: long in the bass, short at the top. */
export function ringTime(midi: number): number {
  return PLUCK.ringLow * Math.pow(2, -(midi - PLUCK.ringFrom) / PLUCK.ringHalving);
}

export function pluckDuration(midi: number): number {
  return Math.min(PLUCK.longest, Math.max(PLUCK.shortest, ringTime(midi) * 0.9));
}

export function pluckRoots(): number[] {
  const out: number[] = [];
  for (let m = PLUCK.lowest; m <= PLUCK.highest; m += PLUCK.rootStep) out.push(m);
  return out;
}

/** The nearest rendered root, and the semitones to shift it by. */
export function pluckRootFor(midi: number): { root: number; shift: number } {
  const roots = pluckRoots();
  const i = Math.round((midi - PLUCK.lowest) / PLUCK.rootStep);
  const root = roots[Math.max(0, Math.min(roots.length - 1, i))]!;
  return { root, shift: midi - root };
}

export function renderPluck(midi: number, rate: number): Float32Array<ArrayBuffer> {
  const f0 = hz(midi);
  const period = rate / f0;
  const length = Math.round(pluckDuration(midi) * rate);
  const out = new Float32Array(length);

  // Loop delay = N (integer) + 0.5 (averaging) + d (allpass), with d kept in [0.1, 1.1).
  const n = Math.floor(period - 0.6);
  const d = period - 0.5 - n;
  const c = (1 - d) / (1 + d);
  const loss = Math.cos((Math.PI * f0) / rate);
  const gain = Math.min(0.99995, Math.pow(10, -3 / (ringTime(midi) * f0)) / loss);

  const burst = excitation(Math.round(period), Math.round(period * PLUCK.pickAt), midi);
  const y = new Float32Array(length);
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < length; i++) {
    const a = i - n >= 0 ? y[i - n]! : 0;
    const b = i - n - 1 >= 0 ? y[i - n - 1]! : 0;
    const avg = 0.5 * (a + b);
    const ap = c * avg + apIn - c * apOut;
    apIn = avg;
    apOut = ap;
    y[i] = (i < burst.length ? burst[i]! : 0) + gain * ap;
  }

  // Pickup comb, then a DC block, then normalise and fade the last few milliseconds.
  const q = Math.max(1, Math.round(period * PLUCK.pickupAt));
  let peak = 0;
  let prevIn = 0;
  let prevOut = 0;
  const r = 1 - (2 * Math.PI * 20) / rate;
  for (let i = 0; i < length; i++) {
    const x = y[i]! - PLUCK.pickupDepth * (i - q >= 0 ? y[i - q]! : 0);
    const v = x - prevIn + r * prevOut;
    prevIn = x;
    prevOut = v;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const scale = peak > 0 ? PLUCK.peak / peak : 0;
  const fade = Math.min(length, Math.round(0.03 * rate));
  for (let i = 0; i < length; i++) {
    const tail = i >= length - fade ? (length - i) / fade : 1;
    out[i] = out[i]! * scale * tail;
  }
  return out;
}

/** One period of noise, mean removed (DC would circulate forever), combed at the pick position. */
function excitation(length: number, pick: number, seed: number): Float32Array {
  let s = (seed * 2654435761) >>> 0 || 1;
  const noise = new Float32Array(length);
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const white = (s >>> 0) / 2147483648 - 1;
    lp += PLUCK.brightness * (white - lp);
    noise[i] = lp;
    mean += lp / length;
  }
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = noise[i]! - mean - (i - pick >= 0 ? noise[i - pick]! - mean : 0);
  }
  return out;
}
