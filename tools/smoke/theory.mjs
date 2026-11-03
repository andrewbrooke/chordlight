// Key spelling, chord recognition, numeral round-trips, borrowed-chord scales, and the lights.

import { chordName, chordPcs, QUALITIES } from 'chordlight/theory/chords.js';
import { detect } from 'chordlight/theory/detect.js';
import { diatonicChords, diatonicSevenths } from 'chordlight/theory/diatonic.js';
import { fitScale } from 'chordlight/theory/fit.js';
import { chordLights, keyLights } from 'chordlight/theory/guide.js';
import { nameOf, pcOf } from 'chordlight/theory/pitch.js';
import {
  numeralText,
  parseProgression,
  parseRoman,
  progressionText,
} from 'chordlight/theory/roman.js';
import { MOODS, spellKey } from 'chordlight/theory/scales.js';
import { check, done, same } from './kit/check.mjs';

const C = spellKey({ home: 0, mood: 'major' });

// Every key spells with seven letters and no double accidentals.
for (const mood of MOODS) {
  for (let home = 0; home < 12; home++) {
    const k = spellKey({ home, mood: mood.id });
    check(new Set(k.notes.map((n) => n.letter)).size === 7, `${k.name} repeats a letter`);
    check(
      k.notes.every((n) => Math.abs(n.acc) <= 1),
      `${k.name} needs a double accidental`,
    );
    for (const chord of [...diatonicChords(k), ...diatonicSevenths(k)]) {
      check(fitScale(k, chord).inKey, `${chordName(chord)} in ${k.name} isn't diatonic`);
    }
  }
}
same(spellKey({ home: 6, mood: 'major' }).name, 'F♯ major', 'the six-sharp tie');
same(spellKey({ home: 3, mood: 'minor' }).name, 'E♭ minor', 'the six-flat tie');
same(spellKey({ home: 5, mood: 'major' }).notes.map(nameOf).join(' '), 'F G A B♭ C D E', 'F major');

// Every quality is recognised in every root, and the common ones in every inversion.
const INVERTIBLE = ['maj', 'm', 'dim', '7', 'maj7'];
for (const q of QUALITIES) {
  for (let root = 0; root < 12; root++) {
    const notes = q.tones.map((t) => 48 + root + t.iv);
    const heard = detect(notes, C);
    const label = `${q.id} on ${root}`;
    if (heard.kind !== 'chord') {
      check(false, `${label} heard as ${heard.kind}`);
      continue;
    }
    same([pcOf(chordPcs(heard.chord)[0]), heard.chord.quality], [root, q.id], label);
    if (!INVERTIBLE.includes(q.id)) continue;
    for (let inv = 1; inv < notes.length; inv++) {
      const voiced = notes.map((n, i) => (i < inv ? n + 12 : n));
      const h = detect(voiced, C);
      check(
        h.kind === 'chord' && h.chord.quality === q.id && h.chord.bass !== undefined,
        `${label}, inversion ${inv}`,
      );
    }
  }
}
same(
  detect([48, 52, 58], C).kind === 'chord' && detect([48, 52, 58], C).chord.quality,
  '7',
  'a 7 with no fifth',
);
const sixth = detect([48, 52, 55, 57], C);
same(sixth.kind === 'chord' && chordName(sixth.chord), 'C6', 'C E G A over C');
const minorSeventh = detect([45, 48, 52, 55], C);
same(minorSeventh.kind === 'chord' && chordName(minorSeventh.chord), 'Am7', 'the same over A');
same(detect([60, 64], C).kind, 'interval', 'two notes a third apart');
const power = detect([48, 55], C);
same(power.kind === 'chord' && chordName(power.chord), 'C5', 'a fifth is a power chord');

// Numerals print back exactly as they were typed.
const TOKENS = [
  'I',
  'ii',
  'iii',
  'IV',
  'V',
  'vi',
  'vii°',
  'bVII',
  'bVI',
  'bIII',
  'iv',
  'II',
  'III',
  'bII',
  'V7',
  'ii7',
  'Imaj7',
  'iiø7',
  'vii°7',
  'Isus4',
  'Vsus2',
  'V7sus4',
  'Iadd9',
  'iadd9',
  'I6',
  'ii6',
  'V9',
  'Imaj9',
  'ii9',
  'I5',
  'I+',
  'imaj7',
  'I:2',
  'V7:8',
];
for (const home of [0, 3, 6, 9]) {
  for (const mood of ['major', 'minor', 'dorian']) {
    const k = spellKey({ home, mood });
    for (const t of TOKENS) {
      const step = parseRoman(t, k);
      if (!step) {
        check(false, `${t} doesn't parse in ${k.name}`);
        continue;
      }
      const back = numeralText(step.chord, k) + (step.beats === 4 ? '' : `:${step.beats}`);
      same(back, t, `${t} in ${k.name}`);
    }
  }
}
const secondary = parseRoman('V/vi', C);
same(secondary && chordName(secondary.chord), 'E', 'V/vi in C');
const named = parseProgression('C G Am F', C);
same(named.ok && progressionText(named.steps, C), 'I V vi IV', 'chord names to numerals');
const dashed = parseProgression('ii-V-I', C);
same(dashed.ok && dashed.steps.length, 3, 'dashes separate chords');
same(parseProgression('I V IVV', C), { ok: false, token: 'IVV' }, 'a bad token is reported');

// The scale each borrowed chord gets.
const FITS = [
  [0, 'major', 'III7', 'A harmonic minor', 'G→G♯'],
  [9, 'minor', 'V', 'A harmonic minor', 'G→G♯'],
  [7, 'major', 'III', 'E harmonic minor', 'D→D♯'],
  [7, 'major', 'iv', 'C Dorian', 'B→B♭ E→E♭ F♯→F'],
  [0, 'major', 'iv', 'F Dorian', 'E→E♭ A→A♭ B→B♭'],
  [0, 'major', 'bVI', 'A♭ Lydian', 'E→E♭ A→A♭ B→B♭'],
  [0, 'major', 'bVII', 'B♭ Lydian', 'B→B♭'],
  [0, 'major', 'v7', 'G Dorian', 'B→B♭'],
  [0, 'major', 'I7', 'C Mixolydian', 'B→B♭'],
];
for (const [home, mood, token, name, changes] of FITS) {
  const k = spellKey({ home, mood });
  const fit = fitScale(k, parseRoman(token, k).chord);
  same(
    [fit.name, fit.changes.map((c) => `${nameOf(c.from)}→${nameOf(c.to)}`).join(' ')],
    [name, changes],
    `${token} in ${k.name}`,
  );
}

// Worked examples of the lights.
function lit(lights) {
  const out = {};
  lights.light.forEach((l, pc) => {
    if (l !== 'out') (out[l] ??= []).push(nameOf(lights.names[pc]));
  });
  for (const l of Object.keys(out)) out[l] = out[l].join(' ');
  return out;
}
same(
  lit(keyLights(C)),
  { home: 'C', wander: 'D A', land: 'E G', lean: 'F B' },
  'C major, Key mode',
);
const kl = keyLights(C);
same([kl.leanTo[5], kl.leanTo[11]], [-1, 1], 'F leans down, B leans up');
same(
  lit(chordLights(C, parseRoman('vi', C).chord)),
  { land: 'C E', wander: 'D G B', lean: 'F', home: 'A' },
  'Am in C',
);
same(
  lit(chordLights(C, parseRoman('V7', C).chord)),
  { lean: 'C', land: 'D F B', wander: 'E A', home: 'G' },
  'G7 in C',
);
const blues = chordLights(C, parseRoman('I7', C).chord, 'blues');
same([blues.blue[3], blues.blue[6], blues.light[3]], [true, true, 'lean'], 'blue notes over C7');

done('keys, chords, numerals, borrowed scales and the worked examples all hold');
