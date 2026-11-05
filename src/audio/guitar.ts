// The plucked-string voice, played into the amp: what the neck, a MIDI keyboard and the computer
// keys sound like in guitar mode, and how a clip's guitar notes replay. Each rendered root covers
// the semitone either side; roots render on first use, which takes a millisecond or two.
//
// Voices have an owner, as the piano's do, so stopping a clip never cuts what the player holds.

import { PLUCK } from '../tuning.js';
import type { Engine } from './engine.js';
import { cut } from './synths.js';
import { pluckDuration, pluckRootFor, renderPluck } from './guitar-model.js';

export type GuitarOwner = 'user' | 'clip';

interface Voice {
  owner: GuitarOwner;
  midi: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  released: boolean;
}

export class GuitarVoice {
  private readonly buffers = new Map<number, AudioBuffer>();
  private voices: Voice[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly into: AudioNode,
  ) {}

  noteOn(owner: GuitarOwner, midi: number, velocity: number, time = this.engine.now): void {
    const ctx = this.engine.ctx;
    for (const v of this.voices) {
      if (v.owner === owner && v.midi === midi && !v.released) this.release(v, time, 0.01);
    }
    const { root, shift } = pluckRootFor(midi);
    const source = ctx.createBufferSource();
    source.buffer = this.buffer(root);
    source.playbackRate.value = Math.pow(2, shift / 12);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400 + 9000 * velocity * velocity;
    tone.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.2 + 0.8 * Math.pow(velocity, 1.5);
    source.connect(tone).connect(gain).connect(this.into);
    source.start(time);
    source.stop(time + pluckDuration(root) / Math.pow(2, shift / 12) + 0.05);

    const voice: Voice = { owner, midi, source, gain, start: time, released: false };
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      gain.disconnect();
    };
    this.voices.push(voice);
    this.steal(time);
  }

  noteOff(owner: GuitarOwner, midi: number, time = this.engine.now): void {
    for (const v of this.voices) {
      if (v.owner === owner && v.midi === midi && !v.released) this.release(v, time);
    }
  }

  /** Silences an owner immediately, including notes booked ahead. */
  allOff(owner: GuitarOwner): void {
    const now = this.engine.now;
    for (const v of this.voices) {
      if (v.owner !== owner) continue;
      v.released = true;
      if (v.start > now) {
        v.source.stop(v.start);
        continue;
      }
      cut(v.gain.gain, now, 0.03);
      v.source.stop(now + 0.3);
    }
  }

  private release(v: Voice, time: number, tau: number = PLUCK.release): void {
    v.released = true;
    v.gain.gain.setTargetAtTime(0, Math.max(time, v.start), tau);
    v.source.stop(Math.max(time, v.start) + tau * 10);
  }

  private steal(time: number): void {
    const live = this.voices.filter((v) => !v.released);
    for (const v of live.slice(0, Math.max(0, live.length - PLUCK.polyphony))) {
      this.release(v, time, 0.02);
    }
  }

  private buffer(root: number): AudioBuffer {
    let b = this.buffers.get(root);
    if (!b) {
      const ctx = this.engine.ctx;
      const data = renderPluck(root, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data, 0);
      this.buffers.set(root, b);
    }
    return b;
  }
}
