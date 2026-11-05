// The detector's whole path from input samples to notes. An anti-alias low-pass and decimation to
// about 12 kHz (a guitar's fundamentals stop near 1.3 kHz, and YIN's cost is the lag range times
// the window), a high-pass for rumble, notches for any mains hum the setup found, then every few
// milliseconds a level, a YIN estimate and a step of the Tracker.
//
// Pure, so the smokes run it on synthesised audio; the worklet runs the same code on the input.

import { LISTEN } from '../tuning.js';
import { type Biquad, highpass, hzOf, lowpass, midiOf, notch, step } from './filters.js';
import { type Heard, type Reading, Tracker, type TrackerConfig } from './tracker.js';
import { Yin } from './yin.js';

export interface ListenConfig extends TrackerConfig {
  /** Mains hum to notch out, in Hz. */
  hum: number[];
}

export class Listener {
  /** The detector's sample rate. */
  readonly rate: number;
  /** Detector-rate samples after the high-pass and before the notches, for the quiet check. */
  tap: ((x: number) => void) | null = null;
  reading: Reading = { t: 0, since: 0, level: -120, pitch: null, clarity: 0 };
  private readonly factor: number;
  private readonly antiAlias: Biquad[];
  private readonly highpass: Biquad;
  private notches: Biquad[] = [];
  private yin: Yin;
  private readonly tracker: Tracker;
  private ring: Float32Array;
  private frame: Float32Array;
  private write = 0;
  private filled = 0;
  private phase = 0;
  private sinceHop = 0;
  private readonly hop: number;
  private readonly levelWindow: number;

  constructor(
    private readonly inputRate: number,
    private config: ListenConfig,
  ) {
    this.factor = Math.max(1, Math.round(inputRate / LISTEN.rate));
    this.rate = inputRate / this.factor;
    const corner = Math.min(LISTEN.antiAlias, this.rate * 0.42);
    // A fourth-order Butterworth as two biquads.
    this.antiAlias = [0.5412, 1.3066].map((q) => lowpass(corner, inputRate, q));
    this.highpass = highpass(LISTEN.highpass, this.rate, Math.SQRT1_2);
    this.hop = Math.round(this.rate * LISTEN.hop);
    this.levelWindow = Math.round(this.rate * LISTEN.levelWindow);
    this.tracker = new Tracker(config);
    this.yin = this.yinFor(config);
    this.ring = new Float32Array(this.yin.frameLength);
    this.frame = new Float32Array(this.yin.frameLength);
    this.configure(config);
  }

  configure(config: ListenConfig): void {
    const rangeChanged = config.lo !== this.config.lo || config.hi !== this.config.hi;
    this.config = config;
    this.tracker.config = config;
    this.notches = config.hum
      .filter((f) => f < this.rate / 2 - 50)
      .map((f) => notch(f, this.rate, LISTEN.notchQ));
    if (rangeChanged) {
      this.yin = this.yinFor(config);
      this.ring = new Float32Array(this.yin.frameLength);
      this.frame = new Float32Array(this.yin.frameLength);
      this.write = 0;
      this.filled = 0;
    }
  }

  /** Feeds a block whose first sample is at audio time `t`; returns what was heard in it. */
  push(block: Float32Array, t: number): Heard[] {
    const out: Heard[] = [];
    const ring = this.ring;
    for (let i = 0; i < block.length; i++) {
      let x = block[i]!;
      for (const f of this.antiAlias) x = step(f, x);
      if (++this.phase < this.factor) continue;
      this.phase = 0;
      x = step(this.highpass, x);
      this.tap?.(x);
      for (const f of this.notches) x = step(f, x);
      ring[this.write] = x;
      this.write = (this.write + 1) % ring.length;
      this.filled = Math.min(ring.length, this.filled + 1);
      if (++this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        out.push(...this.analyse(t + i / this.inputRate));
      }
    }
    return out;
  }

  flush(t: number): Heard[] {
    return this.tracker.flush(t);
  }

  get sounding(): number | null {
    return this.tracker.sounding;
  }

  private yinFor(config: ListenConfig): Yin {
    const maxLag = Math.ceil(this.rate / hzOf(config.lo - LISTEN.rangeMargin));
    const minLag = Math.max(2, Math.floor(this.rate / hzOf(config.hi + LISTEN.rangeMargin)));
    return new Yin(maxLag, minLag, maxLag);
  }

  private analyse(now: number): Heard[] {
    const ring = this.ring;
    const n = ring.length;
    let sum = 0;
    for (let k = 1; k <= this.levelWindow; k++) {
      const x = ring[(this.write - k + n) % n]!;
      sum += x * x;
    }
    const level = 10 * Math.log10(sum / this.levelWindow + 1e-12);

    let pitch: number | null = null;
    let clarity = 0;
    if (this.filled === n && level > this.config.gateDb - LISTEN.listenBelowGate) {
      for (let k = 0; k < n; k++) this.frame[k] = ring[(this.write + k) % n]!;
      const est = this.yin.estimate(this.frame);
      pitch = midiOf(this.rate / est.period);
      clarity = est.clarity;
    }
    const since = now - n / this.rate;
    this.reading = { t: now - this.levelWindow / 2 / this.rate, since, level, pitch, clarity };
    return this.tracker.push(this.reading);
  }
}
