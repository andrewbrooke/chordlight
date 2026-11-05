// Loop positions, voice-leading, and cutting clips from the note log.

import { backingFor, record } from 'chordlight/clips/backing.js';
import { cutClip, extractClip } from 'chordlight/clips/extract.js';
import { beatAt, positionAt, timelineOf, timeOfBeat } from 'chordlight/audio/timeline.js';
import { Transport } from 'chordlight/audio/transport.js';
import { voice } from 'chordlight/audio/voicing.js';
import { QUALITIES, chordHas } from 'chordlight/theory/chords.js';
import { spellOnLetter } from 'chordlight/theory/pitch.js';
import { parseProgression } from 'chordlight/theory/roman.js';
import { spellKey } from 'chordlight/theory/scales.js';
import { BACKING } from 'chordlight/tuning.js';
import { check, done, same } from './kit/check.mjs';

// Where the loop is.
const tl = timelineOf([4, 4, 2, 2]);
const at = (beat) => {
  const p = positionAt(beat, tl);
  return [p.step, p.next, p.beatInStep, p.beatsLeft, p.countIn];
};
same(at(0), [0, 1, 0, 4, false], 'the first downbeat');
same(at(3.5), [0, 1, 3.5, 0.5, false], 'half a beat before the change');
same(at(9), [2, 3, 1, 1, false], 'inside a two-beat chord');
same(at(12), [0, 1, 0, 4, false], 'round the loop');
same(at(-2), [0, 0, 0, 2, true], 'two beats into a count-in');
same(beatAt(timeOfBeat(7.25, 3, 120), 3, 120), 7.25, 'beats and seconds agree');

// Pause and resume, against a stub clock and band.
const clock = { now: 10, heard: 10 };
const booked = [];
const band = { book: (e, p, time) => booked.push([e, time]), join: () => {}, stop: () => {} };
const transport = new Transport(clock, band);
transport.bpm = 120;
transport.start(false);
clock.now = clock.heard = 11.08;
transport.pause();
same(
  [transport.playing, transport.paused, transport.position()?.beat],
  [false, true, 2],
  'a pause holds the beat it stopped on',
);
clock.now = clock.heard = 30;
booked.length = 0;
transport.resume();
same(
  [transport.playing, transport.paused, transport.beatAt(30.08), booked[0]],
  [true, false, 2, [4, 30.08]],
  'a resume carries on from that beat, starting with its eighth',
);
transport.stop();
same([transport.playing, transport.paused], [false, false], 'a stop clears a pause');

// Voice-leading: every chord fits the range and the band never leaps across it. The ninths in D
// once left IVmaj9 with no voicing that fit, and every chord after it silent.
for (const [home, text] of [
  [0, 'I V vi IV'],
  [0, 'ii7 V7 Imaj7'],
  [0, 'I bVI bVII I'],
  [0, 'IVmaj7 III7 vi7 v7 I7'],
  [2, 'Imaj9 iii7 IVmaj9 iv6 vi7 bVImaj7 ii9 Vsus4'],
  [7, 'Iadd9 vi9 IV9 iiadd9 V9 Imaj9'],
]) {
  const parsed = parseProgression(text, spellKey({ home, mood: 'major' }));
  check(parsed.ok, `${text}: does not parse at ${parsed.token}`);
  const steps = parsed.steps ?? [];
  let prev = null;
  for (const s of steps) {
    const v = voice(s.chord, prev, BACKING.chordLo, BACKING.chordHi);
    check(v.length >= 3, `${text}: a chord voiced with ${v.length} notes`);
    check(v[0] >= BACKING.chordLo && v.at(-1) <= BACKING.chordHi, `${text}: out of range ${v}`);
    if (prev) {
      const shift = Math.abs(
        v.reduce((a, b) => a + b, 0) / v.length - prev.reduce((a, b) => a + b, 0) / prev.length,
      );
      check(shift <= 4, `${text}: the voicing jumps ${shift.toFixed(1)} semitones`);
    }
    prev = v;
  }
}

// Every chord on every root voices inside both ranges, with each note one of its own.
for (const [lo, hi] of [
  [BACKING.chordLo, BACKING.chordHi],
  [BACKING.droneLo, BACKING.droneHi],
]) {
  for (let pc = 0; pc < 12; pc++) {
    for (const q of QUALITIES) {
      const chord = {
        root: spellOnLetter(pc, [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][pc]),
        quality: q.id,
      };
      const v = voice(chord, null, lo, hi);
      const has = chordHas(chord);
      check(
        v.length >= 2 && v[0] >= lo && v.at(-1) <= hi && v.every((m) => has[m % 12]),
        `${pc}${q.suffix} in ${lo}..${hi}: ${v}`,
      );
    }
  }
}

// Clips.
const ev = (t, on, midi) => ({ t, on, midi, vel: 0.7, voice: 'piano' });
const log = [
  ev(1, true, 60),
  ev(1.5, false, 60), // before the window
  ev(8, true, 62),
  ev(11, false, 62), // an off whose on fell outside
  ev(12, true, 64),
  ev(12.5, false, 64),
  ev(13, true, 67), // still held when the clip is taken
];
const clip = extractClip(log, 14, 5);
check(clip !== null, 'a clip with notes in it');
same(
  clip.events.map((e) => [Math.round(e.t * 100) / 100, e.on, e.midi]),
  [
    [0.1, true, 64],
    [0.6, false, 64],
    [1.1, true, 67],
    [2.1, false, 67],
  ],
  'the clip keeps the window, trims the silence and closes a held note',
);
same(extractClip(log, 40, 5), null, 'an empty window gives no clip');
const recorded = cutClip(log, 10, 14);
same(
  recorded && [recorded.duration, recorded.events.map((e) => [e.t, e.on, e.midi])],
  [
    4,
    [
      [2, true, 64],
      [2.5, false, 64],
      [3, true, 67],
      [4, false, 67],
    ],
  ],
  'a recording keeps its silence, drops a note begun before it, and closes a held one',
);
same(cutClip(log, 2, 7), null, 'a recording with nothing played in it');

// The backing recorded alongside a clip.
const state = (t, playing, beat = 0) => ({
  t,
  playing,
  beat,
  bpm: 120,
  text: 'I V vi IV',
  home: 0,
  mood: 'major',
  style: 'pad',
  bass: true,
});
const running = backingFor([state(10, true)], 13.25, 20);
same(
  running && [running.lead, running.states.map((s) => [s.t, s.playing, s.beat])],
  [0.25, [[0, true, 6]]],
  'a clip starting mid-beat moves back to the beat, and the backing starts there',
);
const stopped = backingFor([state(10, true), state(15, false)], 13.25, 20);
same(
  stopped && stopped.states.map((s) => [s.t, s.playing]),
  [
    [0, true],
    [2, false],
  ],
  'a stop inside the clip is kept, shifted with the lead',
);
same(backingFor([state(10, false)], 13, 20), null, 'no backing when it was stopped throughout');
same(
  record([state(12, true)], state(11, false), 0).map((s) => [s.t, s.playing]),
  [[11, false]],
  'a stop during the count-in drops the start that never happened',
);
same(
  record([state(1, true), state(2, true), state(3, true)], state(4, true), 2.5).map((s) => s.t),
  [2, 3, 4],
  'pruning keeps the last state before the cutoff',
);

done('loop positions, voice-leading, clips and their backing all hold');
