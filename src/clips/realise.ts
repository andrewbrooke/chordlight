// A clip's recorded backing written out as notes, by running the backing's plan over its transport
// states all at once: what BackingReplay sounds in real time, for the MIDI export. Times are
// seconds from the clip's start.

import { BackingPlan, type Planned } from '../audio/plan.js';
import { positionAt, timelineOf } from '../audio/timeline.js';
import type { Style } from '../presets/library.js';
import { chordName } from '../theory/chords.js';
import { parseProgression } from '../theory/roman.js';
import { spellKey } from '../theory/scales.js';
import type { BackingState } from './backing.js';

export interface Realised {
  notes: Planned[];
  /** Each chord change, named. */
  chords: { t: number; name: string }[];
  /** When each run of the backing starts, and in which style. */
  styles: { t: number; style: Style }[];
}

export function realiseBacking(states: readonly BackingState[], duration: number): Realised {
  const out: Realised = { notes: [], chords: [], styles: [] };
  states.forEach((s, i) => {
    if (!s.playing) return;
    const parsed = parseProgression(s.text, spellKey({ home: s.home, mood: s.mood }));
    if (!parsed.ok) return;
    const plan = new BackingPlan();
    plan.style = s.style;
    plan.bassOn = s.bass;
    plan.setSteps(parsed.steps);
    const tl = timelineOf(parsed.steps.map((step) => step.beats));
    const spb = 60 / s.bpm;
    const following = states[i + 1];
    const end = Math.min(following?.t ?? duration, duration);
    // A stop cuts what's sounding; a change (of tempo, say) lets it ring into the next run.
    const until = following?.playing ? duration : end;
    const keep = (planned: Planned[]) => {
      for (const p of planned) out.notes.push({ ...p, end: Math.min(p.end, until) });
    };
    const name = (step: number) => chordName(parsed.steps[step]!.chord);

    const first = positionAt(s.beat, tl);
    if (!states[i - 1]?.playing) {
      keep(plan.join(first, s.t, spb));
      out.styles.push({ t: s.t, style: s.style });
    }
    // A tempo change records a state mid-chord; only name the chord if it's a different one.
    if (out.chords.at(-1)?.name !== name(first.step)) {
      out.chords.push({ t: s.t, name: name(first.step) });
    }
    for (let eighth = Math.ceil(s.beat * 2 - 1e-6); ; eighth++) {
      const time = s.t + (eighth / 2 - s.beat) * spb;
      if (time >= end) break;
      const pos = positionAt(eighth / 2, tl);
      keep(plan.at(Math.round(pos.loopBeat * 2), pos, time, spb));
      if (time > s.t + 1e-6 && eighth % 2 === 0 && pos.beatInStep < 0.01) {
        out.chords.push({ t: time, name: name(pos.step) });
      }
    }
  });
  return out;
}
