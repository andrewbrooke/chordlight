// Synthesised piano: an additive string model rendered once into buffers, in Workers in the page
// and in Node for `npm run render`.
//
// Partials are stretched by string stiffness (fₙ = n·f₀·√(1+Bn²)), weighted by hammer position and
// felt brightness, and decay in two stages. Three slightly detuned strings are one oscillator with
// amplitude modulation, since cos(ωt)·(1 + 2cos(δt)) equals three sines at ω and ω±δ.

import { PIANO } from '../tuning.js';

/** Envelope update interval, in samples. */
const BLOCK = 16;

export function roots(): number[] {
  const out: number[] = [];
  for (let m = PIANO.lowest; m <= PIANO.highest; m += PIANO.rootStep) out.push(m);
  return out;
}

/** The nearest rendered root, and the semitones to shift it by. */
export function rootFor(midi: number): { root: number; shift: number } {
  const step = PIANO.rootStep;
  const i = Math.round((midi - PIANO.lowest) / step);
  const root = PIANO.lowest + Math.max(0, Math.min(roots().length - 1, i)) * step;
  return { root, shift: midi - root };
}

export function durationOf(midi: number): number {
  return Math.min(PIANO.longest, Math.max(PIANO.shortest, PIANO.longest - (midi - 24) * 0.065));
}

/** Deterministic xorshift, so renders are reproducible. */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

export function renderNote(midi: number, layer: number, sampleRate: number): Float32Array {
  const vel = PIANO.layers[layer]!;
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const t = (midi - 21) / 87;
  const B = PIANO.inharmonicity * Math.pow(100, t);
  const x0 = PIANO.strikeBass + (PIANO.strikeTreble - PIANO.strikeBass) * t;
  const felt =
    (PIANO.feltSoft + (PIANO.feltHard - PIANO.feltSoft) * Math.pow(vel, 1.5)) *
    Math.pow(f0 / 262, 0.25);
  const after = PIANO.aftersound * Math.pow(2, -(midi - 36) / PIANO.decayHalving);
  const prompt = after * PIANO.promptRatio;
  const length = Math.round(durationOf(midi) * sampleRate);
  const out = new Float64Array(length);
  const rand = noise(midi * 7919 + layer * 104729);
  const ceiling = Math.min(14000, sampleRate * 0.45, felt * 7);

  for (let n = 1; n <= 64; n++) {
    const fn = n * f0 * Math.sqrt(1 + B * n * n);
    if (fn > ceiling) break;
    const amp =
      (Math.abs(Math.sin(n * Math.PI * x0)) / Math.pow(n, 0.9)) *
      (1 / (1 + (fn / felt) * (fn / felt))) *
      (fn / (fn + 90));
    if (amp < 1e-4) continue;
    const k = 1 + 0.1 * (n - 1) + fn / 2500;
    // Envelopes and beating change slowly, so they update per block; the partial runs per sample.
    const m1 = Math.exp(-BLOCK / (sampleRate * (prompt / k)));
    const m2 = Math.exp(-BLOCK / (sampleRate * (after / Math.pow(k, 1.2))));
    let e1 = amp * PIANO.promptShare;
    let e2 = amp * (1 - PIANO.promptShare);

    const w = (2 * Math.PI * fn) / sampleRate;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const ph = Math.PI * rand();
    let c = Math.cos(ph);
    let s = Math.sin(ph);

    const beat =
      (PIANO.beatRate * (0.6 + 0.8 * Math.abs(rand())) * Math.sqrt(fn / f0) * 2 * Math.PI * BLOCK) /
      sampleRate;
    const cb = Math.cos(beat);
    const sb = Math.sin(beat);
    let bc = Math.cos(Math.PI * rand());
    let bs = Math.sin(Math.PI * rand());
    const depth = PIANO.beatDepth * (0.7 + 0.6 * Math.abs(rand()));

    for (let start = 0; start < length; start += BLOCK) {
      const g = (e1 + e2) * (1 - depth + depth * bc);
      const end = Math.min(length, start + BLOCK);
      for (let i = start; i < end; i++) {
        out[i]! += s * g;
        const c2 = c * cw - s * sw;
        s = s * cw + c * sw;
        c = c2;
      }
      const bc2 = bc * cb - bs * sb;
      bs = bs * cb + bc * sb;
      bc = bc2;
      e1 *= m1;
      e2 *= m2;
      if ((start & 4095) === 0) {
        // Renormalise the recurrence phasors so their amplitude does not drift.
        const r = 1 / Math.hypot(c, s);
        c *= r;
        s *= r;
        const rb = 1 / Math.hypot(bc, bs);
        bc *= rb;
        bs *= rb;
        if (e1 + e2 < amp * 1e-5) break;
      }
    }
  }

  addKnock(out, vel, f0, sampleRate, rand);
  shape(out, vel, sampleRate);
  return normalise(out, PIANO.layerPeak[layer]!);
}

/** Hammer knock: a few milliseconds of band-passed noise. */
function addKnock(
  out: Float64Array,
  vel: number,
  f0: number,
  sampleRate: number,
  rand: () => number,
): void {
  const centre = Math.min(2500, Math.max(300, f0 * 3));
  const q = 0.9;
  const w = (2 * Math.PI * centre) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const decay = Math.exp(-1 / (sampleRate * PIANO.knockDecay));
  const peak = Math.max(...out.subarray(0, Math.min(out.length, 2048)).map(Math.abs));
  let g = PIANO.knock * vel * (peak || 1) * 8;
  const n = Math.min(out.length, Math.round(sampleRate * PIANO.knockDecay * 8));
  for (let i = 0; i < n; i++) {
    const x = rand();
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i]! += y * g;
    g *= decay;
  }
}

/** Raised-cosine attack (longer for softer strikes) and a fade-out at the end. */
function shape(out: Float64Array, vel: number, sampleRate: number): void {
  const attack = Math.round(sampleRate * (0.0012 + 0.003 * (1 - vel)));
  for (let i = 0; i < attack && i < out.length; i++) {
    out[i]! *= 0.5 - 0.5 * Math.cos((Math.PI * i) / attack);
  }
  const fade = Math.min(out.length, Math.round(sampleRate * 0.3));
  for (let i = 0; i < fade; i++) {
    out[out.length - 1 - i]! *= i / fade;
  }
}

function normalise(out: Float64Array, peak: number): Float32Array {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]!));
  const g = max > 0 ? peak / max : 0;
  const f = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) f[i] = out[i]! * g;
  return f;
}
