// Plays a clip's recorded backing. Each run of playing states gets its own Backing, booked a little
// ahead of the audio clock like the live transport, so a long clip isn't scheduled all at once.

import type { Engine } from '../audio/engine.js';
import { Backing } from '../audio/backing.js';
import type { Piano } from '../audio/piano.js';
import { positionAt, type Timeline, timelineOf } from '../audio/timeline.js';
import { parseProgression } from '../theory/roman.js';
import { spellKey } from '../theory/scales.js';
import { TIMING } from '../tuning.js';
import type { BackingState } from './backing.js';

interface Run {
  backing: Backing;
  tl: Timeline;
  t0: number;
  beat0: number;
  spb: number;
  /** Next eighth note to book, counted in eighths from the loop's start. */
  next: number;
  end: number;
  /** Whether the backing stopped at the end of this run, rather than carrying on changed. */
  cut: boolean;
  stopped: boolean;
}

export class BackingReplay {
  private readonly runs: Run[] = [];
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly engine: Engine,
    piano: Piano,
    states: readonly BackingState[],
    start: number,
    duration: number,
    onNote: (midi: number, start: number, end: number) => void,
  ) {
    states.forEach((s, i) => {
      if (!s.playing) return;
      const parsed = parseProgression(s.text, spellKey({ home: s.home, mood: s.mood }));
      if (!parsed.ok) return;
      const backing = new Backing(engine, piano, 'replay');
      backing.style = s.style;
      backing.bassOn = s.bass;
      backing.setSteps(parsed.steps);
      backing.onNote = onNote;
      const tl = timelineOf(parsed.steps.map((step) => step.beats));
      const spb = 60 / s.bpm;
      const t0 = start + s.t;
      const following = states[i + 1];
      if (!states[i - 1]?.playing) backing.join(positionAt(s.beat, tl), t0, spb);
      this.runs.push({
        backing,
        tl,
        t0,
        beat0: s.beat,
        spb,
        next: Math.ceil(s.beat * 2 - 1e-6),
        end: start + Math.min(following?.t ?? duration, duration),
        cut: !following?.playing,
        stopped: false,
      });
    });
    this.timer = setInterval(() => this.tick(), TIMING.tick * 1000);
    this.tick();
  }

  stop(): void {
    clearInterval(this.timer);
    for (const run of this.runs) if (!run.stopped) run.backing.stop();
  }

  private tick(): void {
    const now = this.engine.now;
    for (const run of this.runs) {
      for (;;) {
        const time = run.t0 + (run.next / 2 - run.beat0) * run.spb;
        if (time >= run.end || time > now + TIMING.horizon) break;
        if (time >= now - 0.02) {
          const pos = positionAt(run.next / 2, run.tl);
          run.backing.book(Math.round(pos.loopBeat * 2), pos, time, run.spb);
        }
        run.next++;
      }
      if (run.cut && !run.stopped && now >= run.end) {
        run.backing.stop();
        run.stopped = true;
      }
    }
  }
}
