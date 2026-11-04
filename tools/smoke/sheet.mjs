// Sheet music from clips: played timing snaps to written values on the backing's beat, every bar
// adds up, ties and accidentals land where they should, and the PDF is well formed.

import { notate, values } from 'chordlight/clips/notate.js';
import { scoreOf, fifthsOf } from 'chordlight/clips/score.js';
import { clipToPdf } from 'chordlight/clips/sheet.js';
import { spellKey } from 'chordlight/theory/scales.js';
import { check, done, same } from './kit/check.mjs';

const bpm = 100;
const spb = 60 / bpm;
const backing = [
  {
    t: 0,
    playing: true,
    beat: 0,
    bpm,
    text: 'I V vi IV',
    home: 0,
    mood: 'major',
    style: 'pad',
    bass: true,
  },
];
let seed = 3;
const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.04;

/** A clip from [beat, beats, midi] at `bpm`, struck a little early or late and released short. */
function clip(notes, extra = {}) {
  const events = [];
  for (const [beat, beats, midi, voice = 'piano'] of notes) {
    const t = Math.max(0, beat * spb + jitter());
    events.push({ t, on: true, midi, vel: 0.7, voice });
    events.push({ t: t + beats * spb * 0.7, on: false, midi, vel: 0, voice });
  }
  events.sort((a, b) => a.t - b.t || Number(a.on) - Number(b.on));
  const end = Math.max(...notes.map(([b, l]) => b + l));
  return {
    id: 'x',
    created: 0,
    duration: end * spb + 0.3,
    events,
    where: 'C major',
    backing,
    ...extra,
  };
}

// Snapping: four short quarters read as four quarters, both hands on their own staff.
const s = scoreOf(
  clip([
    [0, 1, 72],
    [1, 1, 74],
    [2, 1, 76],
    [3, 1, 77],
    [0, 4, 48],
  ]),
);
same(
  s.staves.map((x) => x.clef),
  ['treble', 'bass'],
  'split at middle C',
);
same(
  s.staves[0].notes.map((n) => [n.start, n.beats]),
  [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  'quarters',
);
same(
  s.staves[1].notes.map((n) => [n.start, n.beats]),
  [[0, 2.75]],
  'a bass note let go early keeps its length',
);
same(s.chords, [{ beat: 0, name: 'C' }], 'the backing names the chord');
same([s.bars, s.loose, s.bpm], [1, false, bpm], 'one bar on the backing beat');

const eighths = scoreOf(
  clip([
    [0.5, 0.5, 72],
    [1, 0.5, 74],
    [1.5, 1.5, 76],
    [3, 0.25, 77],
    [3.25, 0.75, 79],
  ]),
);
same(
  eighths.staves[0].notes.map((n) => [n.start, n.beats]),
  [
    [0.5, 0.5],
    [1, 0.5],
    [1.5, 1.5],
    [3, 0.25],
    [3.25, 0.75],
  ],
  'eighths, a dotted quarter and a sixteenth survive the jitter',
);
same(eighths.staves.length, 1, 'no bass staff when nothing is under middle C');

// Played late, as the browser and the player both run: from a real clip, notes up to a sixth of a
// beat behind still read as on the beat, and a pickup lands on the half beat.
const lateness = [0.075, 0.04, 0.135, 0.127, 0.19, 0.175];
const late = clip([
  [0, 2, 72],
  [2, 2, 69],
  [4, 2, 74],
  [6, 1.5, 72],
  [7.5, 0.5, 71],
  [8, 4, 69],
]);
let n = 0;
for (const e of late.events) if (e.on) e.t = [0, 2, 4, 6, 7.5, 8][n] * spb + lateness[n++] * spb;
same(
  scoreOf(late).staves[0].notes.map((x) => x.start),
  [0, 2, 4, 6, 7.5, 8],
  'late notes snap back to the beat',
);
const onTheE = scoreOf(
  clip([
    [0, 0.25, 72],
    [0.25, 0.75, 74],
    [1, 1, 76],
  ]),
);
same(
  onTheE.staves[0].notes.map((x) => x.start),
  [0, 0.25, 1],
  'a sixteenth on the "e" stays there',
);

const loose = scoreOf(clip([[0, 1, 60]], { backing: undefined }));
same([loose.loose, loose.bpm], [true, 120], 'without a backing the beat is assumed');
const held = scoreOf(
  clip(
    [
      [0, 4, 57, 'pad'],
      [0, 4, 61, 'pad'],
      [0, 4, 64, 'pad'],
    ],
    { backing: undefined },
  ),
);
same(held?.chords, [{ beat: 0, name: 'A' }], 'held chords alone still make a page of names');
same(
  scoreOf({ id: 'e', created: 0, duration: 1, events: [], where: 'C major' }),
  null,
  'nothing to write',
);

same(
  [
    ['E♭', 3, 'major'],
    ['A', 9, 'major'],
    ['D', 2, 'dorian'],
    ['F♯', 6, 'minor'],
  ].map(([, home, mood]) => fifthsOf(spellKey({ home, mood }))),
  [-3, 3, 0, 3],
  'key signatures',
);

// Values: the beat decides where a note may be cut.
const v = (beat, beats) => values(beat, beats, 4).map((x) => `${x.type}${'.'.repeat(x.dots)}`);
same(v(0, 3.5), ['half.', 'eighth'], 'three and a half beats from the bar line');
same(v(0.5, 1), ['eighth', 'eighth'], 'an off-beat quarter is cut at the beat');
same(v(1, 2), ['half'], 'a half may start on any beat');
same(v(0.25, 0.75), ['16th', 'eighth'], 'an off-beat dotted eighth is cut back to the half beat');

// A long piece: every bar adds up, ties chain, accidentals reset at the bar line.
const notes = [];
for (let b = 0; b < 64; b++) notes.push([b * 1.75, 1.75, [72, 73, 74, 68, 69][b % 5]]);
const long = clip(notes);
const score = scoreOf(long);
const staves = notate(score);
for (const staff of staves) {
  staff.bars.forEach((bar, i) => {
    const sum = bar.reduce((n, e) => n + e.beats, 0);
    check(Math.abs(sum - 4) < 1e-6, `bar ${i + 1} of the ${staff.clef} adds up to ${sum}`);
    for (const e of bar) {
      const ties = (e.heads ?? []).filter((h) => h.tieStart);
      for (const h of ties) {
        const at = bar.indexOf(e);
        const next = bar[at + 1] ?? staff.bars[i + 1]?.[0];
        check(
          next?.heads?.some((n) => n.midi === h.midi && n.tieStop),
          `bar ${i + 1}: a tie to nothing`,
        );
      }
    }
    // Mirrors notate's rule: a sign wherever the line's alteration changes in the bar, and on the
    // first note after one tied in when either is off the key (C major here, so off zero).
    const shown = new Map();
    const tied = new Map();
    for (const e of bar) {
      for (const h of e.heads ?? []) {
        if (h.tieStop) {
          if (!shown.has(h.line)) tied.set(h.line, h.alter);
          continue;
        }
        const after = shown.has(h.line) ? undefined : tied.get(h.line);
        const want =
          h.alter !== (shown.get(h.line) ?? 0) || (after !== undefined && (after || h.alter));
        check(
          (h.accidental !== undefined) === Boolean(want),
          `bar ${i + 1}: accidental on ${h.midi}`,
        );
        shown.set(h.line, h.alter);
      }
    }
  });
}

// The PDF: well formed, every object where the cross-reference table says, plain ASCII.
const pdf = clipToPdf(long);
const text = new TextDecoder('latin1').decode(pdf);
check(text.startsWith('%PDF-1.4\n') && text.endsWith('%%EOF\n'), 'the PDF header and trailer');
check(
  pdf.every((b) => b < 128),
  'the PDF is plain ASCII',
);
const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
check(text.slice(xref).startsWith('xref'), 'startxref points at the table');
const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
offsets.forEach((o, i) =>
  check(text.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} isn't at ${o}`),
);
for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
  const start = m.index + m[0].length;
  check(text.startsWith('endstream', start + Number(m[1])), 'a stream length is wrong');
}
const pages = Number(/\/Count (\d+)/.exec(text)[1]);
check(pages > 1, `${score.bars} bars fit on ${pages} page`);
same((text.match(/\/Type \/Page /g) ?? []).length, pages, 'the page tree counts every page');
check(text.includes('(C) Tj'), 'chord names are written');

done(`snapping, values, ${score.bars} bars notated, a ${pages}-page PDF of ${pdf.length} bytes`);
