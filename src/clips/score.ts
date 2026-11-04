// A clip snapped to written note values, ready to notate. Only the player's notes are written;
// the backing and held chords become chord names above the staff.
//
// Beats come from the same tempo map as the MIDI export, so bars fall where the backing's did.
// Without a backing there is no beat to follow: the clip is read at CLIPS.looseBpm on a coarser
// grid, which only reads well if it was played near that tempo.
//
// Onsets snap to the coarsest grid that explains them: the beat if the note is near enough to it,
// else the half beat, else the sixteenth, never onto or before the note before. Played notes run
// late (the player, the browser, the audio), so the clip's typical lateness against the half-beat
// grid is taken off first; on a plain sixteenth grid a quarter note 100 ms late lands on the "e".
//
// Snapping alone reads badly: a quarter played a little short becomes a dotted eighth and a
// sixteenth rest. So within a staff, notes struck together become one chord, each chord lasts
// until the next one starts, and a gap of up to NOTATION.fillGap is closed up. Staves split at
// middle C; one is dropped if nothing lands on it.

import { chordName } from '../theory/chords.js';
import { detect } from '../theory/detect.js';
import { parseNoteName, pcOfSpelling, type Spelling } from '../theory/pitch.js';
import { MOODS, type SpelledKey, spellIn, spellKey } from '../theory/scales.js';
import { NOTATION } from '../tuning.js';
import type { Clip } from './file.js';
import { tempoMap, tickAt, TPQ } from './midifile.js';
import { realiseBacking } from './realise.js';

export type Clef = 'treble' | 'bass';

export interface ScoreNote {
  /** Beats from the first bar line. */
  start: number;
  beats: number;
  midi: number;
  spelling: Spelling;
}

export interface Score {
  title: string;
  bpm: number;
  /** Played without a backing, so the beat is assumed. */
  loose: boolean;
  /** Sharps (positive) or flats (negative) in the key signature. */
  fifths: number;
  meter: number;
  bars: number;
  staves: { clef: Clef; notes: ScoreNote[] }[];
  chords: { beat: number; name: string }[];
}

const METER = 4;

export function scoreOf(clip: Clip): Score | null {
  const states = clip.backing ?? [];
  const loose = states.length === 0;
  const segs = tempoMap(states);
  const grids = loose ? NOTATION.looseSnaps : NOTATION.snaps;
  const finest = TPQ * grids.at(-1)![0];
  const tick = (t: number) => tickAt(segs, t);
  const snap = (t: number) => Math.round(tick(t) / finest) * finest;
  const key = keyOf(clip);

  const raw = pairs(clip, 'piano');
  const onsets = snapOnsets(
    raw.map((n) => n.on),
    tick,
    grids,
  );
  const lag = onsets.lag * TPQ;
  const played = raw.map((n, i) => {
    const on = onsets.at[i]!;
    const off = Math.round((tick(n.off) - lag) / finest) * finest;
    return { midi: n.midi, on, off: Math.max(off, on + finest) };
  });
  const named = chordTicks(clip, key, snap);
  if (played.length === 0 && named.length === 0) return null;

  const bar = METER * TPQ;
  const firstTick = Math.min(...played.map((n) => n.on), ...named.map((c) => c.tick));
  const origin = Math.floor(firstTick / bar) * bar;
  const beat = (tick: number) => (tick - origin) / TPQ;

  const staves = (['treble', 'bass'] as const)
    .map((clef) => ({
      clef,
      notes: legato(
        played.filter((n) => n.midi >= 60 === (clef === 'treble')),
        NOTATION.fillGap * TPQ,
        bar,
      ).map((n) => ({
        start: beat(n.on),
        beats: (n.off - n.on) / TPQ,
        midi: n.midi,
        spelling: spellIn(n.midi % 12, key),
      })),
    }))
    .filter((s, i, all) => s.notes.length > 0 || (i === 0 && all[1]!.notes.length === 0));

  const end = Math.max(...staves.flatMap((s) => s.notes.map((n) => n.start + n.beats)), 1);
  const bars = Math.ceil(end / METER - 1e-6);
  const chords: Score['chords'] = [];
  for (const c of named) {
    const at = Math.max(0, beat(c.tick));
    if (at >= bars * METER) break;
    if (chords.at(-1)?.beat === at) chords.pop();
    if (chords.at(-1)?.name !== c.name) chords.push({ beat: at, name: c.name });
  }

  return {
    title: clip.where,
    // Not the first segment's: before a backing starts, the MIDI tempo is bent to meet it.
    bpm: Math.round(states.find((s) => s.playing)?.bpm ?? segs[0]!.bpm),
    loose,
    fifths: fifthsOf(key),
    meter: METER,
    bars,
    staves,
    chords,
  };
}

/**
 * Each onset's tick, snapped, and the lateness (in beats) taken off first. Onsets within
 * NOTATION.together seconds are one chord and snap together.
 */
function snapOnsets(
  times: number[],
  tick: (t: number) => number,
  grids: readonly (readonly [number, number])[],
): { at: number[]; lag: number } {
  const beats = times.map((t) => tick(t) / TPQ);
  const order = times.map((_, i) => i).sort((a, b) => times[a]! - times[b]!);
  const off = (b: number) => b - Math.round(b * 2) / 2;
  const lag = clamp(median(beats.map(off)), NOTATION.maxLag);
  const at: number[] = [];
  let prev = -Infinity;
  let prevTime = -Infinity;
  for (const i of order) {
    if (times[i]! - prevTime <= NOTATION.together) {
      at[i] = prev;
      continue;
    }
    prevTime = times[i]!;
    const b = beats[i]! - lag;
    let snapped: number | undefined;
    for (const [grid, reach] of grids) {
      const s = Math.round(b / grid) * grid;
      if (Math.abs(b - s) <= reach + 1e-9 && s > prev) {
        snapped = s;
        break;
      }
    }
    const step = grids.at(-1)![0];
    prev = snapped ?? Math.max(prev + step, Math.round(b / step) * step);
    at[i] = prev * TPQ;
  }
  return { at, lag };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)]! : (s[m - 1]! + s[m]!) / 2;
}

const clamp = (v: number, most: number) => Math.max(-most, Math.min(most, v));

interface Snapped {
  midi: number;
  on: number;
  off: number;
}

/**
 * Chords struck together share an end: the next chord's start, with gaps up to `fill` closed. The
 * last chord is held to its bar line on the same terms.
 */
function legato(notes: Snapped[], fill: number, bar: number): Snapped[] {
  const onsets = [...new Set(notes.map((n) => n.on))].sort((a, b) => a - b);
  return onsets.flatMap((on, i) => {
    const chord = notes.filter((n) => n.on === on);
    let off = Math.max(...chord.map((n) => n.off));
    const next = onsets[i + 1] ?? Math.ceil(off / bar) * bar;
    if (off > next || next - off <= fill) off = next;
    const midis = [...new Set(chord.map((n) => n.midi))];
    return midis.map((midi) => ({ midi, on, off }));
  });
}

/** One voice's notes as on and off times, in clip seconds. */
function pairs(clip: Clip, voice: 'piano' | 'pad'): { midi: number; on: number; off: number }[] {
  const open = new Map<number, number>();
  const out: { midi: number; on: number; off: number }[] = [];
  for (const e of clip.events) {
    if (e.voice !== voice) continue;
    const on = open.get(e.midi);
    if (on !== undefined) out.push({ midi: e.midi, on, off: e.t });
    if (e.on) open.set(e.midi, e.t);
    else open.delete(e.midi);
  }
  for (const [midi, on] of open) out.push({ midi, on, off: clip.duration });
  return out.sort((a, b) => a.on - b.on);
}

/** The backing's chord changes, or the held chords (Key mode) named from their notes. */
function chordTicks(clip: Clip, key: SpelledKey, snap: (t: number) => number) {
  if (clip.backing && clip.backing.length > 0) {
    return realiseBacking(clip.backing, clip.duration).chords.map((c) => ({
      tick: snap(c.t),
      name: c.name,
    }));
  }
  const held = pairs(clip, 'pad');
  const starts = [...new Set(held.map((n) => n.on))];
  return starts.flatMap((t) => {
    const heard = detect(
      held.filter((n) => Math.abs(n.on - t) < 0.03).map((n) => n.midi),
      key,
    );
    return heard.kind === 'chord' ? [{ tick: snap(t), name: chordName(heard.chord) }] : [];
  });
}

/** The backing's key if it had one; else the key the clip's name ends with; else C major. */
function keyOf(clip: Clip): SpelledKey {
  const s = clip.backing?.[0];
  if (s) return spellKey({ home: s.home, mood: s.mood });
  const m = /([A-G][♯♭]?) (\S+)$/.exec(clip.where);
  const home = m ? parseNoteName(m[1]!) : null;
  const mood = m ? MOODS.find((x) => x.name === m[2]) : undefined;
  if (home && mood) return spellKey({ home: pcOfSpelling(home), mood: mood.id });
  return spellKey({ home: 0, mood: 'major' });
}

export function fifthsOf(key: SpelledKey): number {
  return key.notes.reduce((n, s) => n + Math.sign(s.acc), 0);
}
