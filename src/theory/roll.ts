// A random progression that makes sense in the key: it starts on one of the chords that rest at
// home, each chord after is one "what comes next" suggests (theory/next.ts), no chord comes twice,
// at most one is borrowed, and the last leads back to the first, since progressions loop.
//
// Every path that keeps those rules is listed and one is drawn, weighted by its moves (stronger
// ones likelier). A walk that picked one chord at a time painted itself into corners: after a
// borrowed ♭VI, say, with nothing fresh left to go to. A key has a few hundred such paths.

import { ROLL } from '../tuning.js';
import { type Chord, chordName } from './chords.js';
import { diatonicChords } from './diatonic.js';
import { type Next, nextChords } from './next.js';
import type { Step } from './roman.js';
import type { SpelledKey } from './scales.js';

interface Path {
  chords: Chord[];
  weight: number;
}

export function rollProgression(key: SpelledKey, random: () => number): Step[] {
  const known = new Map<string, Next[]>();
  const after = (c: Chord): Next[] => {
    const name = chordName(c);
    if (!known.has(name)) known.set(name, nextChords(c, key));
    return known.get(name)!;
  };

  const paths: Path[] = [];
  const walk = (chords: Chord[], weight: number, colours: number): void => {
    if (chords.length === ROLL.length) {
      paths.push({ chords, weight });
      return;
    }
    for (const n of after(chords.at(-1)!)) {
      const borrowed = colours + (n.pull === 'colour' ? 1 : 0);
      if (borrowed > ROLL.colours || chords.some((c) => same(c, n.chord))) continue;
      walk([...chords, n.chord], weight * ROLL.pulls[n.pull], borrowed);
    }
  };
  diatonicChords(key).forEach((chord, degree) => {
    const weight = ROLL.start[degree] ?? 0;
    if (weight > 0 && chord.quality !== 'dim') walk([chord], weight, 0);
  });

  const looping = paths.filter((p) =>
    after(p.chords.at(-1)!).some((n) => same(n.chord, p.chords[0]!)),
  );
  const choice = pick(looping.length > 0 ? looping : paths, random);
  return (choice?.chords ?? [diatonicChords(key)[0]!]).map((chord) => ({ chord, beats: 4 }));
}

function same(a: Chord, b: Chord): boolean {
  return chordName(a) === chordName(b);
}

function pick(paths: readonly Path[], random: () => number): Path | null {
  const total = paths.reduce((sum, p) => sum + p.weight, 0);
  let at = random() * total;
  for (const p of paths) {
    at -= p.weight;
    if (at < 0) return p;
  }
  return paths.at(-1) ?? null;
}
