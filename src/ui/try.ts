// The editor's chord tryer: any root and any chord type. Like the editor's other boxes, a click
// plays and Add adds; a double-click to add would first play the chord twice.

import type { App } from '../app.js';
import { type Chord, chordName, QUALITIES, type QualityId, qualityOf } from '../theory/chords.js';
import { parseRoman, ROOT_NUMERALS } from '../theory/roman.js';
import type { Picks } from './chosen.js';
import { $, el, group } from './dom.js';

/** Chord types in rows by size, each under its name. */
const ROWS = [
  ['Triads', 3],
  ['Four notes', 4],
  ['Ninths', 5],
] as const;

export function bindTry(app: App, picks: Picks): void {
  const pickers = $('#try-pick');
  let root = 0;
  let quality: QualityId = 'maj';

  const chordAt = (r: number, q: QualityId): Chord => ({
    root: parseRoman(ROOT_NUMERALS[r]!, app.key)!.chord.root,
    quality: q,
  });

  const pick = (r: number, q: QualityId) => {
    root = r;
    quality = q;
    const chord = chordAt(r, q);
    const notes = app.tryChord(chord);
    picks.pick({ box: 'try', chord, notes, words: qualityOf(q).words });
  };

  const toggle = (className: string, label: (Node | string)[], on: boolean, fn: () => void) => {
    const b = el('button', { className: on ? `${className} on` : className }, label);
    b.addEventListener('click', fn);
    return b;
  };

  const build = () => {
    const roots = ROOT_NUMERALS.map((numeral, r) =>
      toggle(
        'chip',
        [
          el('span', { className: 'numeral', text: numeral }),
          el('span', { className: 'name', text: chordName(chordAt(r, 'maj')) }),
        ],
        r === root,
        () => pick(r, quality),
      ),
    );
    const kinds = ROWS.map(([label, size]) =>
      group(
        label,
        QUALITIES.filter((q) => Math.max(3, q.tones.length) === size).map((q) => {
          const b = toggle('kind', [chordName(chordAt(root, q.id))], q.id === quality, () =>
            pick(root, q.id),
          );
          b.title = q.words;
          return b;
        }),
      ),
    );
    pickers.replaceChildren(group('Root', roots), ...kinds);
  };

  app.on('settings', build);
  picks.watch(build);
  build();
}
