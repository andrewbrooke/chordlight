// Tunable constants. No DOM here: the piano renderer imports this in a Worker and in Node.

/** The synthesised piano (audio/piano-model.ts). Tune by ear with `npm run render`. */
export const PIANO = {
  /** Every third semitone is rendered, so no note is repitched more than one. */
  rootStep: 3,
  lowest: 21,
  highest: 108,
  /** Strike strength of each velocity layer. */
  layers: [0.38, 0.85],
  /** Peak level of each layer's buffers. */
  layerPeak: [0.45, 0.9],
  /** Buffer length in seconds, longest in the bass. */
  longest: 6.5,
  shortest: 1.4,
  /** Aftersound time constant at C2, halving every `decayHalving` semitones up. */
  aftersound: 7.5,
  decayHalving: 20,
  /** The prompt decay's time constant (as a fraction of the aftersound's) and share. */
  promptRatio: 0.22,
  promptShare: 0.7,
  /** Inharmonicity B at A0, rising a hundredfold to C8. */
  inharmonicity: 1e-4,
  /** Hammer strike point as a fraction of string length, bass to treble. */
  strikeBass: 1 / 7.5,
  strikeTreble: 1 / 14,
  /** The felt's lowpass corner in Hz, soft to hard. */
  feltSoft: 900,
  feltHard: 5200,
  /** Beating between the three strings: rate in Hz at the fundamental, and depth. */
  beatRate: 0.35,
  beatDepth: 0.14,
  /** Hammer knock level and decay in seconds. */
  knock: 0.035,
  knockDecay: 0.006,
  /** Notes from here up have no dampers, as on a real piano. */
  undamped: 89,
  /** Release time constant once a damper lands, in seconds. */
  damper: 0.045,
  polyphony: 48,
  /** Stereo spread by pitch: bass left, treble right. */
  spread: 0.35,
};

export const MIX = {
  piano: 0.8,
  backing: 0.5,
  bass: 0.55,
  click: 0.35,
  /** Room tail length and decay in seconds, and wet level. */
  roomLength: 2.2,
  roomDecay: 0.42,
  roomWet: 0.2,
  /** Gain into the safety clipper: hard MIDI chords over the backing peak near full scale. */
  master: 0.7,
  /** The clipper is linear below this level. */
  clipKnee: 0.7,
};

export const PLAY = {
  /** Velocity for computer keys and the mouse. */
  velocity: 0.7,
  /** MIDI note of the layout's C at startup (C4). */
  baseNote: 60,
  lowestBase: 36,
  highestBase: 84,
};

export const TIMING = {
  /** Scheduler interval and lookahead, in seconds. */
  tick: 0.025,
  horizon: 0.12,
  /** Delay before the first beat, so nothing is booked in the past. */
  startDelay: 0.08,
  bpmMin: 40,
  bpmMax: 220,
  countInBeats: 4,
};

/** Note ranges are MIDI notes. */
export const BACKING = {
  chordLo: 48,
  chordHi: 67,
  bassLo: 36,
  driveLo: 43,
  /** Held chords (chord keys, palette) sit lower, under the melody. */
  droneLo: 45,
  droneHi: 64,
  pianoVelocity: 0.42,
  arpVelocity: 0.38,
  padLevel: 0.11,
  droneLevel: 0.09,
};

export const CLIPS = {
  /** Seconds of playing kept for clips. */
  memory: 120,
  defaultSeconds: 30,
  choices: [10, 20, 30, 60],
  max: 40,
};

/** The on-screen keyboard. Widths follow a real piano; key length stretches to fill the stage. */
export const KEYS = {
  /** White key pitch and the gap between keys, in cm. */
  white: 2.35,
  gap: 0.12,
  black: 1.37,
  /** Black key length as a fraction of a white key's. */
  blackRatio: 0.62,
  /** Key length limits in cm; shorter keys would put markers under the black keys. */
  minLength: 17.5,
  maxLength: 30,
  margin: 0.4,
  /** Front lip depth (the key's visible thickness); a press shrinks it to `pressedLip`. */
  lipWhite: 0.7,
  lipBlack: 0.55,
  pressedLip: 0.3,
  shadow: 0.3,
  /** A backing note's press, as a fraction of a real one. */
  ghost: 0.4,
  /** Press and release time constants, in seconds. */
  down: 0.018,
  up: 0.05,
  /** Light cross-fade time constant, in seconds. */
  fade: 0.03,
  pulse: 0.6,
};

export const COLOURS = {
  home: '#ffd66b',
  land: '#eaa53c',
  wander: '#33c7b5',
  lean: '#a87cff',
  nextOnWhite: '#141210',
  nextOnBlack: '#ffffff',
  star: '#fff1c4',
  ivory: '#f1ebdf',
  ivoryLip: '#c9c0b0',
  ebony: '#1b1815',
  ebonyTop: '#2e2924',
  ebonyLip: '#4a423a',
  background: '#17130f',
};

export const GLOW = { home: 1, land: 0.85, wander: 0.7, lean: 0.75, out: 0 };
