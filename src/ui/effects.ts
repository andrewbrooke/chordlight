// The effects panel: the piano's effects top to bottom in the order the sound passes through them,
// each with its own switch, under a preset menu, the chain's switch and the piano's volume. Moving
// any control turns its effect and the chain on, so nothing is adjusted unheard.
//
// It's docked rather than floating (style.css): on a wide screen it takes the explanations'
// column, on a phone held upright their place under the keys, and on one on its side a sheet over
// the keys' right end, so the keys stay playable while it's open. ? puts the explanations back.

import type { App } from '../app.js';
import {
  DIVISIONS,
  type Division,
  echoSeconds,
  eqCurve,
  type FxKind,
  type FxSettings,
  fxActive,
  fxSettings,
  RANGES,
  type Range,
  snap,
} from '../audio/fx-model.js';
import { FX_PRESETS, fxPresetOf } from '../presets/effects.js';
import { FX } from '../tuning.js';
import { $, el, onPick, onToggle, options } from './dom.js';

type Show = (value: number, fx: FxSettings, bpm: number) => string;
type Control =
  | { type: 'slider'; key: string; label: string; show: Show }
  | { type: 'check'; key: string; label: string }
  | { type: 'select'; key: string; label: string; choices: [string, string][] };

interface Block {
  kind: FxKind;
  title: string;
  hint: string;
  controls: Control[];
}

const slider = (key: string, label: string, show: Show): Control => ({
  type: 'slider',
  key,
  label,
  show,
});
const check = (key: string, label: string): Control => ({ type: 'check', key, label });

const signed = (v: number) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : '−'}${Math.abs(v)} dB`);
const hz = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 9950 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`;
const percent = (v: number) => `${Math.round(v * 100)}%`;
const speed = (v: number) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} Hz`;
const seconds = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)} s`;
const ms = (v: number) => `${Math.round(v)} ms`;
const tone = (v: number) => ['dark', 'warm', 'clear', 'bright'][Math.min(3, Math.floor(v * 4))]!;

const DIVISION_NAMES: Record<Division, string> = {
  '1/2': 'half notes',
  '1/4': 'quarter notes',
  '1/8.': 'dotted eighths',
  '1/4t': 'quarter-note triplets',
  '1/8': 'eighth notes',
  '1/8t': 'eighth-note triplets',
  '1/16': 'sixteenth notes',
};

const BLOCKS: Block[] = [
  {
    kind: 'drive',
    title: 'Drive',
    hint: 'warmth, then grit',
    controls: [slider('amount', 'Amount', percent)],
  },
  {
    kind: 'eq',
    title: 'EQ',
    hint: 'bass, middle and treble, and cuts at either end',
    controls: [
      slider('low', 'Low', signed),
      slider('mid', 'Mid', signed),
      slider('midHz', 'Mid at', hz),
      slider('high', 'High', signed),
      slider('lowCut', 'Low cut', (v) => (v <= FX.eq.lowCut[0] ? 'off' : hz(v))),
      slider('highCut', 'High cut', (v) => (v >= FX.eq.highCut[1] ? 'off' : hz(v))),
      check('steep', 'steep cuts'),
    ],
  },
  {
    kind: 'chorus',
    title: 'Chorus',
    hint: 'a second piano, wavering',
    controls: [
      slider('rate', 'Speed', speed),
      slider('depth', 'Depth', percent),
      slider('mix', 'Mix', percent),
    ],
  },
  {
    kind: 'tremolo',
    title: 'Tremolo',
    hint: 'a pulse in the volume',
    controls: [
      slider('rate', 'Speed', speed),
      slider('depth', 'Depth', percent),
      check('pan', 'pulse between the speakers instead'),
    ],
  },
  {
    kind: 'echo',
    title: 'Echo',
    hint: 'repeats that fade away',
    controls: [
      {
        type: 'select',
        key: 'sync',
        label: 'Time',
        choices: [
          ['free', 'free'],
          ...DIVISIONS.map((d): [string, string] => [d, `${DIVISION_NAMES[d]}, with the tempo`]),
        ],
      },
      slider('ms', '', (_, fx, bpm) => ms(echoSeconds(fx.echo, bpm) * 1000)),
      slider('repeats', 'Repeats', percent),
      slider('tone', 'Tone', tone),
      slider('mix', 'Mix', percent),
      check('pingPong', 'bounce between left and right'),
    ],
  },
  {
    kind: 'reverb',
    title: 'Reverb',
    hint: 'the room around the piano',
    controls: [
      slider('size', 'Size', seconds),
      slider('preDelay', 'Pre-delay', ms),
      slider('tone', 'Tone', tone),
      slider('mix', 'Mix', percent),
    ],
  },
];

/** Slider positions: whole numbers, so a log scale moves as smoothly as a linear one. */
const STEPS = 1000;
const toPos = (v: number, r: Range): number => {
  const at = r.log ? Math.log(v / r.min) / Math.log(r.max / r.min) : (v - r.min) / (r.max - r.min);
  return Math.round(STEPS * Math.max(0, Math.min(1, at)));
};
const fromPos = (p: number, r: Range): number =>
  snap(
    r.log ? r.min * Math.pow(r.max / r.min, p / STEPS) : r.min + ((r.max - r.min) * p) / STEPS,
    r,
  );

let setOpen: (open: boolean) => void = () => {};

export function openEffects(open: boolean): void {
  setOpen(open);
}

export const effectsOpen = (): boolean => document.body.classList.contains('fx-open');

export function bindEffects(app: App): void {
  const panel = $('#fx');
  const opener = $<HTMLButtonElement>('#fx-open');
  const curve = el('canvas', { className: 'fx-curve' });
  const draw = () => {
    if (!panel.hidden) drawCurve(curve, app);
  };
  setOpen = (open) => {
    panel.hidden = !open;
    document.body.classList.toggle('fx-open', open);
    opener.classList.toggle('on', open);
    opener.setAttribute('aria-expanded', String(open));
    draw();
  };
  opener.addEventListener('click', () => {
    setOpen(!effectsOpen());
    opener.blur();
  });
  $('#fx-close').addEventListener('click', () => setOpen(false));
  new ResizeObserver(draw).observe(curve);

  const update = (fx: FxSettings) => app.set({ fx });
  /** A change to one effect, which turns it and the chain on. */
  const change = (kind: FxKind, patch: Record<string, unknown>) => {
    const fx = app.s.fx;
    update({ ...fx, on: true, [kind]: { ...fx[kind], on: true, ...patch } } as FxSettings);
  };

  const master = $<HTMLInputElement>('#fx-on');
  onToggle(master, (on) => update({ ...app.s.fx, on }));
  const preset = $<HTMLSelectElement>('#fx-preset');
  onPick(preset, (id) => {
    const p = FX_PRESETS.find((x) => x.id === id);
    if (p) update(fxSettings(p.fx));
  });
  const volume = $<HTMLInputElement>('#fx-volume');
  volume.addEventListener('input', () => {
    app.set({ levels: { ...app.s.levels, piano: Number(volume.value) } });
  });
  volume.addEventListener('change', () => volume.blur());

  const refreshers: (() => void)[] = [];
  const build = (kind: FxKind, c: Control): HTMLElement => {
    const value = () => (app.s.fx[kind] as Record<string, unknown>)[c.key];
    if (c.type === 'check') {
      const input = el('input');
      input.type = 'checkbox';
      onToggle(input, (on) => change(kind, { [c.key]: on }));
      refreshers.push(() => (input.checked = value() === true));
      return el('label', { className: 'check' }, [input, ` ${c.label}`]);
    }
    if (c.type === 'select') {
      const select = el('select');
      options(select, c.choices);
      onPick(select, (v) => change(kind, { [c.key]: v }));
      refreshers.push(() => (select.value = String(value())));
      return el('label', { className: 'fx-choice' }, [c.label, select]);
    }
    const range = RANGES[kind][c.key]!;
    // The echo's time slider shows the time the tempo sets too, and dragging it sets it free.
    const echoTime = kind === 'echo' && c.key === 'ms';
    const input = el('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(STEPS);
    input.step = '1';
    if (c.label === '') input.setAttribute('aria-label', 'Echo time');
    const out = el('output');
    input.addEventListener('input', () => {
      const patch: Record<string, unknown> = { [c.key]: fromPos(Number(input.value), range) };
      if (echoTime) patch['sync'] = 'free';
      change(kind, patch);
    });
    input.addEventListener('change', () => input.blur());
    refreshers.push(() => {
      const fx = app.s.fx;
      const v = echoTime ? echoSeconds(fx.echo, app.s.bpm) * 1000 : (value() as number);
      if (document.activeElement !== input) input.value = String(toPos(v, range));
      out.textContent = c.show(v, fx, app.s.bpm);
    });
    return el('label', { className: 'fx-knob' }, [el('span', { text: c.label }), input, out]);
  };

  const host = $('#fx-blocks');
  for (const block of BLOCKS) {
    const toggle = el('input');
    toggle.type = 'checkbox';
    onToggle(toggle, (on) => {
      const fx = app.s.fx;
      update({ ...fx, on: fx.on || on, [block.kind]: { ...fx[block.kind], on } } as FxSettings);
    });
    const section = el('section', { className: 'fx-block' }, [
      el('div', { className: 'fx-head' }, [
        el('label', { className: 'check fx-title' }, [toggle, ` ${block.title}`]),
        el('span', { className: 'quiet', text: block.hint }),
      ]),
    ]);
    if (block.kind === 'eq') section.append(curve);
    section.append(
      el(
        'div',
        { className: 'fx-knobs' },
        block.controls.map((c) => build(block.kind, c)),
      ),
    );
    host.append(section);
    refreshers.push(() => {
      toggle.checked = app.s.fx[block.kind].on;
      section.classList.toggle('off', !toggle.checked);
    });
  }

  const refresh = () => {
    const s = app.s;
    if (s.instrument !== 'piano' && !panel.hidden) setOpen(false);
    opener.classList.toggle('active', fxActive(s.fx));
    master.checked = s.fx.on;
    panel.classList.toggle('bypassed', !s.fx.on);
    const named = fxPresetOf(s.fx);
    options(preset, [
      ...FX_PRESETS.map((p): [string, string] => [p.id, p.name]),
      ...(named ? [] : [['mine', 'Your own'] as [string, string]]),
    ]);
    preset.value = named?.id ?? 'mine';
    if (document.activeElement !== volume) volume.value = String(s.levels.piano);
    for (const r of refreshers) r();
    draw();
  };
  app.on('settings', refresh);
  refresh();
}

const LOWEST = 20;
const HIGHEST = 20000;
/** dB from the middle of the curve's box to its edge. */
const SPAN = 15;

/** The EQ's response, 20 Hz to 20 kHz, over lines at 100 Hz, 1 kHz, 10 kHz and every 12 dB. */
function drawCurve(canvas: HTMLCanvasElement, app: App): void {
  const [w, h] = [canvas.clientWidth, canvas.clientHeight];
  const g = canvas.getContext('2d');
  if (w === 0 || !g) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const colour = (name: string) => css.getPropertyValue(name).trim();
  const x = (f: number) => (Math.log(f / LOWEST) / Math.log(HIGHEST / LOWEST)) * w;
  const y = (db: number) => Math.max(1, Math.min(h - 1, h / 2 - (db / SPAN) * (h / 2 - 4)));

  g.lineWidth = 1;
  g.strokeStyle = colour('--line');
  g.fillStyle = colour('--soft');
  g.font = '10px system-ui, sans-serif';
  g.beginPath();
  for (const [f, label] of [
    [100, '100'],
    [1000, '1k'],
    [10000, '10k'],
  ] as const) {
    const at = Math.round(x(f)) + 0.5;
    g.moveTo(at, 0);
    g.lineTo(at, h);
    g.fillText(label, at + 3, h - 4);
  }
  for (const db of [-12, 0, 12]) {
    const at = Math.round(y(db)) + 0.5;
    g.moveTo(0, at);
    g.lineTo(w, at);
  }
  g.stroke();

  const fx = app.s.fx;
  const rate = app.audio?.engine.ctx.sampleRate ?? 48000;
  const n = Math.max(2, Math.round(w / 2));
  const freqs = Array.from(
    { length: n },
    (_, i) => LOWEST * Math.pow(HIGHEST / LOWEST, i / (n - 1)),
  );
  const dbs = eqCurve(fx.eq, rate, freqs);
  g.beginPath();
  dbs.forEach((db, i) => g.lineTo((i / (n - 1)) * w, y(db)));
  const lit = fx.on && fx.eq.on ? colour('--land') : colour('--soft');
  g.strokeStyle = lit;
  g.lineWidth = 2;
  g.stroke();
  g.lineTo(w, y(0));
  g.lineTo(0, y(0));
  g.closePath();
  g.globalAlpha = 0.16;
  g.fillStyle = lit;
  g.fill();
  g.globalAlpha = 1;
}
