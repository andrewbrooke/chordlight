// Picks the scale whose notes are lit over a chord. A chord inside the key uses the key's scale.
// Otherwise every transposition of the major, harmonic minor and melodic minor scales containing
// the chord is a candidate, and the one sharing the most notes with the key wins. The two minor
// families pay a 1.5-note penalty; ties go to the nearer scale on the circle of fifths.
//
// Candidates containing the chord's other third are rejected: by shared notes alone, the iv chord
// in a major key (Cm in G) would get an E natural against its E♭.

import { type Chord, chordPcs, rootPc, thirdOf } from './chords.js';
import { type Spelling, nameOf, pcOf, simplify } from './pitch.js';
import { MAJOR, type MoodId, type SpelledKey, type SpelledScale, spellScale } from './scales.js';

const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const MELODIC_MINOR = [0, 2, 3, 5, 7, 9, 11];
const EXOTIC_COST = 1.5;

const MODE_NAMES = ['major', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'minor', 'Locrian'];
/** Mode number of each mood within its relative major (Dorian is 1). */
const MODE_INDEX: Record<MoodId, number> = {
  major: 0,
  dorian: 1,
  phrygian: 2,
  lydian: 3,
  mixolydian: 4,
  minor: 5,
};

export interface Fit {
  scale: SpelledScale;
  name: string;
  inKey: boolean;
  /** Key notes this scale alters, e.g. G → G♯. */
  changes: { from: Spelling; to: Spelling }[];
}

interface Candidate {
  family: 'major' | 'harmonic' | 'melodic';
  tonic: number;
  steps: readonly number[];
  has: boolean[];
}

const CANDIDATES: Candidate[] = (
  [
    ['major', MAJOR],
    ['harmonic', HARMONIC_MINOR],
    ['melodic', MELODIC_MINOR],
  ] as const
).flatMap(([family, steps]) =>
  Array.from({ length: 12 }, (_, tonic) => {
    const has = Array<boolean>(12).fill(false);
    for (const s of steps) has[pcOf(tonic + s)] = true;
    return { family, tonic, steps, has };
  }),
);

/** Circle-of-fifths position of the scale's relative major. */
function fifthsOf(family: Candidate['family'], tonic: number): number {
  return pcOf((family === 'major' ? tonic : tonic + 3) * 7);
}

export function fitScale(key: SpelledKey, chord: Chord): Fit {
  const pcs = chordPcs(chord);
  if (pcs.every((p) => key.has[p])) return { scale: key, name: key.name, inKey: true, changes: [] };

  const root = rootPc(chord);
  const third = thirdOf(chord);
  const other = third === 'major' ? pcOf(root + 3) : third === 'minor' ? pcOf(root + 4) : -1;
  const keyFifths = fifthsOf('major', key.key.home - MAJOR[MODE_INDEX[key.mood.id]]!);

  let best: Candidate | null = null;
  let bestScore = -Infinity;
  let bestDistance = Infinity;
  for (const c of CANDIDATES) {
    if (!pcs.every((p) => c.has[p]) || (other >= 0 && c.has[other])) continue;
    const shared = key.pcs.filter((p) => c.has[p]).length;
    const score = shared - (c.family === 'major' ? 0 : EXOTIC_COST);
    const gap = Math.abs(fifthsOf(c.family, c.tonic) - keyFifths);
    const distance = Math.min(gap, 12 - gap);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = c;
      bestScore = score;
      bestDistance = distance;
    }
  }
  if (!best) return { scale: key, name: key.name, inKey: false, changes: [] };

  const scale = spellScale(best.tonic, best.steps, best.family === 'major');
  return {
    scale,
    name: nameFor(best, scale, root, chord),
    inKey: false,
    changes: diff(key, scale),
  };
}

function nameFor(c: Candidate, scale: SpelledScale, root: number, chord: Chord): string {
  if (c.family !== 'major') {
    return `${nameOf(scale.home)} ${c.family === 'harmonic' ? 'harmonic' : 'melodic'} minor`;
  }
  const degree = scale.pcs.indexOf(root);
  return `${nameOf(simplify(chord.root))} ${MODE_NAMES[degree]}`;
}

/** An altered note keeps its letter (A → A♭); both scales use all seven letters. */
function diff(key: SpelledKey, scale: SpelledScale): Fit['changes'] {
  return key.notes
    .filter((_, i) => !scale.has[key.pcs[i]!])
    .map((from) => ({ from, to: scale.notes.find((n) => n.letter === from.letter)! }));
}
