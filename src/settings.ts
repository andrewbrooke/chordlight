import { type AmpSettings, FLAT } from './audio/amp-model.js';
import type { Layout } from './input/keys.js';
import type { Binding } from './input/midi.js';
import type { Style } from './presets/library.js';
import { STANDARD } from './presets/tunings.js';
import type { Palette } from './theory/guide.js';
import type { MoodId } from './theory/scales.js';
import { CLIPS, MIX, PLAY } from './tuning.js';

export type Mode = 'key' | 'progression';
export type Instrument = 'piano' | 'guitar';
export type LabelMode = 'name' | 'degree' | 'role' | 'off';
/** What a board button can be learned for. */
export type MidiButton = 'record' | 'clip' | 'play' | 'pause';
export const MIDI_BUTTONS: readonly MidiButton[] = ['record', 'clip', 'play', 'pause'];

export interface Settings {
  mode: Mode;
  instrument: Instrument;
  /** The guitar's open strings as MIDI notes, thickest first. */
  tuning: number[];
  /** Listen to the guitar input whenever guitar mode starts, on this device ('' for the default). */
  guitarOn: boolean;
  guitarDevice: string;
  amp: AmpSettings;
  home: number;
  mood: MoodId;
  /** Library preset id, `mine:<name>`, or '' after editing. */
  preset: string;
  /** Stored as numerals so changing home transposes it. */
  text: string;
  palette: Palette | null;
  bpm: number;
  style: Style;
  bass: boolean;
  click: boolean;
  countIn: boolean;
  labels: LabelMode;
  caps: boolean;
  keyLayout: Layout;
  base: number;
  range: number;
  hints: boolean;
  ghosts: boolean;
  /** Beats before a chord change that the next chord's notes are marked. */
  lookAhead: number;
  clipSeconds: number;
  /** Play a clip's recorded backing along with it. */
  clipBacking: boolean;
  pedalReversed: boolean;
  /** MIDI notes ignore how hard the key was struck. */
  midiFull: boolean;
  midiButtons: Partial<Record<MidiButton, Binding>>;
  why: boolean;
  levels: { piano: number; guitar: number; backing: number; bass: number; click: number };
}

export const DEFAULTS: Settings = {
  mode: 'key',
  instrument: 'piano',
  tuning: [...STANDARD],
  guitarOn: false,
  guitarDevice: '',
  // Off until the setup asks: a microphone picked by mistake would feed back through speakers.
  amp: { monitor: false, sound: 'clean', ...FLAT },
  home: 0,
  mood: 'major',
  preset: 'four-chords',
  text: 'I V vi IV',
  palette: null,
  bpm: 92,
  style: 'piano',
  bass: true,
  click: false,
  countIn: true,
  labels: 'name',
  caps: true,
  keyLayout: 'key',
  base: PLAY.baseNote,
  range: 49,
  hints: true,
  ghosts: true,
  lookAhead: 1,
  clipSeconds: CLIPS.defaultSeconds,
  clipBacking: true,
  pedalReversed: false,
  midiFull: false,
  midiButtons: {},
  why: true,
  levels: {
    piano: MIX.piano,
    guitar: MIX.guitar,
    backing: MIX.backing,
    bass: MIX.bass,
    click: MIX.click,
  },
};

/** [lowest, highest] MIDI note for each keyboard size. */
export const RANGES: Record<number, [number, number]> = {
  37: [48, 84],
  49: [36, 84],
  61: [36, 96],
  88: [21, 108],
};
