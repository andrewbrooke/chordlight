// App state and the per-frame loop. Each frame works out which chord is sounding (the
// transport's position in Progression mode, a held chord in Key mode) and recomputes the lights
// only when that changes; the panels listen for the resulting 'context' event.
//
// The instrument decides what the stage draws (keyboard or neck) and what played notes sound like
// (piano or the plucked string). Notes the guitar input hears come in through hear() and unhear():
// shown and logged like any other, but never sounded, since the guitar is already heard.

import { Amp } from './audio/amp.js';
import { ampSettings } from './audio/amp-model.js';
import { Backing } from './audio/backing.js';
import { Engine } from './audio/engine.js';
import { GuitarVoice } from './audio/guitar.js';
import { Piano } from './audio/piano.js';
import { type Held, pad } from './audio/synths.js';
import type { Position } from './audio/timeline.js';
import { Transport } from './audio/transport.js';
import { voice } from './audio/voicing.js';
import { type BackingState, record } from './clips/backing.js';
import type { ClipVoice, NoteEvent } from './clips/extract.js';
import { ComputerKeys } from './input/keys.js';
import { type Binding, sameBinding } from './input/midi.js';
import { attachPointer } from './input/pointer.js';
import { GuitarLink } from './listen/link.js';
import { presetOf } from './presets/library.js';
import { isTuning } from './presets/tunings.js';
import {
  DEFAULTS,
  MIDI_BUTTONS,
  type MidiButton,
  type Mode,
  RANGES,
  type Settings,
} from './settings.js';
import { type Chord, chordHas, chordName } from './theory/chords.js';
import { diatonicChords } from './theory/diatonic.js';
import { chordLights, hintsAfter, keyLights, type Lights } from './theory/guide.js';
import { nameOf, pcOf } from './theory/pitch.js';
import { parseProgression, progressionText, type Step } from './theory/roman.js';
import { degreeLabel, type SpelledKey, spellKey } from './theory/scales.js';
import { BACKING, CLIPS, GUITAR, PLAY } from './tuning.js';
import { load, loadList, save } from './ui/storage.js';
import type { InstrumentView } from './view/instrument.js';
import { KeyboardView } from './view/keyboard.js';
import { NeckView } from './view/neck.js';
import { Stage } from './view/stage.js';

export interface Audio {
  engine: Engine;
  piano: Piano;
  amp: Amp;
  guitar: GuitarVoice;
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

type Event =
  | 'settings'
  | 'context'
  | 'held'
  | 'hover'
  | 'audio'
  | 'mine'
  | 'clip'
  | 'record'
  | 'frame'
  | 'guitar'
  | 'hush';

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
  view: InstrumentView;
  readonly keys: ComputerKeys;
  readonly guitar: GuitarLink;
  heldChord: number | null = null;
  keyChord: number | null = null;
  /** The board button waiting to be learned. */
  learning: MidiButton | null = null;

  /** Played notes: how many inputs hold each, and the voice it started on. */
  private readonly held = new Map<number, { count: number; voice: ClipVoice }>();
  /** Notes the guitar input is hearing. */
  private readonly heard = new Set<number>();
  private readonly listeners = new Map<Event, (() => void)[]>();
  private drone: { held: Held; midi: number }[] = [];
  /** The chord a lane card plays when clicked. */
  private preview: Held[] = [];
  private signature = '';
  private nextSignature = '';
  private timed: Timed[] = [];
  /** While recording, the logs keep everything from here on, however long it runs. */
  private keepFrom: number | null = null;

  constructor(stageHost: HTMLElement) {
    this.s.levels = { ...DEFAULTS.levels, ...this.s.levels };
    this.s.amp = ampSettings(this.s.amp);
    if (!isTuning(this.s.tuning)) this.s.tuning = [...DEFAULTS.tuning];
    if (this.s.instrument !== 'guitar') this.s.instrument = 'piano';
    // A binding saved for a button that no longer exists (an early Stop) would swallow its control.
    this.s.midiButtons = Object.fromEntries(
      Object.entries(this.s.midiButtons).filter(([b]) => MIDI_BUTTONS.includes(b as MidiButton)),
    );
    this.stage = new Stage(stageHost);
    this.view = this.buildView();
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
    this.guitar = new GuitarLink({
      audio: () => {
        const { engine, amp } = this.startAudio();
        return { ctx: engine.ctx, into: amp.live };
      },
      tuning: () => this.s.tuning,
      hear: (m, v, t) => this.hear(m, v, t),
      unhear: (m, t) => this.unhear(m, t),
    });
    this.guitar.onChange = () => {
      if (this.guitar.state !== 'on') this.unhearAll();
      this.emit('guitar');
    };
    attachPointer(this.stage, {
      noteOn: (m, where) => this.noteOn(m, PLAY.velocity, where),
      noteOff: (m) => this.noteOff(m),
      hover: (m) => {
        if (m === this.hover) return;
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
    const amp = new Amp(engine);
    const guitar = new GuitarVoice(engine, amp.voice);
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
    engine.ctx.onstatechange = () => this.emit('audio');
    transport.onStop = () => this.emit('settings');
    transport.onChange = () => this.recordBacking();
    this.audio = { engine, piano, amp, guitar, backing, transport };
    this.applyAudioSettings();
    backing.setSteps(this.steps);
    transport.setBeats(this.steps.map((s) => s.beats));
    this.resumeGuitar();
    return this.audio;
  }

  /** Opens the guitar input if guitar mode wants it and it isn't already open. */
  private resumeGuitar(): void {
    const wanted = this.s.instrument === 'guitar' && this.s.guitarOn;
    if (wanted && this.audio && this.guitar.state === 'off') {
      void this.guitar.open(this.s.guitarDevice || null);
    }
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
    if (changed('range') || changed('instrument') || changed('tuning'))
      this.view = this.buildView();
    if (changed('tuning')) this.guitar.configure();
    if (changed('instrument')) {
      // Piano mode doesn't listen; guitarOn stays, so guitar mode picks the input up again.
      if (this.s.instrument === 'piano') this.guitar.close();
      else this.resumeGuitar();
    }
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
    for (const part of ['piano', 'guitar', 'backing', 'bass', 'click'] as const) {
      a.engine.setLevel(part, this.s.levels[part]);
    }
    a.amp.set(this.s.amp);
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

  private buildView(): InstrumentView {
    if (this.view) this.view.dispose();
    let view: InstrumentView;
    if (this.s.instrument === 'guitar') view = new NeckView(this.s.tuning, GUITAR.frets);
    else {
      const [lo, hi] = RANGES[this.s.range] ?? RANGES[49]!;
      view = new KeyboardView(lo, hi);
    }
    this.stage.setView(view);
    this.signature = '';
    this.nextSignature = '';
    return view;
  }

  /** `where` is the place on the neck it was played, when the pointer knows. */
  noteOn(midi: number, velocity: number = PLAY.velocity, where?: number): void {
    const { engine, piano, guitar } = this.startAudio();
    const held = this.held.get(midi);
    if (held) {
      held.count++;
      return;
    }
    const voice: ClipVoice = this.s.instrument === 'guitar' ? 'guitar' : 'piano';
    this.held.set(midi, { count: 1, voice });
    if (voice === 'guitar') guitar.noteOn('user', midi, velocity);
    else piano.noteOn('user', midi, velocity);
    this.view.press(midi, 'user', true, where);
    this.remember({ t: engine.now, on: true, midi, vel: velocity, voice });
    this.played(midi);
  }

  noteOff(midi: number): void {
    const held = this.held.get(midi);
    if (!held) return;
    if (held.count > 1) {
      held.count--;
      return;
    }
    this.held.delete(midi);
    if (held.voice === 'guitar') this.audio?.guitar.noteOff('user', midi);
    else this.audio?.piano.noteOff('user', midi);
    this.view.press(midi, 'user', false);
    if (this.audio) {
      this.remember({ t: this.audio.engine.now, on: false, midi, vel: 0, voice: held.voice });
    }
    this.emit('held');
  }

  /** A note the guitar input heard, dated to when it was played. */
  hear(midi: number, velocity: number, t: number): void {
    if (this.heard.has(midi)) return;
    this.heard.add(midi);
    this.view.press(midi, 'heard', true);
    this.remember({ t, on: true, midi, vel: velocity, voice: 'guitar' });
    this.played(midi);
  }

  unhear(midi: number, t: number): void {
    if (!this.heard.delete(midi)) return;
    this.view.press(midi, 'heard', false);
    this.remember({ t, on: false, midi, vel: 0, voice: 'guitar' });
    this.emit('held');
  }

  private unhearAll(): void {
    const now = this.audio?.engine.now ?? 0;
    for (const midi of [...this.heard]) this.unhear(midi, now);
  }

  private played(midi: number): void {
    this.last = midi;
    if (this.s.hints) {
      const [lo, hi] = [this.view.lo, this.view.hi];
      for (const m of hintsAfter(midi, this.lights, lo, hi)) this.view.flash(m);
    }
    this.emit('held');
  }

  pedal(down: boolean): void {
    this.audio?.piano.setPedal(down);
  }

  heldNotes(): number[] {
    return [...new Set([...this.held.keys(), ...this.heard])];
  }

  private remember(e: NoteEvent): void {
    this.log.push(e);
    const recording = this.keepFrom !== null;
    const cutoff = Math.min(e.t - CLIPS.memory, this.keepFrom ?? Infinity);
    if ((!recording && this.log.length > 4000) || this.log[0]!.t < cutoff) {
      this.log = this.log.filter((x) => x.t >= cutoff);
      if (!recording) this.log = this.log.slice(-4000);
    }
  }

  keepLogFrom(t: number | null): void {
    this.keepFrom = t;
  }

  learn(button: MidiButton | null): void {
    this.learning = button;
    this.emit('settings');
  }

  /** Learns the control if a learn is waiting, else runs what it's bound to. True if it's ours. */
  midiButton(binding: Binding, down: boolean): boolean {
    const learning = this.learning;
    if (learning && down) {
      this.learning = null;
      const kept = Object.entries(this.s.midiButtons).filter(([, b]) => !sameBinding(b, binding));
      this.set({ midiButtons: { ...Object.fromEntries(kept), [learning]: binding } });
      return true;
    }
    const bound = Object.entries(this.s.midiButtons).find(([, b]) => sameBinding(b, binding));
    if (!bound) return false;
    if (!down) return true;
    if (bound[0] === 'play') this.playStop();
    else if (bound[0] === 'pause') this.pauseResume();
    else this.emit(bound[0] as 'record' | 'clip');
    return true;
  }

  playStop(): void {
    if (this.s.mode !== 'progression') return;
    const { transport } = this.startAudio();
    // From a pause, Play starts again from the top; Pause is what resumes.
    if (transport.playing) transport.stop();
    else if (this.steps.length > 0) {
      this.stopPreview();
      transport.start();
    }
    this.emit('settings');
  }

  pauseResume(): void {
    const transport = this.audio?.transport;
    if (this.s.mode !== 'progression' || !transport) return;
    if (transport.playing) transport.pause();
    else if (transport.paused) transport.resume();
    else return;
    this.emit('settings');
  }

  /** Pauses the progression if it's playing, so something else can be heard. */
  pause(): void {
    if (!this.audio?.transport.playing) return;
    this.audio.transport.pause();
    this.emit('settings');
  }

  /**
   * Quiets everything that plays by itself, for the guitar setup to listen and click over: pauses
   * the progression (Resume picks it up), lets go of a held chord, and stops a clip ('hush').
   */
  hush(): void {
    this.pause();
    if (this.heldChord !== null) this.togglePalette(this.heldChord);
    this.emit('hush');
  }

  /** Selects a card while stopped and plays its chord once. */
  select(index: number): void {
    this.selected = index;
    const step = this.steps[index];
    if (!step || this.audio?.transport.playing) return;
    const { engine } = this.startAudio();
    this.stopPreview();
    const notes = voice(step.chord, null, BACKING.chordLo, BACKING.chordHi);
    this.preview = notes.map((m) => pad(engine, m, engine.now, BACKING.padLevel, engine.now + 1.4));
  }

  private stopPreview(): void {
    const now = this.audio?.engine.now ?? 0;
    for (const h of this.preview) h.stop(now, BACKING.swapCut);
    this.preview = [];
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
      // Straight into the next chord, the old one is cut rather than left to ring under it.
      d.held.stop(now, chord ? BACKING.swapCut : undefined);
      this.view.ghost(d.midi, -1);
      this.remember({ t: now, on: false, midi: d.midi, vel: 0, voice: 'pad' });
    }
    this.drone = [];
    if (!chord || !audio) return;
    for (const midi of voice(chord, null, BACKING.droneLo, BACKING.droneHi)) {
      this.drone.push({ held: pad(audio.engine, midi, now, BACKING.droneLevel), midi });
      if (this.s.ghosts) this.view.ghost(midi, 1);
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
    if (t.ghost) this.view.ghost(t.midi, down ? 1 : -1);
    else this.view.press(t.midi, 'clip', down);
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
    const keepFrom = Math.min(engine.now - CLIPS.memory, this.keepFrom ?? Infinity);
    this.backingLog = record(this.backingLog, state, keepFrom);
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
      this.view.setNext(next ? chordHas(next) : null);
    }

    if (this.audio) this.runTimed(this.audio.engine.heard);
    this.view.update(dt);
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
    this.view.setLights(this.lights, songHome);
    this.relabel();
    this.emit('context');
  }

  relabel(): void {
    const { labels, caps } = this.s;
    this.view.setLabels((midi) => {
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
