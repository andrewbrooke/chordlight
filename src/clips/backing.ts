// The backing is recorded as a log of transport states, not notes: everything it plays follows from
// the progression, tempo, style and where the beat was, so a clip keeps the states covering its
// span and playback regenerates the backing from them.

import type { Style } from '../presets/library.js';
import type { MoodId } from '../theory/scales.js';

export interface BackingState {
  /** Audio-clock seconds in the log; seconds from the clip start once in a clip. */
  t: number;
  playing: boolean;
  /** The loop's beat at `t` (only meaningful while playing). */
  beat: number;
  bpm: number;
  text: string;
  home: number;
  mood: MoodId;
  style: Style;
  bass: boolean;
}

/**
 * The states covering [start, end), relative to `start`, or null if the backing wasn't playing.
 * `lead` is how far to move the clip's start back so the backing begins on a beat.
 */
export function backingFor(
  log: readonly BackingState[],
  start: number,
  end: number,
): { states: BackingState[]; lead: number } | null {
  let active: BackingState | undefined;
  for (const s of log) if (s.t <= start) active = s;
  const states: BackingState[] = [];
  if (active?.playing) {
    states.push({ ...active, t: 0, beat: active.beat + ((start - active.t) * active.bpm) / 60 });
  }
  for (const s of log) if (s.t > start && s.t < end) states.push({ ...s, t: s.t - start });
  if (!states.some((s) => s.playing)) return null;

  const first = states[0]!;
  if (!(first.t === 0 && first.playing)) return { states, lead: 0 };
  const fraction = first.beat - Math.floor(first.beat);
  const lead = (fraction * 60) / first.bpm;
  first.beat -= fraction;
  for (const s of states.slice(1)) s.t += lead;
  return { states, lead };
}

/** Appends a state, dropping any booked for later that it overtakes (a stop during a count-in). */
export function record(log: BackingState[], state: BackingState, keepFrom: number): BackingState[] {
  while (log.length > 0 && log[log.length - 1]!.t > state.t) log.pop();
  log.push(state);
  const firstKept = log.findIndex((s) => s.t >= keepFrom);
  // Keep the last state before the cutoff too: it says what was playing at the cutoff.
  return firstKept > 0 ? log.slice(firstKept - 1) : log;
}
