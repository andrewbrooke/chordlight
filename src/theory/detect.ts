// Names a set of held notes. Every held pitch class is tried as the root; qualities of four or more
// notes may omit the fifth. Preference order: a complete match, the lowest note as root, a root in
// the key, the simpler quality. Completeness comes first or E♭ G C reads as E♭6 (no fifth)
// instead of Cm/E♭.

import { type Chord, QUALITIES, type QualityId } from './chords.js';
import { pcOf, spellOnLetter } from './pitch.js';
import { type SpelledScale, spellIn } from './scales.js';

export type Heard =
  | { kind: 'none' }
  | { kind: 'note'; pc: number }
  | { kind: 'interval'; low: number; high: number; semis: number }
  | { kind: 'chord'; chord: Chord }
  | { kind: 'unknown'; pcs: number[] };

export function detect(midis: readonly number[], key: SpelledScale): Heard {
  if (midis.length === 0) return { kind: 'none' };
  const sorted = [...midis].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map(pcOf))];
  const bass = pcOf(sorted[0]!);
  if (pcs.length === 1) return { kind: 'note', pc: pcs[0]! };
  if (pcs.length === 2) {
    const high = pcs.find((p) => p !== bass)!;
    if (pcOf(high - bass) !== 7) {
      return { kind: 'interval', low: bass, high, semis: pcOf(high - bass) };
    }
  }

  let best: { root: number; q: QualityId; score: number } | null = null;
  for (const root of pcs) {
    const ivs = new Set(pcs.map((p) => pcOf(p - root)));
    QUALITIES.forEach((q, rank) => {
      const want = new Set(q.tones.map((t) => t.iv));
      const exact = sameSet(ivs, want);
      const noFifth =
        !exact && q.tones.length >= 4 && want.has(7) && sameSet(ivs, without(want, 7));
      if (!exact && !noFifth) return;
      const score =
        (exact ? 1000 : 0) + (root === bass ? 100 : 0) + (key.has[root] ? 10 : 0) - rank * 0.1;
      if (!best || score > best.score) best = { root, q: q.id, score };
    });
  }
  if (!best) return { kind: 'unknown', pcs };
  const { root, q } = best as { root: number; q: QualityId };
  const rootSpelling = spellIn(root, key);
  const chord: Chord = { root: rootSpelling, quality: q };
  if (bass !== root) {
    const quality = QUALITIES.find((x) => x.id === q)!;
    const tone = quality.tones.find((t) => pcOf(root + t.iv) === bass);
    chord.bass = tone ? spellOnLetter(bass, rootSpelling.letter + tone.step) : spellIn(bass, key);
  }
  return { kind: 'chord', chord };
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function without(s: Set<number>, x: number): Set<number> {
  const out = new Set(s);
  out.delete(x);
  return out;
}

export const INTERVAL_NAMES = [
  'unison',
  'a half step',
  'a whole step',
  'a minor third',
  'a major third',
  'a fourth',
  'a tritone',
  'a fifth',
  'a minor sixth',
  'a major sixth',
  'a minor seventh',
  'a major seventh',
];
