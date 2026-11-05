// Chord voicings inside a range. A chord with nothing before it takes a standard shape: root
// position, its root in the range's lowest octave, or the inversion nearest that when it won't fit.
// Every chord after moves as little as it can from the one before, so the same chord can come out
// stacked differently in different places; `lift` (a progression's ^ and _) overrides one.
// Chords of five notes drop the fifth.
//
// The candidates are each inversion of the chord as it stacks (root, third, fifth, seventh, ninth)
// and in close position. A ninth stacks past the octave, so on a high root every stacked inversion
// overruns the range; the close ones span under an octave, so one always fits.
//
// Nothing before used to mean "nearest the middle of the range", which put Gmaj7 alone as
// F♯3 G3 B3 D4: a shape nobody would pick, and the same chord sounding higher after Am.

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
    // Root position comes first, then each inversion in turn.
    if (!prev?.length) return notes;
    const cost = movement(notes, prev);
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

/** Distance from each note to the nearest note of the other chord, summed both ways. */
function movement(a: readonly number[], b: readonly number[]): number {
  const near = (x: number, ys: readonly number[]) => Math.min(...ys.map((y) => Math.abs(x - y)));
  return a.reduce((s, x) => s + near(x, b), 0) + b.reduce((s, y) => s + near(y, a), 0);
}

/** A progression's voicings, each led on from the one before, as the band plays them. */
export function voiceChain(
  steps: readonly { chord: Chord; lift?: number | undefined }[],
  lo: number,
  hi: number,
): number[][] {
  const out: number[][] = [];
  for (const s of steps) out.push(invert(voice(s.chord, out.at(-1) ?? null, lo, hi), s.lift ?? 0));
  return out;
}

/** Up an inversion per step of `lift` (the lowest note up an octave), or down (the highest down). */
export function invert(notes: readonly number[], lift: number): number[] {
  // Sorted after every move: a ninth spans more than an octave, so the moved note can land inside.
  let out = [...notes];
  const up = (xs: number[]) => [...xs.slice(1), xs[0]! + 12].sort((a, b) => a - b);
  const down = (xs: number[]) => [xs.at(-1)! - 12, ...xs.slice(0, -1)].sort((a, b) => a - b);
  for (let i = 0; i < Math.abs(lift); i++) out = lift > 0 ? up(out) : down(out);
  return out;
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
