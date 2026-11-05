// On a small screen the top bar keeps what's needed while playing (the mode, Play and Pause, the
// Why button) and the rest moves into a drawer behind ☰. Each control marked `data-menu` in
// index.html goes to the drawer section of that name, in page order, and back to its own place
// when the screen grows. They're moved rather than copied, so their handlers and state go too.
// style.css hides them in the bar on a small screen before this runs, so nothing flashes.

import { COMPACT } from '../tuning.js';
import { $ } from './dom.js';

/** Buttons in the drawer that open something else, which the drawer would cover. */
const OPENERS = '#settings-open, #clips-open, #guitar-open, #edit-open';

let setOpen: (open: boolean) => void = () => {};

/** Opens or closes the drawer, for the tour to show what's in it. */
export function openMenu(open: boolean): void {
  setOpen(open);
}

export function bindMenu(): void {
  const menu = $('#menu');
  const opener = $<HTMLButtonElement>('#menu-open');
  const moves = [...document.querySelectorAll<HTMLElement>('[data-menu]')].map((node) => {
    const mark = document.createComment(node.id || node.textContent!.trim());
    node.before(mark);
    return { node, mark, section: $(`#menu [data-section='${node.dataset['menu']}']`) };
  });

  setOpen = (open: boolean) => {
    menu.hidden = !open;
    opener.setAttribute('aria-expanded', String(open));
  };
  const compact = matchMedia(COMPACT);
  const arrange = () => {
    for (const { node, mark, section } of moves) {
      if (compact.matches) section.append(node);
      else if (node.previousSibling !== mark) mark.after(node);
    }
    if (!compact.matches) setOpen(false);
  };
  compact.addEventListener('change', arrange);
  arrange();

  opener.addEventListener('click', () => {
    setOpen(menu.hidden !== false);
    opener.blur();
  });
  $('#menu-close').addEventListener('click', () => setOpen(false));
  menu.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target === menu || target.closest(OPENERS)) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) setOpen(false);
  });
}

/**
 * What shows `node` on screen: itself, or the button that brings it out, while it waits in the closed
 * drawer (☰) or in the explanations put away (?), which on a short screen hold the chords too.
 */
export function shownBy(node: HTMLElement | null): HTMLElement | null {
  if (!node || node.getClientRects().length > 0) return node;
  if (node.closest('#menu')) return document.getElementById('menu-open');
  const away = document.body.classList.contains('why-closed');
  return away && node.closest('#side') ? document.getElementById('why-open') : node;
}
