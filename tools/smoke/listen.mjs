// The guitar note detector on synthesised audio: pitch is accurate across the neck, plucked notes
// are found at the right time and nothing is found in silence or hum, a re-pluck and a hammer-on
// each start a new note, a low E with a weak fundamental isn't heard an octave up, and harder plucks
// read louder.

import { renderPluck } from 'chordlight/audio/guitar-model.js';
import { hzOf } from 'chordlight/listen/filters.js';
import { Listener } from 'chordlight/listen/listener.js';
import { Tracker } from 'chordlight/listen/tracker.js';
import { check, done, same } from './kit/check.mjs';

const RATE = 48000;
const CONFIG = { lo: 40, hi: 86, gateDb: -58, loudDb: -14, hum: [] };

function run(signal, config = CONFIG) {
  const l = new Listener(RATE, config);
  const events = [];
  for (let i = 0; i < signal.length; i += 128) {
    events.push(...l.push(signal.subarray(i, i + 128), i / RATE));
  }
  events.push(...l.flush(signal.length / RATE));
  return { events, listener: l };
}

const ons = (events) => events.filter((e) => e.kind === 'on');

/** Plucks one after another on one string: each is cut short where the next begins. */
function plucked(seconds, notes, gain = 0.6) {
  const out = new Float32Array(Math.round(seconds * RATE));
  notes.forEach(({ midi, at, level = gain }, i) => {
    const data = renderPluck(midi, RATE);
    const from = Math.round(at * RATE);
    const next = notes[i + 1];
    const to = Math.min(out.length, next ? Math.round(next.at * RATE) : out.length);
    const fade = Math.round(0.004 * RATE);
    for (let k = from; k < to && k - from < data.length; k++) {
      const tail = Math.min(1, (to - k) / fade);
      out[k] += data[k - from] * level * tail;
    }
  });
  return out;
}

function noise(seconds, rms, seed = 7) {
  const out = new Float32Array(Math.round(seconds * RATE));
  let s = seed;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 2147483648 - 1) * rms * Math.sqrt(3);
  }
  return out;
}

function hum(seconds, mains, amplitude) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] =
      amplitude *
      (Math.sin(2 * Math.PI * mains * t) +
        0.5 * Math.sin(2 * Math.PI * 2 * mains * t) +
        0.3 * Math.sin(2 * Math.PI * 3 * mains * t));
  }
  return out;
}

const sum = (...signals) => {
  const out = new Float32Array(Math.max(...signals.map((s) => s.length)));
  for (const s of signals) for (let i = 0; i < s.length; i++) out[i] += s[i];
  return out;
};

const db = (x) => Math.pow(10, x / 20);

// Pitch: a sawtooth's reading, within a few cents up to the top string's 12th fret, which covers
// every string the tuner tunes. Above it a period is a dozen samples at the detector's rate, and
// the reading is only good to about 15 cents: plenty to name the note.
for (const midi of [40, 45, 52, 59, 64, 69, 76, 86]) {
  const f = hzOf(midi);
  const saw = new Float32Array(RATE * 0.3);
  for (let i = 0; i < saw.length; i++) saw[i] = 0.2 * (((i * f) / RATE) % 1) * 2 - 0.2;
  const { listener } = run(saw);
  const cents = (listener.reading.pitch - midi) * 100;
  const within = midi <= 76 ? 6 : 15;
  check(Math.abs(cents) < within, `a ${midi} sawtooth reads ${cents.toFixed(1)} cents out`);
}

// A line up the open strings and the 12th fret, at the times they were played.
const line = [40, 45, 50, 55, 59, 64, 76].map((midi, i) => ({ midi, at: 0.2 + i * 0.6 }));
const { events } = run(plucked(4.8, line));
same(
  ons(events).map((e) => e.midi),
  line.map((n) => n.midi),
  'each plucked note, once, in order',
);
for (const [i, e] of ons(events).entries()) {
  const late = e.t - line[i].at;
  check(late > -0.01 && late < 0.02, `note ${e.midi} dated ${(late * 1000).toFixed(1)} ms off`);
}
const offs = events.filter((e) => e.kind === 'off');
same(offs.length, line.length, 'every note ends');

// Nothing in silence, noise or mains hum below the guitar's range.
same(run(new Float32Array(RATE)).events.length, 0, 'silence is silent');
same(ons(run(noise(1, db(-62))).events).length, 0, 'noise under the gate plays no notes');
const humOnly = sum(noise(1.5, db(-70)), hum(1.5, 60, db(-40)));
same(ons(run(humOnly).events).length, 0, 'mains hum plays no notes');

// A pluck over hum, with the hum notched out.
const overHum = sum(humOnly, plucked(1.5, [{ midi: 57, at: 0.5 }]));
const notched = run(overHum, { ...CONFIG, gateDb: -48, hum: [60, 120, 180] });
same(
  ons(notched.events).map((e) => e.midi),
  [57],
  'a pluck over notched hum is heard, alone',
);

// A re-pluck of the same note is a new note.
const again = run(
  plucked(1.8, [
    { midi: 52, at: 0.2 },
    { midi: 52, at: 0.9 },
  ]),
);
same(
  ons(again.events).map((e) => e.midi),
  [52, 52],
  'a re-pluck starts the note again',
);

// A hammer-on: the pitch moves with no new pluck.
{
  const a = renderPluck(45, RATE);
  const b = renderPluck(47, RATE);
  const out = new Float32Array(Math.round(1.6 * RATE));
  const from = Math.round(0.2 * RATE);
  const change = Math.round(0.8 * RATE);
  const rms = (x, i, n) => Math.sqrt(x.slice(i, i + n).reduce((s, v) => s + v * v, 0) / n);
  const match = rms(a, change - from - 2400, 2400) / rms(b, 0, 2400);
  for (let k = from; k < change; k++) out[k] = 0.6 * a[k - from];
  for (let k = change; k < out.length; k++) out[k] = 0.6 * match * 0.9 * b[k - change];
  const { events: legato } = run(out);
  same(
    ons(legato).map((e) => e.midi),
    [45, 47],
    'a hammer-on moves to the new note',
  );
  const moved = ons(legato)[1];
  check(moved && Math.abs(moved.t - 0.8) < 0.04, `the hammer-on dated to ${moved?.t.toFixed(3)} s`);
}

// A low E whose second harmonic is eight times its first.
{
  const out = new Float32Array(RATE);
  const f = hzOf(40);
  const amps = [0.12, 1, 0.6, 0.4, 0.2];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const env = t < 0.2 ? 0 : Math.exp(-(t - 0.2) * 2);
    let v = 0;
    amps.forEach((a, h) => (v += a * Math.sin(2 * Math.PI * f * (h + 1) * t)));
    out[i] = 0.15 * env * v;
  }
  same(
    ons(run(out).events).map((e) => e.midi),
    [40],
    'a weak-fundamental low E is still E2',
  );
}

// Harder plucks read louder.
{
  const soft = ons(run(plucked(1, [{ midi: 55, at: 0.2, level: 0.05 }])).events)[0];
  const hard = ons(run(plucked(1, [{ midi: 55, at: 0.2, level: 0.8 }])).events)[0];
  check(
    soft && hard && hard.velocity > soft.velocity + 0.2,
    'a hard pluck is louder than a soft one',
  );
}

// Plucks are reported as hits whether or not a note comes of them.
{
  const hits = run(plucked(2, line.slice(0, 3))).events.filter((e) => e.kind === 'hit');
  same(hits.length, 3, 'one hit per pluck');
}

// The tracker on readings shaped like a real guitar's, from a recorded clip that had short notes
// that were never played. A reading every 4 ms, each pitch frame reaching 26 ms back.
const HOP = 0.004;
const FRAME = 0.026;
/** Readings over [from, to): `pitch` is a note or a function of the reading's frame start. */
function readings(spans) {
  const out = [];
  for (const [from, to, pitch, level = -20, clarity = 0.98] of spans) {
    for (let t = from; t < to - 1e-9; t += HOP) {
      const since = t - FRAME;
      const p = typeof pitch === 'function' ? pitch(since) : pitch;
      out.push({ t, since, level, pitch: p, clarity: p === null ? 0 : clarity });
    }
  }
  return out;
}
function track(spans) {
  const tracker = new Tracker(CONFIG);
  const out = [];
  const rs = readings(spans);
  for (const r of rs) out.push(...tracker.push(r));
  out.push(...tracker.flush(rs.at(-1).t + HOP));
  return out;
}
const silence = (from, to) => [from, to, null, -90];

// A new note plucked over one still ringing: frames reaching back before the pluck hold the old one.
{
  const heard = track([
    silence(0, 0.2),
    [0.2, 1, 67, -30],
    [1, 2, (since) => (since < 1 ? 67 : 70), -18],
  ]);
  same(
    ons(heard).map((e) => e.midi),
    [67, 70],
    'a note plucked over a ringing one is the new note, not the old one again',
  );
  check(Math.abs(ons(heard)[1].t - 1) < 0.005, 'and is dated to the pluck');
}

// Slips of an octave and two octaves, mid-note and in the tail, are the same note.
same(
  ons(
    track([
      silence(0, 0.2),
      [0.2, 0.5, 64],
      [0.5, 0.56, 52],
      [0.56, 1, 64, -30],
      [1, 1.17, 40, -34],
      [1.17, 1.4, 64, -36],
    ]),
  ).map((e) => e.midi),
  [64],
  'octave slips are not new notes',
);

// A pluck read an octave low in some of its first frames takes the octave most frames agree on.
same(
  ons(
    track([silence(0, 0.2), [0.2, 0.6, (since) => (since >= 0.2 && since < 0.204 ? 52 : 64)]]),
  ).map((e) => e.midi),
  [64],
  'a new note takes the octave most of its frames agree on',
);

// A murky reading doesn't move a note without a pluck; a clear one does.
same(
  ons(track([silence(0, 0.2), [0.2, 0.6, 60], [0.6, 1, 62, -20, 0.85]])).map((e) => e.midi),
  [60],
  'a murky reading of another note leaves the note alone',
);
same(
  ons(track([silence(0, 0.2), [0.2, 0.6, 60], [0.6, 1, 62, -20, 0.97]])).map((e) => e.midi),
  [60, 62],
  'a clear one is a hammer-on',
);

// From a recorded scale: strings left ringing (a lifted finger's open string, low strings in
// sympathy) under and after the notes played.
const ringing = (midi, at, gain, seconds) => {
  const out = new Float32Array(Math.round(seconds * RATE));
  const d = renderPluck(midi, RATE);
  const from = Math.round(at * RATE);
  for (let i = 0; from + i < out.length && i < d.length; i++) {
    out[from + i] = d[i] * gain * Math.min(1, i / (0.05 * RATE));
  }
  return out;
};
for (const midi of [71, 73, 76]) {
  const low = [40, 45].map((m) => ringing(m, 0.2, 0.6 * db(-18), 1.2));
  same(
    ons(run(sum(plucked(1.2, [{ midi, at: 0.2 }]), ...low)).events).map((e) => e.midi),
    [midi],
    `low strings ringing in sympathy don't take over as ${midi} fades`,
  );
}
// The string an octave below, already ringing as loud as the new pluck: together they repeat at
// the lower note's period, which is what a one-note detector reports unless it looks for the
// shorter period that explains them nearly as well.
{
  const below = renderPluck(59, RATE);
  const signal = new Float32Array(Math.round(1.2 * RATE));
  const into = Math.round(0.2 * RATE);
  for (let i = 0; i < signal.length && i + into < below.length; i++) {
    signal[i] = below[i + into] * 0.6;
  }
  same(
    ons(run(sum(signal, plucked(1.2, [{ midi: 71, at: 0.4 }]))).events).map((e) => e.midi),
    [59, 71],
    'a note plucked over its octave below, still ringing, is the higher note',
  );
}

// A finger lifted off a fretted note: the level drops fast and the open string rings on, quieter.
same(
  ons(
    track([
      silence(0, 0.2),
      [0.2, 0.5, 66, -25],
      [0.5, 0.508, 66, -38],
      [0.508, 0.8, 64, -42],
      [0.8, 1.1, 68, -24],
    ]),
  ).map((e) => e.midi),
  [66, 68],
  'the open string left ringing by a lifted finger is not a note',
);
// The lifted finger plucks the open string a little: a pluck far quieter than the note just played.
same(
  ons(
    track([
      silence(0, 0.2),
      [0.2, 0.5, 66, -22],
      [0.5, 0.55, null, -52],
      [0.55, 0.8, 64, -38],
      [0.8, 1.1, 68, -22],
    ]),
  ).map((e) => e.midi),
  [66, 68],
  'a stray pluck far under the note just played is not a note',
);
same(
  ons(track([silence(0, 0.2), [0.2, 0.5, 66, -22], silence(0.5, 1), [1, 1.3, 68, -40]])).map(
    (e) => e.midi,
  ),
  [66, 68],
  'a soft note after a pause is still a note',
);
same(
  ons(track([silence(0, 0.2), [0.2, 0.6, 64, -22], [0.6, 1, 57, -24]])).map((e) => e.midi),
  [64, 57],
  'a pull-off within reach of the hand moves the note',
);
same(
  ons(track([silence(0, 0.2), [0.2, 0.6, 64, -22], [0.6, 1, 45, -24]])).map((e) => e.midi),
  [64],
  'a far jump with no pluck is a string ringing in sympathy, not a move',
);

done('the detector hears single notes where and when they were played');
