// Replays a recording of the guitar input (Record input, in the Guitar panel) through the detector
// as it is now, with the setup it was recorded with, and says what it hears: beside what was heard
// live, and scored against what was played if you say what that was.
//
//   npm run hear -- <file.wav>                          what it hears now, and heard then
//   npm run hear -- <file.wav> --expect "E4 F#4 Ab4"    scored against what was played
//   npm run hear -- <file.wav> --notes                  every note's time, length and velocity

import { readFileSync } from 'node:fs';
import { recordingFromWav } from 'chordlight/listen/recording.js';
import { stringName } from 'chordlight/presets/tunings.js';
import { configOf, noteName, notesOf, parseNotes, replay, score } from './kit.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--expect');
if (!file) {
  console.log('usage: npm run hear -- <file.wav> [--expect "E4 F#4 Ab4 …"] [--notes]');
  process.exit(2);
}
const expectAt = args.indexOf('--expect');
const played = expectAt >= 0 ? parseNotes(args[expectAt + 1] ?? '') : null;

const recording = recordingFromWav(new Uint8Array(readFileSync(file)));
if (!recording) {
  console.log(`${file} isn't a WAV this can read (16-bit PCM or 32-bit float)`);
  process.exit(2);
}
const { note, samples, rate } = recording;
const seconds = samples.length / rate;
const config = configOf(recording);
console.log(`${file}: ${seconds.toFixed(1)} s at ${rate} Hz`);
if (note) {
  const tuning = note.tuning.map((n) => stringName(n)).join(' ');
  const hum = config.hum.length > 0 ? `, hum filtered at ${config.hum.join(' ')} Hz` : '';
  console.log(
    `  recorded ${new Date(note.created).toLocaleString()} from input ${note.channel + 1} of ${note.device || 'an unnamed device'}`,
  );
  console.log(`  tuned ${tuning}, gate ${config.gateDb.toFixed(1)} dB${hum}`);
} else console.log('  not one of ours: replayed with a fresh setup in standard tuning');

const now = notesOf(replay(recording, config), seconds);
const kept = (notes) => notes.filter((n) => !n.slip);
const line = (notes) =>
  kept(notes)
    .map((n) => noteName(n.midi))
    .join(' ') || '(nothing)';
const slips = (notes) => notes.length - kept(notes).length;

console.log(`\nheard now  (${kept(now).length}, ${slips(now)} slips left out): ${line(now)}`);
if (note) {
  const then = notesOf(note.heard, seconds);
  console.log(`heard then (${kept(then).length}, ${slips(then)} slips left out): ${line(then)}`);
}

if (played) {
  const s = score(
    kept(now).map((n) => n.midi),
    played,
  );
  console.log(
    `\nplayed ${played.length}: ${s.right} heard right, ${s.missed} missed, ${s.extra} extra`,
  );
  const mark = { right: ' ', missed: '-', extra: '+' };
  console.log(s.lines.map((l) => `  ${mark[l.kind]} ${noteName(l.midi)}`).join('\n'));
}

if (args.includes('--notes')) {
  console.log('\n     time  note  length  velocity');
  for (const n of now) {
    const length = `${Math.round(n.length * 1000)} ms`;
    const tag = n.slip ? '  (slip, left out of clips)' : '';
    console.log(
      `  ${n.t.toFixed(3).padStart(7)}  ${noteName(n.midi).padEnd(4)}  ${length.padStart(7)}  ${n.velocity.toFixed(2)}${tag}`,
    );
  }
}
