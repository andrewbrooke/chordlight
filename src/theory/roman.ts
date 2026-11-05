// Parses and prints progressions as Roman numerals or chord names.
//
// Numerals count on the major scale of home, with ♭ and ♯ marking altered roots (the pop
// convention), so ♭VII is the same chord in C major and C minor. Case sets the triad quality,
// `V/vi` is a secondary dominant, and `:n` sets the length in beats.

import { type Chord, type QualityId, rootPc, thirdOf } from './chords.js';
import {
  type Spelling,
  parseNoteName,
  pcOf,
  pcOfSpelling,
  simplify,
  spellOnLetter,
} from './pitch.js';
import { DEGREE_LABELS, MAJOR, type SpelledKey } from './scales.js';

export interface Step {
  chord: Chord;
  beats: number;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Every root by semitones above home, as the numeral that reads it: the degree labels' accidentals. */
export const ROOT_NUMERALS = DEGREE_LABELS.map((d) =>
  d.replace(/\d/, (n) => ROMAN[Number(n) - 1]!),
);
const NUMERAL = '(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)';
const TOKEN = new RegExp(`^([b#♭♯]?)${NUMERAL}([^/:]*)(?:/([b#♭♯]?)${NUMERAL})?(?::(\\d+))?$`);

const UPPER: Record<string, QualityId> = {
  '': 'maj',
  '7': '7',
  maj7: 'maj7',
  '9': '9',
  maj9: 'maj9',
  '6': '6',
  '+': 'aug',
  aug: 'aug',
  '°': 'dim',
  dim: 'dim',
  '°7': 'dim7',
  dim7: 'dim7',
  m7b5: 'm7b5',
  sus2: 'sus2',
  sus4: 'sus4',
  '7sus4': '7sus4',
  add9: 'add9',
  '5': '5',
};
const LOWER: Record<string, QualityId> = {
  ...UPPER,
  '': 'm',
  '7': 'm7',
  maj7: 'mmaj7',
  '9': 'm9',
  '6': 'm6',
  add9: 'madd9',
  ø7: 'm7b5',
};

function normalSuffix(s: string): string {
  return s
    .replace(/^o/, '°')
    .replace(/^ø$/, 'm7b5')
    .replace(/^ø7$/, 'm7b5')
    .replace(/♭/g, 'b')
    .replace(/^(M7|Δ7?|△7?)$/, 'maj7');
}

function accOf(s: string | undefined): number {
  return s === 'b' || s === '♭' ? -1 : s === '#' || s === '♯' ? 1 : 0;
}

function degreeRoot(from: Spelling, acc: string | undefined, numeral: string): Spelling {
  const d = ROMAN.indexOf(numeral.toUpperCase());
  const pc = pcOf(pcOfSpelling(from) + MAJOR[d]! + accOf(acc));
  // Keep the letter even if it needs a double flat (♭VI of D♭ is B𝄫) so the numeral
  // round-trips; display names respell it.
  return spellOnLetter(pc, from.letter + d);
}

export function parseRoman(token: string, key: SpelledKey): Step | null {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const [, acc, numeral, rawSuffix, targetAcc, target, beats] = m;
  const lower = numeral === numeral!.toLowerCase();
  const quality = (lower ? LOWER : UPPER)[normalSuffix(rawSuffix!)];
  if (!quality) return null;
  const from = target ? degreeRoot(key.home, targetAcc, target) : key.home;
  return { chord: { root: degreeRoot(from, acc, numeral!), quality }, beats: beatsOf(beats) };
}

const NAME = /^([A-G][#b♯♭]?)([^/:]*)(?:\/([A-G][#b♯♭]?))?(?::(\d+))?$/;

const NAMED: Record<string, QualityId> = {
  '': 'maj',
  maj: 'maj',
  m: 'm',
  min: 'm',
  '-': 'm',
  '5': '5',
  '°': 'dim',
  dim: 'dim',
  '+': 'aug',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  sus: 'sus4',
  '7': '7',
  maj7: 'maj7',
  m7: 'm7',
  min7: 'm7',
  '6': '6',
  m6: 'm6',
  m7b5: 'm7b5',
  ø: 'm7b5',
  ø7: 'm7b5',
  '°7': 'dim7',
  dim7: 'dim7',
  add9: 'add9',
  madd9: 'madd9',
  'm(add9)': 'madd9',
  '7sus4': '7sus4',
  mmaj7: 'mmaj7',
  'm(maj7)': 'mmaj7',
  mM7: 'mmaj7',
  '9': '9',
  maj9: 'maj9',
  m9: 'm9',
};

export function parseName(token: string): Step | null {
  const m = NAME.exec(token);
  if (!m) return null;
  const root = parseNoteName(m[1]!);
  const suffix = m[2]!
    .replace(/^o/, '°')
    .replace(/♭/g, 'b')
    .replace(/^(M7|Δ7?|△7?)$/, 'maj7');
  const quality = NAMED[suffix];
  if (!root || !quality) return null;
  const bass = m[3] ? (parseNoteName(m[3]) ?? undefined) : undefined;
  return { chord: { root, quality, bass }, beats: beatsOf(m[4]) };
}

function beatsOf(text: string | undefined): number {
  const n = text ? Number(text) : 4;
  return Math.min(16, Math.max(1, n));
}

export function parseToken(token: string, key: SpelledKey): Step | null {
  return parseRoman(token, key) ?? parseName(token);
}

export type Parsed = { ok: true; steps: Step[] } | { ok: false; token: string };

export function parseProgression(text: string, key: SpelledKey): Parsed {
  const tokens = text.split(/[\s,|\-–—]+/).filter((t) => t.length > 0);
  const steps: Step[] = [];
  for (const token of tokens) {
    const step = parseToken(token, key);
    if (!step) return { ok: false, token };
    steps.push(step);
  }
  if (steps.length === 0) return { ok: false, token: '' };
  return { ok: true, steps };
}

const NUMERAL_SUFFIX: Record<QualityId, string> = {
  maj: '',
  m: '',
  '5': '5',
  dim: '°',
  aug: '+',
  sus4: 'sus4',
  sus2: 'sus2',
  '7': '7',
  maj7: 'maj7',
  m7: '7',
  '6': '6',
  m6: '6',
  m7b5: 'ø7',
  dim7: '°7',
  add9: 'add9',
  madd9: 'add9',
  '7sus4': '7sus4',
  mmaj7: 'maj7',
  '9': '9',
  maj9: 'maj9',
  m9: '9',
};

/** The inverse of parseRoman, in its plain-text form: `bVII`, `ii7`. */
export function numeralText(c: Chord, key: SpelledKey): string {
  const home = key.key.home;
  let d = (c.root.letter - key.home.letter + 7) % 7;
  let acc = pcOf(rootPc(c) - home - MAJOR[d]! + 6) - 6;
  if (Math.abs(acc) > 1) {
    // A root spelled against the key's letters (G♯ for A♭): count by pitch instead.
    const iv = pcOf(rootPc(c) - home);
    const exact = MAJOR.indexOf(iv as (typeof MAJOR)[number]);
    d = exact >= 0 ? exact : MAJOR.indexOf((iv + 1) as (typeof MAJOR)[number]);
    acc = exact >= 0 ? 0 : -1;
  }
  const numeral = thirdOf(c) === 'minor' ? ROMAN[d]!.toLowerCase() : ROMAN[d]!;
  const sign = acc < 0 ? 'b' : acc > 0 ? '#' : '';
  return sign + numeral + NUMERAL_SUFFIX[c.quality];
}

export function numeralLabel(c: Chord, key: SpelledKey): string {
  return numeralText(c, key).replace(/^b/, '♭').replace(/^#/, '♯');
}

export function stepText(s: Step, key: SpelledKey): string {
  const n = numeralText(s.chord, key);
  return s.beats === 4 ? n : `${n}:${s.beats}`;
}

export function progressionText(steps: readonly Step[], key: SpelledKey): string {
  return steps.map((s) => stepText(s, key)).join(' ');
}

/** Keeps every numeral and slash bass. */
export function transpose(steps: readonly Step[], from: SpelledKey, to: SpelledKey): Step[] {
  return steps.map((s) => {
    const moved = parseRoman(stepText(s, from), to);
    if (!moved) return s;
    const bass = s.chord.bass;
    if (bass) {
      const letters = bass.letter - s.chord.root.letter;
      const semis = pcOfSpelling(bass) - rootPc(s.chord);
      moved.chord.bass = simplify(
        spellOnLetter(pcOf(rootPc(moved.chord) + semis), moved.chord.root.letter + letters),
      );
    }
    return moved;
  });
}
