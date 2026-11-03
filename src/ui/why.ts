import type { App } from '../app.js';
import { presetOf } from '../presets/library.js';
import { chordName } from '../theory/chords.js';
import { detect } from '../theory/detect.js';
import { pcOf } from '../theory/pitch.js';
import { numeralLabel } from '../theory/roman.js';
import { $, el } from './dom.js';
import { chordLines, heardSentence, keySentence, LIGHT_WORDS, noteSentence } from './words.js';

export function bindWhy(app: App): void {
  const host = $('#why');
  const render = () => {
    const parts: HTMLElement[] = [];
    const h = (t: string) => parts.push(el('h3', { text: t }));
    const p = (t: string, className = '') => parts.push(el('p', { text: t, className }));

    h('The key');
    p(keySentence(app.key));

    const chord = app.chord;
    if (chord) {
      h(app.s.mode === 'progression' ? 'This chord' : 'The chord you hold');
      p(`${numeralLabel(chord, app.key)} · ${chordName(chord)}`, 'big');
      for (const line of chordLines(chord, app.key, app.lights)) p(line);
    }

    const note = app.hover ?? app.last;
    if (note !== null) {
      h(app.hover !== null ? 'Under your pointer' : 'The last note you played');
      p(noteSentence(pcOf(note), app.key, app.lights));
    }

    const preset = app.s.mode === 'progression' ? presetOf(app.s.preset) : undefined;
    if (preset) {
      h(preset.name);
      p(preset.lesson);
      if (preset.heardIn.length > 0) p(`Heard in: ${preset.heardIn.join(' · ')}.`, 'quiet');
      p(`Try this: ${preset.tip}`, 'tip');
    }

    h('The lights');
    for (const words of Object.values(LIGHT_WORDS)) p(words);
    p('Unlit keys are outside the key, but you can still play them.', 'quiet');
    host.replaceChildren(...parts);
  };
  for (const e of ['context', 'hover', 'held', 'settings'] as const) app.on(e, render);
  render();

  const now = $('#now');
  const holding = $('#holding');
  let said = '';
  const readout = () => {
    const pos = app.position;
    let text: string;
    if (app.s.mode === 'progression') {
      const step = app.steps[pos ? pos.step : app.selected];
      const next = pos ? app.steps[pos.next] : undefined;
      const label = (i: typeof step) =>
        i ? `${chordName(i.chord)} (${numeralLabel(i.chord, app.key)})` : '';
      if (pos?.countIn) text = `counting in… first: ${label(next)}`;
      else if (pos) text = `now ${label(step)} · next ${label(next)}`;
      else text = step ? `${label(step)} · press Space or ▶ to play` : 'type a progression in Edit';
    } else {
      const c = app.keyChordNow();
      text = c ? `holding ${chordName(c)} (${numeralLabel(c, app.key)})` : app.key.name;
    }
    if (text !== said) {
      said = text;
      now.textContent = text;
    }
  };
  app.on('frame', readout);

  app.on('held', () => {
    holding.textContent = heardSentence(detect(app.heldNotes(), app.key), app.key, app.lights);
  });
}
