// The first-run tour: a card beside each feature in turn, with the rest of the page dimmed but
// still live, since most steps are finished by doing the thing. Skip or Esc ends it at any step,
// and it's marked seen as soon as it starts, so it never comes back unasked.

import type { App } from '../app.js';
import { TOUR } from '../tuning.js';
import { $, el } from './dom.js';
import { load, save } from './storage.js';
import { grow, placeCard, type Rect, union } from './tour-place.js';
import { STEPS } from './tour-steps.js';

export const tourSeen = (): boolean => load('tour', { seen: false }).seen;
export const markTourSeen = (): void => void save('tour', { seen: true });

let stopTour: (() => void) | null = null;

export function bindTour(app: App): void {
  $('#tour-again').addEventListener('click', (e) => {
    $('#settings').hidden = true;
    (e.currentTarget as HTMLElement).blur();
    startTour(app);
  });
}

export function startTour(app: App): void {
  stopTour?.();
  markTourSeen();

  const ring = el('div', { className: 'tour-ring' });
  const count = el('span', { className: 'quiet' });
  const title = el('h2');
  const body = el('p');
  const hint = el('p', { className: 'quiet' });
  const skip = el('button', { text: 'Skip tour', title: 'End the tour (Esc)' });
  const next = el('button', { className: 'primary' });
  const card = el('div', { className: 'tour-card' }, [
    count,
    title,
    body,
    hint,
    el('div', { className: 'row' }, [skip, el('span', { className: 'spacer' }), next]),
  ]);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Tour');
  body.setAttribute('aria-live', 'polite');
  document.body.append(ring, card);

  let index = 0;
  /** A step's action only counts once it has been seen undone, so a note held over doesn't. */
  let armed = false;
  let doneAt: number | null = null;
  let frame = 0;
  let placed = '';

  const go = (i: number) => {
    if (i >= STEPS.length) return end();
    index = i;
    armed = false;
    doneAt = null;
    const step = STEPS[i]!;
    step.before?.(app);
    count.textContent = `${i + 1} of ${STEPS.length}`;
    title.textContent = step.title;
    hint.textContent = step.done ? 'Try it, or press Next.' : '';
    const last = i === STEPS.length - 1;
    next.textContent = last ? 'Finish' : 'Next';
    skip.hidden = last;
    card.classList.remove('done');
  };

  const place = () => {
    const rects = STEPS[index]!.targets.flatMap((id) => {
      const node = document.getElementById(id);
      const r = (node?.closest('label') ?? node)?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? [r as Rect] : [];
    });
    const target = rects.length > 0 ? grow(union(rects), TOUR.pad) : null;
    const { x, y } = placeCard(
      target,
      card.offsetWidth,
      card.offsetHeight,
      innerWidth,
      innerHeight,
      TOUR.gap,
      TOUR.margin,
    );
    const key = `${JSON.stringify(target)}|${x}|${y}`;
    if (key === placed) return;
    placed = key;
    ring.hidden = !target;
    if (target) {
      Object.assign(ring.style, {
        left: `${target.left}px`,
        top: `${target.top}px`,
        width: `${target.right - target.left}px`,
        height: `${target.bottom - target.top}px`,
      });
    }
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  };

  const tick = (now: number) => {
    const step = STEPS[index]!;
    const text = step.text(app);
    if (body.textContent !== text) body.textContent = text;
    if (step.done && doneAt === null) {
      if (!step.done(app)) armed = true;
      else if (armed) {
        doneAt = now;
        card.classList.add('done');
        hint.textContent = 'Nice.';
      }
    }
    if (doneAt !== null && now - doneAt >= TOUR.advanceDelay * 1000) go(index + 1);
    if (stopTour !== end) return;
    place();
    frame = requestAnimationFrame(tick);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') end();
  };

  function end(): void {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey);
    ring.remove();
    card.remove();
    if (stopTour === end) stopTour = null;
  }

  skip.addEventListener('click', end);
  next.addEventListener('click', () => {
    next.blur();
    go(index + 1);
  });
  window.addEventListener('keydown', onKey);
  stopTour = end;
  go(0);
  frame = requestAnimationFrame(tick);
}
