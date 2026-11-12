// The piano's effects as Web Audio nodes, built once in the order of FX_KINDS. Each effect has a
// dry path and a wet one, and turning it off fades the wet path out rather than disconnecting it,
// so a change of settings only ever moves values and never cuts a note that's ringing. The chain
// off is the same crossfade around all of it.
//
// The echo is two delay lines with a lowpass in each loop, routed by gains: each side feeding
// itself is a stereo echo; fed from the left alone, each feeding the other, it's ping-pong. The
// reverb has two convolvers: a new impulse goes into the quiet one and is crossfaded in, since
// swapping the buffer of one that's ringing clicks. The quiet one's buffer is then dropped, and both
// are while the reverb is off, so a long impulse costs nothing when it isn't heard.

import { FX } from '../tuning.js';
import type { Engine } from './engine.js';
import {
  driveCurve,
  driveGains,
  DRY,
  echoFeedback,
  echoSeconds,
  eqFilters,
  type Filter,
  type FxSettings,
  mixGains,
  reverbImpulse,
  toneHz,
} from './fx-model.js';

type Glide = (param: AudioParam, value: number) => void;

interface Path {
  input: GainNode;
  output: GainNode;
  dry: GainNode;
  wet: GainNode;
}

interface Unit {
  path: Path;
  set(fx: FxSettings, bpm: number, glide: Glide): void;
}

export class Effects {
  /** Stereo: the chorus and echo treat the two sides apart. */
  readonly input: GainNode;
  private readonly units: Unit[];
  private readonly bypass: Path;

  constructor(
    private readonly engine: Engine,
    into: AudioNode,
  ) {
    const ctx = engine.ctx;
    this.units = [drive(ctx), eq(ctx), chorus(ctx), tremolo(ctx), echo(ctx), reverb(ctx)];
    this.units.reduce((a, b) => {
      a.path.output.connect(b.path.input);
      return b;
    });
    this.bypass = path(ctx, this.units[0]!.path.input, this.units.at(-1)!.path.output);
    this.input = this.bypass.input;
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.bypass.output.connect(into);
  }

  set(fx: FxSettings, bpm: number): void {
    const now = this.engine.now;
    const glide: Glide = (p, v) => p.setTargetAtTime(v, now, FX.glide);
    for (const u of this.units) u.set(fx, bpm, glide);
    blend(this.bypass, fx.on, 1, glide);
  }
}

function path(ctx: AudioContext, wetIn: AudioNode, wetOut: AudioNode): Path {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0;
  input.connect(dry).connect(output);
  input.connect(wetIn);
  wetOut.connect(wet).connect(output);
  return { input, output, dry, wet };
}

function blend(p: Path, on: boolean, mix: number, glide: Glide): void {
  const [dry, wet] = on ? mixGains(mix) : [1, 0];
  glide(p.dry.gain, dry);
  glide(p.wet.gain, wet);
}

/** Web Audio reads a low- or high-pass's Q in dB, and every other type's as a plain Q. */
const qDb = (q: number): number => 20 * Math.log10(q);
const qOf = (f: Filter): number => (f.type === 'lowpass' || f.type === 'highpass' ? qDb(f.q) : f.q);

function filter(ctx: AudioContext, type: BiquadFilterType, hz: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = qDb(Math.SQRT1_2);
  return f;
}

/** A gain starting at zero from `from` (one of its outputs) to `to`. */
function link(
  ctx: AudioContext,
  from: AudioNode,
  to: AudioNode | AudioParam,
  output = 0,
): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  from.connect(g, output);
  if (to instanceof AudioParam) g.connect(to);
  else g.connect(to);
  return g;
}

function lfo(ctx: AudioContext, rate: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  o.start();
  return o;
}

function drive(ctx: AudioContext): Unit {
  const pre = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve();
  shaper.oversample = '4x';
  const post = ctx.createGain();
  pre
    .connect(shaper)
    .connect(filter(ctx, 'highpass', FX.drive.block))
    .connect(filter(ctx, 'lowpass', FX.drive.smooth))
    .connect(post);
  const p = path(ctx, pre, post);
  return {
    path: p,
    set(fx, _bpm, glide) {
      const g = driveGains(fx.drive.amount);
      glide(pre.gain, g.pre);
      glide(post.gain, g.post);
      blend(p, fx.drive.on, 1, glide);
      // Oversampling is most of the shaper's cost, and nobody hears it while the drive is off.
      shaper.oversample = fx.drive.on ? '4x' : 'none';
    },
  };
}

function eq(ctx: AudioContext): Unit {
  const nodes = eqFilters(DRY.eq, ctx.sampleRate).map((f) => {
    const node = filter(ctx, f.type, f.f);
    node.Q.value = qOf(f);
    return node;
  });
  nodes.reduce((a, b) => {
    a.connect(b);
    return b;
  });
  const p = path(ctx, nodes[0]!, nodes.at(-1)!);
  return {
    path: p,
    set(fx, _bpm, glide) {
      eqFilters(fx.eq, ctx.sampleRate).forEach((f, i) => {
        const node = nodes[i]!;
        glide(node.frequency, f.f);
        glide(node.gain, f.db);
        glide(node.Q, qOf(f));
      });
      blend(p, fx.eq.on, 1, glide);
    },
  };
}

function chorus(ctx: AudioContext): Unit {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const wobble = lfo(ctx, DRY.chorus.rate);
  // The two sides sweep in opposite directions, which is most of a chorus's width.
  const depths = [0, 1].map((ch) => {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = FX.chorus.delay;
    split.connect(delay, ch).connect(merge, 0, ch);
    const depth = ctx.createGain();
    depth.gain.value = 0;
    wobble.connect(depth).connect(delay.delayTime);
    return depth;
  });
  const p = path(ctx, split, merge);
  return {
    path: p,
    set(fx, _bpm, glide) {
      const c = fx.chorus;
      glide(wobble.frequency, c.rate);
      depths.forEach((d, i) => glide(d.gain, (i === 0 ? 1 : -1) * c.depth * FX.chorus.depth));
      blend(p, c.on, c.mix, glide);
    },
  };
}

function tremolo(ctx: AudioContext): Unit {
  const level = ctx.createGain();
  const pan = ctx.createStereoPanner();
  level.connect(pan);
  const wobble = lfo(ctx, DRY.tremolo.rate);
  const levelDepth = link(ctx, wobble, level.gain);
  const panDepth = link(ctx, wobble, pan.pan);
  const p = path(ctx, level, pan);
  return {
    path: p,
    set(fx, _bpm, glide) {
      const t = fx.tremolo;
      glide(wobble.frequency, t.rate);
      glide(level.gain, t.pan ? 1 : 1 - t.depth / 2);
      glide(levelDepth.gain, t.pan ? 0 : t.depth / 2);
      glide(panDepth.gain, t.pan ? t.depth : 0);
      blend(p, t.on, 1, glide);
    },
  };
}

function echo(ctx: AudioContext): Unit {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const both = ctx.createGain();
  both.gain.value = 0.5;
  split.connect(both, 0);
  split.connect(both, 1);
  const lines = [0, 1].map((ch) => {
    const delay = ctx.createDelay(FX.echo.longest);
    delay.delayTime.value = DRY.echo.ms / 1000;
    const tone = filter(ctx, 'lowpass', toneHz(FX.echo.tone, DRY.echo.tone));
    delay.connect(tone).connect(merge, 0, ch);
    return { delay, tone };
  });
  const [l, r] = [lines[0]!, lines[1]!];
  const straight = [link(ctx, split, l.delay, 0), link(ctx, split, r.delay, 1)];
  const ping = link(ctx, both, l.delay);
  const self = [link(ctx, l.tone, l.delay), link(ctx, r.tone, r.delay)];
  const cross = [link(ctx, l.tone, r.delay), link(ctx, r.tone, l.delay)];
  const p = path(ctx, split, merge);
  return {
    path: p,
    set(fx, bpm, glide) {
      const e = fx.echo;
      const seconds = echoSeconds(e, bpm);
      const feedback = echoFeedback(e);
      for (const { delay, tone } of lines) {
        glide(delay.delayTime, seconds);
        glide(tone.frequency, toneHz(FX.echo.tone, e.tone));
      }
      for (const g of straight) glide(g.gain, e.pingPong ? 0 : 1);
      glide(ping.gain, e.pingPong ? 1 : 0);
      for (const g of self) glide(g.gain, e.pingPong ? 0 : feedback);
      for (const g of cross) glide(g.gain, e.pingPong ? feedback : 0);
      blend(p, e.on, e.mix, glide);
    },
  };
}

function reverb(ctx: AudioContext): Unit {
  const pre = ctx.createDelay(FX.reverb.preDelay[1] / 1000 + 0.01);
  const sum = ctx.createGain();
  const rooms = [0, 1].map(() => {
    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    pre.connect(convolver).connect(gain).connect(sum);
    return { convolver, gain };
  });
  const p = path(ctx, pre, sum);
  const settle = FX.reverb.settle * 1000;
  let live = 0;
  /** The size and tone of the impulse playing; '' while there is none. */
  let made = '';
  /** A new impulse waiting for a slider to stop, or both dropped once the reverb has faded. */
  let pending = 0;
  let quiet = 0;
  // Called from timers, so it takes its own time: a glide booked in the past jumps.
  const fade = (param: AudioParam, v: number) =>
    param.setTargetAtTime(v, ctx.currentTime, FX.glide);

  const make = (size: number, tone: number) => {
    const [left, right] = reverbImpulse(ctx.sampleRate, size, tone);
    const buffer = ctx.createBuffer(2, left.length, ctx.sampleRate);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);
    const idle = live;
    live = 1 - live;
    rooms[live]!.convolver.buffer = buffer;
    fade(rooms[live]!.gain.gain, 1);
    fade(rooms[idle]!.gain.gain, 0);
    made = `${size}:${tone}`;
    window.clearTimeout(quiet);
    quiet = window.setTimeout(() => {
      if (live !== idle) rooms[idle]!.convolver.buffer = null;
    }, settle * 2);
  };
  const drop = () => {
    for (const room of rooms) room.convolver.buffer = null;
    made = '';
  };

  return {
    path: p,
    set(fx, _bpm, glide) {
      const r = fx.reverb;
      glide(pre.delayTime, r.preDelay / 1000);
      blend(p, r.on, r.mix, glide);
      window.clearTimeout(pending);
      if (!r.on) {
        if (made) pending = window.setTimeout(drop, settle * 2);
      } else if (!made) make(r.size, r.tone);
      else if (made !== `${r.size}:${r.tone}`) {
        pending = window.setTimeout(() => make(r.size, r.tone), settle);
      }
    },
  };
}
