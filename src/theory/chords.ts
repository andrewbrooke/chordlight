// Chord qualities, and chords as a spelled root plus a quality. QUALITIES is ordered simplest
// first; detect.ts uses that order to break ties.

import { type Spelling, nameOf, pcOf, pcOfSpelling, simplify, spellOnLetter } from './pitch.js';

export type QualityId =
  | 'maj'
  | 'm'
  | '5'
  | 'dim'
  | 'aug'
  | 'sus4'
  | 'sus2'
  | '7'
  | 'maj7'
  | 'm7'
  | '6'
  | 'm6'
  | 'm7b5'
  | 'dim7'
  | 'add9'
  | 'madd9'
  | '7sus4'
  | 'mmaj7'
  | '9'
  | 'maj9'
  | 'm9';

export interface Tone {
  iv: number;
  /** Label over the chord: R, 3, ♭7. */
  deg: string;
  /** Letter distance from the root, used for spelling. */
  step: number;
}

export interface Quality {
  id: QualityId;
  suffix: string;
  tones: Tone[];
  words: string;
}

const R: Tone = { iv: 0, deg: 'R', step: 0 };
const M3: Tone = { iv: 4, deg: '3', step: 2 };
const m3: Tone = { iv: 3, deg: '♭3', step: 2 };
const P5: Tone = { iv: 7, deg: '5', step: 4 };
const d5: Tone = { iv: 6, deg: '♭5', step: 4 };
const A5: Tone = { iv: 8, deg: '♯5', step: 4 };
const m7: Tone = { iv: 10, deg: '♭7', step: 6 };
const M7: Tone = { iv: 11, deg: '7', step: 6 };
const d7: Tone = { iv: 9, deg: '°7', step: 6 };
const M6: Tone = { iv: 9, deg: '6', step: 5 };
const M2: Tone = { iv: 2, deg: '2', step: 1 };
const M9: Tone = { iv: 2, deg: '9', step: 1 };
const P4: Tone = { iv: 5, deg: '4', step: 3 };

export const QUALITIES: readonly Quality[] = [
  { id: 'maj', suffix: '', tones: [R, M3, P5], words: 'major: bright' },
  { id: 'm', suffix: 'm', tones: [R, m3, P5], words: 'minor: dark' },
  { id: '5', suffix: '5', tones: [R, P5], words: 'a power chord: no third, neither happy nor sad' },
  { id: 'dim', suffix: '°', tones: [R, m3, d5], words: 'diminished: tense, unstable' },
  { id: 'aug', suffix: '+', tones: [R, M3, A5], words: 'augmented: stretched, unresolved' },
  { id: 'sus4', suffix: 'sus4', tones: [R, P4, P5], words: 'suspended: the third held back' },
  { id: 'sus2', suffix: 'sus2', tones: [R, M2, P5], words: 'suspended: open, airy' },
  { id: '7', suffix: '7', tones: [R, M3, P5, m7], words: 'dominant seventh: wants to move on' },
  { id: 'maj7', suffix: 'maj7', tones: [R, M3, P5, M7], words: 'major seventh: dreamy, soft' },
  { id: 'm7', suffix: 'm7', tones: [R, m3, P5, m7], words: 'minor seventh: smooth, mellow' },
  { id: '6', suffix: '6', tones: [R, M3, P5, M6], words: 'sixth: sweet, old-fashioned' },
  { id: 'm6', suffix: 'm6', tones: [R, m3, P5, M6], words: 'minor sixth: dark but warm' },
  { id: 'm7b5', suffix: 'm7♭5', tones: [R, m3, d5, m7], words: 'half-diminished: moody' },
  { id: 'dim7', suffix: '°7', tones: [R, m3, d5, d7], words: 'diminished seventh: suspense' },
  { id: 'add9', suffix: 'add9', tones: [R, M3, P5, M9], words: 'major with a ninth: shimmering' },
  { id: 'madd9', suffix: 'm(add9)', tones: [R, m3, P5, M9], words: 'minor with a ninth: aching' },
  { id: '7sus4', suffix: '7sus4', tones: [R, P4, P5, m7], words: 'suspended seventh: floating' },
  {
    id: 'mmaj7',
    suffix: 'm(maj7)',
    tones: [R, m3, P5, M7],
    words: 'minor-major seventh: spy-film',
  },
  { id: '9', suffix: '9', tones: [R, M3, P5, m7, M9], words: 'ninth: funky, rich' },
  { id: 'maj9', suffix: 'maj9', tones: [R, M3, P5, M7, M9], words: 'major ninth: lush' },
  { id: 'm9', suffix: 'm9', tones: [R, m3, P5, m7, M9], words: 'minor ninth: lush and dark' },
];

export const qualityOf = (id: QualityId): Quality => QUALITIES.find((q) => q.id === id)!;

export interface Chord {
  root: Spelling;
  quality: QualityId;
  /** Slash-chord bass, when it is not the root. */
  bass?: Spelling | undefined;
}

export function rootPc(c: Chord): number {
  return pcOfSpelling(c.root);
}

export function chordPcs(c: Chord): number[] {
  const r = rootPc(c);
  return qualityOf(c.quality).tones.map((t) => pcOf(r + t.iv));
}

export function chordHas(c: Chord): boolean[] {
  const pcs = chordPcs(c);
  return Array.from({ length: 12 }, (_, pc) => pcs.includes(pc));
}

/** Voiced notes named with their octaves, spelled as the chord spells them: G3 B3 D4 F♯4. */
export function voicedNames(c: Chord, notes: readonly number[]): string[] {
  const pcs = chordPcs(c);
  const names = chordSpellings(c);
  return notes.map((m) => {
    const s = names[pcs.indexOf(pcOf(m))]!;
    // By letter, so B♯3 is the C4 key and C♭4 the B3 one.
    return nameOf(s) + (Math.floor((m - s.acc) / 12) - 1);
  });
}

/** Spelled by letter from the root; a double-accidental root is respelled first (B𝄫 → A C♯ E). */
export function chordSpellings(c: Chord): Spelling[] {
  const root = simplify(c.root);
  const r = rootPc(c);
  return qualityOf(c.quality).tones.map((t) =>
    simplify(spellOnLetter(pcOf(r + t.iv), root.letter + t.step)),
  );
}

export function chordName(c: Chord): string {
  const base = nameOf(simplify(c.root)) + qualityOf(c.quality).suffix;
  return c.bass ? `${base}/${nameOf(simplify(c.bass))}` : base;
}

/** null for chords with no third (power chords, sus). */
export function thirdOf(c: Chord): 'major' | 'minor' | null {
  const tones = qualityOf(c.quality).tones;
  if (tones.some((t) => t.iv === 4 && t.step === 2)) return 'major';
  if (tones.some((t) => t.iv === 3 && t.step === 2)) return 'minor';
  return null;
}

export function chordDegrees(c: Chord): Map<number, string> {
  const r = rootPc(c);
  return new Map(qualityOf(c.quality).tones.map((t) => [pcOf(r + t.iv), t.deg]));
}

/** Labels for non-chord notes, by semitones above the root. */
export const TENSION_LABELS = ['R', '♭9', '9', '♯9', '3', '11', '♯11', '5', '♭13', '13', '♭7', '7'];
