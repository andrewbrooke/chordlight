// App state and the per-frame loop. Each frame works out which chord is sounding (the
// transport's position in Progression mode, a held chord in Key mode) and recomputes the lights
// only when that changes; the panels listen for the resulting 'context' event.

import { Backing } from './audio/backing.js';
import { Engine } from './audio/engine.js';
import { Piano } from './audio/piano.js';
import { type Held, pad } from './audio/synths.js';
import type { Position } from './audio/timeline.js';
import { Transport } from './audio/transport.js';
import { voice } from './audio/voicing.js';
import { type BackingState, record } from './clips/backing.js';
import type { NoteEvent } from './clips/extract.js';
import { ComputerKeys } from './input/keys.js';
import { attachPointer } from './input/pointer.js';
import { presetOf } from './presets/library.js';
import { DEFAULTS, type Mode, RANGES, type Settings } from './settings.js';
import { type Chord, chordHas, chordName } from './theory/chords.js';
import { diatonicChords } from './theory/diatonic.js';
import { chordLights, hintsAfter, keyLights, type Lights } from './theory/guide.js';
import { nameOf, pcOf } from './theory/pitch.js';
import { parseProgression, progressionText, type Step } from './theory/roman.js';
import { degreeLabel, type SpelledKey, spellKey } from './theory/scales.js';
import { BACKING, CLIPS, PLAY } from './tuning.js';
import { load, loadList, save } from './ui/storage.js';
import { KeyboardView } from './view/keyboard.js';
import { Stage } from './view/stage.js';

export interface Audio {
  engine: Engine;
  piano: Piano;
  backing: Backing;
  transport: Transport;
}

export interface Mine {
  name: string;
  text: string;
  home: number;
  mood: Settings['mood'];
  bpm: number;
  style: Settings['style'];
  palette: Settings['palette'];
}

type Event = 'settings' | 'context' | 'held' | 'hover' | 'audio' | 'mine' | 'clip' | 'frame';

/** A key press shown at a booked time: the live backing's, or a clip's during playback. */
interface Timed {
  midi: number;
  start: number;
  end: number;
  ghost: boolean;
  owner: 'live' | 'clip';
  on: boolean;
}

export class App {
  s: Settings = load('settings', DEFAULTS);
  key: SpelledKey = spellKey({ home: this.s.home, mood: this.s.mood });
  steps: Step[] = [];
  selected = 0;
  audio: Audio | null = null;
  lights: Lights = keyLights(this.key);
  chord: Chord | null = null;
  position: Position | null = null;
  hover: number | null = null;
  last: number | null = null;
  tuned = 0;
  midi = '';
  mine: Mine[] = loadList<Mine>('mine');
  /** Recent note events, for clips. */
  log: NoteEvent[] = [];
  /** The backing's transport states over the same span, so clips can replay it. */
  backingLog: BackingState[] = [];
  readonly stage: Stage;
  keyboard: KeyboardView;
  readonly keys: ComputerKeys;
  heldChord: number | null = null;
  keyChord: number | null = null;

  private readonly held = new Map<number, number>();
  private readonly listeners = new Map<Event, (() => void)[]>();
  private drone: { held: Held; midi: number }[] = [];
  private signature = '';
  private nextSignature = '';
  private timed: Timed[] = [];

  constructor(stageHost: HTMLElement) {
    this.s.levels = { ...DEFAULTS.levels, ...this.s.levels };
    this.stage = new Stage(stageHost);
    this.keyboard = this.buildKeyboard();
    this.keys = new ComputerKeys({
      noteOn: (m) => this.noteOn(m),
      noteOff: (m) => this.noteOff(m),
      chord: (i, down) => this.chordKey(i, down),
      pedal: (down) => this.pedal(down),
      octave: (d) => this.shiftOctave(d),
      playStop: () => this.playStop(),
      clip: () => this.emit('clip'),
    });
    this.keys.setLayout(this.s.keyLayout, this.s.home, this.key.mood.steps);
    this.keys.base = this.s.base;
    attachPointer(this.stage, {
      noteOn: (m) => this.noteOn(m),
      noteOff: (m) => this.noteOff(m),
      hover: (m) => {
        this.hover = m;
        this.emit('hover');
      },
    });
    this.reparse();
    let then = performance.now();
    this.stage.renderer.setAnimationLoop((now) => {
      this.frame(Math.min(0.1, (now - then) / 1000));
      then = now;
    });
  }

  on(event: Event, fn: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
  }

  emit(event: Event): void {
    for (const fn of this.listeners.get(event) ?? []) fn();
  }

  /** Creates the audio graph. Must run from a user gesture or the browser keeps it suspended. */
  startAudio(): Audio {
    if (this.audio) {
      void this.audio.engine.ctx.resume();
      return this.audio;
    }
    const engine = new Engine();
    const piano = new Piano(engine);
    const backing = new Backing(engine, piano);
    const transport = new Transport(engine, backing);
    piano.onProgress = (f) => {
      this.tuned = f;
      this.emit('audio');
    };
    piano.load();
    backing.onNote = (midi, start, end) => {
      if (this.s.ghosts)
        this.timed.push({ midi, start, end, ghost: true, owner: 'live', on: false });
    };
    transport.onStop = () => this.emit('settings');
    transport.onChange = () => this.recordBacking();
    this.audio = { engine, piano, backing, transport };
    this.applyAudioSettings();
    backing.setSteps(this.steps);
    transport.setBeats(this.steps.map((s) => s.beats));
    return this.audio;
  }

  set(patch: Partial<Settings>): void {
    const before = this.s;
    this.s = { ...before, ...patch };
    save('settings', this.s);
    const changed = (k: keyof Settings) => before[k] !== this.s[k];

    if (changed('home') || changed('mood')) {
      this.key = spellKey({ home: this.s.home, mood: this.s.mood });
      this.reparse();
      this.restartDrone();
    }
    if (changed('text')) this.reparse();
    if (changed('range')) this.keyboard = this.buildKeyboard();
    // Held keys keep their notes across an octave or key change; a layout change releases them.
    if (changed('keyLayout')) this.keys.releaseAll();
    this.keys.setLayout(this.s.keyLayout, this.s.home, this.key.mood.steps);
    this.keys.base = this.s.base;
    if (changed('mode')) {
      this.audio?.transport.stop();
      this.heldChord = null;
      this.restartDrone();
    }
    if (changed('why')) document.body.classList.toggle('why-closed', !this.s.why);
    this.applyAudioSettings();
    if ((changed('style') || changed('bass')) && this.audio?.transport.playing) {
      this.recordBacking();
    }
    this.signature = '';
    this.emit('settings');
  }

  private applyAudioSettings(): void {
    const a = this.audio;
    if (!a) return;
    a.transport.setBpm(this.s.bpm);
    a.transport.countIn = this.s.countIn;
    a.transport.clickOn = this.s.click;
    a.backing.style = this.s.style;
    a.backing.bassOn = this.s.bass;
    for (const part of ['piano', 'backing', 'bass', 'click'] as const) {
      a.engine.setLevel(part, this.s.levels[part]);
    }
  }

  loadPreset(id: string): void {
    const mine = id.startsWith('mine:')
      ? this.mine.find((m) => `mine:${m.name}` === id)
      : undefined;
    const p = mine ?? presetOf(id);
    if (!p) return;
    this.selected = 0;
    this.set({
      preset: id,
      text: p.text,
      home: p.home,
      mood: p.mood,
      bpm: p.bpm,
      style: p.style,
      palette: p.palette ?? null,
    });
  }

  /** Stores typed text as numerals. Returns the first unreadable token, or null. */
  applyText(text: string): string | null {
    const parsed = parseProgression(text, this.key);
    if (!parsed.ok) return parsed.token || text;
    const numerals = progressionText(parsed.steps, this.key);
    if (numerals !== this.s.text) {
      this.selected = 0;
      this.set({ text: numerals, preset: '' });
    }
    return null;
  }

  saveMine(name: string): void {
    const entry: Mine = {
      name,
      text: this.s.text,
      home: this.s.home,
      mood: this.s.mood,
      bpm: this.s.bpm,
      style: this.s.style,
      palette: this.s.palette,
    };
    this.mine = [...this.mine.filter((m) => m.name !== name), entry];
    save('mine', this.mine);
    this.s = { ...this.s, preset: `mine:${name}` };
    save('settings', this.s);
    this.emit('mine');
    this.emit('settings');
  }

  deleteMine(name: string): void {
    this.mine = this.mine.filter((m) => m.name !== name);
    save('mine', this.mine);
    if (this.s.preset === `mine:${name}`) this.set({ preset: '' });
    this.emit('mine');
  }

  private reparse(): void {
    const parsed = parseProgression(this.s.text, this.key);
    this.steps = parsed.ok ? parsed.steps : [];
    this.selected = Math.min(this.selected, Math.max(0, this.steps.length - 1));
    if (this.audio) {
      this.audio.backing.setSteps(this.steps);
      this.audio.transport.setBeats(this.steps.map((s) => s.beats));
    }
    this.signature = '';
  }

  private buildKeyboard(): KeyboardView {
    const [lo, hi] = RANGES[this.s.range] ?? RANGES[49]!;
    if (this.keyboard) this.keyboard.dispose();
    const kb = new KeyboardView(lo, hi);
    this.stage.setKeyboard(kb);
    this.signature = '';
    this.nextSignature = '';
    return kb;
  }

  noteOn(midi: number, velocity: number = PLAY.velocity): void {
    const { engine, piano } = this.startAudio();
    const count = this.held.get(midi) ?? 0;
    this.held.set(midi, count + 1);
    if (count > 0) return;
    piano.noteOn('user', midi, velocity);
    this.keyboard.press(midi, 'user', true);
    this.remember({ t: engine.now, on: true, midi, vel: velocity, voice: 'piano' });
    this.last = midi;
    if (this.s.hints) {
      const [lo, hi] = [this.keyboard.lo, this.keyboard.hi];
      for (const m of hintsAfter(midi, this.lights, lo, hi)) this.keyboard.flash(m);
    }
    this.emit('held');
  }

  noteOff(midi: number): void {
    const count = this.held.get(midi) ?? 0;
    if (count === 0) return;
    if (count > 1) {
      this.held.set(midi, count - 1);
      return;
    }
    this.held.delete(midi);
    this.audio?.piano.noteOff('user', midi);
    this.keyboard.press(midi, 'user', false);
    if (this.audio) {
      this.remember({ t: this.audio.engine.now, on: false, midi, vel: 0, voice: 'piano' });
    }
    this.emit('held');
  }

  pedal(down: boolean): void {
    this.audio?.piano.setPedal(down);
  }

  heldNotes(): number[] {
    return [...this.held.keys()];
  }

  private remember(e: NoteEvent): void {
    this.log.push(e);
    const cutoff = e.t - CLIPS.memory;
    if (this.log.length > 4000 || this.log[0]!.t < cutoff) {
      this.log = this.log.filter((x) => x.t >= cutoff).slice(-4000);
    }
  }

  playStop(): void {
    if (this.s.mode !== 'progression') return;
    const { transport } = this.startAudio();
    if (transport.playing) transport.stop();
    else if (this.steps.length > 0) transport.start();
    this.emit('settings');
  }

  /** Selects a card while stopped and plays its chord once. */
  select(index: number): void {
    this.selected = index;
    const step = this.steps[index];
    if (!step || this.audio?.transport.playing) return;
    const { engine } = this.startAudio();
    const notes = voice(step.chord, null, BACKING.chordLo, BACKING.chordHi);
    for (const m of notes) pad(engine, m, engine.now, BACKING.padLevel, engine.now + 1.4);
  }

  /** Z–M hold the key's chords I–vii° while pressed (Key mode only). */
  private chordKey(index: number, down: boolean): void {
    if (this.s.mode !== 'key') return;
    if (down) this.keyChord = index;
    else if (this.keyChord === index) this.keyChord = null;
    else return;
    this.restartDrone();
  }

  togglePalette(index: number): void {
    this.heldChord = this.heldChord === index ? null : index;
    this.restartDrone();
    this.emit('settings');
  }

  keyChordNow(): Chord | null {
    const i = this.keyChord ?? this.heldChord;
    return i === null ? null : (diatonicChords(this.key)[i] ?? null);
  }

  private restartDrone(): void {
    const chord = this.s.mode === 'key' ? this.keyChordNow() : null;
    const audio = chord ? this.startAudio() : this.audio;
    const now = audio?.engine.now ?? 0;
    for (const d of this.drone) {
      d.held.stop(now);
      this.keyboard.ghost(d.midi, -1);
      this.remember({ t: now, on: false, midi: d.midi, vel: 0, voice: 'pad' });
    }
    this.drone = [];
    if (!chord || !audio) return;
    for (const midi of voice(chord, null, BACKING.droneLo, BACKING.droneHi)) {
      this.drone.push({ held: pad(audio.engine, midi, now, BACKING.droneLevel), midi });
      if (this.s.ghosts) this.keyboard.ghost(midi, 1);
      this.remember({ t: now, on: true, midi, vel: 0.5, voice: 'pad' });
    }
  }

  private shiftOctave(delta: number): void {
    const base = Math.min(PLAY.highestBase, Math.max(PLAY.lowestBase, this.s.base + delta * 12));
    if (base !== this.s.base) this.set({ base });
  }

  /** A clip's note during playback; `ghost` for its backing. */
  showPress(midi: number, start: number, end: number, ghost = false): void {
    if (ghost && !this.s.ghosts) return;
    this.timed.push({ midi, start, end, ghost, owner: 'clip', on: false });
  }

  clearPresses(owner: Timed['owner']): void {
    for (const t of this.timed) if (t.owner === owner && t.on) this.showTimed(t, false);
    this.timed = this.timed.filter((t) => t.owner !== owner);
  }

  private showTimed(t: Timed, down: boolean): void {
    if (t.ghost) this.keyboard.ghost(t.midi, down ? 1 : -1);
    else this.keyboard.press(t.midi, 'clip', down);
  }

  private recordBacking(): void {
    const a = this.audio;
    if (!a) return;
    const { transport, engine } = a;
    const t = transport.playing ? Math.max(engine.now, transport.downbeat) : engine.now;
    const s = this.s;
    const state: BackingState = {
      t,
      playing: transport.playing,
      beat: transport.playing ? transport.beatAt(t) : 0,
      bpm: transport.bpm,
      text: s.text,
      home: s.home,
      mood: s.mood,
      style: s.style,
      bass: s.bass,
    };
    this.backingLog = record(this.backingLog, state, engine.now - CLIPS.memory);
  }

  private frame(dt: number): void {
    const transport = this.audio?.transport;
    this.position = this.s.mode === 'progression' ? (transport?.position() ?? null) : null;
    if (!transport?.playing && this.timed.some((t) => t.owner === 'live'))
      this.clearPresses('live');

    let chord: Chord | null;
    if (this.s.mode === 'progression') {
      const index = this.position ? this.position.step : this.selected;
      chord = this.steps[index]?.chord ?? null;
    } else chord = this.keyChordNow();
    this.setContext(chord);

    const pos = this.position;
    const next =
      pos && this.s.lookAhead > 0 && pos.beatsLeft <= this.s.lookAhead + 1e-6
        ? (this.steps[pos.next]?.chord ?? null)
        : null;
    const nextSignature = next ? chordName(next) + (pos?.next ?? '') : '';
    if (nextSignature !== this.nextSignature) {
      this.nextSignature = nextSignature;
      this.keyboard.setNext(next ? chordHas(next) : null);
    }

    if (this.audio) this.runTimed(this.audio.engine.heard);
    this.keyboard.update(dt);
    this.stage.render();
    this.emit('frame');
  }

  private setContext(chord: Chord | null): void {
    const palette = this.s.mode === 'progression' ? this.s.palette : null;
    const signature = `${this.key.name}|${chord ? chordName(chord) : '-'}|${palette}|${this.s.mode}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.chord = chord;
    this.lights = chord ? chordLights(this.key, chord, palette ?? undefined) : keyLights(this.key);
    const songHome = chord ? this.key.key.home : -1;
    this.keyboard.setLights(this.lights, songHome);
    this.relabel();
    this.emit('context');
  }

  relabel(): void {
    const { labels, caps } = this.s;
    this.keyboard.setLabels((midi) => {
      const pc = pcOf(midi);
      const main =
        labels === 'name'
          ? nameOf(this.lights.names[pc]!)
          : labels === 'degree'
            ? degreeLabel(pc, this.key)
            : labels === 'role'
              ? this.lights.roles[pc]!
              : '';
      return [main, caps ? this.keys.capFor(midi) : ''];
    });
  }

  private runTimed(now: number): void {
    let done = false;
    for (const t of this.timed) {
      if (!t.on && now >= t.start) {
        t.on = true;
        this.showTimed(t, true);
      }
      if (t.on && now >= t.end) {
        this.showTimed(t, false);
        t.on = false;
        t.end = -1;
        done = true;
      }
    }
    if (done) this.timed = this.timed.filter((t) => t.end !== -1);
  }

  setMode(mode: Mode): void {
    this.set({ mode });
  }
}
