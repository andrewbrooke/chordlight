// The live guitar amp: the chain from amp-model.ts built as Web Audio nodes, once, with every knob
// a change of settings. WaveShapers oversample 4x, which keeps hard clipping from aliasing into a
// fizz above the notes.
//
// Two ways in: `live`, the guitar input (already gated in the worklet), muted unless monitoring is
// on; and `voice`, the plucked-string voice, which always sounds.

import { AMP } from '../tuning.js';
import { type AmpSettings, ampStages, clipCurve, type Curve, FLAT } from './amp-model.js';
import type { Engine } from './engine.js';

type Built =
  | { kind: 'filter'; node: BiquadFilterNode }
  | { kind: 'gain'; node: GainNode }
  | { kind: 'clip'; gain: GainNode; shaper: WaveShaperNode; curve: Curve | null };

export class Amp {
  readonly live: GainNode;
  readonly voice: GainNode;
  private readonly built: Built[];

  constructor(private readonly engine: Engine) {
    const ctx = engine.ctx;
    this.live = ctx.createGain();
    this.live.gain.value = 0;
    this.voice = ctx.createGain();
    const input = ctx.createGain();
    this.live.connect(input);
    this.voice.connect(input);

    let node: AudioNode = input;
    this.built = ampStages('clean', FLAT).map((s): Built => {
      if (s.kind === 'filter') {
        const f = ctx.createBiquadFilter();
        node = node.connect(f);
        return { kind: 'filter', node: f };
      }
      if (s.kind === 'gain') {
        const g = ctx.createGain();
        node = node.connect(g);
        return { kind: 'gain', node: g };
      }
      const gain = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '4x';
      node = node.connect(gain).connect(shaper);
      return { kind: 'clip', gain, shaper, curve: null };
    });
    node.connect(engine.buses.guitar);
  }

  set(s: AmpSettings): void {
    const now = this.engine.now;
    const glide = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, 0.02);
    const linear = (db: number) => Math.pow(10, db / 20);
    this.live.gain.setTargetAtTime(s.monitor ? 1 : 0, now, 0.02);
    ampStages(s.sound, s).forEach((stage, i) => {
      const b = this.built[i]!;
      if (stage.kind === 'filter' && b.kind === 'filter') {
        b.node.type = stage.type;
        glide(b.node.frequency, stage.f);
        glide(b.node.gain, stage.db);
        // Web Audio reads a low- or high-pass's Q in dB, and every other type's as a plain Q.
        const lowOrHigh = stage.type === 'lowpass' || stage.type === 'highpass';
        b.node.Q.value = lowOrHigh ? 20 * Math.log10(stage.q) : stage.q;
      } else if (stage.kind === 'gain' && b.kind === 'gain') {
        glide(b.node.gain, linear(stage.db));
      } else if (stage.kind === 'clip' && b.kind === 'clip') {
        glide(b.gain.gain, linear(stage.db) / AMP.curveSpan);
        if (b.curve !== stage.curve) {
          b.shaper.curve = clipCurve(stage.curve);
          b.curve = stage.curve;
        }
      }
    });
  }
}
