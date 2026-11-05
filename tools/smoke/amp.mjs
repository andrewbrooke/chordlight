// The guitar amp's sounds, run offline through the same chain the live amp builds: every sound has
// the same stages (the live amp builds its nodes once), they play a riff equally loud, Drive changes
// the sound more than the loudness, and the sounds are distinct: each distorts more and sustains
// longer than the one before. Saved settings from before there were sounds start as voiced.

import {
  AMP_SOUNDS,
  AmpModel,
  ampSettings,
  ampStages,
  clipCurve,
  FLAT,
} from 'chordlight/audio/amp-model.js';
import { renderPluck } from 'chordlight/audio/guitar-model.js';
import { highpass, highshelf, step } from 'chordlight/listen/filters.js';
import { check, done, same } from './kit/check.mjs';

const RATE = 48000;
const db = (x) => 20 * Math.log10(x);
const rms = (a, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};

/** RMS after a rough loudness weighting: low bass discounted, presence lifted. */
function loudness(y) {
  const a = highpass(100, RATE, 0.5);
  const b = highshelf(1500, RATE, 4);
  let s = 0;
  for (const v of y) {
    const w = step(b, step(a, v));
    s += w * w;
  }
  return db(Math.sqrt(s / y.length));
}

/** Palm-muted power chords, two ringing ones, then single notes, at a DI's level. */
function riff() {
  const out = new Float32Array(RATE * 4);
  const put = (midi, at, length, level) => {
    const d = renderPluck(midi, RATE);
    const from = Math.round(at * RATE);
    const n = Math.round(length * RATE);
    for (let i = 0; i < n && i < d.length && from + i < out.length; i++) {
      out[from + i] += d[i] * level * Math.min(1, (n - i) / 200);
    }
  };
  for (let i = 0; i < 8; i++) for (const m of [40, 47, 52]) put(m, i * 0.1875, 0.17, 0.3);
  [
    [45, 52, 57],
    [43, 50, 55],
  ].forEach((chord, k) => chord.forEach((m) => put(m, 1.5 + k * 0.75, 0.7, 0.3)));
  [52, 55, 57, 59].forEach((m, i) => put(m, 3 + i * 0.25, 0.24, 0.4));
  return out;
}

const run = (sound, knobs = FLAT, x) => new AmpModel(RATE, ampStages(sound, knobs)).process(x);

// The live amp sets each sound's values on the same nodes.
const shape = (sound) => ampStages(sound, FLAT).map((s) => (s.kind === 'filter' ? s.type : s.kind));
for (const s of AMP_SOUNDS) same(shape(s), shape('clean'), `${s} has the same stages as clean`);

const dry = riff();
const voiced = Object.fromEntries(AMP_SOUNDS.map((s) => [s, loudness(run(s, FLAT, dry))]));
for (const s of AMP_SOUNDS) {
  const off = voiced[s] - voiced.clean;
  check(Math.abs(off) < 1, `${s} plays the riff ${off.toFixed(1)} dB from clean`);
  for (const drive of [0, 1]) {
    const moved = loudness(run(s, { ...FLAT, drive }, dry)) - voiced[s];
    check(Math.abs(moved) < 4, `${s} at drive ${drive} moves ${moved.toFixed(1)} dB`);
  }
  let peak = 0;
  for (const v of run(s, FLAT, dry)) peak = Math.max(peak, Math.abs(v));
  check(peak < 1, `${s} peaks over full scale: ${db(peak).toFixed(1)} dB`);
}

// Distortion, from a held G3: what isn't the fundamental, over the last half second.
function distortion(sound) {
  const x = new Float32Array(RATE);
  for (let i = 0; i < x.length; i++) x[i] = 0.25 * Math.sin((2 * Math.PI * 196 * i) / RATE);
  const y = run(sound, FLAT, x);
  const from = y.length - RATE / 2;
  const c = 2 * Math.cos((2 * Math.PI * 196) / RATE);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < y.length; i++) {
    const s = y[i] + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  const n = RATE / 2;
  const fundamental = ((s1 * s1 + s2 * s2 - c * s1 * s2) * 2) / (n * n);
  const total = rms(y, from) ** 2;
  return Math.sqrt(Math.max(0, total - fundamental) / total);
}

/** How far a pluck falls from its attack to 1.3 s on: less for a sound that sustains. */
function fall(sound) {
  const d = renderPluck(45, RATE);
  const x = new Float32Array(RATE * 2);
  for (let i = 0; i < x.length && i < d.length; i++) x[i] = d[i] * 0.4;
  const y = run(sound, FLAT, x);
  return db(rms(y, 2400, 7200)) - db(rms(y, 57600, 67200));
}

const dist = Object.fromEntries(AMP_SOUNDS.map((s) => [s, distortion(s)]));
const falls = Object.fromEntries(AMP_SOUNDS.map((s) => [s, fall(s)]));
const pct = (x) => `${(x * 100).toFixed(0)}%`;
check(dist.clean < 0.03, `clean distorts ${pct(dist.clean)}`);
check(dist.crunch > 0.1, `crunch distorts only ${pct(dist.crunch)}`);
check(dist.punk > dist.crunch && dist.fuzz > dist.crunch, 'punk and fuzz distort more than crunch');
const order = ['clean', 'crunch', 'punk', 'fuzz'];
for (let i = 1; i < order.length; i++) {
  const [a, b] = [order[i - 1], order[i]];
  check(
    falls[b] < falls[a] - 2.5,
    `${b} should sustain clearly longer than ${a}: falls ${falls[b].toFixed(1)} dB against ${falls[a].toFixed(1)}`,
  );
}

// The knobs
const midDb = (sound, mid) =>
  ampStages(sound, { ...FLAT, mid }).find(
    (s) => s.kind === 'filter' && s.type === 'peaking' && s.f === 800,
  )?.db;
check(midDb('fuzz', 1) - midDb('fuzz', 0) > 10, 'the mid knob turns the scoop');

// Curves end at ±1 and never fold back.
for (const curve of ['soft', 'tube', 'hard']) {
  const c = clipCurve(curve);
  same([c[0], c[c.length - 1]], [-1, 1], `the ${curve} curve ends at ±1`);
  let rising = true;
  for (let i = 1; i < c.length; i++) if (c[i] < c[i - 1]) rising = false;
  check(rising, `the ${curve} curve rises throughout`);
}

// Saved settings
same(
  ampSettings({ monitor: true, drive: 0.1, tone: 0.55 }),
  { monitor: true, sound: 'clean', ...FLAT },
  'settings from before there were sounds start as voiced',
);
same(
  ampSettings({ monitor: false, sound: 'fuzz', drive: 0.8, bass: 0.3, mid: 0.2, treble: 0.6 }),
  { monitor: false, sound: 'fuzz', drive: 0.8, bass: 0.3, mid: 0.2, treble: 0.6 },
  'a saved sound keeps its knobs',
);
same(ampSettings({ sound: 'lead' }).sound, 'clean', 'a sound that no longer exists is clean');

const summary = order.map((s) => `${s} ${pct(dist[s])} / ${falls[s].toFixed(0)} dB`).join(', ');
done(`four sounds, equally loud and distinct (distortion / fall): ${summary}`);
