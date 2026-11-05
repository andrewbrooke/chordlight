// The editor's "what comes next" box: chords that sound good after the progression's last one,
// grouped by how they move from it (theory/next.ts), all in one wrapping row. A click plays the
// change from the last chord.

import type { App } from '../app.js';
import { type Chord, chordName } from '../theory/chords.js';
import { type Next, nextChords, PULLS } from '../theory/next.js';
import { numeralLabel } from '../theory/roman.js';
import { chordChip, type Picks } from './chosen.js';
import { $, el } from './dom.js';
import { NEXT_WORDS, PULL_WORDS } from './words.js';

export function bindNext(app: App, picks: Picks): void {
  const host = $('#next-pick');
  let following = '';

  const build = () => {
    const last = app.steps.at(-1)?.chord;
    const now = last ? `${app.key.name}|${app.steps.length}|${chordName(last)}` : '';
    if (now !== following) {
      following = now;
      picks.drop('next');
    }
    if (!last) {
      host.replaceChildren(el('p', { className: 'quiet', text: 'Add a chord first.' }));
      return;
    }

    const list = nextChords(last, app.key);
    const chip = (n: Next) =>
      chordChip(
        n.chord,
        app.key,
        picks.is('next', n.chord),
        () => {
          app.tryMove(last, n.chord);
          picks.pick({ box: 'next', chord: n.chord, words: NEXT_WORDS[n.reason][1], from: last });
        },
        NEXT_WORDS[n.reason][0],
      );
    host.replaceChildren(
      el('div', { className: 'flow' }, [
        tier('After', [followed(last)]),
        el('span', { className: 'arrow', text: '→' }),
        ...PULLS.flatMap((pull) => {
          const items = list.filter((n) => n.pull === pull);
          return items.length > 0 ? [tier(PULL_WORDS[pull], items.map(chip))] : [];
        }),
      ]),
    );
  };

  const followed = (chord: Chord) =>
    el('div', { className: 'chip after' }, [
      el('span', { className: 'numeral', text: numeralLabel(chord, app.key) }),
      el('span', { className: 'name', text: chordName(chord) }),
      el('span', { className: 'tag', text: 'last chord' }),
    ]);

  app.on('settings', build);
  picks.watch(build);
  build();
}

/** A group with its name in small capitals over it, so groups can sit side by side. */
function tier(label: string, items: HTMLElement[]): HTMLElement {
  return el('div', { className: 'tier' }, [
    el('span', { className: 'cap', text: label }),
    el('div', { className: 'chips' }, items),
  ]);
}
