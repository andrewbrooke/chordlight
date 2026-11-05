// What the editor's chord boxes share: the chip for a chord, and the one chord picked across all of
// them, shown in the bar under the boxes beside the only button that adds. A chip click only plays.

import type { App } from '../app.js';
import { type Chord, chordName, chordSpellings } from '../theory/chords.js';
import { jobOf } from '../theory/diatonic.js';
import { nameOf } from '../theory/pitch.js';
import { numeralLabel, numeralText } from '../theory/roman.js';
import type { SpelledKey } from '../theory/scales.js';
import { el } from './dom.js';

export function chordChip(
  chord: Chord,
  key: SpelledKey,
  on: boolean,
  click: () => void,
  tag = '',
): HTMLButtonElement {
  const b = el('button', { className: `chip job-${jobOf(chord, key)}${on ? ' on' : ''}` }, [
    el('span', { className: 'numeral', text: numeralLabel(chord, key) }),
    el('span', { className: 'name', text: chordName(chord) }),
  ]);
  if (tag) b.append(el('span', { className: 'tag', text: tag }));
  b.addEventListener('click', click);
  return b;
}

/** A chord picked in one of the boxes; `from` when it was heard as the change from that chord. */
export interface Pick {
  box: string;
  chord: Chord;
  words: string;
  from?: Chord | undefined;
}

export class Picks {
  private current: Pick | null = null;
  private readonly redraws: (() => void)[] = [];

  constructor(
    private readonly app: App,
    private readonly bar: HTMLElement,
    private readonly add: (token: string) => void,
  ) {
    this.draw();
  }

  /** A box's own redraw, run whenever the pick moves, so only one chip is ever lit. */
  watch(redraw: () => void): void {
    this.redraws.push(redraw);
  }

  pick(p: Pick | null): void {
    this.current = p;
    for (const redraw of this.redraws) redraw();
    this.draw();
  }

  is(box: string, chord: Chord): boolean {
    return this.current?.box === box && chordName(this.current.chord) === chordName(chord);
  }

  /** Lets go of a box's pick from inside that box's own redraw. */
  drop(box: string): void {
    if (this.current?.box !== box) return;
    this.current = null;
    this.draw();
  }

  private draw(): void {
    const p = this.current;
    const key = this.app.key;
    if (!p) {
      this.bar.className = 'chosen empty';
      this.bar.replaceChildren(
        el('span', { className: 'quiet', text: 'Click any chord above to hear it.' }),
      );
      return;
    }
    const adder = el('button', { className: 'primary', text: 'Add to progression' });
    adder.addEventListener('click', () => {
      this.add(numeralText(p.chord, key));
      this.pick(null);
    });
    this.bar.className = `chosen job-${jobOf(p.chord, key)}`;
    this.bar.replaceChildren(
      ...(p.from ? [el('span', { className: 'from', text: `${chordName(p.from)} →` })] : []),
      el('span', { className: 'big', text: chordName(p.chord) }),
      el('span', { className: 'numeral', text: numeralLabel(p.chord, key) }),
      el('span', { className: 'notes', text: chordSpellings(p.chord).map(nameOf).join(' ') }),
      el('span', { className: 'words', text: p.words }),
      el('span', { className: 'spacer' }),
      adder,
    );
  }
}
