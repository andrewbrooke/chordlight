// Guitar mode's pure parts: the tunings are six playable strings each, the neck's frets narrow
// towards the body, a note with no place given goes near the hand, and the plucked-string voice is
// in tune, decays and ends in silence.

import {
  pluckDuration,
  pluckRootFor,
  pluckRoots,
  renderPluck,
} from 'chordlight/audio/guitar-model.js';
import { Listener } from 'chordlight/listen/listener.js';
import {
  isTuning,
  STANDARD,
  stringLabel,
  stringName,
  TUNINGS,
  tuningOf,
} from 'chordlight/presets/tunings.js';
import { PLUCK } from 'chordlight/tuning.js';
import {
  follow,
  nearestPlace,
  neckColumns,
  placesFor,
  spotId,
  spotOf,
} from 'chordlight/view/neck-layout.js';
import { check, done, same } from './kit/check.mjs';

// Tunings
for (const t of TUNINGS) check(isTuning([...t.notes]), `${t.name} isn't six playable strings`);
same(new Set(TUNINGS.map((t) => t.id)).size, TUNINGS.length, 'tuning ids are unique');
same(tuningOf(STANDARD)?.id, 'standard', 'standard tuning is recognised');
same(tuningOf([40, 45, 50, 55, 59, 63]), undefined, 'a custom tuning is no preset');
same(STANDARD.map((n) => stringName(n)).join(' '), 'E A D G B E', 'standard spells E A D G B E');
same(stringName(40, true), 'E2', 'the low E is E2');
same(
  [0, 1, 2, 3, 4, 5].map(stringLabel),
  ['6th (thickest)', '5th', '4th', '3rd', '2nd', '1st (thinnest)'],
  'strings are counted the way guitarists count them',
);
same(isTuning([40, 45, 50]), false, 'three strings is not a tuning');
same(isTuning([40, 45, 50, 55, 59, 200]), false, 'a string out of range is not a tuning');

// The neck
const FRETS = 22;
const cols = neckColumns(FRETS);
same(cols.cells.length, FRETS + 1, 'a cell for the open strings and each fret');
same(cols.wires.length, FRETS, 'a wire after each fret');
let narrowing = true;
for (let f = 2; f <= FRETS; f++) {
  const w = (i) => cols.cells[i].x1 - cols.cells[i].x0;
  if (!(w(f) < w(f - 1))) narrowing = false;
}
check(narrowing, 'frets narrow towards the body');
check(Math.abs(cols.cells[0].x0 - cols.names.x1) < 1e-9, 'the open strings follow the names');
check(Math.abs(cols.width / 2 + cols.names.x0) < 1e-9, 'the neck is centred');
for (let id = 0; id < 6 * (FRETS + 1); id++) {
  if (spotId(spotOf(id, FRETS), FRETS) !== id) check(false, `place ${id} doesn't round-trip`);
}

same(placesFor(64, STANDARD, FRETS).length, 5, 'E4 is in five places on a 22-fret neck');
same(placesFor(39, STANDARD, FRETS).length, 0, 'nothing below the low E');
same(nearestPlace(64, STANDARD, FRETS, 2), { string: 5, fret: 0 }, 'in first position E4 is open');
same(nearestPlace(64, STANDARD, FRETS, 9), { string: 3, fret: 9 }, 'up the neck it is fretted');
same(nearestPlace(59, STANDARD, FRETS, 5), { string: 3, fret: 4 }, 'B3 nearest the 5th fret');
same(nearestPlace(100, STANDARD, FRETS, 2), null, 'a note off the neck has no place');
check(follow(2, { string: 0, fret: 12 }) > 2, 'the hand moves towards a fretted note');
same(follow(7, { string: 0, fret: 0 }), 7, 'an open string leaves the hand where it is');

// The plucked-string voice
const RATE = 48000;
for (let m = 28; m <= 100; m++) {
  const { root, shift } = pluckRootFor(m);
  check(
    pluckRoots().includes(root) && Math.abs(shift) <= 1,
    `note ${m} maps to ${root} by ${shift}`,
  );
}
const config = { lo: 28, hi: 100, gateDb: -70, loudDb: -14, hum: [] };
for (const midi of [40, 52, 64, 76]) {
  const b = renderPluck(midi, RATE);
  same(b.length, Math.round(pluckDuration(midi) * RATE), `note ${midi} length`);
  let peak = 0;
  let finite = true;
  for (const x of b) {
    if (!Number.isFinite(x)) finite = false;
    peak = Math.max(peak, Math.abs(x));
  }
  check(finite, `note ${midi} has a non-finite sample`);
  check(Math.abs(peak - PLUCK.peak) < 1e-3, `note ${midi} peaks at ${peak.toFixed(3)}`);
  const rms = (from, to) => {
    let s = 0;
    for (let i = from; i < to; i++) s += b[i] * b[i];
    return Math.sqrt(s / (to - from));
  };
  const tenth = Math.floor(b.length / 10);
  check(rms(b.length - 2 * tenth, b.length - tenth) < rms(0, tenth) * 0.5, `note ${midi} rings on`);
  check(rms(b.length - 64, b.length) < 1e-3, `note ${midi} doesn't end in silence`);

  const l = new Listener(RATE, config);
  const at = Math.round(0.3 * RATE);
  for (let i = 0; i + 128 <= at; i += 128) l.push(b.subarray(i, i + 128), i / RATE);
  const cents = (l.reading.pitch - midi) * 100;
  check(Math.abs(cents) < 5, `note ${midi} is ${cents.toFixed(1)} cents out of tune`);
}

done('tunings, the neck and the plucked string hold together');
