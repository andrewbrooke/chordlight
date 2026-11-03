// Moods (six modes of the major scale) and key spelling.
//
// Moods run brightest to darkest, each lowering one note of the one before. A key's home is spelled
// on the letter that needs the fewest accidentals without doubles; six-accidental ties go sharp for
// moods with a major third and flat for the rest (F♯ major, E♭ minor).

import { type Spelling, accFor, nameOf, pcOf, spellOnLetter } from './pitch.js';

export type MoodId = 'lydian' | 'major' | 'mixolydian' | 'dorian' | 'minor' | 'phrygian';

export interface Mood {
  id: MoodId;
  name: string;
  feel: string;
  steps: readonly number[];
  /** Has a major third: uses the major pentatonic, and ties spell sharp. */
  bright: boolean;
  /** Index of the mode's characteristic note; null for major and minor. */
  moodDegree: number | null;
}

export const MOODS: readonly Mood[] = [
  {
    id: 'lydian',
    name: 'Lydian',
    feel: 'floating, dreamy',
    steps: [0, 2, 4, 6, 7, 9, 11],
    bright: true,
    moodDegree: 3,
  },
  {
    id: 'major',
    name: 'major',
    feel: 'happy, settled',
    steps: [0, 2, 4, 5, 7, 9, 11],
    bright: true,
    moodDegree: null,
  },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    feel: 'easy rock, laid back',
    steps: [0, 2, 4, 5, 7, 9, 10],
    bright: true,
    moodDegree: 6,
  },
  {
    id: 'dorian',
    name: 'Dorian',
    feel: 'cool minor, soulful',
    steps: [0, 2, 3, 5, 7, 9, 10],
    bright: false,
    moodDegree: 5,
  },
  {
    id: 'minor',
    name: 'minor',
    feel: 'sad, epic',
    steps: [0, 2, 3, 5, 7, 8, 10],
    bright: false,
    moodDegree: null,
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    feel: 'dark, Spanish',
    steps: [0, 1, 3, 5, 7, 8, 10],
    bright: false,
    moodDegree: 1,
  },
];

export const moodOf = (id: MoodId): Mood => MOODS.find((m) => m.id === id)!;

/** Numerals and degree labels count on this, whatever the mood. */
export const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;

export interface SpelledScale {
  home: Spelling;
  notes: Spelling[];
  pcs: number[];
  has: boolean[];
  /** +1 if the scale is written with sharps, -1 with flats, 0 with neither. */
  direction: number;
}

export function spellScale(
  homePc: number,
  steps: readonly number[],
  bright: boolean,
): SpelledScale {
  let best: SpelledScale | null = null;
  let bestCost = Infinity;
  for (let letter = 0; letter < 7; letter++) {
    if (Math.abs(accFor(letter, homePc)) > 1) continue;
    const notes = steps.map((s, i) => spellOnLetter(pcOf(homePc + s), letter + i));
    const doubles = notes.filter((n) => Math.abs(n.acc) > 1).length;
    const sum = notes.reduce((a, n) => a + n.acc, 0);
    const cost =
      doubles * 100 + notes.reduce((a, n) => a + Math.abs(n.acc), 0) + tieBreak(sum, bright);
    if (cost < bestCost) {
      bestCost = cost;
      const pcs = steps.map((s) => pcOf(homePc + s));
      const has = Array.from({ length: 12 }, (_, pc) => pcs.includes(pc));
      best = { home: notes[0]!, notes, pcs, has, direction: Math.sign(sum) };
    }
  }
  return best!;
}

/** Half a point: only ever decides an exact tie. */
function tieBreak(sum: number, bright: boolean): number {
  if (sum === 0) return 0;
  return sum > 0 === bright ? 0 : 0.5;
}

export interface Key {
  home: number;
  mood: MoodId;
}

export interface SpelledKey extends SpelledScale {
  key: Key;
  mood: Mood;
  name: string;
}

const keys = new Map<string, SpelledKey>();

export function spellKey(key: Key): SpelledKey {
  const id = `${key.home}:${key.mood}`;
  let k = keys.get(id);
  if (!k) {
    const mood = moodOf(key.mood);
    const scale = spellScale(key.home, mood.steps, mood.bright);
    k = { ...scale, key, mood, name: `${nameOf(scale.home)} ${mood.name}` };
    keys.set(id, k);
  }
  return k;
}

// Out-of-key black keys, spelled to match the key's accidentals.
const SHARPS = [1, 3, 6, 8, 10].map((pc) => ({ pc, s: spellOnLetter(pc, letterBelow(pc)) }));
const FLATS = [1, 3, 6, 8, 10].map((pc) => ({ pc, s: spellOnLetter(pc, letterBelow(pc) + 1) }));
/** For keys with no accidentals: the usual C major spellings. */
const PLAIN: Record<number, number> = { 1: 1, 3: -1, 6: 1, 8: -1, 10: -1 };

function letterBelow(pc: number): number {
  return [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc]!;
}

export function spellIn(pc: number, scale: SpelledScale): Spelling {
  const i = scale.pcs.indexOf(pc);
  if (i >= 0) return scale.notes[i]!;
  const natural = [0, 2, 4, 5, 7, 9, 11].indexOf(pc);
  if (natural >= 0) return { letter: natural, acc: 0 };
  const sharp = scale.direction > 0 || (scale.direction === 0 && PLAIN[pc] === 1);
  return (sharp ? SHARPS : FLATS).find((e) => e.pc === pc)!.s;
}

/** Relative to the major scale of home, like the numerals: Dorian reads 1 2 ♭3 4 5 6 ♭7. */
export const DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];

export function degreeLabel(pc: number, key: SpelledKey): string {
  return DEGREE_LABELS[pcOf(pc - key.key.home)]!;
}
