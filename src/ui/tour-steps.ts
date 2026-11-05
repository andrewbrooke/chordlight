// The first-run tour's steps, in order. Free of the DOM so tools/smoke/tour.mjs can run them
// against a stand-in App and check every target id against index.html. What the screen is like
// comes in as a Where, since a phone has no hover or computer keys and keeps controls behind ☰.

import type { App } from '../app.js';
import { CHORD_CODES, capOf } from '../input/layouts.js';
import { chordName, chordPcs, chordSpellings } from '../theory/chords.js';
import { diatonicChords } from '../theory/diatonic.js';
import { nameOf, pcOf } from '../theory/pitch.js';

export interface Where {
  /** A touch screen: no hover, and no computer keys to speak of. */
  touch: boolean;
  /** The compact bar, with most controls in the ☰ drawer. */
  compact: boolean;
  /** The stage shows a section of the instrument, with the strip above it to move it. */
  section: boolean;
}

export interface TourStep {
  title: string;
  /** Ids of the elements spotlit together, the one the card stays clear of first; none centres it. */
  targets: string[];
  text(app: App, where: Where): string;
  /** Doing this moves the tour on by itself. */
  done?(app: App): boolean;
  /** Puts the page in the state the step talks about. */
  before?(app: App): void;
}

const homeChord = (app: App) => diatonicChords(app.key)[0]!;

/** "C, E and G". */
function listed(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The computer keys for `pcs` stacked upwards from the lowest, or '' if they don't all fit. */
export function capsFor(app: App, pcs: number[]): string {
  const [lo, hi] = app.keys.span();
  const caps: string[] = [];
  let m = lo;
  for (const pc of pcs) {
    while (m <= hi && (pcOf(m) !== pc || !app.keys.capFor(m))) m++;
    if (m > hi) return '';
    caps.push(app.keys.capFor(m));
    m++;
  }
  return caps.join(' ');
}

function holdsHomeChord(app: App): boolean {
  const held = new Set(app.heldNotes().map(pcOf));
  return chordPcs(homeChord(app)).every((pc) => held.has(pc));
}

const keyMode = (app: App) => {
  if (app.s.mode !== 'key') app.setMode('key');
};

export const STEPS: readonly TourStep[] = [
  {
    title: 'Play a note',
    targets: ['stage'],
    before: keyMode,
    text: (app, where) => {
      const play = where.touch
        ? 'Tap the keys to play.'
        : app.s.caps
          ? 'Your computer keys play the piano: each key shows the letter that plays it. You can ' +
            'also click.'
          : 'Your computer keys play the piano, or click the keys.';
      const strip = where.section ? ' Drag the strip above the keys to move along them.' : '';
      return `${play}${strip} Play any note.`;
    },
    done: (app) => app.heldNotes().length > 0,
  },
  {
    title: 'The lights',
    targets: ['stage', 'legend'],
    text: () =>
      'Every key is lit by how well it fits. Gold is safe to land on, and the ringed gold is ' +
      'home. Teal is fine to pass through. Violet clashes a little, so move on the way its arrow ' +
      'points. Unlit keys are outside the key.',
  },
  {
    title: 'The home chord',
    targets: ['readout', 'stage'],
    text: (app, where) => {
      const chord = homeChord(app);
      const caps = where.touch ? '' : capsFor(app, chordPcs(chord));
      const notes = listed(chordSpellings(chord).map(nameOf));
      const hold = caps ? `Hold ${caps} together` : `Hold ${notes} together`;
      return `${hold}: that's ${chordName(chord)}, the home chord of ${app.key.name}. Whatever you hold is named above the keyboard.`;
    },
    done: holdsHomeChord,
  },
  {
    title: 'Why it lights up',
    targets: ['why'],
    before: (app) => {
      if (!app.s.why) app.set({ why: true });
    },
    text: (_app, where) =>
      'This panel explains the key, the chord, and the last note you played. ' +
      (where.touch ? 'Tap a key to read about it. ' : 'Point at a key to read about that one. ') +
      'The ? button at the top hides the panel.',
  },
  {
    title: 'Chords to play over',
    targets: ['palette'],
    before: keyMode,
    text: (_app, where) =>
      (where.touch
        ? "Tap a card to hold one of the key's chords, and again to let go."
        : `Hold ${capOf(CHORD_CODES[0]!)} to ${capOf(CHORD_CODES.at(-1)!)}, or click a card, to ` +
          "sound one of the key's chords.") +
      ' The lights follow it, so play a melody over the top.',
    done: (app) => app.keyChordNow() !== null,
  },
  {
    title: 'Key and mood',
    targets: ['home', 'mood'],
    text: () =>
      'Change the home note or the mood and everything follows: the lights, the chords and the ' +
      'notes your keys play.',
  },
  {
    title: 'Progression mode',
    targets: ['mode'],
    text: () => 'Progression mode plays a chord progression for you to play over. Switch to it.',
    done: (app) => app.s.mode === 'progression',
  },
  {
    title: 'Play along',
    targets: ['transport', 'play', 'lane'],
    before: (app) => {
      if (app.s.mode !== 'progression') app.setMode('progression');
    },
    text: (_app, where) =>
      (where.compact
        ? 'Press Play; the presets are in the ☰ menu.'
        : 'Pick a preset and press Play.') +
      (where.touch ? '' : ' Space plays too.') +
      ' The chord playing now is outlined, and just before the next one arrives, its notes are ' +
      'marked with dots on the keys.',
    done: (app) => app.audio?.transport.playing ?? false,
  },
  {
    title: 'Keep what you played',
    targets: ['record', 'clip', 'clips-open'],
    text: (app, where) =>
      `Played something good? Clip${where.touch ? '' : ', or Enter,'} keeps the last ` +
      `${app.s.clipSeconds} seconds, backing and all. Record keeps everything from one press to ` +
      'the next. Clips lists them, to play back or save as MIDI.',
  },
  {
    title: "That's the basics",
    targets: ['settings-open'],
    text: () =>
      'Settings has the keyboard size, other key layouts and the volumes, and can show this ' +
      'tour again.',
  },
];
