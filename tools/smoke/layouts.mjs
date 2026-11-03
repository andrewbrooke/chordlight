// Keyboard layouts: Q E T is the home triad in every key, letters stay in key, numbers fill gaps.

import { offsets } from 'chordlight/input/layouts.js';
import { MAJOR, MOODS } from 'chordlight/theory/scales.js';
import { check, done, same } from './kit/check.mjs';

const LETTERS = [
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyY',
  'KeyU',
  'KeyI',
  'KeyO',
  'KeyP',
  'BracketLeft',
  'BracketRight',
];
const pc = (n) => ((n % 12) + 12) % 12;

for (const mood of MOODS) {
  for (let home = 0; home < 12; home++) {
    const map = offsets('key', home, mood.steps);
    const label = `${mood.id} on ${home}`;
    const inKey = (n) => mood.steps.includes(pc(n - home));
    same(
      ['KeyQ', 'KeyE', 'KeyT'].map((c) => map.get(c) - home),
      [0, mood.steps[2], mood.steps[4]],
      `${label}: Q E T is the home chord`,
    );
    for (const c of LETTERS) check(inKey(map.get(c)), `${label}: ${c} is out of key`);
    for (const [code, n] of map) {
      if (!LETTERS.includes(code)) check(!inKey(n), `${label}: ${code} doubles a key note`);
    }
    const notes = [...map.values()].sort((a, b) => a - b);
    same(new Set(notes).size, notes.length, `${label}: two keys play one note`);
    same(notes.at(-1) - notes[0] + 1, notes.length, `${label}: a semitone is missing`);
  }
}
same(
  [...offsets('piano', 7, MOODS[0].steps)],
  [...offsets('key', 0, MAJOR)],
  'piano is C major, whatever the key',
);
same(
  [...offsets('rows', 0, MAJOR).values()],
  [...Array(24).keys()],
  'rows are two chromatic octaves',
);

done('every layout keeps its promise in every key and mood');
