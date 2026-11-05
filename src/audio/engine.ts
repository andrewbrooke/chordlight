// Audio graph: a bus per part, a generated convolution room, and a soft clipper on the output.
//
// The output stage is a soft clipper rather than a DynamicsCompressor: the compressor adds
// automatic make-up gain and lets fast attacks through, which clipped chords over the backing.

import { MIX } from '../tuning.js';

export type Part = 'piano' | 'guitar' | 'backing' | 'bass' | 'click';

export class Engine {
  readonly ctx: AudioContext;
  readonly buses: Record<Part, GainNode>;
  /** Saturating input for the drive style; feeds the backing bus. */
  readonly drive: AudioNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    // The clipper's curve spans ±2, so halve the signal going in.
    const master = ctx.createGain();
    master.gain.value = MIX.master / 2;
    const clipper = ctx.createWaveShaper();
    clipper.curve = safety();
    clipper.oversample = '4x';
    master.connect(clipper).connect(ctx.destination);

    const room = ctx.createConvolver();
    room.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = MIX.roomWet;
    room.connect(wet).connect(master);

    const bus = (level: number, roomed: boolean): GainNode => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(master);
      if (roomed) g.connect(room);
      return g;
    };
    this.buses = {
      piano: bus(MIX.piano, true),
      guitar: bus(MIX.guitar, true),
      backing: bus(MIX.backing, true),
      bass: bus(MIX.bass, false),
      click: bus(MIX.click, false),
    };

    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip();
    shaper.oversample = '2x';
    const trim = ctx.createGain();
    trim.gain.value = 0.5;
    shaper.connect(trim).connect(this.buses.backing);
    this.drive = shaper;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Audio time currently reaching the speakers: currentTime minus output latency. */
  get heard(): number {
    const lag = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.ctx.currentTime - lag;
  }

  setLevel(part: Part, level: number): void {
    this.buses[part].gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
  }
}

function impulse(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.round(MIX.roomLength * rate);
  const buffer = ctx.createBuffer(2, length, rate);
  let seed = 1;
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      const t = i / rate;
      // The lowpass closes over the tail: bright early reflections, a darker decay.
      const k = 0.55 * Math.exp(-t / 0.6) + 0.04;
      lp += k * (white - lp);
      const early = t < 0.012 ? 0 : 1;
      data[i] = lp * Math.exp(-t / MIX.roomDecay) * early;
    }
  }
  return buffer;
}

/** Linear up to the knee, then a tanh shoulder towards full scale, over ±2 of input. */
function safety(): Float32Array<ArrayBuffer> {
  const knee = MIX.clipKnee;
  const room = 0.99 - knee;
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = ((i / (curve.length - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

function softClip(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  return curve;
}
