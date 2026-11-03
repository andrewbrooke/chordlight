import type { App } from '../app.js';
import { type Chord, chordName } from '../theory/chords.js';
import { borrowedChords, diatonicChords, diatonicSevenths, jobOf } from '../theory/diatonic.js';
import { numeralLabel, numeralText } from '../theory/roman.js';
import { $, el } from './dom.js';

export function bindLane(app: App): void {
  const lane = $('#lane');
  let cards: HTMLElement[] = [];
  let shown = '';

  const build = () => {
    cards = app.steps.map((step, i) => {
      const job = jobOf(step.chord, app.key);
      const dots = el('span', { className: 'beats' });
      for (let b = 0; b < step.beats; b++) dots.append(el('i'));
      const card = el(
        'button',
        { className: `card job-${job}${job === 'borrowed' ? ' borrowed' : ''}` },
        [
          el('span', { className: 'numeral', text: numeralLabel(step.chord, app.key) }),
          el('span', { className: 'name', text: chordName(step.chord) }),
          el('span', { className: 'tag' }),
          dots,
        ],
      );
      card.addEventListener('click', () => {
        app.select(i);
        card.blur();
      });
      return card;
    });
    lane.replaceChildren(...cards);
    shown = '';
  };

  // Runs every frame, so it only touches the DOM when the state string changes.
  const update = () => {
    const pos = app.position;
    const current = pos ? pos.step : -1;
    const next = pos ? pos.next : -1;
    const beat = pos && !pos.countIn ? Math.floor(pos.beatInStep + 1e-6) : -1;
    const state = `${current}|${next}|${beat}|${app.selected}|${pos?.countIn}`;
    if (state === shown) return;
    shown = state;
    cards.forEach((card, i) => {
      card.classList.toggle('current', i === current && !pos?.countIn);
      card.classList.toggle('next', i === next && (pos?.countIn || i !== current));
      card.classList.toggle('selected', !pos && i === app.selected);
      card.querySelector('.tag')!.textContent =
        i === next && (pos?.countIn || i !== current) ? 'next' : '';
      card.querySelectorAll('.beats i').forEach((dot, b) => {
        dot.classList.toggle('done', i === current && b <= beat);
      });
    });
  };

  app.on('settings', build);
  app.on('frame', update);
  build();
  bindEditor(app);
}

function bindEditor(app: App): void {
  const editor = $('#editor');
  const text = $<HTMLInputElement>('#prog-text');
  const error = $('#prog-error');
  const add = $('#prog-add');
  const name = $<HTMLInputElement>('#save-name');
  const remove = $<HTMLButtonElement>('#delete-mine');

  $('#edit-open').addEventListener('click', (e) => {
    editor.hidden = !editor.hidden;
    if (!editor.hidden) {
      text.value = app.s.text;
      text.focus();
    }
    (e.currentTarget as HTMLElement).blur();
  });

  const apply = () => {
    const bad = app.applyText(text.value);
    error.textContent = bad === null ? '' : `Couldn't read "${bad}".`;
    if (bad === null) text.value = app.s.text;
  };
  $('#prog-apply').addEventListener('click', apply);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') text.blur();
  });

  const chip = (chord: Chord) => {
    const b = el('button', { className: 'card', title: `add ${chordName(chord)}` }, [
      el('span', { className: 'numeral', text: numeralLabel(chord, app.key) }),
      el('span', { className: 'name', text: chordName(chord) }),
    ]);
    b.classList.add(`job-${jobOf(chord, app.key)}`);
    b.addEventListener('click', () => {
      text.value = `${text.value.trim()} ${numeralText(chord, app.key)}`.trim();
      text.focus();
    });
    return b;
  };
  const chips = () => {
    const borrowed = borrowedChords(app.key).filter((c) => jobOf(c, app.key) === 'borrowed');
    add.replaceChildren(
      ...diatonicChords(app.key).map(chip),
      ...diatonicSevenths(app.key).map(chip),
      ...borrowed.map(chip),
    );
    if (document.activeElement !== text) text.value = app.s.text;
    const mine = app.s.preset.startsWith('mine:') ? app.s.preset.slice(5) : '';
    remove.hidden = mine === '';
    if (mine && document.activeElement !== name) name.value = mine;
  };
  app.on('settings', chips);
  app.on('mine', chips);
  chips();

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
