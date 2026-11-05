// Turns the detector's readings into notes: when one starts, which it is, and when it stops.
//
// A pluck is an onset, the level jumping well above where it just was. A note starts at an onset
// (or at the level rising through the gate) once the pitch holds on one semitone for a few frames,
// and it is dated to the onset rather than to the moment it was sure. It ends when the level falls
// back through the gate or drops fast (a damped string); when the pitch settles on another semitone
// with no new onset (a hammer-on, pull-off or slide); or at a new onset, whether that settles on a
// note or not (a strum isn't one).
//
// Readings below the clarity floor carry no pitch: a chord, a muted string, noise. A note needs the
// pitch to move most of a semitone before it changes, so a string a little out of tune, or a
// vibrato, doesn't flicker between two.
//
// What a real guitar does that synthesised plucks didn't, each of which made notes never played:
// - A pitch frame reaching back before a pluck still holds the note it replaced, so a new note
//   was first confirmed as the old one. Only frames wholly after the pluck count towards it.
// - The detector slips an octave or two, mostly in an attack or a dying tail. No hand moves an
//   octave without a pluck (a slide passes the notes between), so a reading an exact octave or
//   two from the note is the same note; and a new note's octave is the one most frames agree on.
// - Lifting a finger leaves the open string ringing, or plucks it a little, and other strings ring
//   in sympathy. So a fast drop in level ends the note (whatever rings on isn't a slide into a new
//   one); a move without a pluck must read clearly and stay within a hand's reach, since a string
//   ringing in sympathy is usually far below the note; and a pluck far quieter than what was just
//   playing doesn't start a note. Measuring a move against the note's peak instead lost real
//   hammer-ons late in a long note.

import { LISTEN } from '../tuning.js';

export interface Reading {
  /** Audio-clock seconds. */
  t: number;
  /** When the oldest sample in the pitch frame was played. */
  since: number;
  /** RMS level in dBFS. */
  level: number;
  /** In MIDI notes with a fraction, or null if the frame wasn't analysed. */
  pitch: number | null;
  clarity: number;
}

export type Heard =
  | { kind: 'on'; midi: number; velocity: number; t: number }
  | { kind: 'off'; midi: number; t: number }
  | { kind: 'hit'; t: number; level: number };

export interface TrackerConfig {
  /** The lowest and highest notes the guitar can play. */
  lo: number;
  hi: number;
  /** RMS dBFS above which something is playing. */
  gateDb: number;
  /** RMS dBFS of a hard pluck: velocity 1. */
  loudDb: number;
}

interface Pending {
  t: number;
  peak: number;
  /** The loudest level in the moments before: a pluck far under it is a stray. */
  before: number;
  frames: number;
  /** Notes read in a row since the pluck, all of one pitch class. */
  run: number[];
  /** Whether a pluck started it, so giving up ends the note it interrupted. */
  hit: boolean;
}

interface Level {
  t: number;
  level: number;
}

const pcOf = (midi: number): number => ((midi % 12) + 12) % 12;

/** Whether a reading is the note slipped an exact octave or two. */
const slipped = (pitch: number, note: number): boolean => {
  const away = Math.round(Math.abs(pitch - note));
  return away === 12 || away === 24;
};

/** The note read most often; a tie goes to the latest. */
function commonest(run: readonly number[]): number {
  let best = run[run.length - 1]!;
  let most = 0;
  for (const m of [...run].reverse()) {
    const n = run.filter((x) => x === m).length;
    if (n > most) {
      best = m;
      most = n;
    }
  }
  return best;
}

const loudest = (levels: readonly Level[]): Level | undefined =>
  levels.reduce<Level | undefined>((a, b) => (!a || b.level > a.level ? b : a), undefined);

export class Tracker {
  private note: number | null = null;
  private started = 0;
  private pending: Pending | null = null;
  private moved: { midi: number; t: number; frames: number } | null = null;
  private quietSince: number | null = null;
  private quietFrames = 0;
  private readonly recent: number[] = [];
  /** Levels over the last LISTEN.strayWindow seconds. */
  private window: Level[] = [];
  /** The sounding note's levels over the last LISTEN.dampFrames readings. */
  private damping: Level[] = [];
  private lastHit = -Infinity;
  private lastLevel = -Infinity;

  constructor(public config: TrackerConfig) {}

  get sounding(): number | null {
    return this.note;
  }

  push(r: Reading): Heard[] {
    const out: Heard[] = [];
    const c = this.config;
    const before = this.recent.length > 0 ? Math.min(...this.recent) : -Infinity;
    this.recent.push(r.level);
    if (this.recent.length > LISTEN.onsetFrames) this.recent.shift();
    const louder = loudest(this.window)?.level ?? -Infinity;
    this.window = this.window.filter((x) => r.t - x.t < LISTEN.strayWindow);
    this.window.push({ t: r.t, level: r.level });

    const loudEnough = r.level > c.gateDb;
    if (loudEnough && r.level - before > LISTEN.onsetDb && r.t - this.lastHit > LISTEN.refractory) {
      this.lastHit = r.t;
      out.push({ kind: 'hit', t: r.t, level: r.level });
      this.pending = { t: r.t, peak: r.level, before: louder, frames: 0, run: [], hit: true };
    } else if (!this.pending && this.note === null && loudEnough && this.lastLevel <= c.gateDb) {
      this.pending = { t: r.t, peak: r.level, before: louder, frames: 0, run: [], hit: false };
    }
    this.lastLevel = r.level;

    const pitch = this.pitchOf(r);
    if (this.pending) this.settle(this.pending, r, pitch, out);
    else if (this.note !== null) this.follow(this.note, r, pitch, out);
    return out;
  }

  /** Ends the sounding note, as when the input closes. */
  flush(t: number): Heard[] {
    const out: Heard[] = [];
    if (this.note !== null) this.end(t, out);
    this.pending = null;
    return out;
  }

  private pitchOf(r: Reading): number | null {
    const { lo, hi } = this.config;
    if (r.pitch === null || r.clarity < LISTEN.clarity) return null;
    return r.pitch >= lo - 0.5 && r.pitch <= hi + 0.5 ? r.pitch : null;
  }

  private settle(p: Pending, r: Reading, pitch: number | null, out: Heard[]): void {
    p.frames++;
    p.peak = Math.max(p.peak, r.level);
    if (pitch !== null && r.since >= p.t) {
      const m = Math.round(pitch);
      if (p.run.length > 0 && pcOf(p.run[0]!) !== pcOf(m)) p.run = [];
      p.run.push(m);
      // Readings that disagree on the octave are a mixture settling (a soft pluck over a string
      // still ringing): wait for more of them before choosing.
      const needed = new Set(p.run).size > 1 ? LISTEN.confirmFrames * 2 : LISTEN.confirmFrames;
      if (p.run.length >= needed) {
        this.pending = null;
        // A stray: a lifted finger's open string, a brushed one. What was sounding carries on.
        if (p.peak < p.before - LISTEN.strayDb) return;
        if (this.note !== null) this.end(p.t, out);
        this.start(commonest(p.run), p.peak, p.t, out);
        return;
      }
    }
    if (p.frames < LISTEN.pendingFrames && r.level > this.config.gateDb - LISTEN.gateHysteresis) {
      return;
    }
    this.pending = null;
    const stray = p.peak < p.before - LISTEN.strayDb;
    if (p.hit && !stray && this.note !== null) this.end(p.t, out);
  }

  private follow(note: number, r: Reading, pitch: number | null, out: Heard[]): void {
    if (r.level < this.config.gateDb - LISTEN.gateHysteresis) {
      this.quietSince ??= r.t;
      if (++this.quietFrames >= LISTEN.releaseFrames) this.end(this.quietSince, out);
      return;
    }
    this.quietSince = null;
    this.quietFrames = 0;

    // Damped: the level fell fast, past the pluck's own first fading.
    this.damping.push({ t: r.t, level: r.level });
    if (this.damping.length > LISTEN.dampFrames) this.damping.shift();
    const top = loudest(this.damping)!;
    if (r.t - this.started > LISTEN.dampAfter && top.level - r.level > LISTEN.dampDb) {
      this.end(top.t, out);
      return;
    }

    if (pitch === null) return;
    if (Math.abs(pitch - note) <= LISTEN.moveBy || slipped(pitch, note)) {
      this.moved = null;
      return;
    }
    // A pull-off flicks the string and the level holds; a finger only lifted lets it fall away,
    // and what rings on (the open string) is not a note.
    const fell = top.level - r.level > LISTEN.moveFall;
    if (r.clarity < LISTEN.moveClarity || Math.abs(pitch - note) > LISTEN.moveReach + 0.5 || fell) {
      this.moved = null;
      return;
    }
    const m = Math.round(pitch);
    if (this.moved?.midi === m) this.moved.frames++;
    else this.moved = { midi: m, t: r.t - LISTEN.moveLag, frames: 1 };
    if (this.moved.frames >= LISTEN.confirmFrames) {
      const t = this.moved.t;
      this.end(t, out);
      this.start(m, r.level, t, out);
    }
  }

  private start(midi: number, level: number, t: number, out: Heard[]): void {
    this.note = midi;
    this.started = t;
    this.damping = [];
    this.moved = null;
    this.quietSince = null;
    this.quietFrames = 0;
    out.push({ kind: 'on', midi, velocity: this.velocity(level), t });
  }

  private end(t: number, out: Heard[]): void {
    if (this.note === null) return;
    out.push({ kind: 'off', midi: this.note, t });
    this.note = null;
    this.moved = null;
    this.damping = [];
    this.quietSince = null;
    this.quietFrames = 0;
  }

  private velocity(peakDb: number): number {
    const { gateDb, loudDb } = this.config;
    const x = (peakDb - gateDb) / Math.max(1, loudDb - gateDb);
    return Math.max(LISTEN.softest, Math.min(1, x));
  }
}
