// Plays the rendered piano: each note repitches the nearest rendered root by at most a semitone.
//
// Voices have an owner, so releasing a key never cuts a backing or clip note of the same pitch,
// and the sustain pedal only holds the player's notes. Until a note's buffer arrives from the
// workers, a plain triangle plays in its place.

import { PIANO } from '../tuning.js';
import type { Engine } from './engine.js';
import { cut } from './synths.js';
import { durationOf, rootFor, roots } from './piano-model.js';

/** `replay` is a clip's recorded backing, kept apart so it never cuts the clip's own notes. */
export type Owner = 'user' | 'backing' | 'clip' | 'replay';

interface Voice {
  owner: Owner;
  midi: number;
  source: AudioScheduledSourceNode;
  gain: GainNode;
  start: number;
  released: boolean;
  pedalled: boolean;
}

/** Enough workers to render the full set in about a second. */
const WORKERS = 3;

export class Piano {
  private readonly buffers = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private readonly held = new Set<number>();
  private pedal = false;
  private expected = 0;
  onProgress: (fraction: number) => void = () => {};

  constructor(private readonly engine: Engine) {}

  load(): void {
    const ctx = this.engine.ctx;
    const jobs = renderOrder();
    this.expected = jobs.length;
    const workers = Array.from({ length: WORKERS }, () => {
      return new Worker(new URL('./piano-worker.js', import.meta.url), { type: 'module' });
    });
    workers.forEach((worker, w) => {
      worker.onmessage = (e: MessageEvent<{ root: number; layer: number; data: Float32Array }>) => {
        const { root, layer, data } = e.data;
        const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
        this.buffers.set(`${root}:${layer}`, buffer);
        this.onProgress(this.buffers.size / this.expected);
        if (this.buffers.size === this.expected) workers.forEach((x) => x.terminate());
      };
      // Round-robin, so every worker starts near the middle of the keyboard.
      const notes = jobs.filter((_, i) => i % WORKERS === w);
      worker.postMessage({ sampleRate: ctx.sampleRate, notes });
    });
  }

  noteOn(owner: Owner, midi: number, velocity: number, time = this.engine.now): void {
    const ctx = this.engine.ctx;
    for (const v of this.voices) {
      if (v.owner === owner && v.midi === midi && !v.released) this.release(v, time, 0.015);
    }
    if (owner === 'user') this.held.add(midi);

    const { root, shift } = rootFor(midi);
    const layer = velocity < 0.6 ? 0 : 1;
    const buffer = this.buffers.get(`${root}:${layer}`) ?? this.buffers.get(`${root}:${1 - layer}`);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800 + 16000 * velocity * velocity;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.15 + 0.85 * Math.pow(velocity, 1.7);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, ((midi - 64) / 40) * PIANO.spread));

    let source: AudioScheduledSourceNode;
    if (buffer) {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.playbackRate.value = Math.pow(2, shift / 12);
      s.connect(filter);
      source = s;
    } else {
      source = this.standIn(midi, time, filter);
    }
    filter.connect(gain).connect(pan).connect(this.engine.buses.piano);
    source.start(time);
    source.stop(time + durationOf(midi) + 0.05);

    const voice: Voice = {
      owner,
      midi,
      source,
      gain,
      start: time,
      released: false,
      pedalled: false,
    };
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      pan.disconnect();
    };
    this.voices.push(voice);
    this.steal(time);
  }

  noteOff(owner: Owner, midi: number, time = this.engine.now): void {
    if (owner === 'user') this.held.delete(midi);
    for (const v of this.voices) {
      if (v.owner !== owner || v.midi !== midi || v.released) continue;
      if (owner === 'user' && this.pedal) v.pedalled = true;
      else this.release(v, time);
    }
  }

  setPedal(down: boolean): void {
    this.pedal = down;
    if (down) return;
    for (const v of this.voices) {
      if (v.pedalled && !v.released && !this.held.has(v.midi)) this.release(v, this.engine.now);
    }
  }

  /** Silences an owner immediately, including pending releases and notes booked ahead. */
  allOff(owner: Owner): void {
    if (owner === 'user') this.held.clear();
    const now = this.engine.now;
    for (const v of this.voices) {
      if (v.owner !== owner) continue;
      v.released = true;
      if (v.start > now) {
        // Not started yet: stopping at its own start time means it never plays.
        v.source.stop(v.start);
        continue;
      }
      cut(v.gain.gain, now, 0.03);
      v.source.stop(now + 0.3);
    }
  }

  private release(v: Voice, time: number, tau: number = PIANO.damper): void {
    v.released = true;
    // Like a real piano, the top keys have no dampers.
    if (v.midi >= PIANO.undamped && tau === PIANO.damper) return;
    v.gain.gain.setTargetAtTime(0, time, tau);
    v.source.stop(time + tau * 10);
  }

  private steal(time: number): void {
    const excess = this.voices.filter((v) => !v.released).length - PIANO.polyphony;
    for (const v of this.voices.filter((x) => !x.released).slice(0, Math.max(0, excess))) {
      this.release(v, time, 0.02);
    }
  }

  private standIn(midi: number, time: number, into: AudioNode): AudioScheduledSourceNode {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, time);
    env.gain.setTargetAtTime(0, time, 0.5);
    osc.connect(env).connect(into);
    return osc;
  }
}

/** Loud layer first (the computer-key velocity), from the middle of the keyboard outwards. */
function renderOrder(): { root: number; layer: number }[] {
  const byCentre = roots().sort((a, b) => Math.abs(a - 66) - Math.abs(b - 66));
  return [1, 0].flatMap((layer) => byCentre.map((root) => ({ root, layer })));
}
