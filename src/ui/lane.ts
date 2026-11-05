import type { App } from '../app.js';
import { chordName } from '../theory/chords.js';
import { jobOf } from '../theory/diatonic.js';
import { numeralLabel } from '../theory/roman.js';
import { $, el } from './dom.js';
import { bindEditor } from './editor.js';

export function bindLane(app: App): void {
  const lane = $('#lane');
  let cards: HTMLElement[] = [];
  let shown = '';
  let followed = -1;

  const build = () => {
    cards = app.steps.map((step, i) => {
      const job = jobOf(step.chord, app.key);
      const dots = el('span', { className: 'beats' });
      for (let b = 0; b < step.beats; b++) dots.append(el('i'));
      const card = el('button', { className: `card job-${job}` }, [
        el('span', { className: 'numeral', text: numeralLabel(step.chord, app.key) }),
        el('span', { className: 'name', text: chordName(step.chord) + lifted(step.lift) }),
        el('span', { className: 'tag' }),
        dots,
      ]);
      card.addEventListener('click', () => {
        app.select(i);
        card.blur();
      });
      return card;
    });
    lane.replaceChildren(...cards);
    shown = '';
    followed = -1;
  };

  // Runs every frame, so it only touches the DOM when the state string changes.
  const update = () => {
    const pos = app.position;
    const current = pos ? pos.step : -1;
    const next = pos ? pos.next : -1;
    const beat = pos && !pos.countIn ? Math.floor(pos.beatInStep + 1e-6) : -1;
    const selected = app.trying ? -1 : app.selected;
    const state = `${current}|${next}|${beat}|${selected}|${pos?.countIn}`;
    if (state === shown) return;
    shown = state;
    cards.forEach((card, i) => {
      card.classList.toggle('current', i === current && !pos?.countIn);
      card.classList.toggle('next', i === next && (pos?.countIn || i !== current));
      card.classList.toggle('selected', !pos && i === selected);
      card.querySelector('.tag')!.textContent =
        i === next && (pos?.countIn || i !== current) ? 'next' : '';
      card.querySelectorAll('.beats i').forEach((dot, b) => {
        dot.classList.toggle('done', i === current && b <= beat);
      });
    });
    const focus = pos ? current : selected;
    if (focus !== followed) {
      followed = focus;
      const card = cards[focus];
      if (card) reveal(lane, card);
    }
  };

  app.on('settings', build);
  app.on('frame', update);
  build();
  bindEditor(app);
}

/** A voicing raised or lowered with ^ or _, as arrows after the chord's name. */
function lifted(lift = 0): string {
  return lift === 0 ? '' : ` ${(lift > 0 ? '↑' : '↓').repeat(Math.abs(lift))}`;
}

/** Scrolls a row that doesn't wrap (on a small screen) to show `card`, with the one after it. */
function reveal(row: HTMLElement, card: HTMLElement): void {
  const r = row.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  if (c.left < r.left) row.scrollBy({ left: c.left - r.left - 8, behavior });
  else if (c.right + c.width / 2 > r.right) row.scrollBy({ left: c.left - r.left - 8, behavior });
}
