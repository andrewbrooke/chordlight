// Where things sit on the guitar neck, and where a note with no known place is shown.
//
// Left to right: the string names, the open strings, the nut, then the frets. Frets narrow towards
// the body by less than a real neck's 2^(-1/12) each, so labels still fit on the high frets.
//
// A note can be played in up to six places, and one pickup can't tell which string sounded. A note
// with no place given (heard, played on a MIDI keyboard, replayed) goes to the place nearest the
// hand, and the hand drifts towards each note played. Open strings cost nothing in first position.

import { GUITAR } from '../tuning.js';

export interface Spot {
  string: number;
  fret: number;
}

export interface NeckColumns {
  /** The string names' column. */
  names: { x0: number; x1: number };
  nut: { x0: number; x1: number };
  /** Fret wire centres, 1 to `frets`. */
  wires: number[];
  /** Each fret's playing area, 0 (open) to `frets`. */
  cells: { x0: number; x1: number }[];
  width: number;
}

export function neckColumns(frets: number): NeckColumns {
  const g = GUITAR;
  const ratio = Math.pow(2, -g.taper / 12);
  const fretWidths = Array.from({ length: frets }, (_, i) => g.firstFret * Math.pow(ratio, i));
  const width = g.namesWidth + g.openWidth + g.nutWidth + fretWidths.reduce((a, b) => a + b, 0);
  const left = -width / 2;

  const names = { x0: left, x1: left + g.namesWidth };
  const open = { x0: names.x1, x1: names.x1 + g.openWidth };
  const nut = { x0: open.x1, x1: open.x1 + g.nutWidth };
  const cells = [open];
  const wires: number[] = [];
  let x = nut.x1;
  for (const w of fretWidths) {
    cells.push({ x0: x, x1: x + w });
    x += w;
    wires.push(x);
  }
  return { names, nut, wires, cells, width };
}

export const spotId = (s: Spot, frets: number): number => s.string * (frets + 1) + s.fret;

export const spotOf = (id: number, frets: number): Spot => ({
  string: Math.floor(id / (frets + 1)),
  fret: id % (frets + 1),
});

/** Every place on the neck that plays `midi`. */
export function placesFor(midi: number, tuning: readonly number[], frets: number): Spot[] {
  const out: Spot[] = [];
  tuning.forEach((open, string) => {
    const fret = midi - open;
    if (fret >= 0 && fret <= frets) out.push({ string, fret });
  });
  return out;
}

const reach = (spot: Spot, hand: number): number =>
  spot.fret === 0 ? Math.max(0, hand - GUITAR.openReach) : Math.abs(spot.fret - hand);

/** The place for `midi` nearest the hand; ties go to the lower fret. */
export function nearestPlace(
  midi: number,
  tuning: readonly number[],
  frets: number,
  hand: number,
): Spot | null {
  let best: Spot | null = null;
  for (const spot of placesFor(midi, tuning, frets)) {
    if (!best) best = spot;
    else {
      const d = reach(spot, hand) - reach(best, hand);
      if (d < -1e-9 || (Math.abs(d) <= 1e-9 && spot.fret < best.fret)) best = spot;
    }
  }
  return best;
}

/** Where the hand is after playing at `spot`. An open string leaves it where it was. */
export function follow(hand: number, spot: Spot): number {
  return spot.fret === 0 ? hand : hand + (spot.fret - hand) * GUITAR.handFollow;
}
