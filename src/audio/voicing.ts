// Chord voicings that move as little as possible from the previous chord. Chords of five notes
// drop the fifth.
//
// The candidates are each inversion of the chord as it stacks (root, third, fifth, seventh, ninth)
// and in close position. A ninth stacks past the octave, so on a high root every stacked inversion
// overruns the range; the close ones span under an octave, so one always fits.

import { type Chord, chordPcs, qualityOf, rootPc } from '../theory/chords.js';
import { pcOf, pcOfSpelling } from '../theory/pitch.js';

export function voice(
  chord: Chord,
  prev: readonly number[] | null,
  lo: number,
  hi: number,
): number[] {
  const pcs = tonesOf(chord);
  const close = [...pcs].sort((a, b) => pcOf(a - pcs[0]!) - pcOf(b - pcs[0]!));
  let best: number[] = [];
  let bestCost = Infinity;
  for (const order of [...rotations(pcs), ...rotations(close)]) {
    const notes = stack(order, lo);
    if (notes[notes.length - 1]! > hi) continue;
    const cost = prev?.length ? movement(notes, prev) : Math.abs(mean(notes) - (lo + hi) / 2);
    if (cost < bestCost) {
      bestCost = cost;
      best = notes;
    }
  }
  return best;
}

function tonesOf(chord: Chord): number[] {
  const pcs = chordPcs(chord);
  if (pcs.length <= 4) return pcs;
  const fifth = qualityOf(chord.quality).tones.findIndex((t) => t.iv === 7);
  return pcs.filter((_, i) => i !== fifth);
}

function rotations<T>(xs: readonly T[]): T[][] {
  return xs.map((_, r) => [...xs.slice(r), ...xs.slice(0, r)]);
}

/** Each pitch class in turn, on the first note above the last, starting from `lo`. */
function stack(order: readonly number[], lo: number): number[] {
  const notes: number[] = [];
  let n = lo + pcOf(order[0]! - lo);
  for (const pc of order) {
    while (pcOf(n) !== pc) n++;
    notes.push(n);
    n++;
  }
  return notes;
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Distance from each note to the nearest note of the other chord, summed both ways. */
function movement(a: readonly number[], b: readonly number[]): number {
  const near = (x: number, ys: readonly number[]) => Math.min(...ys.map((y) => Math.abs(x - y)));
  return a.reduce((s, x) => s + near(x, b), 0) + b.reduce((s, y) => s + near(y, a), 0);
}

/** The slash bass if there is one, else the root, in the octave starting at `lo`. */
export function bassNote(chord: Chord, lo: number): number {
  const pc = chord.bass ? pcOfSpelling(chord.bass) : rootPc(chord);
  return lo + pcOf(pc - lo);
}

export function powerChord(chord: Chord, lo: number): number[] {
  const root = lo + pcOf(rootPc(chord) - lo);
  return [root, root + 7, root + 12];
}
