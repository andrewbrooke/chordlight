// Small screens: how much of the keyboard and neck a stage shows (never fewer than STAGE.fewestKeys
// keys, and as fat as the screen allows up to STAGE.finger), that a section is whole keys or frets
// and moves one at a time, that desktops still show everything, and that the compact layout's
// wiring in index.html and style.css matches ui/menu.ts and COMPACT.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neckColumns, neckShape } from 'chordlight/view/neck-layout.js';
import { frame, widest } from 'chordlight/view/framing.js';
import { RANGES } from 'chordlight/settings.js';
import { keyboardShape, layoutKeys } from 'chordlight/view/layout.js';
import { COMPACT, GUITAR, KEYS, STAGE } from 'chordlight/tuning.js';
import { check, done, same } from './kit/check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const cols = neckColumns(GUITAR.frets);
const neck = neckShape(cols);
const keyboard = (range) => {
  const { spots, width } = layoutKeys(...RANGES[range]);
  return { ...keyboardShape(width), spots };
};

/** What a stage of w × h CSS px at `dpr` shows: the frame, and the white keys wholly in view. */
function show(shape, w, h, dpr, target) {
  const [W, H] = [w * dpr, h * dpr];
  const windowed = widest(shape, W, H, target * dpr) < shape.width;
  const shown = windowed ? widest(shape, W, H, target * dpr) : shape.width;
  const f = frame(shape, W, H, shown, -Infinity);
  const perCssPx = W / f.viewW / dpr;
  return { f, windowed, perCssPx };
}

/** Keys and frets wholly in the section: the stage cuts drawing off at its edges. */
const inside = (f, a, b) => a >= f.from - 1e-6 && b <= f.to + 1e-6;
const keysIn = (kb, f) =>
  kb.spots.filter((s) => {
    const half = (s.black ? KEYS.black : KEYS.white) / 2;
    return inside(f, s.x - half, s.x + half);
  }).length;
const fretsIn = (f) => neck.units.slice(1).filter(([a, b]) => inside(f, a, b)).length;

// Upright phones are too narrow for fat keys: they show the fewest keys, as wide as that allows.
for (const [w, h] of [
  [360, 520],
  [390, 560],
  [430, 600],
]) {
  const kb = keyboard(49);
  const { f, windowed, perCssPx } = show(kb, w, h, 3, STAGE.finger);
  check(windowed, `${w}x${h}: a phone shows a section of 49 keys`);
  const keys = keysIn(kb, f);
  check(keys >= STAGE.fewestKeys && keys <= STAGE.fewestKeys + 2, `${w}x${h}: ${keys} keys`);
  const white = KEYS.white * perCssPx;
  check(white >= 34, `${w}x${h}: white keys are only ${white.toFixed(1)} px`);
  const frets = fretsIn(show(neck, w, h, 3, STAGE.finger).f);
  same(frets, STAGE.fewestFrets, `${w}x${h}: frets shown from the nut`);
}

// Phones on their side reach a finger's width, on stubby keys, and show more than the fewest.
for (const [w, h] of [
  [667, 250],
  [844, 270],
  [915, 280],
]) {
  const kb = keyboard(49);
  const { f, perCssPx } = show(kb, w, h, 3, STAGE.finger);
  const white = KEYS.white * perCssPx;
  check(white >= STAGE.finger - 6, `${w}x${h}: white keys are only ${white.toFixed(1)} px`);
  check(keysIn(kb, f) >= STAGE.fewestKeys, `${w}x${h}: only ${keysIn(kb, f)} keys`);
  check(f.length < KEYS.decorLength, `${w}x${h}: keys ${f.length.toFixed(1)} cm, not stubby`);
  check(f.length >= KEYS.minLength - 1e-9, `${w}x${h}: keys shorter than the minimum`);
  check(fretsIn(show(neck, w, h, 3, STAGE.finger).f) >= 8, `${w}x${h}: too few frets`);
}

// On a very short stage keys stop at their minimum length; showing fewer wouldn't widen them.
{
  const kb = keyboard(49);
  const { f } = show(kb, 844, 160, 3, STAGE.finger);
  same(Math.round(f.length * 100) / 100, KEYS.minLength, 'keys drawn at their minimum length');
  const spare = f.viewW - 2 * KEYS.margin - (f.to - f.from);
  check(spare >= -1e-6 && spare < KEYS.white, 'the section fills the width, bar part of a key');
}

// A desktop shows the whole of any keyboard and the neck, as before sections existed.
for (const range of Object.keys(RANGES)) {
  const { windowed, f } = show(keyboard(range), 1100, 420, 1, STAGE.mouse);
  check(!windowed, `${range} keys on a desktop stage show whole`);
  same(
    [f.from, f.to],
    [-keyboard(range).width / 2, keyboard(range).width / 2],
    `${range} keys span`,
  );
}
check(!show(neck, 1100, 420, 1, STAGE.mouse).windowed, 'the neck on a desktop stage shows whole');

// Sections are whole keys or frets, and sweeping along moves them one at a time, end to end.
for (const [name, shape] of [
  ['keyboard', keyboard(88)],
  ['neck', neck],
]) {
  const W = 390 * 3;
  const H = 420 * 3;
  const room = widest(shape, W, H, STAGE.finger * 3);
  const lefts = shape.units.map((u) => u[0]);
  const rights = shape.units.map((u) => u[1]);
  const starts = [];
  let f;
  for (let from = -shape.width / 2 - 5; from <= shape.width / 2 + 5; from += 0.05) {
    f = frame(shape, W, H, room, from);
    const [i, j] = [lefts.indexOf(f.from), rights.indexOf(f.to)];
    check(i >= 0 && j >= 0, `${name}: the section ${f.from}–${f.to} cuts a key or fret`);
    check(f.to - f.from <= room + 1e-6, `${name}: the section is wider than the room`);
    check(j === rights.length - 1 || rights[j + 1] - f.from > room, `${name}: room for one more`);
    if (starts.at(-1) !== i) starts.push(i);
    if (name === 'keyboard') {
      const spare = f.viewW - 2 * KEYS.margin - (f.to - f.from);
      check(Math.abs(spare) < 1e-6, `keyboard: whole keys leave ${spare.toFixed(2)} cm blank`);
    }
    const px = (f.x0 * W) / f.viewW;
    check(Math.abs(px - Math.round(px)) < 1e-6, `${name}: left edge off the pixel grid`);
  }
  same(
    starts,
    starts.map((_, k) => k),
    `${name}: sections start at each key or fret in turn`,
  );
  same(f.to, rights.at(-1), `${name}: the last section reaches the end`);
}

// The compact layout's wiring.
const css = readFileSync(join(root, 'style.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
check(css.includes(`@media ${COMPACT} {`), `style.css has no @media ${COMPACT}`);
const sections = new Set([...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]));
const wanted = new Set([...html.matchAll(/data-menu="([^"]+)"/g)].map((m) => m[1]));
for (const name of wanted) check(sections.has(name), `data-menu="${name}" has no drawer section`);
for (const id of ['menu', 'menu-open', 'menu-close', 'play', 'pause', 'mode', 'why-open']) {
  check(html.includes(`id="${id}"`), `index.html has no #${id}`);
}
// The bar keeps these; moving them into the drawer would leave nothing to play with.
for (const id of ['play', 'pause', 'mode', 'why-open', 'menu-open']) {
  const tag = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
  check(!tag.includes('data-menu'), `#${id} would move into the drawer`);
}

done(`sections framed for phones, short stages and desktops; ${wanted.size} drawer sections`);
