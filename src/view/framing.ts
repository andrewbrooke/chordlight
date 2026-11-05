// How the stage frames the instrument: all of it across the width, unless that would draw what a
// finger or pointer aims at (a white key, a fret) narrower than wanted; then only a section, which
// can be moved. Zooming in stops at the first of three limits: targets as wide as wanted, the
// fewest keys or frets a section may show, and the instrument's minimum length on a short stage.
//
// A section is made of whole units (white keys, or frets with their wires) and moves a unit at a
// time. Units all the same width (keys) are zoomed to fill the room exactly. Frets narrow along the
// neck, so there the scale is set by the room, which keeps it steady as the section moves, and
// whatever is left over is blank either side; the stage cuts off what lies in it.

import { KEYS } from '../tuning.js';

/** A unit's left and right edges, in cm across the instrument. */
export type Unit = readonly [number, number];

/** The instrument's size in cm. It runs across from -width/2 to width/2. */
export interface Shape {
  width: number;
  minLength: number;
  maxLength: number;
  /** The width of what a finger aims at. */
  touch: number;
  /** The narrowest section worth showing. */
  fewest: number;
  /** What a section is made of, left to right. */
  units: readonly Unit[];
}

export interface Frame {
  /** The section shown, in cm across the instrument. */
  from: number;
  to: number;
  /** The earliest and latest a section of this size can start. */
  first: number;
  last: number;
  /** How long the keys (or the neck's string set) are drawn. */
  length: number;
  /** The camera's left edge, width and height, in cm. */
  x0: number;
  viewW: number;
  viewH: number;
}

/** How much of the instrument, in cm across, a w × h px stage shows, aiming at `target` px targets. */
export function widest(shape: Shape, w: number, h: number, target: number): number {
  const m = KEYS.margin;
  const scale = Math.min(
    target / shape.touch,
    h / (shape.minLength + 2 * m),
    w / (shape.fewest + 2 * m),
  );
  return w / scale - 2 * m;
}

/**
 * The first and last units of a section at most `room` cm wide, starting at the unit whose left
 * edge is nearest `from`, and the latest start that still reaches the last unit.
 */
export function section(
  units: readonly Unit[],
  room: number,
  from: number,
): [first: number, last: number, latest: number] {
  const end = units.length - 1;
  const fits = (i: number, j: number) => units[j]![1] - units[i]![0] <= room + 1e-6;
  let latest = 0;
  while (latest < end && !fits(latest, end)) latest++;
  let i = 0;
  for (let k = 1; k <= latest; k++) {
    if (Math.abs(units[k]![0] - from) < Math.abs(units[i]![0] - from)) i = k;
  }
  let j = i;
  while (j < end && fits(i, j + 1)) j++;
  return [i, j, latest];
}

const span = (u: Unit) => u[1] - u[0];
const even = (units: readonly Unit[]) =>
  units.every((u) => Math.abs(span(u) - span(units[0]!)) < 1e-9);

/** Frames `shown` cm of the instrument on a w × h px stage, starting as near `from` as it can. */
export function frame(shape: Shape, w: number, h: number, shown: number, from: number): Frame {
  const m = KEYS.margin;
  const half = shape.width / 2;
  let room = Math.min(shown, shape.width);
  let [start, end, first, last] = [-half, half, -half, -half];
  if (room < shape.width - 1e-6) {
    const { units } = shape;
    const [i, j, latest] = section(units, room, from);
    [start, end, first, last] = [units[i]![0], units[j]![1], units[0]![0], units[latest]![0]];
    if (even(units)) room = end - start;
  }
  const aspect = w / h;
  const wide = room + 2 * m;
  const length = Math.min(shape.maxLength, Math.max(shape.minLength, wide / aspect - 2 * m));
  const viewH = Math.max(wide / aspect, length + 2 * m);
  const viewW = viewH * aspect;
  const px = w / viewW;
  // On a whole pixel, so moving the section moves every edge and label by whole pixels.
  const x0 = Math.round(((start + end) / 2 - viewW / 2) * px) / px;
  return { from: start, to: end, first, last, length, x0, viewW, viewH };
}
