// Horizontal key positions. Black keys use real-keyboard offsets (the C–E group split into five
// slots, F–B into seven), so they are not centred between white keys.

import { pcOf } from '../theory/pitch.js';
import { KEYS } from '../tuning.js';

const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

export const isBlack = (midi: number): boolean => BLACK[pcOf(midi)]!;

/** Black key centre, in white-key widths from the group's first white key. */
const OFFSET: Record<number, number> = {
  1: 1.5 * (3 / 5),
  3: 3.5 * (3 / 5),
  6: 1.5 * (4 / 7),
  8: 3.5 * (4 / 7),
  10: 5.5 * (4 / 7),
};

export interface Spot {
  midi: number;
  black: boolean;
  x: number;
}

export function layoutKeys(lo: number, hi: number): { spots: Spot[]; width: number } {
  const W = KEYS.white;
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const width = whites.length * W;
  const left = -width / 2;
  const edgeOf = (white: number) => left + whites.indexOf(white) * W;

  const spots: Spot[] = [];
  for (let m = lo; m <= hi; m++) {
    if (!isBlack(m)) {
      spots.push({ midi: m, black: false, x: edgeOf(m) + W / 2 });
      continue;
    }
    const pc = pcOf(m);
    const group = m - pc + (pc < 5 ? 0 : 5);
    // A range starting on a black key has no white key to measure from; skip it.
    if (!whites.includes(group)) continue;
    spots.push({ midi: m, black: true, x: edgeOf(group) + OFFSET[pc]! * W });
  }
  return { spots, width };
}
