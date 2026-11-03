// Books the backing band for each eighth note of the loop. Voicings are worked out once per
// progression, each moving as little as possible from the last.

import type { Style } from '../presets/library.js';
import { BACKING } from '../tuning.js';
import type { Step } from '../theory/roman.js';
import type { Engine } from './engine.js';
import type { Owner, Piano } from './piano.js';
import { bass, drive, type Held, pad } from './synths.js';
import type { Position } from './timeline.js';
import { bassNote, powerChord, voice } from './voicing.js';

export class Backing {
  style: Style = 'pad';
  bassOn = true;
  onNote: (midi: number, start: number, end: number) => void = () => {};
  private steps: Step[] = [];
  private voicings: number[][] = [];
  /** Synth notes sounding or booked ahead, so stop() can cut them. The piano cuts its own. */
  private sounding: { held: Held; end: number }[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly piano: Piano,
    private readonly owner: Owner = 'backing',
  ) {}

  setSteps(steps: readonly Step[]): void {
    this.steps = [...steps];
    this.voicings = [];
    let prev: number[] | null = null;
    for (const s of steps) {
      prev = voice(s.chord, prev, BACKING.chordLo, BACKING.chordHi);
      this.voicings.push(prev);
    }
  }

  /** `eighth` counts from the loop's start. */
  book(eighth: number, pos: Position, time: number, spb: number): void {
    const step = this.steps[pos.step];
    const chord = this.voicings[pos.step];
    if (!step || !chord) return;
    this.sounding = this.sounding.filter((s) => s.end > this.engine.now);
    const onBeat = eighth % 2 === 0;
    const startsStep = onBeat && pos.beatInStep < 0.01;
    const half = onBeat && Math.round(pos.beatInStep) % 2 === 0;
    const beatsLeft = pos.beatsLeft;

    switch (this.style) {
      case 'pad':
        if (startsStep) {
          const end = time + beatsLeft * spb;
          for (const m of chord)
            this.keep(pad(this.engine, m, time, BACKING.padLevel, end), m, time, end);
        }
        break;
      case 'piano':
        if (half) {
          const length = Math.min(2, beatsLeft) * spb * 0.92;
          const vel = BACKING.pianoVelocity * (startsStep ? 1 : 0.8);
          for (const m of chord) this.pianoNote(m, vel, time, length);
        }
        break;
      case 'arp': {
        const tones = [...chord, chord[0]! + 12];
        const path = [...tones, ...tones.slice(1, -1).reverse()];
        const i = Math.round(pos.beatInStep * 2) % path.length;
        this.pianoNote(path[i]!, BACKING.arpVelocity, time, spb * 0.75);
        break;
      }
      case 'drive': {
        const notes = powerChord(step.chord, BACKING.driveLo);
        const end = time + spb * 0.45;
        this.sounding.push({ held: drive(this.engine, notes, time, spb * 0.45), end: end + 0.4 });
        for (const m of notes) this.onNote(m, time, end);
        break;
      }
    }

    if (!this.bassOn) return;
    const low = bassNote(step.chord, BACKING.bassLo);
    const length = this.style === 'drive' ? spb * 0.4 : Math.min(2, beatsLeft) * spb * 0.9;
    if (this.style === 'drive' || half) {
      this.keep(bass(this.engine, low, time, length), low, time, time + length);
    }
  }

  /** Starting partway through a chord: a pad gets its remaining beats; other styles pick up on the beat. */
  join(pos: Position, time: number, spb: number): void {
    const chord = this.voicings[pos.step];
    if (this.style !== 'pad' || !chord || pos.beatInStep < 0.01) return;
    const end = time + pos.beatsLeft * spb;
    for (const m of chord)
      this.keep(pad(this.engine, m, time, BACKING.padLevel, end), m, time, end);
  }

  /** Silences everything, including notes already booked ahead. */
  stop(): void {
    const now = this.engine.now;
    for (const s of this.sounding) if (s.end > now) s.held.stop(now);
    this.sounding = [];
    this.piano.allOff(this.owner);
  }

  private keep(held: Held, midi: number, time: number, end: number): void {
    this.sounding.push({ held, end: end + 1.5 });
    this.onNote(midi, time, end);
  }

  private pianoNote(midi: number, vel: number, time: number, length: number): void {
    this.piano.noteOn(this.owner, midi, vel, time);
    this.piano.noteOff(this.owner, midi, time + length);
    this.onNote(midi, time, time + length);
  }
}
