// A notated score drawn onto A4 pages as a list of plain drawing operations, which pdf.ts writes
// out. Drawn rather than typeset: a PDF can't count on a music font, so clefs, rests, flags and
// accidentals are paths in staff spaces, and only numbers and names are text.
//
// Each onset in a bar gets a column as wide as the root of the shortest value starting there,
// shared by both staves so a chord's hands line up. Bars fill systems greedily and are stretched
// to the margin. Each system is drawn at the origin first and measured, so ledger lines, stems and
// chord names get the room they take, then systems are dealt onto pages.

import { NOTATION } from '../tuning.js';
import { type Head, type Staff, type ValueType, type Written } from './notate.js';
import type { Clef, Score } from './score.js';

export type Cmd =
  ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export type Op =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number }
  | { k: 'path'; cmds: Cmd[]; w: number; fill: boolean }
  | {
      k: 'ellipse';
      x: number;
      y: number;
      rx: number;
      ry: number;
      rot: number;
      w: number;
      fill: boolean;
    }
  | { k: 'text'; x: number; y: number; text: string; size: number; bold: boolean; anchor: Anchor };

export type Anchor = 'start' | 'middle' | 'end';

export interface Sheet {
  title: string;
  width: number;
  height: number;
  pages: Op[][];
}

const S = NOTATION.space;
/** Stroke widths below are written as they look at a 9-unit staff space. */
const px = (n: number) => (n * S) / 9;
const [PAGE_W, PAGE_H] = NOTATION.page;
const M = NOTATION.margin;
const WIDTH = PAGE_W - 2 * M;
/** From the top line of the treble staff to the top line of the bass. */
const GRAND = 10 * S;
/** The bottom line's diatonic step, by clef: E4 and G2. */
const BOTTOM: Record<Clef, number> = { treble: 30, bass: 18 };
/** Key signature positions, as diatonic steps, in the order they're added. */
const KEY_SHARPS: Record<Clef, number[]> = {
  treble: [38, 35, 39, 36, 33, 37, 34],
  bass: [24, 21, 25, 22, 19, 23, 20],
};
const KEY_FLATS: Record<Clef, number[]> = {
  treble: [34, 37, 33, 36, 32, 35, 31],
  bass: [20, 23, 19, 22, 18, 21, 17],
};

const TREBLE = parse(
  'M0.15 2.3C-0.5 2.4-0.6 1.7-0.1 1.6M0.15 2.3L-0.1-3.5C0.9-4.2 0.8-2.6-0.5-1.4' +
    'C-1.2-0.7-1 0.9 0.1 1C1.1 1 1.1-0.6 0.1-0.6C-0.5-0.6-0.5 0.3 0.1 0.3',
);
const BASS = parse('M-0.55 0C-0.55-0.9 0.9-1.2 1-0.1C1.1 1 0 1.9-0.9 2.5');
const QUARTER_REST = parse('M-0.3-1.5L0.35-0.75L-0.15-0.1L0.4 0.6C-0.3 0.3-0.4 0.9 0 1.3');
const SHARP = parse('M-0.25-1.2L-0.25 1.4M0.25-1.4L0.25 1.2');
const SHARP_BARS = parse('M-0.5-0.25L0.5-0.6M-0.5 0.6L0.5 0.25');
const NATURAL = parse('M-0.25-1.3L-0.25 0.6M0.25-0.6L0.25 1.3');
const NATURAL_BARS = parse('M-0.25-0.2L0.25-0.35M-0.25 0.35L0.25 0.2');
const FLAT = parse('M-0.25-1.8L-0.25 0.5C0.6-0.1 0.4-0.7-0.25-0.2');

const TAILS: Partial<Record<ValueType, number>> = { eighth: 1, '16th': 2, '32nd': 3 };

/** An SVG-style path of absolute M, L, C and Z commands. */
function parse(d: string): Cmd[] {
  const out: Cmd[] = [];
  for (const [, op, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const n = (args!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (op === 'Z') out.push(['Z']);
    else if (op === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) out.push(['C', ...(n.slice(i, i + 6) as Six)]);
    } else for (let i = 0; i + 1 < n.length; i += 2) out.push([op as 'M' | 'L', n[i]!, n[i + 1]!]);
  }
  return out;
}
type Six = [number, number, number, number, number, number];

/** Scales a path by `s` and moves it to (x, y). */
function place(cmds: Cmd[], x: number, y: number, s: number): Cmd[] {
  return cmds.map((c) => {
    if (c[0] === 'Z') return c;
    const [op, ...n] = c;
    const moved = n.map((v, i) => (i % 2 === 0 ? x + v * s : y + v * s));
    return [op, ...moved] as Cmd;
  });
}

class Pen {
  readonly ops: Op[] = [];
  line(x1: number, y1: number, x2: number, y2: number, w: number): void {
    this.ops.push({ k: 'line', x1, y1, x2, y2, w });
  }
  path(cmds: Cmd[], w: number, fill = false): void {
    this.ops.push({ k: 'path', cmds, w, fill });
  }
  /** A path in staff spaces about (x, y). */
  shape(x: number, y: number, cmds: Cmd[], w: number): void {
    this.path(place(cmds, x, y, S), w);
  }
  dot(x: number, y: number, r: number): void {
    this.ops.push({ k: 'ellipse', x, y, rx: r, ry: r, rot: 0, w: 0, fill: true });
  }
  text(x: number, y: number, text: string, size: number, bold = false, anchor: Anchor = 'start') {
    this.ops.push({ k: 'text', x, y, text, size, bold, anchor });
  }
}

export function engrave(score: Score, staves: Staff[]): Sheet {
  const systems = layout(score, staves);
  const pages: Op[][] = [[]];
  const header = new Pen();
  header.text(PAGE_W / 2, M + 8, score.title, 16, true, 'middle');
  let y = M + 30;
  header.ops.push({
    k: 'ellipse',
    x: M + 2,
    y,
    rx: 0.62 * S,
    ry: 0.42 * S,
    rot: -20,
    w: 0.5,
    fill: true,
  });
  header.line(M + 2 + 0.58 * S, y, M + 2 + 0.58 * S, y - 3 * S, px(1.1));
  header.text(M + 2 + 1.6 * S, y + 3, `= ${score.bpm}`, 10);
  if (score.loose) {
    header.text(
      PAGE_W - M,
      y + 3,
      'Played without a backing: the beat is assumed.',
      8,
      false,
      'end',
    );
  }
  pages[0]!.push(...header.ops);
  y += 2.5 * S;

  for (const system of systems) {
    const { top, bottom } = extent(system);
    if (y + bottom - top > PAGE_H - M && pages.at(-1)!.length > 0 && y > M) {
      pages.push([]);
      y = M;
    }
    pages.at(-1)!.push(...shift(system, y - top));
    y += bottom - top + 2.5 * S;
  }
  if (pages.length > 1) {
    pages.forEach((page, i) => {
      page.push({
        k: 'text',
        x: PAGE_W / 2,
        y: PAGE_H - M / 2,
        text: `${i + 1} / ${pages.length}`,
        size: 8,
        bold: false,
        anchor: 'middle',
      });
    });
  }
  return { title: score.title, width: PAGE_W, height: PAGE_H, pages };
}

/** The highest and lowest y any operation reaches. */
function extent(ops: Op[]): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  const see = (y: number) => {
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  };
  for (const op of ops) {
    if (op.k === 'line') [op.y1, op.y2].forEach(see);
    else if (op.k === 'ellipse') [op.y - op.rx, op.y + op.rx].forEach(see);
    else if (op.k === 'text') [op.y - op.size * 0.75, op.y + op.size * 0.2].forEach(see);
    else for (const c of op.cmds) for (let i = 2; i < c.length; i += 2) see(c[i] as number);
  }
  return { top, bottom };
}

function shift(ops: Op[], dy: number): Op[] {
  return ops.map((op) => {
    if (op.k === 'line') return { ...op, y1: op.y1 + dy, y2: op.y2 + dy };
    if (op.k === 'path') return { ...op, cmds: place(op.cmds, 0, dy, 1) };
    return { ...op, y: op.y + dy };
  });
}

/** Where each onset's heads go, from the bar's left edge, and how wide the bar is. */
function columns(staves: Staff[], index: number) {
  const events = staves.flatMap((st) => st.bars[index]!).filter((e) => !e.whole);
  const onsets = [...new Set(events.map((e) => e.beat))].sort((a, b) => a - b);
  const at = new Map<number, number>();
  let x = 1.2 * S;
  for (const onset of onsets) {
    const here = events.filter((e) => e.beat === onset);
    const shortest = Math.min(...here.map((e) => e.beats));
    if (here.some((e) => e.heads?.some((h) => h.accidental !== undefined))) x += 1.4 * S;
    at.set(onset, x + 0.8 * S);
    x += S * (1.9 + 2.6 * Math.sqrt(shortest)) + (here.some((e) => e.dots) ? 0.6 * S : 0);
  }
  return { at, width: Math.max(x + 0.6 * S, 7 * S) };
}

interface Placed {
  system: number;
  staff: number;
  midi: number;
  x: number;
  y: number;
  up: boolean;
  from: number;
  to: number;
  head: Head;
}

/** Every system drawn with its top staff's top line at y = 0. */
function layout(score: Score, staves: Staff[]): Op[][] {
  const keyW = Math.abs(score.fifths) * S + (score.fifths ? 0.6 * S : 0);
  const keyX = 3.6 * S;
  const timeX = keyX + keyW + 1.2 * S;
  const opening = timeX + 2.4 * S;
  const later = keyX + keyW + 0.8 * S;
  const bars = staves[0]!.bars.map((_, i) => columns(staves, i));
  const height = (staves.length - 1) * GRAND + 4 * S;

  const runs: number[][] = [];
  let current: number[] = [];
  let used = opening;
  bars.forEach((bar, i) => {
    if (current.length > 0 && used + bar.width > WIDTH) {
      runs.push(current);
      current = [];
      used = later;
    }
    current.push(i);
    used += bar.width;
  });
  runs.push(current);

  const placed: Placed[] = [];
  const rights: number[] = [];
  const pens = runs.map((run, s) => {
    const pen = new Pen();
    const prefix = s === 0 ? opening : later;
    const natural = run.reduce((sum, i) => sum + bars[i]!.width, 0);
    const lastRun = s === runs.length - 1;
    const stretch = lastRun && prefix + natural < WIDTH * 0.75 ? 1 : (WIDTH - prefix) / natural;
    const right = M + prefix + natural * stretch;
    rights.push(right);

    staves.forEach((staff, k) => {
      const top = k * GRAND;
      for (let l = 0; l < 5; l++) pen.line(M, top + l * S, right, top + l * S, px(0.8));
      clef(pen, staff.clef, top);
      keySignature(pen, staff.clef, score.fifths, M + keyX, top);
      if (s === 0) {
        pen.text(M + timeX, top + 1.9 * S, String(score.meter), 2.2 * S, true, 'middle');
        pen.text(M + timeX, top + 3.9 * S, '4', 2.2 * S, true, 'middle');
      }
    });
    pen.line(M, 0, M, height, px(1));
    if (staves.length > 1) brace(pen, height);

    let x = M + prefix;
    const chordAt: { x: number; name: string }[] = [];
    for (const index of run) {
      const { at, width } = bars[index]!;
      const w = width * stretch;
      const left = x;
      const columnX = (beat: number) => left + at.get(beat)! * stretch;
      staves.forEach((staff, k) => {
        const mid = k * GRAND + 2 * S;
        drawVoice(pen, staff.bars[index]!, {
          columnX,
          mid,
          bottom: BOTTOM[staff.clef],
          center: left + w / 2,
          place: (head, hx, hy, up, e) =>
            placed.push({
              system: s,
              staff: k,
              midi: head.midi,
              x: hx,
              y: hy,
              up,
              from: index * score.meter + e.beat,
              to: index * score.meter + e.beat + e.beats,
              head,
            }),
        });
      });
      for (const c of score.chords) {
        const beat = c.beat - index * score.meter;
        if (beat < 0 || beat >= score.meter) continue;
        chordAt.push({ x: beatX(at, beat, score.meter, width) * stretch + left, name: c.name });
      }
      x += w;
      const final = index === score.bars - 1;
      pen.line(x - (final ? px(1.5) : 0), 0, x - (final ? px(1.5) : 0), height, px(final ? 3 : 1));
      if (final) pen.line(x - px(6), 0, x - px(6), height, px(1));
    }

    // Chord names and the bar number ride above whatever the top staff reaches.
    const { top } = extent(pen.ops);
    const row = Math.min(-2.4 * S, top - 1 * S);
    for (const c of chordAt) pen.text(c.x - 0.6 * S, row, c.name, 1.9 * S, true);
    pen.text(M, Math.min(-1.4 * S, row), String(run[0]! + 1), 1.4 * S);
    return pen;
  });

  ties(pens, placed, rights);
  return pens.map((p) => p.ops);
}

/** A chord change's x in a bar: at its onset's column, or between the columns either side. */
function beatX(at: Map<number, number>, beat: number, meter: number, width: number): number {
  const known = [...at].sort((a, b) => a[0] - b[0]);
  const exact = at.get(beat);
  if (exact !== undefined) return exact;
  const before = known.filter(([b]) => b < beat).at(-1) ?? [0, 1.2 * S];
  const after = known.find(([b]) => b > beat) ?? [meter, width];
  return before[1] + ((beat - before[0]) / (after[0] - before[0])) * (after[1] - before[1]);
}

function clef(pen: Pen, which: Clef, top: number): void {
  if (which === 'treble') {
    pen.shape(M + 1.6 * S, top + 3 * S, TREBLE, 0.18 * S);
    return;
  }
  pen.shape(M + 1.4 * S, top + S, BASS, 0.24 * S);
  pen.dot(M + 0.85 * S, top + S, 0.32 * S);
  for (const d of [0.5, 1.5]) pen.dot(M + 2.9 * S, top + d * S, 0.15 * S);
}

function keySignature(pen: Pen, which: Clef, fifths: number, x: number, top: number): void {
  const lines = (fifths > 0 ? KEY_SHARPS : KEY_FLATS)[which];
  for (let i = 0; i < Math.abs(fifths); i++) {
    const y = top + 4 * S - (lines[i]! - BOTTOM[which]) * (S / 2);
    accidental(pen, x + (i + 0.5) * S, y, Math.sign(fifths));
  }
}

function brace(pen: Pen, h: number): void {
  const a = M - px(4);
  const b = M - px(12);
  pen.path(
    [
      ['M', a, 0],
      ['C', b, h / 4, a, h / 2 - px(6), b, h / 2],
      ['C', a, h / 2 + px(6), b, (3 * h) / 4, a, h],
    ],
    px(2),
  );
}

function accidental(pen: Pen, x: number, y: number, alter: number): void {
  if (alter > 0) {
    pen.shape(x, y, SHARP, px(1.1));
    pen.shape(x, y, SHARP_BARS, 0.32 * S);
  } else if (alter < 0) pen.shape(x, y, FLAT, px(1.2));
  else {
    pen.shape(x, y, NATURAL, px(1.1));
    pen.shape(x, y, NATURAL_BARS, 0.3 * S);
  }
}

function noteHead(pen: Pen, x: number, y: number, type: ValueType): void {
  if (type === 'whole') {
    pen.ops.push({
      k: 'ellipse',
      x,
      y,
      rx: 0.75 * S,
      ry: 0.48 * S,
      rot: 0,
      w: 0.22 * S,
      fill: false,
    });
    return;
  }
  const hollow = type === 'half';
  pen.ops.push({
    k: 'ellipse',
    x,
    y,
    rx: 0.62 * S,
    ry: 0.42 * S,
    rot: -20,
    w: hollow ? 0.16 * S : 0,
    fill: !hollow,
  });
}

function rest(pen: Pen, x: number, mid: number, e: Written): void {
  const box = (y: number) =>
    pen.path(
      [
        ['M', x - 0.6 * S, y],
        ['L', x + 0.6 * S, y],
        ['L', x + 0.6 * S, y + 0.5 * S],
        ['L', x - 0.6 * S, y + 0.5 * S],
        ['Z'],
      ],
      0,
      true,
    );
  if (e.type === 'whole') box(mid - S);
  else if (e.type === 'half') box(mid - 0.5 * S);
  else if (e.type === 'quarter') pen.shape(x, mid, QUARTER_REST, 0.28 * S);
  else {
    const tails = TAILS[e.type] ?? 1;
    for (let i = 0; i < tails; i++) {
      const dy = i * 0.9;
      pen.shape(
        x,
        mid,
        parse(`M-0.35 ${-0.6 + dy}C-0.1 ${-0.2 + dy} 0.3 ${-0.3 + dy} 0.45 ${-0.8 + dy}`),
        0.2 * S,
      );
      pen.dot(x - 0.35 * S, mid + (-0.75 + dy) * S, 0.2 * S);
    }
    pen.shape(
      x,
      mid,
      parse(`M0.45 -0.8L${-0.2 - (tails - 1) * 0.25} ${1 + (tails - 1) * 0.9}`),
      0.16 * S,
    );
  }
  if (e.dots) pen.dot(x + 0.9 * S, mid - 0.5 * S, 0.17 * S);
}

/** The stem direction a set of notes takes on its own: away from the middle line. */
const away = (positions: number[]) => positions.reduce((a, b) => a + b, 0) / positions.length < 4;

interface VoiceContext {
  columnX(beat: number): number;
  mid: number;
  bottom: number;
  center: number;
  place(head: Head, x: number, y: number, up: boolean, e: Written): void;
}

interface Stem {
  sx: number;
  near: number;
  far: number;
  up: boolean;
}

function drawVoice(pen: Pen, events: Written[], ctx: VoiceContext): void {
  const { columnX, mid, bottom } = ctx;
  const yOf = (pos: number) => mid - (pos - 4) * (S / 2);
  const posOf = (h: Head) => h.line - bottom;

  // A beam group takes one stem direction for all its notes.
  const groups: Written[][] = [];
  for (const e of events) {
    if (e.beams?.[1] === 'begin') groups.push([e]);
    else if (e.beams?.[1]) groups.at(-1)?.push(e);
  }
  const direction = new Map<Written, boolean>();
  for (const g of groups) {
    const up = away(g.flatMap((e) => e.heads!.map(posOf)));
    for (const e of g) direction.set(e, up);
  }

  const stems = new Map<Written, Stem>();
  for (const e of events) {
    if (!e.heads) {
      rest(pen, e.whole ? ctx.center : columnX(e.beat), mid, e);
      continue;
    }
    const x = columnX(e.beat);
    const positions = e.heads.map(posOf);
    const up = direction.get(e) ?? away(positions);
    const lo = Math.min(...positions);
    const hi = Math.max(...positions);
    for (let p = -2; p >= lo; p -= 2) pen.line(x - 1.1 * S, yOf(p), x + 1.1 * S, yOf(p), px(1));
    for (let p = 10; p <= hi; p += 2) pen.line(x - 1.1 * S, yOf(p), x + 1.1 * S, yOf(p), px(1));

    // A second in a chord puts one head on the other side of the stem.
    const sorted = [...e.heads].sort((a, b) => (up ? a.line - b.line : b.line - a.line));
    let previous: number | null = null;
    let offset = 0;
    let stagger = 0;
    for (const h of sorted) {
      const p = posOf(h);
      const moved = previous !== null && Math.abs(p - previous) === 1 && offset === 0;
      offset = moved ? (up ? 1.25 : -1.25) * S : 0;
      previous = p;
      const hx = x + offset;
      noteHead(pen, hx, yOf(p), e.type);
      if (h.accidental !== undefined) {
        accidental(pen, x - 1.6 * S - stagger * S, yOf(p), h.accidental);
        stagger = stagger ? 0 : 1;
      }
      if (e.dots) pen.dot(x + 1.3 * S, yOf(p) + (p % 2 === 0 ? -0.5 * S : 0), 0.17 * S);
      ctx.place(h, hx, yOf(p), up, e);
    }
    if (e.type === 'whole') continue;

    const sx = up ? x + 0.58 * S : x - 0.58 * S;
    const near = yOf(up ? lo : hi);
    const far = yOf(up ? hi : lo);
    stems.set(e, { sx, near, far, up });
    if (e.beams) continue;
    const end = up ? Math.min(far - 3.5 * S, mid) : Math.max(far + 3.5 * S, mid);
    pen.line(sx, near, sx, end, px(1.1));
    for (let t = 0; t < (TAILS[e.type] ?? 0); t++) {
      const fy = end + (up ? t : -t) * 0.8 * S;
      const d = up ? 1 : -1;
      pen.path(
        [
          ['M', sx, fy],
          [
            'C',
            sx + 0.2 * S,
            fy + d * S,
            sx + 1.3 * S,
            fy + d * 1.2 * S,
            sx + 0.8 * S,
            fy + d * 2.6 * S,
          ],
        ],
        0.2 * S,
      );
    }
  }
  for (const g of groups) beam(pen, g, stems, mid);
}

/** A beam group's stems and beams: one sloped line, every stem run to it. */
function beam(pen: Pen, group: Written[], stems: Map<Written, Stem>, mid: number): void {
  const st = group.map((e) => stems.get(e)!);
  const first = st[0]!;
  const last = st.at(-1)!;
  const d = first.up ? -1 : 1;
  const run = last.sx - first.sx || 1;
  const slope = Math.max(-S / run, Math.min(S / run, (last.far - first.far) / run));
  const reach = (s: Stem) => s.far + d * 3.3 * S - slope * (s.sx - first.sx);
  let base = first.up ? Math.min(...st.map(reach)) : Math.max(...st.map(reach));
  if (first.up ? base > mid : base < mid) base = mid;
  const yAt = (x: number) => base + slope * (x - first.sx);
  for (const s of st) pen.line(s.sx, s.near, s.sx, yAt(s.sx), px(1.1));

  const levels = Math.max(...group.map((e) => Object.keys(e.beams!).length));
  for (let level = 1; level <= levels; level++) {
    const off = -d * (level - 1) * 0.8 * S;
    const t = 0.45 * S;
    const bar = (x1: number, x2: number) =>
      pen.path(
        [
          ['M', x1, yAt(x1) + off],
          ['L', x2, yAt(x2) + off],
          ['L', x2, yAt(x2) + off - d * t],
          ['L', x1, yAt(x1) + off - d * t],
          ['Z'],
        ],
        0,
        true,
      );
    group.forEach((e, i) => {
      const kind = e.beams![level];
      const x = st[i]!.sx;
      if (kind === 'begin' || kind === 'continue') {
        if (group[i + 1]?.beams?.[level]) bar(x, st[i + 1]!.sx);
      } else if (kind === 'forward hook') bar(x, x + 1.1 * S);
      else if (kind === 'backward hook') bar(x - 1.1 * S, x);
    });
  }
}

/** An arc from each tied head to the head it holds into; across a system break, in two halves. */
function ties(pens: Pen[], placed: Placed[], rights: number[]): void {
  const arc = (pen: Pen, x1: number, x2: number, y: number, up: boolean) => {
    const d = up ? 1 : -1;
    const lift = Math.min(1.4 * S, 0.35 * S + (x2 - x1) * 0.06);
    const y0 = y + d * 0.6 * S;
    const y1 = y0 + d * lift;
    pen.path(
      [
        ['M', x1, y0],
        ['C', x1 + (x2 - x1) * 0.25, y1, x2 - (x2 - x1) * 0.25, y1, x2, y0],
      ],
      px(1.2),
    );
  };
  for (const p of placed.filter((n) => n.head.tieStart)) {
    const q = placed.find(
      (n) =>
        n.head.tieStop &&
        n.staff === p.staff &&
        n.midi === p.midi &&
        Math.abs(n.from - p.to) < 1e-6,
    );
    if (!q) continue;
    if (q.system === p.system) arc(pens[p.system]!, p.x + 0.4 * S, q.x - 0.4 * S, p.y, p.up);
    else {
      arc(pens[p.system]!, p.x + 0.4 * S, rights[p.system]! - 0.5 * S, p.y, p.up);
      arc(pens[q.system]!, q.x - 3 * S, q.x - 0.4 * S, q.y, q.up);
    }
  }
}
