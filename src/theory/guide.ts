// Classifies each of the twelve pitch classes for writing a melody:
//
//   home    the key's tonic, or the sounding chord's root
//   land    the key's 3rd and 5th, or the chord's other notes
//   wander  the other pentatonic notes, or scale notes that colour the chord
//   lean    the key's two half-step notes, or a scale note a half step above a chord note
//           (the jazz "avoid note" rule)
//   out     everything else
//
// With no chord, the key's 7th leans up to the tonic; over the I chord the same note is a colour.

import {
  type Chord,
  chordDegrees,
  chordHas,
  chordPcs,
  chordSpellings,
  rootPc,
  TENSION_LABELS,
} from './chords.js';
import { fitScale, type Fit } from './fit.js';
import { type Spelling, nameOf, pcOf } from './pitch.js';
import { degreeLabel, type SpelledKey, spellIn } from './scales.js';

export type Light = 'home' | 'land' | 'wander' | 'lean' | 'out';

export type Palette = 'blues';

export interface Lights {
  light: Light[];
  /** -1 or +1 if a lean note resolves down or up a half step, else 0. */
  leanTo: number[];
  /** -1 when there is none or a chord is sounding. */
  moodNote: number;
  names: Spelling[];
  /** Scale degrees with no chord; chord roles (R 3 ♭7 9) over one. */
  roles: string[];
  blue: boolean[];
  chord: Chord | null;
  fit: Fit | null;
  scaleName: string;
}

const PENTATONIC_BRIGHT = [0, 1, 2, 4, 5];
const PENTATONIC_DARK = [0, 2, 3, 4, 6];

export function keyLights(key: SpelledKey): Lights {
  const light = Array<Light>(12).fill('out');
  const leanTo = Array<number>(12).fill(0);
  const penta = key.mood.bright ? PENTATONIC_BRIGHT : PENTATONIC_DARK;
  key.pcs.forEach((pc, i) => {
    if (i === 0) light[pc] = 'home';
    else if (i === 2 || i === 4) light[pc] = 'land';
    else if (penta.includes(i)) light[pc] = 'wander';
    else {
      light[pc] = 'lean';
      leanTo[pc] = key.has[pcOf(pc - 1)] ? -1 : 1;
    }
  });
  const md = key.mood.moodDegree;
  return {
    light,
    leanTo,
    moodNote: md === null ? -1 : key.pcs[md]!,
    names: Array.from({ length: 12 }, (_, pc) => spellIn(pc, key)),
    roles: Array.from({ length: 12 }, (_, pc) => degreeLabel(pc, key)),
    blue: Array<boolean>(12).fill(false),
    chord: null,
    fit: null,
    scaleName: key.name,
  };
}

/** The blues scale from the key's home: 1 ♭3 4 ♭5 5 ♭7. */
const BLUES = [0, 3, 5, 6, 7, 10];
const BLUE_NOTES = [3, 6];

export function chordLights(key: SpelledKey, chord: Chord, palette?: Palette): Lights {
  const root = rootPc(chord);
  const has = chordHas(chord);
  const degrees = chordDegrees(chord);
  const fit = fitScale(key, chord);
  const blues = palette === 'blues';
  const home = key.key.home;
  const inScale = (pc: number) =>
    blues ? BLUES.includes(pcOf(pc - home)) : fit.scale.has[pc] === true;

  const light = Array<Light>(12).fill('out');
  const leanTo = Array<number>(12).fill(0);
  const blue = Array<boolean>(12).fill(false);
  for (let pc = 0; pc < 12; pc++) {
    if (pc === root) light[pc] = 'home';
    else if (has[pc]) light[pc] = 'land';
    else if (!inScale(pc)) continue;
    else if (has[pcOf(pc - 1)]) {
      light[pc] = 'lean';
      leanTo[pc] = -1;
    } else if (blues && BLUE_NOTES.includes(pcOf(pc - home))) {
      light[pc] = 'lean';
      blue[pc] = true;
      leanTo[pc] = has[pcOf(pc + 1)] ? 1 : -1;
    } else light[pc] = 'wander';
  }

  return {
    light,
    leanTo,
    moodNote: -1,
    names: Array.from({ length: 12 }, (_, pc) => spellOver(pc, chord, fit, key)),
    roles: Array.from(
      { length: 12 },
      (_, pc) => degrees.get(pc) ?? TENSION_LABELS[pcOf(pc - root)]!,
    ),
    blue,
    chord,
    fit,
    scaleName: blues ? `${nameOf(key.home)} blues` : fit.name,
  };
}

function spellOver(pc: number, chord: Chord, fit: Fit, key: SpelledKey): Spelling {
  const i = chordPcs(chord).indexOf(pc);
  if (i >= 0) return chordSpellings(chord)[i]!;
  return fit.scale.has[pc] ? spellIn(pc, fit.scale) : spellIn(pc, key);
}

/** After `last`: the nearest lit note within a step each way, and the nearest gold each way. */
export function hintsAfter(last: number, lights: Lights, lo: number, hi: number): number[] {
  const lit = (n: number) => lights.light[pcOf(n)] !== 'out';
  const gold = (n: number) => {
    const l = lights.light[pcOf(n)];
    return l === 'home' || l === 'land';
  };
  const out = new Set<number>();
  for (const dir of [-1, 1]) {
    for (let n = last + dir; n >= lo && n <= hi && Math.abs(n - last) <= 2; n += dir) {
      if (lit(n)) {
        out.add(n);
        break;
      }
    }
    for (let n = last + dir; n >= lo && n <= hi && Math.abs(n - last) <= 12; n += dir) {
      if (gold(n)) {
        out.add(n);
        break;
      }
    }
  }
  return [...out];
}
