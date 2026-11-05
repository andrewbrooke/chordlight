// Shared by `npm run hear` and the recordings smoke: replaying a recording of the guitar input
// through the detector, pairing what it heard into notes, and scoring them against what was played.

import { Listener } from 'chordlight/listen/listener.js';
import { STANDARD } from 'chordlight/presets/tunings.js';
import { CLIPS, GUITAR, LISTEN } from 'chordlight/tuning.js';

const BLOCK = 128;

/** The setup a recording was made with, or a fresh one for a WAV from elsewhere. */
export function configOf(recording) {
  if (recording.note) return recording.note.config;
  return {
    lo: Math.min(...STANDARD),
    hi: Math.max(...STANDARD) + GUITAR.frets,
    gateDb: LISTEN.gateDb,
    loudDb: LISTEN.loudDb,
    hum: [],
  };
}

/** Runs the samples through a Listener in the worklet's block size; returns what it heard. */
export function replay(recording, config = configOf(recording)) {
  const listener = new Listener(recording.rate, config);
  const heard = [];
  const { samples, rate } = recording;
  for (let i = 0; i < samples.length; i += BLOCK) {
    heard.push(...listener.push(samples.subarray(i, i + BLOCK), i / rate));
  }
  heard.push(...listener.flush(samples.length / rate));
  return heard;
}

/** Ons and offs as notes; those a clip would leave out (too short to have been played) marked. */
export function notesOf(heard, end) {
  const open = new Map();
  const notes = [];
  for (const e of heard) {
    if (e.kind === 'on') open.set(e.midi, e);
    else if (e.kind === 'off' && open.has(e.midi)) {
      const on = open.get(e.midi);
      open.delete(e.midi);
      notes.push({ midi: e.midi, t: on.t, length: e.t - on.t, velocity: on.velocity });
    }
  }
  for (const on of open.values()) {
    notes.push({ midi: on.midi, t: on.t, length: end - on.t, velocity: on.velocity });
  }
  notes.sort((a, b) => a.t - b.t);
  return notes.map((n) => ({ ...n, slip: n.length < CLIPS.shortestHeard }));
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const noteName = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** `E4 F#4 Ab4 Bb3` (or ♯ ♭) to MIDI notes; throws on anything else. */
export function parseNotes(text) {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((word) => {
      const m = /^([A-G])([#b♯♭]?)(-?\d)$/.exec(word);
      if (!m) throw new Error(`not a note: ${word} (try E4, F#4, Bb3)`);
      const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
      return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + acc;
    });
}

/**
 * Lines up what was heard with what was played (the longest run they share, in order) and counts
 * what's left over: notes heard that weren't played, and notes played that weren't heard.
 */
export function score(heard, played) {
  const n = heard.length;
  const m = played.length;
  const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      best[i][j] =
        heard[i] === played[j] ? best[i + 1][j + 1] + 1 : Math.max(best[i + 1][j], best[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && heard[i] === played[j]) {
      lines.push({ kind: 'right', midi: heard[i] });
      i++;
      j++;
    } else if (j < m && (i === n || best[i][j + 1] >= best[i + 1][j])) {
      lines.push({ kind: 'missed', midi: played[j] });
      j++;
    } else {
      lines.push({ kind: 'extra', midi: heard[i] });
      i++;
    }
  }
  const count = (kind) => lines.filter((l) => l.kind === kind).length;
  return { right: count('right'), extra: count('extra'), missed: count('missed'), lines };
}
