// The progression editor: the text and saving, three boxes of chords to pick from, and the one bar
// that adds the chord picked. A click in any box plays, so nothing goes in unheard.

import type { App } from '../app.js';
import { type Chord, qualityOf } from '../theory/chords.js';
import { borrowedChords, diatonicChords, diatonicSevenths, jobOf } from '../theory/diatonic.js';
import { chordChip, Picks } from './chosen.js';
import { $, group } from './dom.js';
import { bindNext } from './next.js';
import { bindTry } from './try.js';

export function bindEditor(app: App): void {
  const editor = $('#editor');
  const text = $<HTMLInputElement>('#prog-text');
  const error = $('#prog-error');
  const name = $<HTMLInputElement>('#save-name');
  const remove = $<HTMLButtonElement>('#delete-mine');

  $('#edit-open').addEventListener('click', (e) => {
    editor.hidden = !editor.hidden;
    if (editor.hidden) app.tryChord(null);
    else {
      // On a short screen the editor is in the sheet ? pulls out, which may be put away.
      if (editor.getClientRects().length === 0) app.set({ why: true });
      text.value = app.s.text;
      text.focus();
    }
    (e.currentTarget as HTMLElement).blur();
  });

  const apply = (): boolean => {
    const bad = app.applyText(text.value);
    error.textContent = bad === null ? '' : `Couldn't read "${bad}".`;
    if (bad === null) text.value = app.s.text;
    return bad === null;
  };
  $('#prog-apply').addEventListener('click', () => apply());
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') text.blur();
  });

  /** Adds a chord and applies it, so it lands in the lane straight away, selected and heard. */
  const append = (token: string) => {
    text.value = `${text.value.trim()} ${token}`.trim();
    if (apply()) app.select(app.steps.length - 1);
  };
  const picks = new Picks(app, $('#picked'), append);
  let key = app.key.name;
  app.on('settings', () => {
    if (app.key.name === key) return;
    key = app.key.name;
    picks.pick(null);
  });
  bindNext(app, picks);
  bindKeyBox(app, picks);
  bindTry(app, picks);

  const fields = () => {
    if (document.activeElement !== text) text.value = app.s.text;
    const mine = app.s.preset.startsWith('mine:') ? app.s.preset.slice(5) : '';
    remove.hidden = mine === '';
    if (mine && document.activeElement !== name) name.value = mine;
  };
  app.on('settings', fields);
  app.on('mine', fields);
  fields();

  $('#save-mine').addEventListener('click', () => {
    const n = name.value.trim();
    if (!n) {
      name.focus();
      return;
    }
    if (app.applyText(text.value) !== null) return;
    app.saveMine(n);
  });
  remove.addEventListener('click', () => {
    const mine = app.s.preset.slice(5);
    if (remove.dataset['armed'] !== mine) {
      remove.dataset['armed'] = mine;
      remove.textContent = 'Really delete?';
      return;
    }
    delete remove.dataset['armed'];
    remove.textContent = 'Delete this one';
    app.deleteMine(mine);
  });
}

/** The key's own chords, as triads and sevenths, and the borrowed ones songs use most. */
function bindKeyBox(app: App, picks: Picks): void {
  const title = $('#prog-add-title');
  const host = $('#prog-add');

  const build = () => {
    const key = app.key;
    const borrowed = borrowedChords(key).filter((c) => jobOf(c, key) === 'borrowed');
    const chip = (chord: Chord) =>
      chordChip(chord, key, picks.is('key', chord), () => {
        app.tryChord(chord);
        picks.pick({ box: 'key', chord, words: qualityOf(chord.quality).words });
      });
    title.textContent = `From ${key.name}`;
    host.replaceChildren(
      group('Triads', diatonicChords(key).map(chip)),
      group('Sevenths', diatonicSevenths(key).map(chip)),
      group('Borrowed', borrowed.map(chip)),
    );
  };
  app.on('settings', build);
  picks.watch(build);
  build();
}
