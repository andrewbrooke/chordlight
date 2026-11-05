// A clip, and the JSON file it exports as: what was stored, rounded to 0.1 ms and with nothing
// snapped to the beat.
// Each backing state also carries its chords worked out (`chords`), so a reader needn't parse
// numerals; import ignores them and works them out again from `text`.

import type { Style } from '../presets/library.js';
import { chordName, chordPcs, rootPc } from '../theory/chords.js';
import { numeralLabel, parseProgression } from '../theory/roman.js';
import { MOODS, spellKey } from '../theory/scales.js';
import type { BackingState } from './backing.js';
import type { ClipVoice, NoteEvent } from './extract.js';

export interface Clip {
  id: string;
  created: number;
  duration: number;
  events: NoteEvent[];
  where: string;
  /** The backing's transport states, if it was playing. */
  backing?: BackingState[];
}

export const CLIP_FORMAT = 'chordlight-clip';
export const CLIP_VERSION = 1;

const VOICES: readonly ClipVoice[] = ['piano', 'pad', 'guitar'];
const STYLES: readonly Style[] = ['pad', 'piano', 'arp', 'drive'];

export function clipToJson(clip: Clip): string {
  const { id: _, duration, events, backing, ...rest } = clip;
  const file = {
    format: CLIP_FORMAT,
    version: CLIP_VERSION,
    ...rest,
    duration: round(duration),
    events: events.map((e) => ({ ...e, t: round(e.t) })),
    ...(backing
      ? {
          backing: backing.map((s) => ({
            ...s,
            t: round(s.t),
            beat: round(s.beat),
            chords: chordsOf(s),
          })),
        }
      : {}),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Times and beats to four places (0.1 ms at most): the audio clock moves in 128-sample steps, so
 * the digits past that are subtraction noise, not timing.
 */
const round = (n: number): number => Math.round(n * 1e4) / 1e4;

function chordsOf(s: BackingState) {
  const key = spellKey({ home: s.home, mood: s.mood });
  const parsed = parseProgression(s.text, key);
  if (!parsed.ok) return [];
  return parsed.steps.map(({ chord, beats }) => ({
    numeral: numeralLabel(chord, key),
    name: chordName(chord),
    beats,
    root: rootPc(chord),
    pcs: chordPcs(chord),
  }));
}

/** null unless the text is a clip file this version can read. */
export function clipFromJson(text: string, id: string): Clip | null {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(file) || file['format'] !== CLIP_FORMAT) return null;
  const version = file['version'];
  if (typeof version !== 'number' || version > CLIP_VERSION) return null;
  const { duration, where, created, events, backing } = file;
  if (!isNumber(duration) || duration <= 0 || typeof where !== 'string') return null;
  if (!Array.isArray(events) || !events.every(isEvent)) return null;
  if (backing !== undefined && !(Array.isArray(backing) && backing.every(isState))) return null;
  return {
    id,
    created: isNumber(created) ? created : Date.now(),
    duration,
    events: events.map(({ t, on, midi, vel, voice }) => ({ t, on, midi, vel, voice })),
    where,
    ...(backing ? { backing: backing.map(stateOf) } : {}),
  };
}

function stateOf(s: BackingState): BackingState {
  const { t, playing, beat, bpm, text, home, mood, style, bass } = s;
  return { t, playing, beat, bpm, text, home, mood, style, bass };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isEvent(v: unknown): v is NoteEvent {
  if (!isRecord(v)) return false;
  const { t, on, midi, vel, voice } = v;
  return (
    isNumber(t) &&
    t >= 0 &&
    typeof on === 'boolean' &&
    Number.isInteger(midi) &&
    (midi as number) >= 0 &&
    (midi as number) <= 127 &&
    isNumber(vel) &&
    vel >= 0 &&
    vel <= 1 &&
    VOICES.includes(voice as ClipVoice)
  );
}

function isState(v: unknown): v is BackingState {
  if (!isRecord(v)) return false;
  const { t, playing, beat, bpm, text, home, mood, style, bass } = v;
  return (
    isNumber(t) &&
    t >= 0 &&
    typeof playing === 'boolean' &&
    isNumber(beat) &&
    isNumber(bpm) &&
    bpm > 0 &&
    typeof text === 'string' &&
    Number.isInteger(home) &&
    (home as number) >= 0 &&
    (home as number) < 12 &&
    MOODS.some((m) => m.id === mood) &&
    STYLES.includes(style as Style) &&
    typeof bass === 'boolean'
  );
}
