// Computer-keyboard input, read by physical key (`KeyboardEvent.code`) so it works on any layout.
// Each held key remembers its note, so changing octave mid-press still releases the right one.

import { CHORD_CODES, capOf, type Layout, offsets } from './layouts.js';
import { MAJOR } from '../theory/scales.js';

export interface KeyActions {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  chord(index: number, down: boolean): void;
  pedal(down: boolean): void;
  octave(delta: number): void;
  playStop(): void;
  clip(): void;
}

export { CHORD_CODES, capOf, type Layout };

export class ComputerKeys {
  /** MIDI note of the C at the bottom of the layout's octave. */
  base = 60;
  private map = offsets('key', 0, MAJOR);
  private readonly notes = new Map<string, number>();
  private readonly chords = new Set<string>();
  private readonly shifts = new Set<string>();

  constructor(private readonly actions: KeyActions) {
    window.addEventListener('keydown', (e) => this.down(e));
    window.addEventListener('keyup', (e) => this.up(e));
    window.addEventListener('blur', () => this.releaseAll());
  }

  /** `home` and `steps` only matter for the in-key layout. */
  setLayout(layout: Layout, home: number, steps: readonly number[]): void {
    this.map = offsets(layout, home, steps);
  }

  capFor(midi: number): string {
    for (const [code, offset] of this.map) if (this.base + offset === midi) return capOf(code);
    return '';
  }

  span(): [number, number] {
    const all = [...this.map.values()];
    return [this.base + Math.min(...all), this.base + Math.max(...all)];
  }

  releaseAll(): void {
    for (const midi of this.notes.values()) this.actions.noteOff(midi);
    this.notes.clear();
    for (const code of this.chords) this.actions.chord(CHORD_CODES.indexOf(code), false);
    this.chords.clear();
    if (this.shifts.size > 0) this.actions.pedal(false);
    this.shifts.clear();
  }

  private down(e: KeyboardEvent): void {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    const offset = this.map.get(code);
    const chord = CHORD_CODES.indexOf(code);
    const known =
      offset !== undefined ||
      chord >= 0 ||
      ['ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(code);
    if (!known) return;
    // Otherwise a focused button takes Space and Enter as a click.
    e.preventDefault();
    if (e.repeat) return;

    if (offset !== undefined) {
      if (this.notes.has(code)) return;
      const midi = this.base + offset;
      this.notes.set(code, midi);
      this.actions.noteOn(midi);
    } else if (chord >= 0) {
      this.chords.add(code);
      this.actions.chord(chord, true);
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      if (this.shifts.size === 0) this.actions.pedal(true);
      this.shifts.add(code);
    } else if (code === 'ArrowLeft') this.actions.octave(-1);
    else if (code === 'ArrowRight') this.actions.octave(1);
    else if (code === 'Space') this.actions.playStop();
    else if (code === 'Enter') this.actions.clip();
  }

  private up(e: KeyboardEvent): void {
    const code = e.code;
    const midi = this.notes.get(code);
    if (midi !== undefined) {
      this.notes.delete(code);
      this.actions.noteOff(midi);
    }
    if (this.chords.delete(code)) this.actions.chord(CHORD_CODES.indexOf(code), false);
    if (this.shifts.delete(code) && this.shifts.size === 0) this.actions.pedal(false);
  }
}

const NOT_TEXT = ['range', 'checkbox', 'radio', 'button', 'submit', 'color'];

/** Text fields own the keyboard; sliders, checkboxes and selects don't. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  return t instanceof HTMLInputElement && !NOT_TEXT.includes(t.type);
}
