// Renders the synthesised piano, and the guitar through each amp sound, to WAV files in
// var/render/, for tuning by ear.
//
//   npm run render                    a phrase, the range, and the full set's render time
//   npm run render -- C4 [soft|hard]  one note
//   npm run render -- all             every rendered root at both velocity layers
//   npm run render -- amp [sound]     a riff dry and through each amp sound (or one), as loud as in the page

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMP_SOUNDS, AmpModel, ampStages, FLAT } from 'chordlight/audio/amp-model.js';
import { renderPluck } from 'chordlight/audio/guitar-model.js';
import { renderNote, rootFor, roots } from 'chordlight/audio/piano-model.js';
import { MIX, PIANO } from 'chordlight/tuning.js';

const RATE = 48000;
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../var/render');
mkdirSync(OUT, { recursive: true });

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(text) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(text);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

function wav(path, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
  console.log(`  ${path}`);
}

const cache = new Map();
function buffer(root, layer) {
  const id = `${root}:${layer}`;
  if (!cache.has(id)) cache.set(id, renderNote(root, layer, RATE));
  return cache.get(id);
}

/** Mixes [midi, start, layer, hold] notes dry, repitched as playback does. */
function mix(notes, seconds) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (const [midi, start, layer, hold] of notes) {
    const { root, shift } = rootFor(midi);
    const src = buffer(root, layer);
    const rate = Math.pow(2, shift / 12);
    const at = Math.round(start * RATE);
    const release = hold === undefined ? Infinity : Math.round(hold * RATE);
    for (let i = 0; at + i < out.length; i++) {
      const pos = i * rate;
      const j = Math.floor(pos);
      if (j + 1 >= src.length) break;
      const damp = i > release ? Math.exp(-(i - release) / (PIANO.damper * RATE)) : 1;
      out[at + i] += (src[j] + (src[j + 1] - src[j]) * (pos - j)) * damp * 0.5;
    }
  }
  return out;
}

/** A pop-punk riff on the plucked-string voice, at a DI's level: muted chugs, open chords, a line. */
function riff() {
  const beat = 60 / 168;
  const out = new Float32Array(Math.round(RATE * (beat * 16 + 1.5)));
  const put = (midi, at, length, level) => {
    const d = renderPluck(midi, RATE);
    const from = Math.round(at * RATE);
    const n = Math.round(length * RATE);
    for (let i = 0; i < n && i < d.length && from + i < out.length; i++) {
      out[from + i] += d[i] * level * Math.min(1, (n - i) / 240);
    }
  };
  const power = (root) => [root, root + 7, root + 12];
  for (let i = 0; i < 8; i++) for (const m of power(40)) put(m, (i * beat) / 2, beat * 0.4, 0.28);
  for (const [k, root] of [43, 45].entries()) {
    for (const m of power(root)) put(m, beat * (4 + k * 2), beat * 1.9, 0.3);
  }
  for (const [k, m] of [64, 67, 69, 71, 69, 67, 64, 62].entries()) {
    put(m, beat * (8 + k), beat * 0.9, 0.42);
  }
  for (const m of power(40)) put(m, beat * 16, 1.4, 0.3);
  return out;
}

const arg = process.argv[2];
if (arg === 'amp') {
  const only = process.argv[3];
  if (only && !AMP_SOUNDS.includes(only)) {
    console.log(`no amp sound ${only}; there are: ${AMP_SOUNDS.join(' ')}`);
    process.exit(2);
  }
  const dry = riff();
  wav(join(OUT, 'amp-dry.wav'), dry);
  // The guitar bus, then the master's gain into its clipper: what the page plays.
  const page = MIX.guitar * MIX.master;
  for (const sound of only ? [only] : AMP_SOUNDS) {
    const wet = new AmpModel(RATE, ampStages(sound, FLAT)).process(dry);
    wav(
      join(OUT, `amp-${sound}.wav`),
      wet.map((v) => v * page),
    );
  }
} else if (arg === 'all') {
  for (const root of roots()) {
    for (const layer of [0, 1])
      wav(join(OUT, `root-${root}-${layer ? 'hard' : 'soft'}.wav`), buffer(root, layer));
  }
} else if (arg) {
  const midi = midiOf(arg);
  if (midi === null) {
    console.log(`not a note: ${arg} (try C4, F#3, Bb5)`);
    process.exit(2);
  }
  const layers = process.argv[3] === 'soft' ? [0] : process.argv[3] === 'hard' ? [1] : [0, 1];
  for (const layer of layers) {
    wav(join(OUT, `${arg}-${layer ? 'hard' : 'soft'}.wav`), mix([[midi, 0, layer]], 7));
  }
} else {
  const started = performance.now();
  for (const root of roots()) for (const layer of [0, 1]) buffer(root, layer);
  const ms = performance.now() - started;
  const bytes = [...cache.values()].reduce((a, b) => a + b.byteLength, 0);
  console.log(
    `the page's sample set: ${cache.size} buffers, ${(bytes / 1e6).toFixed(1)} MB, rendered in ${ms.toFixed(0)} ms at ${RATE} Hz`,
  );

  const beat = 60 / 92;
  const melody = [64, 67, 72, 71, 69, 67, 64, 62, 60];
  const phrase = melody.map((m, i) => [m, i * beat * 0.5, i % 4 === 0 ? 1 : 0, beat * 0.45]);
  const chords = [
    [48, 55, 64],
    [43, 50, 59],
    [45, 52, 60],
    [41, 48, 57],
  ].flatMap((c, i) => c.map((m) => [m, i * beat * 4, 0, beat * 3.8]));
  wav(join(OUT, 'phrase.wav'), mix([...phrase.map(([m, t, l, h]) => [m, t, l, h]), ...chords], 12));
  wav(
    join(OUT, 'range.wav'),
    mix(
      roots()
        .filter((r) => r % 12 === 0)
        .map((m, i) => [m, i * 1.2, 1, 1]),
      12,
    ),
  );
}
