import type { Layout } from './input/keys.js';
import type { Style } from './presets/library.js';
import type { Palette } from './theory/guide.js';
import type { MoodId } from './theory/scales.js';
import { CLIPS, MIX, PLAY } from './tuning.js';

export type Mode = 'key' | 'progression';
export type LabelMode = 'name' | 'degree' | 'role' | 'off';

export interface Settings {
  mode: Mode;
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
  why: boolean;
  levels: { piano: number; backing: number; bass: number; click: number };
}

export const DEFAULTS: Settings = {
  mode: 'key',
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
  why: true,
  levels: { piano: MIX.piano, backing: MIX.backing, bass: MIX.bass, click: MIX.click },
};

/** [lowest, highest] MIDI note for each keyboard size. */
export const RANGES: Record<number, [number, number]> = {
  37: [48, 84],
  49: [36, 84],
  61: [36, 96],
  88: [21, 108],
};
