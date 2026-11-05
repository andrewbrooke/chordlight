// A clip as a Standard MIDI File: format 1, 480 ticks a quarter, for DAWs and notation programs.
//
// Notes keep the times they were played at; nothing is snapped. The tempo map is what lines them
// up. With a backing it follows the transport's tempo and starts the file at the bar line before
// the clip, so the backing's downbeats fall on the program's beats; where the backing restarts
// after a stop, the stopped stretch's tempo is bent so the restart lands on the grid too. Bars
// assume 4/4, counted from the progression's first beat. Without a backing there is no beat to
// follow, and the file runs at CLIPS.looseBpm.
//
// Tracks: tempo, meter and chord names (as markers); the player's notes; held chords (Key mode);
// the guitar's notes; the backing's chords; its bass. Empty ones are left out. Text is ASCII, since MIDI text has no
// declared encoding and programs disagree about anything else.

import type { Planned } from '../audio/plan.js';
import type { Style } from '../presets/library.js';
import { CLIPS } from '../tuning.js';
import type { BackingState } from './backing.js';
import type { ClipVoice } from './extract.js';
import type { Clip } from './file.js';
import { realiseBacking } from './realise.js';

export const TPQ = 480;
const BAR = 4 * TPQ;

/** General MIDI programs, counted from 0. */
const PROGRAM = { piano: 0, cleanGuitar: 27, guitar: 29, bass: 33, pad: 89 };
const STYLE_PROGRAM: Record<Style, number> = {
  pad: PROGRAM.pad,
  piano: PROGRAM.piano,
  arp: PROGRAM.piano,
  drive: PROGRAM.guitar,
};
const VOICE_CHANNEL: Record<ClipVoice, number> = { piano: 0, pad: 1, guitar: 4 };
const VOICE_PROGRAM: Record<ClipVoice, number> = {
  piano: PROGRAM.piano,
  pad: PROGRAM.pad,
  guitar: PROGRAM.cleanGuitar,
};
const CHORDS = 2;
const BASS = 3;

/** From `t` seconds on, ticks advance at `bpm`. */
export interface Segment {
  t: number;
  tick: number;
  bpm: number;
}

export function tempoMap(states: readonly BackingState[]): Segment[] {
  const first = states[0];
  const startsPlaying = first !== undefined && first.playing && first.t === 0;
  const segs: Segment[] = [
    { t: 0, tick: startsPlaying ? phase(first.beat) : 0, bpm: first?.bpm ?? CLIPS.looseBpm },
  ];
  let playing = startsPlaying;
  for (const s of startsPlaying ? states.slice(1) : states) {
    const prev = segs[segs.length - 1]!;
    let tick = tickIn(prev, s.t);
    if (s.playing && !playing && s.t > prev.t) {
      tick = alignTo(tick, phase(s.beat), prev.tick);
      prev.bpm = (60 * (tick - prev.tick)) / TPQ / (s.t - prev.t);
    }
    segs.push({ t: s.t, tick, bpm: s.bpm });
    playing = s.playing;
  }
  return segs;
}

export function tickAt(segs: readonly Segment[], t: number): number {
  let seg = segs[0]!;
  for (const s of segs) if (s.t <= t) seg = s;
  return Math.round(tickIn(seg, t));
}

const tickIn = (seg: Segment, t: number) => seg.tick + ((t - seg.t) * seg.bpm * TPQ) / 60;
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Where a beat falls in its bar, in ticks. */
const phase = (beat: number) => mod(Math.round(beat * TPQ), BAR);

/** The tick nearest `natural` that sits at `target` in its bar, and after `after`. */
function alignTo(natural: number, target: number, after: number): number {
  let tick = natural - mod(natural - target, BAR);
  if (natural - tick > BAR / 2) tick += BAR;
  while (tick <= after) tick += BAR;
  return tick;
}

interface Event {
  tick: number;
  /** Ties at one tick: meta and program changes, then note-offs, then note-ons. */
  order: number;
  bytes: number[];
}

export function clipToMidi(clip: Clip): Uint8Array<ArrayBuffer> {
  const states = clip.backing ?? [];
  const segs = tempoMap(states);
  const at = (t: number) => tickAt(segs, t);
  const backing = states.length > 0 ? realiseBacking(states, clip.duration) : null;

  const conductor: Event[] = [
    meta(0, 0x03, clip.where),
    { tick: 0, order: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
    // The first tempo also covers the lead-in before the clip's first bar.
    ...segs.map((s, i) => tempo(i === 0 ? 0 : Math.round(s.tick), s.bpm)),
    ...(backing?.chords ?? []).map((c) => meta(at(c.t), 0x06, c.name)),
  ];

  const tracks = [conductor];
  for (const voice of ['piano', 'pad', 'guitar'] as const) {
    const ch = VOICE_CHANNEL[voice];
    const events: Event[] = [program(0, ch, VOICE_PROGRAM[voice])];
    const opened = new Map<number, number>();
    for (const e of clip.events) {
      if (e.voice !== voice) continue;
      const tick = at(e.t);
      if (e.on) {
        opened.set(e.midi, tick);
        events.push(noteOn(tick, ch, e.midi, e.vel));
      } else if (opened.has(e.midi)) {
        events.push(noteOff(Math.max(tick, opened.get(e.midi)! + 1), ch, e.midi));
        opened.delete(e.midi);
      }
    }
    if (events.length > 1) tracks.push([meta(0, 0x03, TRACK_NAME[voice]), ...events]);
  }

  if (backing) {
    const chords = backing.notes.filter((p) => p.sound !== 'bass');
    const bass = backing.notes.filter((p) => p.sound === 'bass');
    const programs = backing.styles.map((s) => program(at(s.t), CHORDS, STYLE_PROGRAM[s.style]));
    if (chords.length > 0) {
      tracks.push([meta(0, 0x03, 'Backing chords'), ...programs, ...planned(chords, CHORDS, at)]);
    }
    if (bass.length > 0) {
      tracks.push([
        meta(0, 0x03, 'Backing bass'),
        program(0, BASS, PROGRAM.bass),
        ...planned(bass, BASS, at),
      ]);
    }
  }

  const header = chunk('MThd', [0, 1, ...u16(tracks.length), ...u16(TPQ)]);
  return new Uint8Array([...header, ...tracks.flatMap(trackChunk)]);
}

const TRACK_NAME: Record<ClipVoice, string> = {
  piano: 'Played',
  pad: 'Held chords',
  guitar: 'Guitar',
};

function planned(notes: readonly Planned[], ch: number, at: (t: number) => number): Event[] {
  return notes.flatMap((p) => {
    const on = at(p.start);
    const off = Math.max(at(p.end), on + 1);
    return p.notes.flatMap((m) => [noteOn(on, ch, m, p.velocity), noteOff(off, ch, m)]);
  });
}

const noteOn = (tick: number, ch: number, midi: number, vel: number): Event => ({
  tick,
  order: 2,
  bytes: [0x90 | ch, midi, Math.min(127, Math.max(1, Math.round(vel * 127)))],
});

const noteOff = (tick: number, ch: number, midi: number): Event => ({
  tick,
  order: 1,
  bytes: [0x80 | ch, midi, 64],
});

const program = (tick: number, ch: number, n: number): Event => ({
  tick,
  order: 0,
  bytes: [0xc0 | ch, n],
});

function tempo(tick: number, bpm: number): Event {
  const us = Math.min(0xffffff, Math.max(1, Math.round(60_000_000 / bpm)));
  return { tick, order: 0, bytes: [0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] };
}

function meta(tick: number, type: number, text: string): Event {
  const bytes = [...ascii(text)].map((c) => c.charCodeAt(0));
  return { tick, order: 0, bytes: [0xff, type, ...vlq(bytes.length), ...bytes] };
}

function ascii(text: string): string {
  return text
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/°/g, 'dim')
    .replace(/[^\x20-\x7e]/g, '?');
}

function trackChunk(events: Event[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of sorted) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', body);
}

function chunk(type: string, body: number[]): number[] {
  const n = body.length;
  const id = [...type].map((c) => c.charCodeAt(0));
  return [...id, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, ...body];
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** A variable-length quantity, as every delta time is written. */
function vlq(n: number): number[] {
  const out = [n & 0x7f];
  for (let v = n >>> 7; v > 0; v >>>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
}
