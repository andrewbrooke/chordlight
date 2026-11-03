// Note offsets (semitones above the octave's C) for each computer-keyboard layout:
//
//   key    the letter row plays the current key's notes from home, so Q E T is always the home
//          triad; the number above a whole-step gap plays the note in between
//   piano  the same, fixed to C major: letters are white keys, numbers black keys
//   rows   two chromatic octaves, Q to ] and 1 to =

import { MAJOR } from '../theory/scales.js';

export type Layout = 'key' | 'piano' | 'rows';

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

/** The number key above the gap after each letter: 2 sits between Q and W. */
const GAPS = [
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
  'Minus',
  'Equal',
];

const NUMBERS = ['Digit1', ...GAPS];

export const CHORD_CODES = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'];

export function capOf(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']' }[code] ?? '';
}

export function offsets(
  layout: Layout,
  home: number,
  steps: readonly number[],
): Map<string, number> {
  if (layout === 'rows') {
    return new Map([...LETTERS, ...NUMBERS].map((code, i) => [code, i]));
  }
  const [from, scale] = layout === 'key' ? [home, steps] : [0, MAJOR];
  const letters = LETTERS.map((_, i) => from + scale[i % 7]! + 12 * Math.floor(i / 7));
  const map = new Map<string, number>(LETTERS.map((code, i) => [code, letters[i]!]));
  GAPS.forEach((code, i) => {
    if (letters[i + 1]! - letters[i]! === 2) map.set(code, letters[i]! + 1);
  });
  return map;
}
