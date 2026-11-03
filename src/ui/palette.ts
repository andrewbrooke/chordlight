import type { App } from '../app.js';
import { chordName } from '../theory/chords.js';
import { diatonicChords, jobOf } from '../theory/diatonic.js';
import { numeralLabel } from '../theory/roman.js';
import { $, el } from './dom.js';
import { CHORD_CODES, capOf } from '../input/keys.js';

export function bindPalette(app: App): void {
  const host = $('#palette');
  const build = () => {
    const held = app.keyChord ?? app.heldChord;
    host.replaceChildren(
      ...diatonicChords(app.key).map((chord, i) => {
        const card = el('button', { className: `card job-${jobOf(chord, app.key)}` }, [
          el('span', { className: 'numeral', text: numeralLabel(chord, app.key) }),
          el('span', { className: 'name', text: chordName(chord) }),
          el('span', { className: 'tag', text: capOf(CHORD_CODES[i]!) }),
        ]);
        card.classList.toggle('held', held === i);
        card.title = 'Click to hold this chord; click again to let go';
        card.addEventListener('click', () => {
          app.togglePalette(i);
          card.blur();
        });
        return card;
      }),
    );
  };
  app.on('settings', build);
  app.on('context', build);
  build();
}
