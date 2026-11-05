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

/** The plucked-string voice (audio/guitar-model.ts). */
export const PLUCK = {
  lowest: 28,
  highest: 100,
  /** Every third semitone is rendered, so no note is repitched more than one. */
  rootStep: 3,
  /** Seconds to fall 60 dB at `ringFrom`, halving every `ringHalving` semitones up. */
  ringLow: 4.5,
  ringFrom: 40,
  ringHalving: 26,
  longest: 4.5,
  shortest: 1.2,
  /** Pick and pickup positions, as fractions of the string from the bridge. */
  pickAt: 0.13,
  pickupAt: 0.22,
  pickupDepth: 0.5,
  /** The burst's one-pole low-pass coefficient: 1 is white noise, lower is a softer pick. */
  brightness: 0.55,
  peak: 0.5,
  /** Release time constant when a note is let go, in seconds. */
  release: 0.07,
  polyphony: 12,
};

/**
 * The guitar amp (audio/amp-model.ts). A sound is two clipping stages with filters round them.
 * Frequencies in Hz, gains and drives in dB, Q plain. Each sound's `level` is set so a riff plays as
 * loud as through Clean, and `makeup` is the share of a drive change taken back off it (none for a
 * saturated sound, whose clipping limits it already), so Drive changes the sound, not the loudness.
 * tools/smoke/amp.mjs holds both there; `npm run render -- amp` plays the sounds to WAV files.
 */
export const AMP = {
  /** The clipping curves take input over ±this, so a stage driven at 0 dB barely bends a pluck. */
  curveSpan: 4,
  /** The tube curve's offset (its even harmonics), and how square the hard curve's knee is. */
  asymmetry: 0.2,
  hardKnee: 6,
  /** Bass, mid and treble move their filter this far either way; drive moves each stage by its span. */
  knobDb: 9,
  sounds: {
    /** Bright and open, breaking up only when driven hard. */
    clean: {
      tighten: 50,
      push: [700, 0.7, 0],
      stages: [
        { db: 0, span: 10, curve: 'soft' },
        { db: 0, span: 0, curve: 'soft' },
      ],
      smooth: 12000,
      between: 20,
      bass: [100, 2],
      mid: [450, 0.8, -2],
      treble: [2500, 3],
      presence: [5000, 1, 2],
      cab: 'open',
      makeup: 0.85,
      level: 6,
    },
    /** A valve amp just past breaking up: chords crunch, single notes bite. */
    crunch: {
      tighten: 90,
      push: [900, 0.8, 4],
      stages: [
        { db: 20, span: 9, curve: 'tube' },
        { db: 6, span: 5, curve: 'tube' },
      ],
      smooth: 8000,
      between: 100,
      bass: [110, 1],
      mid: [700, 0.9, 2],
      treble: [2800, 2],
      presence: [4000, 1, 2],
      cab: 'closed',
      makeup: 0.45,
      level: -16,
    },
    /** Pop-punk: saturated, tight in the bass (the high-pass before the drive), mids pushed forward. */
    punk: {
      tighten: 150,
      push: [1100, 0.7, 7],
      stages: [
        { db: 28, span: 9, curve: 'tube' },
        { db: 16, span: 6, curve: 'hard' },
      ],
      smooth: 6500,
      between: 140,
      bass: [110, 5],
      mid: [750, 0.8, 1],
      treble: [3000, 3],
      presence: [4200, 1.2, 4],
      cab: 'closed',
      makeup: 0,
      level: -22,
    },
    /** A fuzz pedal into the amp: square-wave clipping, endless sustain, mids scooped out. */
    fuzz: {
      tighten: 40,
      push: [400, 0.6, 3],
      stages: [
        { db: 34, span: 9, curve: 'hard' },
        { db: 20, span: 6, curve: 'hard' },
      ],
      smooth: 5000,
      between: 50,
      bass: [100, 6],
      mid: [800, 0.6, -10],
      treble: [2600, 4],
      presence: [5000, 1, 0],
      cab: 'closed',
      makeup: 0,
      level: -17.5,
    },
  },
  /** Speaker cabinets as filters: type, Hz, Q, dB. An open-back 1x12, and a closed 4x12. */
  cabs: {
    open: [
      ['highpass', 65, 0.707, 0],
      ['peaking', 110, 1.2, 1],
      ['peaking', 500, 0.9, -1.5],
      ['peaking', 2500, 1.3, 2],
      ['lowpass', 6500, 0.707, 0],
      ['lowpass', 8000, 0.6, 0],
    ],
    closed: [
      ['highpass', 75, 0.707, 0],
      ['peaking', 110, 1.3, 4],
      ['peaking', 400, 0.9, -3],
      ['peaking', 2200, 1.4, 3.5],
      ['lowpass', 5000, 0.707, 0],
      ['lowpass', 5800, 0.6, 0],
    ],
  },
} as const;

/** The noise gate in front of the amp (listen/worklet.ts). */
export const GATE = {
  /** Opens when the peak envelope is this many dB over the gate's RMS level; closes this many below. */
  peakOverRms: 6,
  hysteresis: 6,
  /** Seconds: the gain's rise and fall, and the envelope's decay. */
  attack: 0.002,
  release: 0.08,
  hold: 0.05,
};

/** The note detector (listen/). Levels are RMS dBFS. */
export const LISTEN = {
  /**
   * The detector runs near this rate, after an anti-alias low-pass and a rumble high-pass (Hz). The
   * low-pass sits well under the rate's limit: treble sharpens YIN's dips, so a period between
   * samples reads less accurately.
   */
  rate: 12000,
  antiAlias: 3000,
  highpass: 40,
  /** Seconds between analyses, and the window the level is measured over. */
  hop: 0.004,
  levelWindow: 0.012,
  /** Semitones beyond the guitar's range that the pitch search still covers. */
  rangeMargin: 1,
  yinThreshold: 0.15,
  /**
   * Of YIN's period, twice it and its fractions, the shortest whose mismatch is within
   * max(best × periodRatio, periodFloor) wins. The floor is how much a quieter string ringing
   * underneath may leave unexplained; a real low note's half period leaves about half.
   */
  periodRatio: 1.5,
  periodFloor: 0.25,
  /** Readings below this clarity carry no pitch: a chord, a muted string, noise. */
  clarity: 0.8,
  /** Pitch isn't analysed this many dB below the gate. */
  listenBelowGate: 10,
  /** A pluck: the level rising this many dB above its lowest in the last `onsetFrames` readings. */
  onsetDb: 6,
  onsetFrames: 6,
  refractory: 0.06,
  /** Readings in a row on one semitone that confirm a note, or a move to another. */
  confirmFrames: 3,
  /** Readings a pluck may take to settle on a note before it's given up on. */
  pendingFrames: 30,
  /** Semitones the pitch must move from a note to change it, and how far back the move is dated. */
  moveBy: 0.65,
  moveLag: 0.01,
  /** Clarity a reading needs to move a note without a pluck: a dying or muted string reads noisily. */
  moveClarity: 0.9,
  /** The farthest a move without a pluck goes, in semitones: a pull-off from the 7th fret to open. */
  moveReach: 7,
  /** Nor a move after the level fell this many dB within `dampFrames` readings: a lifted finger. */
  moveFall: 6,
  /** A note ends if its level falls this many dB within `dampFrames` readings, `dampAfter` s in. */
  dampDb: 8,
  dampFrames: 10,
  dampAfter: 0.08,
  /** A pluck peaking this many dB under the loudest of the last `strayWindow` s isn't a note. */
  strayDb: 12,
  strayWindow: 0.3,
  /** A note ends this many dB under the gate, after `releaseFrames` readings there. */
  gateHysteresis: 4,
  releaseFrames: 8,
  notchQ: 30,
  /** Until a setup: the gate, a hard pluck's level, and the input latency if the browser gives none. */
  gateDb: -58,
  loudDb: -14,
  inputLatency: 0.01,
  /** Velocity of the softest note heard. */
  softest: 0.12,
  /** The longest recording of the input, in seconds: about 6 MB at 48 kHz. */
  recordLongest: 60,
};

/** The guided guitar setup (listen/calibrate.ts, ui/setup.ts). */
export const SETUP = {
  /** Finding the guitar: a channel's peak must reach `findFloor` dBFS and rise `findRise` over its quiet. */
  findFloor: -50,
  findRise: 15,
  /** A pluck's sample peak in dBFS: clipping at `clipDb`, loud above `loudDb`, quiet below `quietDb`. */
  clipDb: -1,
  loudDb: -4,
  quietDb: -26,
  /** Good plucks that finish the level step. */
  goodPlucks: 3,
  quietSeconds: 3,
  /** The gate's margin over the quiet level, and its limits. */
  gateMargin: 10,
  gateLowest: -75,
  gateHighest: -40,
  /** A quiet level above this is worth a word about noise. */
  noisyDb: -50,
  /** Hum: harmonics checked, the dB a harmonic must stand over the bins at `humBeside` Hz from it. */
  humHarmonics: 6,
  humProminence: 12,
  humBeside: [-7, -4, 4, 7],
  /** Cents from the note that count as in tune, held for `inTuneHold` seconds. */
  inTuneCents: 6,
  inTuneHold: 0.8,
  /** Timing: count-in clicks, clicks to play along to, and their tempo. */
  countIn: 4,
  clicks: 8,
  bpm: 80,
  /** Seconds a pluck may fall from its click, the delay to expect, and plucks needed. */
  earliest: -0.12,
  latest: 0.35,
  expected: 0.05,
  timingMatches: 5,
  /** Above this delay in seconds, playing through the amp is likely to feel late. */
  laggy: 0.045,
};

export const MIX = {
  piano: 0.8,
  guitar: 0.8,
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
  /** Velocity for every MIDI note when the full-strength setting is on. */
  midiFull: 1,
  /** MIDI note of the layout's C at startup (C4). */
  baseNote: 60,
  lowestBase: 36,
  highestBase: 84,
};

export const POINTER = {
  /** Seconds a hovered key stays hovered after the pointer leaves it, to bridge the gaps. */
  hoverLinger: 0.15,
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
  /** Velocity written to MIDI for the synth parts (pad, drive, bass), which have levels instead. */
  heldVelocity: 0.6,
  droneLevel: 0.09,
  /** Fade time constant, in seconds, when a clicked or held chord replaces the one sounding. */
  swapCut: 0.02,
};

export const CLIPS = {
  /** Seconds of playing kept for clips. */
  memory: 120,
  defaultSeconds: 30,
  choices: [10, 20, 30, 60],
  max: 40,
  /** A recording stops itself after this many seconds; much longer may not fit in storage. */
  longest: 600,
  /** Tempo a clip with no backing is written to MIDI at; its notes keep their own timing. */
  looseBpm: 120,
  /**
   * Notes heard from a guitar shorter than this, in seconds, are left out of a clip: detector slips,
   * not playing. A 32nd note at 180 bpm is 42 ms.
   */
  shortestHeard: 0.04,
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
  minLength: 18.5,
  maxLength: 30,
  margin: 0.4,
  /** Front lip depth (the key's visible thickness); a press shrinks it to `pressedLip`. */
  lipWhite: 0.95,
  lipBlack: 0.8,
  pressedLip: 0.2,
  /** How much a full press darkens the key. */
  pressDim: 0.4,
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

/** The guitar neck (view/neck.ts), in cm like the keyboard. */
export const GUITAR = {
  frets: 22,
  /** The first fret's width; each after is 2^(-taper/12) narrower, where a real neck's taper is 1. */
  firstFret: 3.7,
  taper: 0.45,
  namesWidth: 1.6,
  openWidth: 2.6,
  nutWidth: 0.35,
  wireWidth: 0.13,
  /** Fingerboard past the last fret wire. */
  overhang: 0.6,
  /** String spacing limits; the stage stretches the neck between them. */
  minSpacing: 2.3,
  maxSpacing: 3.6,
  /** The row of fret numbers under the neck. */
  numberRow: 1.3,
  /** Note dots: their share of the string spacing, largest size, and growth when pressed. */
  dotShare: 0.62,
  dotMax: 1.9,
  pressGrow: 0.12,
  /** Gap between a pressed dot's edge and the lean arrow below it, and the arrow's size. */
  markerGap: 0.12,
  arrowSize: 0.42,
  /** A backing note's ring, as an opacity. */
  ghost: 0.5,
  inlaySize: 0.32,
  inlayOpacity: 0.22,
  /** Drawn string thickness, thickest first; the first `wound` strings are wound. */
  gauges: [0.17, 0.15, 0.13, 0.1, 0.08, 0.065],
  wound: 3,
  /** An unplaced note goes nearest the hand, which starts here and moves this share to each note. */
  handStart: 2,
  handFollow: 0.4,
  /** Open strings cost nothing while the hand is at or below this fret. */
  openReach: 3,
};

export const COLOURS = {
  home: '#ffd66b',
  /** Home on ivory: `home` there is 1.2:1, this is 3.1:1. */
  homeOnWhite: '#b37a00',
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
  board: '#3a281c',
  nut: '#e8dfcc',
  fret: '#9b958b',
  wound: '#bba57f',
  plain: '#d9d5cc',
  inlay: '#d9cdb6',
};

export const GLOW = { home: 1, land: 0.85, wander: 0.7, lean: 0.75, out: 0 };

/** Sheet music from clips (clips/score.ts, engrave.ts). Lengths are in beats, sizes in points. */
export const NOTATION = {
  /** Where an onset may snap, coarsest first, each with how far off it (in beats) it may be played. */
  snaps: [
    [1, 0.17],
    [0.5, 0.1],
    [0.25, 0.125],
  ] as const,
  /** Without a backing the tempo is a guess, so nothing finer than eighths. */
  looseSnaps: [
    [1, 0.17],
    [0.5, 0.25],
  ] as const,
  /** Notes struck within this many seconds of each other are one chord. */
  together: 0.04,
  /** The most a clip's typical lateness, in beats, is taken off before snapping. */
  maxLag: 0.15,
  /** A gap up to this long before the next note is closed up, so short playing isn't rests. */
  fillGap: 0.5,
  /** Staff space, A4 page, and margin. */
  space: 6,
  page: [595.28, 841.89] as const,
  margin: 48,
};

/** The first-run tour (ui/tour.ts), in px and seconds. */
export const TOUR = {
  /** Pause after a step's action is done, so its effect is seen before the card moves on. */
  advanceDelay: 0.9,
  /** Spotlight padding round its target, the card's distance from it, and from the window edge. */
  pad: 6,
  gap: 10,
  margin: 10,
};
