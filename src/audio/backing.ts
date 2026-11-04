// Plays the backing band: BackingPlan decides the notes on each eighth, and this sounds them.

import type { Style } from '../presets/library.js';
import { BACKING } from '../tuning.js';
import type { Step } from '../theory/roman.js';
import type { Engine } from './engine.js';
import type { Owner, Piano } from './piano.js';
import { BackingPlan, type Planned } from './plan.js';
import { bass, drive, type Held, pad } from './synths.js';
import type { Position } from './timeline.js';

export class Backing {
  onNote: (midi: number, start: number, end: number) => void = () => {};
  private readonly plan = new BackingPlan();
  /** Synth notes sounding or booked ahead, so stop() can cut them. The piano cuts its own. */
  private sounding: { held: Held; end: number }[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly piano: Piano,
    private readonly owner: Owner = 'backing',
  ) {}

  get style(): Style {
    return this.plan.style;
  }

  set style(style: Style) {
    this.plan.style = style;
  }

  get bassOn(): boolean {
    return this.plan.bassOn;
  }

  set bassOn(on: boolean) {
    this.plan.bassOn = on;
  }

  setSteps(steps: readonly Step[]): void {
    this.plan.setSteps(steps);
  }

  /** `eighth` counts from the loop's start. */
  book(eighth: number, pos: Position, time: number, spb: number): void {
    this.sounding = this.sounding.filter((s) => s.end > this.engine.now);
    for (const p of this.plan.at(eighth, pos, time, spb)) this.sound(p);
  }

  join(pos: Position, time: number, spb: number): void {
    for (const p of this.plan.join(pos, time, spb)) this.sound(p);
  }

  /** Silences everything, including notes already booked ahead. */
  stop(): void {
    const now = this.engine.now;
    for (const s of this.sounding) if (s.end > now) s.held.stop(now);
    this.sounding = [];
    this.piano.allOff(this.owner);
  }

  private sound(p: Planned): void {
    const length = p.end - p.start;
    switch (p.sound) {
      case 'pad':
        for (const m of p.notes) {
          this.keep(pad(this.engine, m, p.start, BACKING.padLevel, p.end), m, p.start, p.end);
        }
        break;
      case 'piano':
        for (const m of p.notes) {
          this.piano.noteOn(this.owner, m, p.velocity, p.start);
          this.piano.noteOff(this.owner, m, p.end);
          this.onNote(m, p.start, p.end);
        }
        break;
      case 'drive':
        this.sounding.push({
          held: drive(this.engine, p.notes, p.start, length),
          end: p.end + 0.4,
        });
        for (const m of p.notes) this.onNote(m, p.start, p.end);
        break;
      case 'bass':
        for (const m of p.notes)
          this.keep(bass(this.engine, m, p.start, length), m, p.start, p.end);
        break;
    }
  }

  private keep(held: Held, midi: number, time: number, end: number): void {
    this.sounding.push({ held, end: end + 1.5 });
    this.onNote(midi, time, end);
  }
}
