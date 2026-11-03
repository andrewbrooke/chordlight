// Piano buffers are finite, peak at their layer level, decay, and end in silence.

import { durationOf, renderNote, rootFor, roots } from 'chordlight/audio/piano-model.js';
import { PIANO } from 'chordlight/tuning.js';
import { check, done, same } from './kit/check.mjs';

const RATE = 48000;
const rms = (a, from, to) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

const started = performance.now();
for (const midi of [21, 36, 60, 84, 108]) {
  for (const layer of [0, 1]) {
    const b = renderNote(midi, layer, RATE);
    const label = `note ${midi}, layer ${layer}`;
    same(b.length, Math.round(durationOf(midi) * RATE), `${label} length`);
    let peak = 0;
    let finite = true;
    for (const x of b) {
      if (!Number.isFinite(x)) finite = false;
      peak = Math.max(peak, Math.abs(x));
    }
    check(finite, `${label} has a non-finite sample`);
    check(Math.abs(peak - PIANO.layerPeak[layer]) < 1e-3, `${label} peaks at ${peak.toFixed(3)}`);
    const tenth = Math.floor(b.length / 10);
    const early = rms(b, 0, tenth);
    const late = rms(b, b.length - tenth * 2, b.length - tenth);
    check(
      late < early * 0.5,
      `${label} doesn't decay: ${early.toFixed(3)} then ${late.toFixed(3)}`,
    );
    check(rms(b, b.length - 64, b.length) < 1e-3, `${label} doesn't end in silence`);
  }
}
const ms = performance.now() - started;

// Every note on 88 keys is within a semitone of a rendered root.
for (let m = 21; m <= 108; m++) {
  const { root, shift } = rootFor(m);
  check(roots().includes(root) && Math.abs(shift) <= 1, `note ${m} maps to ${root} by ${shift}`);
}

done(`buffers are sound and decay; ten rendered in ${ms.toFixed(0)} ms`);
