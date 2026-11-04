// Saved clips: capture (the last N seconds, or a recording from one press to the next), playback
// with or without their recorded backing, deletion and persistence.

import type { App } from '../app.js';
import { type Held, pad } from '../audio/synths.js';
import { presetOf } from '../presets/library.js';
import { BACKING, CLIPS } from '../tuning.js';
import { loadList, save } from '../ui/storage.js';
import { backingFor } from './backing.js';
import { cutClip, extractClip, type NoteEvent } from './extract.js';
import type { Clip } from './file.js';
import { BackingReplay } from './replay.js';

export class ClipShelf {
  clips: Clip[] = loadList<Clip>('clips');
  playing: string | null = null;
  /** The audio-clock time recording started, while recording. */
  recording: number | null = null;
  /** False if localStorage refused the last save. */
  kept = true;
  onChange: () => void = () => {};
  private pads: Held[] = [];
  private replay: BackingReplay | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly app: App) {}

  /** Returns null if nothing was played in the window. */
  take(): Clip | null {
    const audio = this.app.audio;
    if (!audio) return null;
    const taken = extractClip(this.app.log, audio.engine.now, this.app.s.clipSeconds);
    if (!taken) return null;
    return this.keep(taken.events, taken.duration, taken.start);
  }

  record(): void {
    if (this.recording !== null) return;
    this.recording = this.app.startAudio().engine.now;
    this.app.keepLogFrom(this.recording);
    this.onChange();
  }

  /** Ends the recording; null if nothing was played during it. */
  stopRecording(): Clip | null {
    const start = this.recording;
    const audio = this.app.audio;
    if (start === null || !audio) return null;
    this.recording = null;
    this.app.keepLogFrom(null);
    const cut = cutClip(this.app.log, start, audio.engine.now);
    if (!cut) {
      this.onChange();
      return null;
    }
    return this.keep(cut.events, cut.duration, start);
  }

  private keep(events: NoteEvent[], duration: number, start: number): Clip {
    // With a backing, the clip starts on the beat before its first note so the backing lines up.
    const backing = backingFor(this.app.backingLog, start, start + duration);
    const lead = backing?.lead ?? 0;
    const s = this.app.s;
    const preset = s.mode === 'progression' ? presetOf(s.preset) : undefined;
    const where = preset ? `${preset.name} in ${this.app.key.name}` : this.app.key.name;
    const clip: Clip = {
      id: newId(),
      created: Date.now(),
      duration: duration + lead,
      events: events.map((e) => ({ ...e, t: e.t + lead })),
      where,
      ...(backing ? { backing: backing.states } : {}),
    };
    this.clips = [clip, ...this.clips].slice(0, CLIPS.max);
    this.store();
    return clip;
  }

  play(id: string): void {
    this.stop();
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) return;
    // A clip brings its own backing; the live one would play over it out of time.
    this.app.pause();
    const { engine, piano } = this.app.startAudio();
    const start = engine.now + 0.05;
    for (const { on, off } of pairs(clip.events)) {
      const t0 = start + on.t;
      const t1 = start + off;
      if (on.voice === 'piano') {
        piano.noteOn('clip', on.midi, on.vel, t0);
        piano.noteOff('clip', on.midi, t1);
      } else {
        this.pads.push(pad(engine, on.midi, t0, BACKING.droneLevel, t1));
      }
      this.app.showPress(on.midi, t0, t1);
    }
    if (clip.backing && this.app.s.clipBacking) {
      this.replay = new BackingReplay(
        engine,
        piano,
        clip.backing,
        start,
        clip.duration,
        (m, a, b) => this.app.showPress(m, a, b, true),
      );
    }
    this.playing = id;
    this.timer = setTimeout(() => this.stop(), (clip.duration + 0.1) * 1000);
    this.onChange();
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.playing === null) return;
    const audio = this.app.audio;
    if (audio) {
      audio.piano.allOff('clip');
      for (const p of this.pads) p.stop(audio.engine.now);
    }
    this.pads = [];
    this.replay?.stop();
    this.replay = null;
    this.app.clearPresses('clip');
    this.playing = null;
    this.onChange();
  }

  /** Stops the backing of the clip that's playing and lets its notes carry on. */
  dropBacking(): void {
    this.replay?.stop();
    this.replay = null;
  }

  /** Puts an imported clip at the top of the shelf. */
  add(clip: Clip): void {
    this.clips = [clip, ...this.clips].slice(0, CLIPS.max);
    this.store();
  }

  remove(id: string): void {
    if (this.playing === id) this.stop();
    this.clips = this.clips.filter((c) => c.id !== id);
    this.store();
  }

  private store(): void {
    this.kept = save('clips', this.clips);
    this.onChange();
  }
}

export const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function pairs(events: readonly NoteEvent[]): { on: NoteEvent; off: number }[] {
  const open = new Map<string, NoteEvent>();
  const out: { on: NoteEvent; off: number }[] = [];
  for (const e of events) {
    const id = `${e.voice}:${e.midi}`;
    if (e.on) open.set(id, e);
    else {
      const on = open.get(id);
      if (on) out.push({ on, off: e.t });
      open.delete(id);
    }
  }
  return out;
}
