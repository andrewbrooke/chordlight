import { type Chord, chordPcs, type QualityId, rootPc } from './chords.js';
import { pcOf } from './pitch.js';
import { parseRoman } from './roman.js';
import type { SpelledKey } from './scales.js';

const TRIADS: Record<string, QualityId> = { '4,7': 'maj', '3,7': 'm', '3,6': 'dim', '4,8': 'aug' };

export function diatonicChords(key: SpelledKey): Chord[] {
  return key.pcs.map((pc, i) => {
    const third = pcOf(key.pcs[(i + 2) % 7]! - pc);
    const fifth = pcOf(key.pcs[(i + 4) % 7]! - pc);
    return { root: key.notes[i]!, quality: TRIADS[`${third},${fifth}`] ?? 'maj' };
  });
}

export function diatonicSevenths(key: SpelledKey): Chord[] {
  const SEVENTHS: Record<string, QualityId> = {
    '4,7,11': 'maj7',
    '4,7,10': '7',
    '3,7,10': 'm7',
    '3,6,10': 'm7b5',
    '3,7,11': 'mmaj7',
    '3,6,9': 'dim7',
  };
  return key.pcs.map((pc, i) => {
    const ivs = [2, 4, 6].map((k) => pcOf(key.pcs[(i + k) % 7]! - pc)).join(',');
    return { root: key.notes[i]!, quality: SEVENTHS[ivs] ?? 'maj7' };
  });
}

/** Common borrowed chords, as numerals so they work in any key. */
export const BORROWED = ['bIII', 'bVI', 'bVII', 'iv', 'II', 'III', 'V', 'V7', 'bII'];

export function borrowedChords(key: SpelledKey): Chord[] {
  return BORROWED.map((t) => parseRoman(t, key)?.chord).filter((c): c is Chord => c !== undefined);
}

export type Job = 'home' | 'away' | 'tension' | 'borrowed';

/** I, iii and vi rest; ii and IV move away; V and vii° pull home. */
export function jobOf(chord: Chord, key: SpelledKey): Job {
  if (!chordPcs(chord).every((pc) => key.has[pc])) return 'borrowed';
  const degree = key.pcs.indexOf(rootPc(chord));
  return (
    (['home', 'away', 'home', 'away', 'tension', 'home', 'tension'] as const)[degree] ?? 'borrowed'
  );
}
