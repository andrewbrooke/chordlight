import type { App } from '../app.js';
import { PRESETS } from '../presets/library.js';
import { type LabelMode, RANGES } from '../settings.js';
import { nameOf } from '../theory/pitch.js';
import { moodOf, type MoodId, spellKey } from '../theory/scales.js';
import { CLIPS, TIMING } from '../tuning.js';
import type { Layout } from '../input/layouts.js';
import { $, el, onPick, onToggle, options } from './dom.js';

/** What each layout's rows play; `x` is a key cap. */
const LAYOUT_HELP: Record<Layout, string> = {
  key: "the letter row `Q`–`]` plays the key's notes from home, so `Q` `E` `T` is the home chord; the numbers above fill in the notes between.",
  piano:
    'the letter row `Q`–`]` plays the white keys from C, so `Q` `E` `T` is C major; the numbers above play the black keys between.',
  rows: 'every key is a half step: the letter row `Q`–`]` plays C up to B, and the number row `1`–`=` carries on an octave higher.',
};

/** Text with `x` spans set as code. */
const withCaps = (text: string): (Node | string)[] =>
  text.split('`').map((part, i) => (i % 2 ? el('code', { text: part }) : part));

const MOOD_ORDER: MoodId[] = ['major', 'minor', 'lydian', 'mixolydian', 'dorian', 'phrygian'];
const MODE_LABEL = (id: MoodId) => {
  const m = moodOf(id);
  return `${m.name.charAt(0).toUpperCase()}${m.name.slice(1)}: ${m.feel}`;
};

export function bindControls(app: App): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#mode button')) {
    b.addEventListener('click', () => {
      app.set({ mode: b.dataset['mode'] as 'key' | 'progression' });
      b.blur();
    });
  }

  const home = $<HTMLSelectElement>('#home');
  const mood = $<HTMLSelectElement>('#mood');
  options(
    mood,
    MOOD_ORDER.map((id) => [id, MODE_LABEL(id)]),
  );
  onPick(home, (v) => app.set({ home: Number(v) }));
  onPick(mood, (v) => app.set({ mood: v as MoodId }));

  const preset = $<HTMLSelectElement>('#preset');
  onPick(preset, (v) => app.loadPreset(v));

  const play = $<HTMLButtonElement>('#play');
  play.addEventListener('click', () => {
    app.playStop();
    play.blur();
  });

  const pause = $<HTMLButtonElement>('#pause');
  pause.addEventListener('click', () => {
    app.pauseResume();
    pause.blur();
  });

  const bpm = $<HTMLInputElement>('#bpm');
  const slider = $<HTMLInputElement>('#bpm-slider');
  for (const input of [bpm, slider]) {
    input.min = String(TIMING.bpmMin);
    input.max = String(TIMING.bpmMax);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (v >= TIMING.bpmMin && v <= TIMING.bpmMax) app.set({ bpm: v });
    });
    input.addEventListener('change', () => input.blur());
  }

  onToggle($('#countin'), (on) => app.set({ countIn: on }));
  onToggle($('#click-on'), (on) => app.set({ click: on }));
  onToggle($('#bass'), (on) => app.set({ bass: on }));
  const style = $<HTMLSelectElement>('#style');
  options(style, [
    ['pad', 'pad: held chords'],
    ['piano', 'piano: struck chords'],
    ['arp', 'arp: broken chords'],
    ['drive', 'drive: pop-punk eighths'],
  ]);
  onPick(style, (v) => app.set({ style: v as typeof app.s.style }));

  const labels = $<HTMLSelectElement>('#labels');
  options(labels, [
    ['name', 'note names'],
    ['degree', 'scale degrees'],
    ['role', 'roles over the chord'],
    ['off', 'off'],
  ]);
  onPick(labels, (v) => app.set({ labels: v as LabelMode }));

  const range = $<HTMLSelectElement>('#range');
  options(
    range,
    Object.keys(RANGES).map((n) => [n, `${n} keys`]),
  );
  onPick(range, (v) => app.set({ range: Number(v) }));
  const layout = $<HTMLSelectElement>('#layout');
  options(layout, [
    ['key', "in key: letters play the key's notes, Q E T is the home chord"],
    ['piano', 'piano-shaped: letters are the white notes, numbers the black'],
    ['rows', 'chromatic rows: every key a half step, two octaves'],
  ]);
  onPick(layout, (v) => app.set({ keyLayout: v as Layout }));
  onToggle($('#caps'), (on) => app.set({ caps: on }));
  onToggle($('#hints'), (on) => app.set({ hints: on }));
  onToggle($('#ghosts'), (on) => app.set({ ghosts: on }));
  onToggle($('#pedal-reversed'), (on) => {
    app.set({ pedalReversed: on });
    app.pedal(false);
  });
  onToggle($('#midi-full'), (on) => app.set({ midiFull: on }));
  const look = $<HTMLSelectElement>('#lookahead');
  options(look, [
    ['0', 'never'],
    ['1', 'in the last beat'],
    ['2', 'in the last two beats'],
    ['4', 'a bar ahead'],
  ]);
  onPick(look, (v) => app.set({ lookAhead: Number(v) }));
  for (const part of ['piano', 'backing', 'bass', 'click'] as const) {
    const input = $<HTMLInputElement>(`#level-${part}`);
    input.addEventListener('input', () => {
      app.set({ levels: { ...app.s.levels, [part]: Number(input.value) } });
    });
    input.addEventListener('change', () => input.blur());
  }
  const seconds = $<HTMLSelectElement>('#clip-seconds');
  options(
    seconds,
    CLIPS.choices.map((n) => [String(n), `${n} seconds`]),
  );
  onPick(seconds, (v) => app.set({ clipSeconds: Number(v) }));

  drawer('#settings', '#settings-open', '#settings-close');
  drawer('#clips', '#clips-open', '#clips-close');
  const why = $<HTMLButtonElement>('#why-open');
  why.addEventListener('click', () => {
    app.set({ why: !app.s.why });
    why.blur();
  });

  const refresh = () => {
    const s = app.s;
    document.body.classList.toggle('mode-key', s.mode === 'key');
    document.body.classList.toggle('mode-progression', s.mode === 'progression');
    document.body.classList.toggle('why-closed', !s.why);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#mode button')) {
      b.classList.toggle('on', b.dataset['mode'] === s.mode);
    }
    options(
      home,
      Array.from({ length: 12 }, (_, pc) => [
        String(pc),
        nameOf(spellKey({ home: pc, mood: s.mood }).home),
      ]),
    );
    home.value = String(s.home);
    mood.value = s.mood;
    presets(app, preset);
    const playing = app.audio?.transport.playing ?? false;
    const paused = app.audio?.transport.paused ?? false;
    if (playing) caption(play, '■', 'Stop');
    else caption(play, '▶', 'Play');
    pause.disabled = !playing && !paused;
    if (paused) caption(pause, '▶', 'Resume');
    else caption(pause, '⏸︎', 'Pause');
    if (document.activeElement !== bpm) bpm.value = String(s.bpm);
    slider.value = String(s.bpm);
    $<HTMLInputElement>('#countin').checked = s.countIn;
    $<HTMLInputElement>('#click-on').checked = s.click;
    $<HTMLInputElement>('#bass').checked = s.bass;
    style.value = s.style;
    labels.value = s.labels;
    range.value = String(s.range);
    layout.value = s.keyLayout;
    $('#layout-help').replaceChildren(...withCaps(LAYOUT_HELP[s.keyLayout]));
    $<HTMLInputElement>('#caps').checked = s.caps;
    $<HTMLInputElement>('#hints').checked = s.hints;
    $<HTMLInputElement>('#ghosts').checked = s.ghosts;
    $<HTMLInputElement>('#pedal-reversed').checked = s.pedalReversed;
    $<HTMLInputElement>('#midi-full').checked = s.midiFull;
    look.value = String(s.lookAhead);
    for (const part of ['piano', 'backing', 'bass', 'click'] as const) {
      $<HTMLInputElement>(`#level-${part}`).value = String(s.levels[part]);
    }
    seconds.value = String(s.clipSeconds);
    $('#legend-star').hidden = s.mode !== 'key' || moodOf(s.mood).moodDegree === null;
    const [lo, hi] = app.keys.span();
    $('#octave').textContent = `computer keys play ${noteName(lo)}–${noteName(hi)} (← →)`;
  };
  app.on('settings', refresh);
  app.on('mine', refresh);
  refresh();

  const tuning = $('#tuning');
  const midi = $('#midi');
  app.on('audio', () => {
    if (app.audio?.engine.ctx.state === 'suspended') {
      tuning.textContent = 'click or press any key to turn the sound on';
    } else {
      tuning.textContent = app.tuned < 1 ? `tuning the piano… ${Math.round(app.tuned * 100)}%` : '';
    }
    midi.textContent = app.midi;
  });
}

function presets(app: App, select: HTMLSelectElement): void {
  const groups = new Map<string, HTMLOptGroupElement>();
  const nodes: HTMLElement[] = [];
  if (app.s.preset === '') nodes.push(new Option('(your edit)', ''));
  for (const p of PRESETS) {
    let g = groups.get(p.group);
    if (!g) {
      g = document.createElement('optgroup');
      g.label = p.group;
      groups.set(p.group, g);
      nodes.push(g);
    }
    g.append(new Option(p.name, p.id));
  }
  if (app.mine.length > 0) {
    const g = document.createElement('optgroup');
    g.label = 'Mine';
    for (const m of app.mine) g.append(new Option(m.name, `mine:${m.name}`));
    nodes.push(g);
  }
  select.replaceChildren(...nodes);
  select.value = app.s.preset;
}

/** An icon and a word. The narrowest screens hide the word, so it's also the button's name. */
function caption(button: HTMLButtonElement, icon: string, word: string): void {
  if (button.getAttribute('aria-label') === word) return;
  button.setAttribute('aria-label', word);
  button.replaceChildren(`${icon} `, el('span', { className: 'word', text: word }));
}

function drawer(panel: string, open: string, close: string): void {
  const p = $(panel);
  $(open).addEventListener('click', (e) => {
    p.hidden = !p.hidden;
    (e.currentTarget as HTMLElement).blur();
  });
  $(close).addEventListener('click', () => (p.hidden = true));
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
