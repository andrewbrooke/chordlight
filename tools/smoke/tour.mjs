// The tour: every step's targets exist in index.html, each step's text reads in every layout and
// key, its actions are recognised, and the card lands inside the window beside its target.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capOf, offsets } from 'chordlight/input/layouts.js';
import { chordPcs } from 'chordlight/theory/chords.js';
import { diatonicChords } from 'chordlight/theory/diatonic.js';
import { MOODS, spellKey } from 'chordlight/theory/scales.js';
import { placeCard } from 'chordlight/ui/tour-place.js';
import { capsFor, STEPS } from 'chordlight/ui/tour-steps.js';
import { check, done, same } from './kit/check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const id of ['tour-again', 'start-plain']) check(ids.has(id), `index.html has no #${id}`);

/** Just enough of App for the steps: a key, the computer keys, and what's held. */
function fakeApp(layout, home, mood) {
  const key = spellKey({ home, mood });
  const map = offsets(layout, home, key.mood.steps);
  const base = 60;
  const app = {
    key,
    s: { mode: 'progression', why: false, clipSeconds: 30 },
    held: [],
    audio: null,
    keys: {
      span: () => [base + Math.min(...map.values()), base + Math.max(...map.values())],
      capFor: (midi) => {
        for (const [code, o] of map) if (base + o === midi) return capOf(code);
        return '';
      },
    },
    heldNotes: () => app.held,
    keyChordNow: () => null,
    set: (patch) => Object.assign(app.s, patch),
    setMode: (mode) => (app.s.mode = mode),
  };
  return app;
}

const titles = STEPS.map((s) => s.title);
same(new Set(titles).size, titles.length, 'step titles are unique');
for (const step of STEPS) {
  for (const id of step.targets) check(ids.has(id), `"${step.title}" points at missing #${id}`);
}

const homeStep = STEPS.find((s) => s.title === 'The home chord');
for (const layout of ['key', 'piano', 'rows']) {
  for (const mood of MOODS) {
    for (let home = 0; home < 12; home++) {
      const app = fakeApp(layout, home, mood.id);
      const label = `${layout}, ${app.key.name}`;
      for (const step of STEPS) {
        step.before?.(app);
        const text = step.text(app);
        check(
          text.length > 20 && !/undefined|NaN/.test(text),
          `${label}: "${step.title}" reads ${text}`,
        );
      }
      const I = diatonicChords(app.key)[0];
      const caps = capsFor(app, chordPcs(I));
      if (layout === 'key') same(caps, 'Q E T', `${label}: the home chord's keys`);
      check(caps !== '', `${label}: no keys found for the home chord`);
      app.held = [];
      check(!homeStep.done(app), `${label}: nothing held counts as the home chord`);
      app.held = chordPcs(I).map((pc) => 48 + pc);
      check(homeStep.done(app), `${label}: holding the home chord isn't recognised`);
      app.held = app.held.slice(1);
      check(!homeStep.done(app), `${label}: two of its notes count as the home chord`);
    }
  }
}

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
let placed = 0;
for (const [vw, vh] of [
  [1440, 900],
  [1024, 700],
  [390, 800],
]) {
  for (let i = 0; i < 400; i++) {
    const r = (n) => ((i * 2654435761 + n * 40503) % 1000) / 1000;
    const left = r(1) * vw * 0.9;
    const top = r(2) * vh * 0.9;
    const target = {
      left,
      top,
      right: Math.min(vw, left + 20 + r(3) * vw * 0.8),
      bottom: Math.min(vh, top + 20 + r(4) * vh * 0.6),
    };
    const [w, h] = [Math.min(300, vw - 20), 170];
    const { x, y } = placeCard(target, w, h, vw, vh, 10, 10);
    const card = { left: x, top: y, right: x + w, bottom: y + h };
    const where = `${vw}x${vh}, target ${JSON.stringify(target)}`;
    check(
      x >= 10 && y >= 10 && card.right <= vw - 10 && card.bottom <= vh - 10,
      `${where}: card off screen`,
    );
    const room = [vh - target.bottom - h, target.top - h, vw - target.right - w, target.left - w];
    if (room.some((n) => n >= 20))
      check(!overlaps(card, target), `${where}: card covers its target`);
    placed++;
  }
}
const centred = placeCard(null, 300, 170, 1000, 600, 10, 10);
same(centred, { x: 350, y: 215 }, 'with no target the card is centred');

done(`${STEPS.length} steps in 3 layouts × ${MOODS.length * 12} keys; ${placed} placements`);
