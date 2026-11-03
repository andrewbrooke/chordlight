// Loop position as a pure function of time, shared by the scheduler and the lights.
// Beat 0 is the first downbeat; the count-in uses negative beats.

export interface Timeline {
  beats: number[];
  starts: number[];
  total: number;
}

export function timelineOf(beats: readonly number[]): Timeline {
  const starts: number[] = [];
  let total = 0;
  for (const b of beats) {
    starts.push(total);
    total += b;
  }
  return { beats: [...beats], starts, total };
}

export interface Position {
  countIn: boolean;
  /** Negative during the count-in. */
  beat: number;
  loopBeat: number;
  step: number;
  next: number;
  beatInStep: number;
  stepBeats: number;
  beatsLeft: number;
}

export const beatAt = (time: number, startTime: number, bpm: number): number =>
  ((time - startTime) * bpm) / 60;

export const timeOfBeat = (beat: number, startTime: number, bpm: number): number =>
  startTime + (beat * 60) / bpm;

export function positionAt(beat: number, tl: Timeline): Position {
  if (beat < 0) {
    return {
      countIn: true,
      beat,
      loopBeat: 0,
      step: 0,
      next: 0,
      beatInStep: 0,
      stepBeats: tl.beats[0] ?? 4,
      beatsLeft: -beat,
    };
  }
  const loopBeat = beat % tl.total;
  let step = tl.starts.length - 1;
  while (step > 0 && tl.starts[step]! > loopBeat + 1e-9) step--;
  const beatInStep = loopBeat - tl.starts[step]!;
  const stepBeats = tl.beats[step]!;
  return {
    countIn: false,
    beat,
    loopBeat,
    step,
    next: (step + 1) % tl.beats.length,
    beatInStep,
    stepBeats,
    beatsLeft: stepBeats - beatInStep,
  };
}
