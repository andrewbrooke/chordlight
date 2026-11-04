// Clip export: the JSON file round-trips and refuses what isn't one; the MIDI file reads back with
// the notes, backing, chord markers and tempo where they should be, on the backing's grid.

import { clipFromJson, clipToJson } from 'chordlight/clips/file.js';
import { clipToMidi, tempoMap, tickAt } from 'chordlight/clips/midifile.js';
import { check, done, same } from './kit/check.mjs';

const state = (t, playing, beat, bpm = 120) => ({
  t,
  playing,
  beat,
  bpm,
  text: 'I V vi IV',
  home: 0,
  mood: 'major',
  style: 'pad',
  bass: true,
});
const note = (t, on, midi, vel = 0.7, voice = 'piano') => ({ t, on, midi, vel, voice });

const clip = {
  id: 'a',
  created: 1_700_000_000_000,
  duration: 4,
  events: [note(0.5, true, 60), note(1, false, 60)],
  where: 'Four Chords in C major',
  backing: [state(0, true, 0)],
};

// JSON
const json = clipToJson(clip);
same(clipFromJson(json, 'b'), { ...clip, id: 'b' }, 'a clip survives JSON, with a new id');
same(
  JSON.parse(json).backing[0].chords.map((c) => [c.numeral, c.name, c.beats, c.pcs]),
  [
    ['I', 'C', 4, [0, 4, 7]],
    ['V', 'G', 4, [7, 11, 2]],
    ['vi', 'Am', 4, [9, 0, 4]],
    ['IV', 'F', 4, [5, 9, 0]],
  ],
  'the file spells out the chords',
);
const noisy = JSON.parse(
  clipToJson({
    ...clip,
    duration: 24.90800000000005,
    events: [note(0.10000000000002274, true, 60), note(4.969333333333395, false, 60)],
    backing: [state(0, true, 5.999999999999989)],
  }),
);
same(
  [noisy.duration, noisy.events.map((e) => e.t), noisy.backing[0].beat],
  [24.908, [0.1, 4.9693], 6],
  'times and beats are written to four places',
);
const altered = (patch) => JSON.stringify({ ...JSON.parse(json), ...patch });
same(clipFromJson('not json', 'c'), null, 'text that is not JSON');
same(clipFromJson(altered({ format: 'other' }), 'c'), null, 'another format');
same(clipFromJson(altered({ version: 2 }), 'c'), null, 'a newer version');
same(clipFromJson(altered({ events: [note(0, true, 200)] }), 'c'), null, 'a note out of range');
same(
  clipFromJson(altered({ backing: [{ ...state(0, true, 0), style: 'x' }] }), 'c'),
  null,
  'a style',
);

// Tempo maps
same(tempoMap([]), [{ t: 0, tick: 0, bpm: 120 }], 'no backing: the loose tempo from the start');
same(tempoMap([state(0, true, 6)])[0].tick, 960, 'a clip starting on beat 3 sits two beats in');
same(
  tickAt(tempoMap([state(0, true, 0), state(2, true, 4, 60)]), 3),
  2400,
  'a tempo change carries on from where the beat was',
);
const restart = tempoMap([state(0, true, 0), state(2.1, false, 4.2), state(3, true, 0)]);
const back = tickAt(restart, 3);
check(back % 1920 === 0, `a restart lands on a bar line, not tick ${back}`);
check(back > tickAt(restart, 2.1), 'a restart comes after the stop');
same(tickAt(restart, 3.5), back + 480, 'and runs at its own tempo after');

// MIDI
function readMidi(bytes) {
  let i = 0;
  const u = (n) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + bytes[i++];
    return v;
  };
  const vlq = () => {
    let v = 0;
    for (;;) {
      const b = bytes[i++];
      v = v * 128 + (b & 0x7f);
      if (b < 0x80) return v;
    }
  };
  const text = (n) => String.fromCharCode(...bytes.slice(i, (i += n)));
  check(text(4) === 'MThd' && u(4) === 6, 'a MIDI header');
  const head = { format: u(2), tracks: u(2), tpq: u(2) };
  const tracks = [];
  for (let k = 0; k < head.tracks; k++) {
    check(text(4) === 'MTrk', `track ${k} is a track`);
    const end = u(4) + i;
    const track = { name: '', notes: [], tempos: [], markers: [], ended: false };
    let tick = 0;
    while (i < end) {
      tick += vlq();
      const status = bytes[i++];
      if (status === 0xff) {
        const type = bytes[i++];
        const n = vlq();
        if (type === 0x03) track.name = text(n);
        else if (type === 0x06) track.markers.push([tick, text(n)]);
        else if (type === 0x51) track.tempos.push([tick, u(3)]);
        else if (type === 0x2f) track.ended = (i += n) === end;
        else i += n;
      } else if (status >> 4 === 0xc) i++;
      else {
        const [midi, vel] = [bytes[i++], bytes[i++]];
        if (status >> 4 === 0x9) track.notes.push([tick, midi, vel]);
      }
    }
    tracks.push(track);
  }
  return { ...head, tracks };
}

const file = readMidi(clipToMidi(clip));
same([file.format, file.tpq], [1, 480], 'format 1 at 480 ticks a quarter');
same(
  file.tracks.map((t) => t.name),
  ['Four Chords in C major', 'Played', 'Backing chords', 'Backing bass'],
  'a track each, empty ones left out',
);
check(
  file.tracks.every((t) => t.ended),
  'every track ends where its length says',
);
same(file.tracks[0].tempos, [[0, 500000]], 'the backing tempo');
same(
  file.tracks[0].markers,
  [
    [0, 'C'],
    [1920, 'G'],
  ],
  'chord names on the bar lines',
);
same(file.tracks[1].notes, [[480, 60, 89]], 'the played note where it was played');
const struck = (tick) =>
  file.tracks[2].notes
    .filter(([t]) => t === tick)
    .map(([, m]) => m % 12)
    .sort((a, b) => a - b);
same(
  [struck(0), struck(1920), file.tracks[2].notes.length],
  [[0, 4, 7], [2, 7, 11], 6],
  'the pad strikes each chord on its first beat',
);
same(
  file.tracks[3].notes.map(([t]) => t),
  [0, 960, 1920, 2880],
  'the bass on every other beat',
);

const loose = readMidi(clipToMidi({ ...clip, backing: undefined, where: 'C♯ major' }));
same(
  loose.tracks.map((t) => t.name),
  ['C# major', 'Played'],
  'no backing tracks without a backing, and ASCII names',
);
same(loose.tracks[1].notes, [[480, 60, 89]], 'loose notes at the loose tempo');

done('clips export as JSON and MIDI and read back as they went out');
