// A score laid out as notation: each staff's bars of events, every note cut into values a page
// can print and tied where it was cut, with beams and accidentals decided.
//
// Values follow the beat. A note is cut at the bar line, then into the longest value that may
// start where it is: anything under a beat stays inside its beat, anything off the beat is cut
// back to it, and a half may start on any beat. Eighths are beamed by the half bar when whole
// beats of them run on, anything shorter by the beat. Each staff has one voice, since the score
// has already made every chord end where the next begins.

import type { Spelling } from '../theory/pitch.js';
import type { Clef, Score } from './score.js';

export type ValueType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';
export type BeamKind = 'begin' | 'continue' | 'end' | 'forward hook' | 'backward hook';

export interface Head {
  midi: number;
  /** Diatonic steps from C0: the line or space the head sits on. */
  line: number;
  alter: number;
  /** The accidental printed before it, when the key and the bar so far don't already say so. */
  accidental?: number;
  tieStart: boolean;
  tieStop: boolean;
}

export interface Written {
  beat: number;
  beats: number;
  type: ValueType;
  dots: number;
  /** A whole-bar rest, centred in its bar. */
  whole?: boolean;
  /** Absent for a rest. */
  heads?: Head[];
  beams?: Record<number, BeamKind>;
}

export interface Staff {
  clef: Clef;
  bars: Written[][];
}

const EPS = 1e-6;

const VALUES: [beats: number, type: ValueType, dots: number][] = [
  [4, 'whole', 0],
  [3, 'half', 1],
  [2, 'half', 0],
  [1.5, 'quarter', 1],
  [1, 'quarter', 0],
  [0.75, 'eighth', 1],
  [0.5, 'eighth', 0],
  [0.375, '16th', 1],
  [0.25, '16th', 0],
  [0.125, '32nd', 0],
];

export function notate(score: Score): Staff[] {
  const { meter, bars } = score;
  return score.staves.map(({ clef, notes }) => {
    const pieces = notes.flatMap((n) => cut(n.start, n.beats, meter, bars, n.midi, n.spelling));
    const out: Written[][] = [];
    for (let bar = 0; bar < bars; bar++) {
      const chords: { beat: number; beats: number; heads: Head[] }[] = [];
      for (const p of pieces.filter((x) => x.bar === bar)) {
        const chord = chords.find((c) => near(c.beat, p.beat) && near(c.beats, p.beats));
        if (chord) chord.heads.push(p.head);
        else chords.push({ beat: p.beat, beats: p.beats, heads: [p.head] });
      }
      chords.sort((a, b) => a.beat - b.beat);
      for (const c of chords) c.heads.sort((a, b) => a.midi - b.midi);
      const events = eventsOf(chords, meter);
      beam(events);
      out.push(events);
    }
    accidentals(out, score.fifths);
    return { clef, bars: out };
  });
}

const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** A note cut at the bar lines, each piece tied to the next. */
function cut(start: number, beats: number, meter: number, bars: number, midi: number, s: Spelling) {
  const end = Math.min(start + beats, bars * meter);
  const octave = Math.floor((midi - s.acc) / 12) - 1;
  const out: { bar: number; beat: number; beats: number; head: Head }[] = [];
  for (let at = start; at < end - EPS;) {
    const bar = Math.floor(at / meter + EPS);
    const until = Math.min(end, (bar + 1) * meter);
    out.push({
      bar,
      beat: at - bar * meter,
      beats: until - at,
      head: {
        midi,
        line: octave * 7 + s.letter,
        alter: s.acc,
        tieStop: at > start + EPS,
        tieStart: until < end - EPS,
      },
    });
    at = until;
  }
  return out;
}

/** The coarsest grid a beat position sits on. */
const alignment = (at: number) =>
  [4, 2, 1, 0.5, 0.25, 0.125].find((u) => near(at / u, Math.round(at / u))) ?? 0.0625;

/** The longest value a note at `at` with `left` to run may be printed as before it is cut. */
function longest(at: number, left: number, meter: number) {
  for (const [beats, type, dots] of VALUES) {
    if (beats > left + EPS || at + beats > meter + EPS) continue;
    const base = dots ? beats / 1.5 : beats;
    const onBeat = near(at, Math.round(at));
    if (!(base <= alignment(at) + EPS || (beats === 2 && onBeat))) continue;
    if (beats < 1 && at + beats > Math.floor(at + EPS) + 1 + EPS) continue;
    // A dotted value inside a beat starts where twice its base would: a dotted sixteenth on the
    // half beat, never on the "e", which would leave a thirty-second to finish the beat.
    if (dots && beats < 1 && base * 2 > alignment(at) + EPS) continue;
    return { beats, type, dots };
  }
  // Finer than the grid allows; the score never produces this.
  return { beats: left, type: '32nd' as const, dots: 0 };
}

/** A span cut into printable values. */
export function values(beat: number, beats: number, meter: number) {
  const out: { beat: number; beats: number; type: ValueType; dots: number }[] = [];
  let at = beat;
  let left = beats;
  while (left > EPS) {
    const v = longest(at, left, meter);
    out.push({ beat: at, ...v });
    at += v.beats;
    left -= v.beats;
  }
  return out;
}

function eventsOf(chords: { beat: number; beats: number; heads: Head[] }[], meter: number) {
  const out: Written[] = [];
  const rest = (from: number, to: number) => {
    if (to - from < EPS) return;
    if (near(from, 0) && near(to, meter)) {
      out.push({ beat: 0, beats: meter, type: 'whole', dots: 0, whole: true });
      return;
    }
    out.push(...values(from, to - from, meter));
  };
  let at = 0;
  for (const chord of chords) {
    rest(at, chord.beat);
    const pieces = values(chord.beat, chord.beats, meter);
    pieces.forEach((v, i) => {
      out.push({
        ...v,
        heads: chord.heads.map((h) => ({
          ...h,
          tieStop: i > 0 || h.tieStop,
          tieStart: i < pieces.length - 1 || h.tieStart,
        })),
      });
    });
    at = chord.beat + chord.beats;
  }
  rest(at, meter);
  return out;
}

const LEVEL: Partial<Record<ValueType, number>> = { eighth: 1, '16th': 2, '32nd': 3 };

function beam(events: Written[]): void {
  type Group = { beat: number; span: number; events: Written[] };
  const groups: Group[] = [];
  let group: Group | null = null;
  for (const e of events) {
    const short = e.heads !== undefined && e.beats < 1 - EPS;
    const beat = Math.floor(e.beat + EPS);
    if (short && group && beat === group.beat) group.events.push(e);
    else if (short) groups.push((group = { beat, span: 1, events: [e] }));
    else group = null;
  }
  const eighths = (g: Group) => g.events.every((e) => e.type === 'eighth' && !e.dots);
  const full = (g: Group) => g.events.reduce((sum, e) => sum + e.beats, 0) > 1 - EPS;
  const merged: Group[] = [];
  for (const g of groups) {
    const last = merged.at(-1);
    const joins =
      last &&
      g.beat === last.beat + last.span &&
      Math.floor(last.beat / 2) === Math.floor(g.beat / 2) &&
      eighths(last) &&
      eighths(g) &&
      full(last) &&
      full(g);
    if (joins) {
      last.events.push(...g.events);
      last.span++;
    } else merged.push({ ...g });
  }
  const level = (e: Written | undefined) => (e ? (LEVEL[e.type] ?? 0) : 0);
  for (const { events: run } of merged.filter((g) => g.events.length > 1)) {
    run.forEach((e, i) => {
      const beams: Record<number, BeamKind> = {};
      for (let n = 1; n <= level(e); n++) {
        const before = level(run[i - 1]) >= n;
        const after = level(run[i + 1]) >= n;
        if (n === 1) beams[n] = i === 0 ? 'begin' : i === run.length - 1 ? 'end' : 'continue';
        else if (before && after) beams[n] = 'continue';
        else if (before) beams[n] = 'end';
        else if (after) beams[n] = 'begin';
        else beams[n] = i === 0 ? 'forward hook' : 'backward hook';
      }
      e.beams = beams;
    });
  }
}

/** The order sharps join a key signature, as letters (C = 0); flats join in reverse. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];

/**
 * Which accidental each head shows, by the bar's running alteration on that line. A note tied in
 * from the last bar keeps its accidental without showing it, so the next note on its line in this
 * bar shows its own whenever they differ, or when it repeats the tied one's.
 */
function accidentals(bars: Written[][], fifths: number): void {
  const key = Array<number>(7).fill(0);
  const order = fifths >= 0 ? SHARP_ORDER : [...SHARP_ORDER].reverse();
  for (let i = 0; i < Math.abs(fifths); i++) key[order[i]!] = Math.sign(fifths);
  for (const bar of bars) {
    const held = new Map<number, number>();
    const tied = new Map<number, number>();
    for (const e of bar) {
      for (const h of e.heads ?? []) {
        if (h.tieStop) {
          if (!held.has(h.line)) tied.set(h.line, h.alter);
          continue;
        }
        const natural = key[((h.line % 7) + 7) % 7]!;
        const was = held.get(h.line) ?? natural;
        const after = held.has(h.line) ? undefined : tied.get(h.line);
        const restate = after !== undefined && (after !== natural || h.alter !== natural);
        if (h.alter !== was || restate) h.accidental = h.alter;
        held.set(h.line, h.alter);
      }
    }
  }
}
