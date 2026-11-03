// Renders the synthesised piano to WAV files in var/render/, for tuning by ear.
//
//   npm run render                    a phrase, the range, and the full set's render time
//   npm run render -- C4 [soft|hard]  one note
//   npm run render -- all             every rendered root at both velocity layers

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNote, rootFor, roots } from 'chordlight/audio/piano-model.js';
import { PIANO } from 'chordlight/tuning.js';

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

const arg = process.argv[2];
if (arg === 'all') {
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
