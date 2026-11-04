// Backing voices (pad, bass, drive) and the metronome click.
//
// Each note schedules its own release when it is created; Held.stop() is only for cutting notes
// short. A cut holds the current level and fades from there: cancelling automation outright
// resets a gain to its default of 1.

import type { Engine } from './engine.js';

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export interface Held {
  /** Cuts the note short, fading over `tau` if given. A note not yet started never plays. */
  stop(at: number, tau?: number): void;
}

/** Fades a gain to zero from `at`, starting at whatever level it has reached. */
export function cut(gain: AudioParam, at: number, tau: number): void {
  if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(at);
  else {
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
  }
  gain.setTargetAtTime(0, at, tau);
}

function handle(oscs: OscillatorNode[], env: GainNode, start: number, tau: number): Held {
  oscs[0]!.onended = () => env.disconnect();
  return {
    stop(at: number, fade = tau) {
      if (at <= start) {
        // Not started yet: stopping at its own start time means it never plays.
        for (const o of oscs) o.stop(start);
        return;
      }
      cut(env.gain, at, fade);
      for (const o of oscs) o.stop(at + fade * 8);
    },
  };
}

function envelope(engine: Engine, into: AudioNode): GainNode {
  const env = engine.ctx.createGain();
  env.gain.value = 0;
  env.connect(into);
  return env;
}

/** With `end`, the pad releases itself there; without it, it sounds until stopped. */
export function pad(engine: Engine, midi: number, time: number, level: number, end?: number): Held {
  const ctx = engine.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900 + midi * 6;
  filter.Q.value = 0.6;
  const env = envelope(engine, engine.buses.backing);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(level, time + 0.25);
  filter.connect(env);
  const oscs = [-7, 7].map((cents) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    o.detune.value = cents;
    o.connect(filter);
    o.start(time);
    return o;
  });
  if (end !== undefined) {
    const at = Math.max(end, time + 0.25);
    env.gain.setTargetAtTime(0, at, 0.15);
    for (const o of oscs) o.stop(at + 1.2);
  }
  return handle(oscs, env, time, 0.15);
}

export function bass(engine: Engine, midi: number, time: number, length: number): Held {
  const ctx = engine.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const env = envelope(engine, engine.buses.bass);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.5, time + 0.008);
  env.gain.setTargetAtTime(0.28, time + 0.008, 0.25);
  env.gain.setTargetAtTime(0, time + length, 0.04);
  filter.connect(env);
  const oscs = (['triangle', 'sine'] as const).map((type, i) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1 : 0.6;
    o.connect(g).connect(filter);
    o.start(time);
    o.stop(time + length + 0.3);
    return o;
  });
  return handle(oscs, env, time, 0.03);
}

export function drive(
  engine: Engine,
  notes: readonly number[],
  time: number,
  length: number,
): Held {
  const ctx = engine.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(2600, time);
  filter.frequency.setTargetAtTime(500, time, 0.06);
  const env = envelope(engine, engine.drive);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.22, time + 0.004);
  env.gain.setTargetAtTime(0, time + Math.min(length, 0.12), 0.05);
  filter.connect(env);
  const oscs = notes.map((midi) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    o.connect(filter);
    o.start(time);
    o.stop(time + length + 0.4);
    return o;
  });
  return handle(oscs, env, time, 0.02);
}

export function click(engine: Engine, time: number, accent: boolean): void {
  const ctx = engine.ctx;
  const o = ctx.createOscillator();
  o.frequency.value = accent ? 1660 : 1100;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(accent ? 0.6 : 0.4, time + 0.002);
  env.gain.setTargetAtTime(0, time + 0.002, 0.012);
  o.connect(env).connect(engine.buses.click);
  o.start(time);
  o.stop(time + 0.1);
}
