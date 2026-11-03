// User-facing explanations, generated from the theory so they always match the lights.

import { type Chord, chordName, qualityOf, rootPc } from '../theory/chords.js';
import { type Heard, INTERVAL_NAMES } from '../theory/detect.js';
import type { Fit } from '../theory/fit.js';
import type { Lights } from '../theory/guide.js';
import { nameOf, pcOf } from '../theory/pitch.js';
import { numeralLabel } from '../theory/roman.js';
import { MOODS, type SpelledKey, spellKey } from '../theory/scales.js';

const n = (lights: Lights, pc: number) => nameOf(lights.names[pcOf(pc)]!);

export function keySentence(key: SpelledKey): string {
  const notes = key.notes.map(nameOf).join(' ');
  const head = `${key.name}: ${notes}.`;
  const white = key.key.home === 0 && key.mood.id === 'major';
  if (white) return `${head} The white keys, with C as home.`;
  if (key.mood.id === 'major') return `${head} ${capital(key.mood.feel)}.`;
  if (key.mood.id === 'minor') {
    const rel = spellKey({ home: pcOf(key.key.home + 3), mood: 'major' });
    return `${head} ${capital(key.mood.feel)}. The same notes as ${rel.name}, with ${nameOf(key.home)} as home.`;
  }
  return `${head} ${capital(key.mood.feel)}. ${moodChange(key)}`;
}

/** Describes a mode by the one note it changes relative to major or minor. */
function moodChange(key: SpelledKey): string {
  const i = MOODS.indexOf(key.mood);
  const near = [MOODS[i - 1], MOODS[i + 1]].find((m) => m?.id === 'major' || m?.id === 'minor')!;
  const d = key.mood.steps.findIndex((s, j) => s !== near.steps[j]);
  const other = spellKey({ home: key.key.home, mood: near.id });
  const raised = key.mood.steps[d]! > near.steps[d]!;
  const ord = ['', '2nd', '3rd', '4th', '5th', '6th', '7th'][d]!;
  return (
    `It's ${near.name} with a ${raised ? 'raised' : 'lowered'} ${ord} ` +
    `(${nameOf(key.notes[d]!)} instead of ${nameOf(other.notes[d]!)}), marked with a star on the keys.`
  );
}

const JOBS = [
  'home, where the music rests',
  'away from home',
  'home family: restful, but less final than I',
  'away: the usual first step from home',
  'tension: it pulls back to home',
  'home family: a softer resting place',
  'tension: unstable, it wants to resolve',
];

export function chordLines(chord: Chord, key: SpelledKey, lights: Lights): string[] {
  const lines: string[] = [];
  const fit = lights.fit;
  const degree = key.pcs.indexOf(rootPc(chord));
  if (fit?.inKey && degree >= 0) lines.push(`Its job: ${JOBS[degree]}.`);
  else lines.push(`Borrowed from outside ${key.name}.`);
  lines.push(capital(qualityOf(chord.quality).words) + '.');
  if (lights.blue.some(Boolean)) {
    lines.push(
      `Lights use the ${lights.scaleName} scale: chord notes in gold, the rest of the scale in teal, blue notes in violet.`,
    );
  } else if (fit && !fit.inKey) lines.push(changeLine(fit));
  return lines;
}

function changeLine(fit: Fit): string {
  const moves = fit.changes.map((c) => `${nameOf(c.from)} becomes ${nameOf(c.to)}`).join(', ');
  return `Its notes come from ${fit.name}, so ${moves}.`;
}

const ORDINAL: Record<string, string> = {
  R: 'root',
  '2': '2nd',
  '♭3': 'minor 3rd',
  '3': '3rd',
  '4': '4th',
  '♭5': 'flat 5th',
  '5': '5th',
  '♯5': 'sharp 5th',
  '6': '6th',
  '°7': 'diminished 7th',
  '♭7': '7th',
  '7': 'major 7th',
  '♭9': 'flat 9th',
  '9': '9th',
  '♯9': 'sharp 9th',
  '11': '11th',
  '♯11': 'sharp 11th',
  '♭13': 'flat 13th',
  '13': '13th',
};

const KEY_DEGREES = ['home', '2nd', '3rd', '4th', '5th', '6th', '7th'];

export function noteSentence(pc: number, key: SpelledKey, lights: Lights): string {
  const name = n(lights, pc);
  const light = lights.light[pc]!;
  const resolve = lights.leanTo[pc] ?? 0;
  const target = n(lights, pc + resolve);
  const chord = lights.chord;

  if (!chord) {
    const ord = KEY_DEGREES[key.pcs.indexOf(pc)] ?? '';
    switch (light) {
      case 'home':
        return `${name} is home. Phrases feel finished when they end here.`;
      case 'land':
        return `${name} is the ${ord} of ${key.name}, a stable note to land on.`;
      case 'wander':
        return `${name} (the ${ord}) is safe to pass through or hold.`;
      case 'lean':
        return `${name} (the ${ord}) pulls a half step ${resolve < 0 ? 'down' : 'up'} to ${target}.`;
      default:
        return `${name} is outside the key. Use it deliberately, then move to a lit note.`;
    }
  }

  const cname = chordName(chord);
  const role = ORDINAL[lights.roles[pc]!] ?? lights.roles[pc]!;
  switch (light) {
    case 'home':
      return `${name} is the root of ${cname}, the note it's named after.`;
    case 'land':
      return `${name} is the ${role} of ${cname}, a safe note to land on.`;
    case 'wander':
      return `${name} is the ${role} over ${cname}. It adds colour; pass through it or hold it.`;
    case 'lean':
      if (lights.blue[pc]) return `${name} is a blue note. Slide from it to ${target}.`;
      return `${name} clashes with ${target}, the ${ORDINAL[lights.roles[pcOf(pc + resolve)]!] ?? ''} of ${cname}. Move ${resolve < 0 ? 'down' : 'up'} to ${target} after playing it.`;
    default:
      return `${name} is outside the notes that fit ${cname}. Use it deliberately, then move to a lit note.`;
  }
}

export function heardSentence(heard: Heard, key: SpelledKey, lights: Lights): string {
  switch (heard.kind) {
    case 'none':
      return '';
    case 'note': {
      const name = n(lights, heard.pc);
      const role = lights.chord
        ? `the ${ORDINAL[lights.roles[heard.pc]!] ?? lights.roles[heard.pc]} of ${chordName(lights.chord)}`
        : key.has[heard.pc]
          ? `the ${KEY_DEGREES[key.pcs.indexOf(heard.pc)]} of ${key.name}`
          : `outside ${key.name}`;
      return heard.pc === key.key.home && !lights.chord ? `${name}: home` : `${name}: ${role}`;
    }
    case 'interval':
      return `${n(lights, heard.low)} + ${n(lights, heard.high)}: ${INTERVAL_NAMES[heard.semis]}`;
    case 'chord': {
      const name = chordName(heard.chord);
      const tail = heard.chord.quality === '5' ? ' (a power chord)' : '';
      return `${name}${tail} · ${numeralLabel(heard.chord, key)} in ${key.name}`;
    }
    case 'unknown':
      return 'no common chord name';
  }
}

export const LIGHT_WORDS = {
  home: 'home: the note the key or chord is named after',
  land: 'land: safe to hold and to end on',
  wander: 'wander: in key, fine to pass through',
  lean: 'lean: clashes a little; move on the way the arrow points',
};

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
