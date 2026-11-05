// What could come after a chord: the key's chords ranked by how the root moves to them, then the
// borrowed chords songs reach for at that point.
//
// Root movement rather than a table of degrees, so it explains any chord, borrowed or typed, in any
// key and mood, in terms a learner can carry to the next song: a root falling a fifth is the
// strongest pull, a third keeps two notes, a step is a plain move. Rising a fifth (V→ii) is left
// out unless it leaves home or arrives there: it mostly sounds like going backwards. Diminished
// chords are never suggested; they are passing chords, and the tryer has them.

import { type Chord, chordPcs, rootPc } from './chords.js';
import { diatonicChords, jobOf } from './diatonic.js';
import { pcOf } from './pitch.js';
import { parseRoman } from './roman.js';
import type { SpelledKey } from './scales.js';

export type Pull = 'strong' | 'smooth' | 'step' | 'colour';

/** In the order they are listed within a pull. */
export const REASONS = [
  'settles',
  'resolves',
  'fullStop',
  'fifth',
  'amen',
  'toV',
  'setsOut',
  'thirdDown',
  'thirdUp',
  'fakeOut',
  'stepUp',
  'stepDown',
  'home',
  'bVII',
  'iv',
  'bVI',
  'V',
  'II',
  'III',
  'bIII',
  'bII',
] as const;

export type Reason = (typeof REASONS)[number];

export interface Next {
  chord: Chord;
  pull: Pull;
  reason: Reason;
}

export const PULLS: readonly Pull[] = ['strong', 'smooth', 'step', 'colour'];

/**
 * Borrowed chords by how often songs use them, each with the roots (semitones above home) it
 * usually follows, and for a secondary dominant the root it points at, which must be in the key.
 */
const IDIOMS: { numeral: string; reason: Reason; after: number[]; points?: number }[] = [
  { numeral: 'bVII', reason: 'bVII', after: [0, 5, 8] },
  { numeral: 'iv', reason: 'iv', after: [0, 5] },
  { numeral: 'bVI', reason: 'bVI', after: [0, 5, 7] },
  { numeral: 'V', reason: 'V', after: [0, 2, 5, 8] },
  { numeral: 'II', reason: 'II', after: [0, 9], points: 7 },
  { numeral: 'III', reason: 'III', after: [0], points: 9 },
  { numeral: 'bIII', reason: 'bIII', after: [0, 10] },
  { numeral: 'bII', reason: 'bII', after: [0, 5] },
];

/** At most this many borrowed chords, so the key's own stay the main answer. */
const COLOURS = 3;

export function nextChords(after: Chord, key: SpelledKey): Next[] {
  const home = key.key.home;
  const from = rootPc(after);
  const out: Next[] = [];

  for (const chord of diatonicChords(key).filter((c) => c.quality !== 'dim')) {
    const move = moveTo(after, chord, home);
    if (move) out.push({ chord, ...move });
  }

  const since = pcOf(from - home);
  let colours = 0;
  for (const b of IDIOMS) {
    if (colours === COLOURS) break;
    const chord = parseRoman(b.numeral, key)?.chord;
    if (!chord || jobOf(chord, key) !== 'borrowed') continue;
    if (rootPc(chord) === from && chord.quality === after.quality) continue;
    if (!b.after.includes(since)) continue;
    if (b.points !== undefined && !key.pcs.includes(pcOf(home + b.points))) continue;
    out.push({ chord, pull: 'colour', reason: b.reason });
    colours++;
  }

  const rank = (n: Next) => PULLS.indexOf(n.pull) * 100 + REASONS.indexOf(n.reason);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** How the root moves from one chord to the next, if it is a move worth suggesting. */
function moveTo(after: Chord, to: Chord, home: number): Omit<Next, 'chord'> | null {
  const from = rootPc(after);
  const i = pcOf(rootPc(to) - from);
  const toHome = rootPc(to) === home;
  const q = after.quality;

  if (i === 0) {
    return q === 'sus2' || q === 'sus4' || q === '7sus4'
      ? { pull: 'strong', reason: 'settles' }
      : null;
  }
  if ((q === 'dim' || q === 'dim7' || q === 'm7b5') && i === 1) {
    return { pull: 'strong', reason: 'resolves' };
  }
  if (i === 5) return { pull: 'strong', reason: toHome ? 'fullStop' : 'fifth' };
  if (i === 7 && toHome) return { pull: 'strong', reason: 'amen' };
  if (i === 2 && rootPc(to) === pcOf(home + 7)) return { pull: 'strong', reason: 'toV' };
  if (i === 7 && from === home) return { pull: 'strong', reason: 'setsOut' };

  const shared = chordPcs(to).filter((pc) => chordPcs(after).includes(pc)).length;
  if (shared >= 2 && (i === 8 || i === 9)) return { pull: 'smooth', reason: 'thirdDown' };
  if (shared >= 2 && (i === 3 || i === 4)) return { pull: 'smooth', reason: 'thirdUp' };

  if (pcOf(from - home) === 7 && pcOf(rootPc(to) - home) === 9) {
    return { pull: 'step', reason: 'fakeOut' };
  }
  // Roots on one letter (♭VI and vi) are the same degree bent, not a step: the change smears.
  const bent = to.root.letter === after.root.letter;
  if (!bent && (i === 1 || i === 2)) return { pull: 'step', reason: 'stepUp' };
  if (!bent && (i === 10 || i === 11)) return { pull: 'step', reason: 'stepDown' };
  if (toHome) return { pull: 'step', reason: 'home' };
  return null;
}
