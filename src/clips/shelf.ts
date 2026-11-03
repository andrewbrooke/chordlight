// Saved clips: capture, playback with or without their recorded backing, deletion and persistence.

import type { App } from '../app.js';
import { type Held, pad } from '../audio/synths.js';
import { presetOf } from '../presets/library.js';
import { BACKING, CLIPS } from '../tuning.js';
import { loadList, save } from '../ui/storage.js';
import { type BackingState, backingFor } from './backing.js';
import { extractClip, type NoteEvent } from './extract.js';
import { BackingReplay } from './replay.js';

export interface Clip {
  id: string;
  created: number;
  duration: number;
  events: NoteEvent[];
  where: string;
  /** The backing's transport states, if it was playing. */
  backing?: BackingState[];
}

export class ClipShelf {
  clips: Clip[] = loadList<Clip>('clips');
  playing: string | null = null;
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
    // With a backing, the clip starts on the beat before its first note so the backing lines up.
    const backing = backingFor(this.app.backingLog, taken.start, taken.start + taken.duration);
    const lead = backing?.lead ?? 0;
    const s = this.app.s;
    const preset = s.mode === 'progression' ? presetOf(s.preset) : undefined;
    const where = preset ? `${preset.name} in ${this.app.key.name}` : this.app.key.name;
    const clip: Clip = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      created: Date.now(),
      duration: taken.duration + lead,
      events: taken.events.map((e) => ({ ...e, t: e.t + lead })),
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
