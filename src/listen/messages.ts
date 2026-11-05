// What passes between the guitar worklet and the page.

import type { ListenConfig } from './listener.js';
import type { Heard } from './tracker.js';

export interface Meter {
  kind: 'meter';
  /** Each input channel's sample peak since the last meter, in dBFS. */
  peaks: number[];
  /** The guitar channel's RMS level, in dBFS. */
  level: number;
  /** In MIDI notes with a fraction; null when nothing clear is playing. */
  pitch: number | null;
  clarity: number;
  /** The note the tracker has sounding, if any. */
  note: number | null;
}

export interface Captured {
  kind: 'captured';
  samples: Float32Array;
  rate: number;
}

/** The guitar channel as the detector received it, and what it heard, timed from the start. */
export interface Recorded {
  kind: 'recorded';
  samples: Float32Array;
  rate: number;
  heard: Heard[];
}

export type FromWorklet = Heard | Meter | Captured | Recorded;

export interface Setup {
  config: ListenConfig;
  /** Which input channel the guitar is on. */
  channel: number;
  /** The amp's gate, in RMS dBFS. Above the detector's when there's hum: the amp hears it unfiltered. */
  ampGateDb: number;
}

export type ToWorklet =
  | ({ kind: 'setup' } & Setup)
  | { kind: 'capture'; seconds: number }
  /** Starts a recording of at most `seconds`; 0 ends one and sends it. */
  | { kind: 'record'; seconds: number };
