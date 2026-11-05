// Recordings of the guitar input: the WAV and its note survive a round trip, a recording replays
// through the detector to the notes that were played, and every real recording kept in
// tools/smoke/recordings/ still scores at least as well as it did when it was adopted.
//
// A real recording is adopted by saving its .wav there beside a .json of what was played:
// { "played": "E4 F#4 Ab4 …", "allow": { "missed": 0, "extra": 0 } }. Tighten `allow` as the
// detector improves; it is the most a change may get wrong before this fails. The folder is
// gitignored: recordings are kept on the machine that made them, not in the repository.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPluck } from 'chordlight/audio/guitar-model.js';
import {
  decodeWav,
  encodeWav,
  recordingFromWav,
  recordingToWav,
} from 'chordlight/listen/recording.js';
import { STANDARD } from 'chordlight/presets/tunings.js';
import { notesOf, parseNotes, replay, score } from '../listen/kit.mjs';
import { check, done, same } from './kit/check.mjs';

const RATE = 48000;

// The WAV itself
const ramp = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.8);
const decoded = decodeWav(encodeWav(ramp, RATE, 'a note — with ✓ in it'));
same([decoded.rate, decoded.samples.length], [RATE, ramp.length], 'rate and length survive');
same(decoded.comment, 'a note — with ✓ in it', 'the comment survives, unicode and all');
let worst = 0;
for (let i = 0; i < ramp.length; i++)
  worst = Math.max(worst, Math.abs(decoded.samples[i] - ramp[i]));
check(worst < 1 / 32767 + 1e-6, `samples survive to 16 bits: off by ${worst}`);
same(decodeWav(encodeWav(ramp, RATE)).comment, null, 'no comment, no LIST chunk');
same(decodeWav(new Uint8Array([1, 2, 3])), null, 'bytes that are not a WAV');

// A recording replays to what was played.
const line = parseNotes('E4 F#4 Ab4 A4 B4');
const samples = new Float32Array(RATE * 3);
line.forEach((midi, k) => {
  const d = renderPluck(midi, RATE);
  const from = Math.round((0.2 + k * 0.5) * RATE);
  const to = Math.round((0.7 + k * 0.5) * RATE);
  for (let i = from; i < to && i - from < d.length; i++) samples[i] = d[i - from] * 0.6;
});
const config = { lo: 40, hi: 86, gateDb: -58, loudDb: -14, hum: [] };
const note = {
  format: 'chordlight-guitar-input',
  version: 1,
  created: 0,
  device: 'test',
  channel: 0,
  tuning: [...STANDARD],
  config,
  offset: 0.03,
  heard: [],
};
const recording = recordingFromWav(recordingToWav(samples, RATE, note));
same(recording.note.config, config, 'the setup travels with the recording');
const heard = notesOf(replay(recording), samples.length / RATE).filter((n) => !n.slip);
same(
  score(
    heard.map((n) => n.midi),
    line,
  ).right,
  line.length,
  'a recorded line replays to the notes played',
);

// Real recordings
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'recordings');
const kept = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.wav')) : [];
const results = [];
for (const file of kept) {
  const sidecar = join(dir, file.replace(/\.wav$/, '.json'));
  if (!existsSync(sidecar)) {
    check(false, `${file} has no .json saying what was played`);
    continue;
  }
  const { played, allow = {} } = JSON.parse(readFileSync(sidecar, 'utf8'));
  const rec = recordingFromWav(new Uint8Array(readFileSync(join(dir, file))));
  check(rec !== null, `${file} isn't a readable WAV`);
  if (!rec) continue;
  const notes = notesOf(replay(rec), rec.samples.length / rec.rate).filter((n) => !n.slip);
  const s = score(
    notes.map((n) => n.midi),
    parseNotes(played),
  );
  check(s.missed <= (allow.missed ?? 0), `${file}: ${s.missed} played notes missed`);
  check(s.extra <= (allow.extra ?? 0), `${file}: ${s.extra} notes heard that weren't played`);
  results.push(`${file} ${s.right}/${s.right + s.missed}`);
}

done(
  kept.length > 0
    ? `recordings round-trip and replay; real ones: ${results.join(', ')}`
    : 'recordings round-trip and replay; no real recordings kept yet',
);
