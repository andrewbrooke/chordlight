// Transport and lookahead scheduler. Every 25 ms it books the eighth notes due in the next 120 ms
// against the audio clock, so timing doesn't depend on frame rate or main-thread load. A tempo
// change re-anchors the start time so the current beat doesn't jump, and so does a resume: a pause
// keeps the beat it stopped on and silences what was booked past it.

import { TIMING } from '../tuning.js';
import type { Backing } from './backing.js';
import type { Engine } from './engine.js';
import { click } from './synths.js';
import {
  beatAt,
  type Position,
  positionAt,
  type Timeline,
  timelineOf,
  timeOfBeat,
} from './timeline.js';

export class Transport {
  playing = false;
  bpm = 92;
  countIn = true;
  clickOn = false;
  onStop: () => void = () => {};
  /** Called after every start, stop and tempo change. */
  onChange: () => void = () => {};
  private startTime = 0;
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tl: Timeline = timelineOf([4]);
  /** The beat it stopped on, while paused. */
  private pausedAt: number | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly backing: Backing,
  ) {}

  setBeats(beats: readonly number[]): void {
    this.tl = timelineOf(beats);
    // A new progression starts from its top, whether playing or paused.
    if (this.playing) this.start(false);
    else if (this.pausedAt !== null) this.pausedAt = 0;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  start(countIn = this.countIn): void {
    this.halt();
    this.pausedAt = null;
    const spb = 60 / this.bpm;
    const lead = countIn ? TIMING.countInBeats : 0;
    this.startTime = this.engine.now + TIMING.startDelay + lead * spb;
    this.next = -lead * 2;
    this.playing = true;
    this.timer = setInterval(() => this.tick(), TIMING.tick * 1000);
    this.tick();
    this.onChange();
  }

  stop(): void {
    if (!this.playing && this.pausedAt === null) return;
    this.pausedAt = null;
    this.halt();
    this.onStop();
    this.onChange();
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.beatAt(this.engine.now);
    this.halt();
    this.onChange();
  }

  resume(): void {
    const beat = this.pausedAt;
    if (beat === null) return;
    this.pausedAt = null;
    const spb = 60 / this.bpm;
    const time = this.engine.now + TIMING.startDelay;
    this.startTime = time - beat * spb;
    this.next = Math.ceil(beat * 2 - 1e-6);
    this.playing = true;
    if (beat >= 0) this.backing.join(positionAt(beat, this.tl), time, spb);
    this.timer = setInterval(() => this.tick(), TIMING.tick * 1000);
    this.tick();
    this.onChange();
  }

  setBpm(bpm: number): void {
    const clamped = Math.min(TIMING.bpmMax, Math.max(TIMING.bpmMin, Math.round(bpm)));
    if (this.playing) {
      const now = this.engine.now;
      const beat = beatAt(now, this.startTime, this.bpm);
      this.startTime = now - (beat * 60) / clamped;
    }
    const changed = clamped !== this.bpm;
    this.bpm = clamped;
    if (changed && this.playing) this.onChange();
  }

  /** The first downbeat's time; later than now during a count-in. */
  get downbeat(): number {
    return this.startTime;
  }

  beatAt(time: number): number {
    return beatAt(time, this.startTime, this.bpm);
  }

  /** Defaults to the time currently being heard; held while paused, and null when stopped. */
  position(time = this.engine.heard): Position | null {
    if (this.pausedAt !== null) return positionAt(this.pausedAt, this.tl);
    if (!this.playing) return null;
    return positionAt(beatAt(time, this.startTime, this.bpm), this.tl);
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.playing) this.backing.stop();
    this.playing = false;
  }

  private tick(): void {
    const now = this.engine.now;
    const spb = 60 / this.bpm;
    for (;;) {
      const time = timeOfBeat(this.next / 2, this.startTime, this.bpm);
      if (time > now + TIMING.horizon) break;
      // Skip anything that fell behind (a throttled tab, say) rather than play it late in a burst.
      if (time >= now - 0.02) this.book(this.next, time, spb);
      this.next++;
    }
  }

  private book(eighth: number, time: number, spb: number): void {
    const beat = eighth / 2;
    const onBeat = eighth % 2 === 0;
    if (beat < 0) {
      if (onBeat) click(this.engine, time, beat === -TIMING.countInBeats);
      return;
    }
    const pos = positionAt(beat, this.tl);
    if (onBeat && this.clickOn) click(this.engine, time, pos.loopBeat % 4 === 0);
    const loopEighth = Math.round(pos.loopBeat * 2);
    this.backing.book(loopEighth, pos, time, spb);
  }
}
