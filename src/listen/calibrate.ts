// The guided setup's measurements, pure so the smokes can check them on made-up signals: which
// channel the guitar is on, whether the level is right, the quiet level and any mains hum, how far
// a string is from its note, and the delay between a click and the pluck played along to it.

import { LISTEN, SETUP } from '../tuning.js';
import { notch, step } from './filters.js';

/** The channel whose level rose most above its own quiet, if any rose enough to be a guitar. */
export function pickChannel(quiet: readonly number[], loud: readonly number[]): number | null {
  let best: number | null = null;
  loud.forEach((db, c) => {
    const rise = db - (quiet[c] ?? -120);
    if (db < SETUP.findFloor || rise < SETUP.findRise) return;
    if (best === null || rise > loud[best]! - (quiet[best] ?? -120)) best = c;
  });
  return best;
}

export type LevelAdvice = 'quiet' | 'good' | 'loud' | 'clipping';

/** From a pluck's sample peak in dBFS. */
export function adviseLevel(peakDb: number): LevelAdvice {
  if (peakDb >= SETUP.clipDb) return 'clipping';
  if (peakDb > SETUP.loudDb) return 'loud';
  if (peakDb < SETUP.quietDb) return 'quiet';
  return 'good';
}

export interface QuietReport {
  /** The median RMS level of short windows, in dBFS: what the amp's gate hears. */
  floorDb: number;
  /** The same with the hum filtered out: what the detector hears. */
  cleanDb: number;
  mains: 50 | 60 | null;
  /** The mains harmonics that stand out, in Hz. */
  hum: number[];
  noisy: boolean;
}

/** The median level of 50 ms windows, from `from` on. */
function floorOf(samples: Float32Array, rate: number, from = 0): number {
  const win = Math.max(1, Math.round(rate * 0.05));
  const levels: number[] = [];
  for (let i = from; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let k = i; k < i + win; k++) sum += samples[k]! * samples[k]!;
    levels.push(10 * Math.log10(sum / win + 1e-12));
  }
  return median(levels) ?? -120;
}

export function analyseQuiet(samples: Float32Array, rate: number): QuietReport {
  const floorDb = floorOf(samples, rate);

  const hann = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    hann[i] = samples[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1)));
  }
  let mains: 50 | 60 | null = null;
  let hum: number[] = [];
  let strongest = 0;
  for (const base of [50, 60] as const) {
    const found: number[] = [];
    let total = 0;
    for (let k = 1; k <= SETUP.humHarmonics; k++) {
      const f = base * k;
      if (f > rate / 2 - 20) break;
      const peak = power(hann, f, rate);
      const around = SETUP.humBeside.map((d) => power(hann, f + d, rate));
      const floor = around.reduce((a, b) => a + b, 0) / around.length;
      if (10 * Math.log10(peak / Math.max(floor, 1e-30)) > SETUP.humProminence) {
        found.push(f);
        total += peak;
      }
    }
    if (found.length > 0 && total > strongest) {
      strongest = total;
      mains = base;
      hum = found;
    }
  }
  return {
    floorDb,
    cleanDb: filtered(samples, rate, hum),
    mains,
    hum,
    noisy: floorDb > SETUP.noisyDb,
  };
}

/** The floor through the same notches the detector will use, once they have settled. */
function filtered(samples: Float32Array, rate: number, hum: readonly number[]): number {
  if (hum.length === 0) return floorOf(samples, rate);
  const notches = hum.map((f) => notch(f, rate, LISTEN.notchQ));
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let x = samples[i]!;
    for (const f of notches) x = step(f, x);
    out[i] = x;
  }
  return floorOf(out, rate, Math.round(rate * 0.5));
}

/** The gate sits a margin above the quiet level, and never so high it cuts ordinary playing. */
export function gateFor(floorDb: number): number {
  return Math.min(SETUP.gateHighest, Math.max(SETUP.gateLowest, floorDb + SETUP.gateMargin));
}

export type TuneVerdict = 'in tune' | 'flat' | 'sharp';

/** How far a heard pitch (MIDI, with a fraction) is from a string's note. */
export function tuneTo(pitch: number, target: number): { cents: number; verdict: TuneVerdict } {
  const cents = (pitch - target) * 100;
  const verdict = Math.abs(cents) <= SETUP.inTuneCents ? 'in tune' : cents < 0 ? 'flat' : 'sharp';
  return { cents, verdict };
}

export interface Timing {
  /** Seconds from a click being booked to the pluck played along to it arriving. */
  offset: number;
  matched: number;
  /** Median distance from the median, in seconds: how steady the plucks were. */
  spread: number;
}

/** Pairs each click with the nearest pluck in a window around it; null if too few paired. */
export function timingOffset(clicks: readonly number[], hits: readonly number[]): Timing | null {
  const unused = [...hits];
  const diffs: number[] = [];
  for (const c of clicks) {
    let best = -1;
    unused.forEach((h, i) => {
      const d = h - c;
      if (d < SETUP.earliest || d > SETUP.latest) return;
      if (best < 0 || Math.abs(d - SETUP.expected) < Math.abs(unused[best]! - c - SETUP.expected)) {
        best = i;
      }
    });
    if (best < 0) continue;
    diffs.push(unused[best]! - c);
    unused.splice(best, 1);
  }
  if (diffs.length < SETUP.timingMatches) return null;
  const offset = median(diffs)!;
  const spread = median(diffs.map((d) => Math.abs(d - offset)))!;
  return { offset, matched: diffs.length, spread };
}

/** Interfaces before laptop microphones, and a real device before the browser's "Default" alias. */
export function likelyInterface(labels: readonly string[]): number {
  const interfaceLike =
    /focusrite|scarlett|audient|presonus|audiobox|behringer|umc|motu|steinberg|zoom|line ?6|irig|guitar|instrument|interface|usb audio|m-?audio|arturia|universal audio|apollo|volt|ssl|komplete|tascam|roland|boss|yamaha|mackie|solid state/i;
  const alias = /^(default|communications)\b/i;
  const ranked = labels
    .map((label, i) => ({
      i,
      score: (interfaceLike.test(label) ? 2 : 0) + (alias.test(label) ? 0 : 1),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return ranked[0]?.i ?? 0;
}

export function median(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Goertzel power at one frequency. */
function power(x: Float32Array, f: number, rate: number): number {
  const coeff = 2 * Math.cos((2 * Math.PI * f) / rate);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s = x[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
