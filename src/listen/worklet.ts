// The guitar input's AudioWorklet. It takes the device's channels, picks the guitar's, gates it into
// the amp and runs the Listener on it, posting notes and plucks as they are heard and a meter about
// thirty times a second. A capture hands back a stretch of the detector's input for the setup's
// quiet check; a recording hands back the guitar channel exactly as the Listener got it, with what
// it heard, so the same playing can be replayed through the detector later.
//
// The gate only shapes what the amp hears; the Listener has its own thresholds and gets the signal
// ungated, or every note would lose its first milliseconds.

import { GATE } from '../tuning.js';
import { amplitudeOf, dbOf } from './filters.js';
import { Listener } from './listener.js';
import type { Meter, Recorded, Setup, ToWorklet } from './messages.js';
import type { Heard } from './tracker.js';

interface Scope {
  sampleRate: number;
  currentTime: number;
  registerProcessor(name: string, processor: unknown): void;
  AudioWorkletProcessor: new () => { readonly port: MessagePort };
}

const scope = globalThis as unknown as Scope;

class GuitarProcessor extends scope.AudioWorkletProcessor {
  private readonly listener: Listener;
  private channel: number;
  private open = 0;
  private close = 0;
  private envelope = 0;
  private gain = 0;
  private gateOpen = false;
  private readonly attack: number;
  private readonly release: number;
  private readonly fall: number;
  private peaks = [0, 0];
  private blocks = 0;
  private readonly meterEvery: number;
  private capture: { buffer: Float32Array; at: number } | null = null;
  private recording: { buffer: Float32Array; at: number; start: number; heard: Heard[] } | null =
    null;

  constructor(options: { processorOptions: Setup }) {
    super();
    const setup = options.processorOptions;
    const rate = scope.sampleRate;
    this.listener = new Listener(rate, setup.config);
    this.channel = setup.channel;
    this.setGate(setup.ampGateDb);
    this.attack = 1 - Math.exp(-1 / (GATE.attack * rate));
    this.release = 1 - Math.exp(-1 / (GATE.release * rate));
    this.fall = Math.exp(-1 / (GATE.hold * rate));
    this.meterEvery = Math.max(1, Math.round(rate / 128 / 30));
    this.listener.tap = (x) => this.record(x);
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => {
      const m = e.data;
      if (m.kind === 'setup') {
        this.listener.configure(m.config);
        this.channel = m.channel;
        this.setGate(m.ampGateDb);
      } else if (m.kind === 'capture') {
        const length = Math.round(m.seconds * this.listener.rate);
        this.capture = { buffer: new Float32Array(length), at: 0 };
      } else if (m.seconds > 0) {
        const length = Math.round(m.seconds * scope.sampleRate);
        this.recording = { buffer: new Float32Array(length), at: 0, start: -1, heard: [] };
      } else this.sendRecording();
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const out = outputs[0]?.[0];
    for (let c = 0; c < Math.min(2, input.length); c++) {
      const ch = input[c]!;
      let peak = this.peaks[c] ?? 0;
      for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
      this.peaks[c] = peak;
    }
    const x = input[Math.min(this.channel, input.length - 1)];
    if (!x) {
      out?.fill(0);
      return true;
    }
    if (out) this.gate(x, out);
    const rec = this.recording;
    if (rec) {
      if (rec.start < 0) rec.start = scope.currentTime;
      const n = Math.min(x.length, rec.buffer.length - rec.at);
      rec.buffer.set(x.subarray(0, n), rec.at);
      rec.at += n;
    }
    for (const heard of this.listener.push(x, scope.currentTime)) {
      this.port.postMessage(heard);
      rec?.heard.push({ ...heard, t: heard.t - rec.start });
    }
    if (rec && rec.at >= rec.buffer.length) this.sendRecording();
    if (++this.blocks >= this.meterEvery) {
      this.blocks = 0;
      const r = this.listener.reading;
      const meter: Meter = {
        kind: 'meter',
        peaks: this.peaks.slice(0, Math.max(1, input.length)).map(dbOf),
        level: r.level,
        pitch: r.pitch,
        clarity: r.clarity,
        note: this.listener.sounding,
      };
      this.port.postMessage(meter);
      this.peaks = [0, 0];
    }
    return true;
  }

  /** The gate opens on the peak envelope, with hysteresis, and fades rather than switches. */
  private gate(x: Float32Array, out: Float32Array): void {
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]!);
      this.envelope = a > this.envelope ? a : this.envelope * this.fall;
      if (this.envelope > this.open) this.gateOpen = true;
      else if (this.envelope < this.close) this.gateOpen = false;
      const target = this.gateOpen ? 1 : 0;
      this.gain += (target - this.gain) * (target > this.gain ? this.attack : this.release);
      out[i] = x[i]! * this.gain;
    }
  }

  private setGate(gateDb: number): void {
    this.open = amplitudeOf(gateDb + GATE.peakOverRms);
    this.close = this.open * amplitudeOf(-GATE.hysteresis);
  }

  private sendRecording(): void {
    const rec = this.recording;
    if (!rec) return;
    this.recording = null;
    const samples = rec.buffer.slice(0, rec.at);
    const recorded: Recorded = {
      kind: 'recorded',
      samples,
      rate: scope.sampleRate,
      heard: rec.heard,
    };
    this.port.postMessage(recorded, [samples.buffer]);
  }

  private record(x: number): void {
    const c = this.capture;
    if (!c) return;
    c.buffer[c.at++] = x;
    if (c.at < c.buffer.length) return;
    this.capture = null;
    this.port.postMessage({ kind: 'captured', samples: c.buffer, rate: this.listener.rate }, [
      c.buffer.buffer,
    ]);
  }
}

scope.registerProcessor('chordlight-guitar', GuitarProcessor);
