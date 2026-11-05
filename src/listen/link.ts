// The guitar input as the app holds it: whether it is open, the setup it runs with, and passing
// what it hears on as notes. A setup is kept per input device, since another interface (or another
// lead, or another room) wants its own channel, gate and timing.
//
// Heard notes are dated back by the setup's offset: the time from the backing booking a beat to a
// pluck played along to it reaching the audio clock. That is what lines a guitar clip up with its
// backing. Until the setup has measured it, the browser's own latency figures stand in.

import { GUITAR, LISTEN } from '../tuning.js';
import { load, save } from '../ui/storage.js';
import { GuitarInput, type InputDevice, OpenError, type OpenFailure } from './input.js';
import type { ListenConfig } from './listener.js';
import type { Captured, Meter, Recorded, Setup } from './messages.js';
import { RECORDING_FORMAT, type RecordingNote, recordingToWav } from './recording.js';

export interface Calibration {
  channel: number;
  /** The detector's gate, after the hum filters, and the amp's, before them. */
  gateDb: number;
  ampGateDb: number;
  loudDb: number;
  hum: number[];
  /** Seconds to date heard notes back by; null until the setup measures it. */
  offset: number | null;
}

export const FRESH: Calibration = {
  channel: 0,
  gateDb: LISTEN.gateDb,
  ampGateDb: LISTEN.gateDb,
  loudDb: LISTEN.loudDb,
  hum: [],
  offset: null,
};

export type LinkState = 'off' | 'opening' | 'on' | 'failed';

export interface LinkHost {
  /** Starts audio if need be; the amp's input for the live guitar. */
  audio(): { ctx: AudioContext; into: AudioNode };
  tuning(): readonly number[];
  hear(midi: number, velocity: number, t: number): void;
  unhear(midi: number, t: number): void;
}

type Saved = Record<string, Calibration>;

export class GuitarLink {
  state: LinkState = 'off';
  failure: OpenFailure | null = null;
  calibration: Calibration = FRESH;
  /** Whether this device has been through the setup. */
  calibrated = false;
  meter: Meter | null = null;
  onChange: () => void = () => {};
  readonly onMeter = new Set<(m: Meter) => void>();
  readonly onHit = new Set<(t: number, level: number) => void>();
  /** A finished recording of the input, as a WAV file's bytes. */
  onRecorded: (wav: Uint8Array<ArrayBuffer>, seconds: number) => void = () => {};
  /** When the current recording started, by the page's clock; null when not recording. */
  recordingSince: number | null = null;
  private input: GuitarInput | null = null;
  private fallbackOffset = 0;

  constructor(private readonly host: LinkHost) {}

  get device(): InputDevice | null {
    return this.input?.device ?? null;
  }

  /** Seconds heard notes are dated back by. */
  get offset(): number {
    return this.calibration.offset ?? this.fallbackOffset;
  }

  /** True if it opened. A saved device that has gone falls back to the default input. */
  async open(deviceId: string | null): Promise<boolean> {
    this.close();
    this.state = 'opening';
    this.failure = null;
    this.onChange();
    const { ctx, into } = this.host.audio();
    try {
      this.input = await this.openOn(ctx, into, deviceId);
    } catch (e) {
      this.state = 'failed';
      this.failure = e instanceof OpenError ? e.failure : 'failed';
      this.onChange();
      return false;
    }
    const input = this.input;
    this.fallbackOffset =
      (input.latency || LISTEN.inputLatency) + (ctx.outputLatency || ctx.baseLatency || 0);
    const saved = load<Saved>('guitar-setup', {})[keyOf(input.device)];
    this.calibration = saved ? { ...FRESH, ...saved } : FRESH;
    this.calibrated = saved !== undefined;
    input.onMessage = (m) => {
      if (m.kind === 'meter') {
        this.meter = m;
        for (const fn of this.onMeter) fn(m);
      } else if (m.kind === 'hit') {
        for (const fn of this.onHit) fn(m.t, m.level);
      } else if (m.kind === 'on') {
        this.host.hear(m.midi, m.velocity, m.t - this.offset);
      } else if (m.kind === 'off') {
        this.host.unhear(m.midi, m.t - this.offset);
      } else if (m.kind === 'recorded') {
        this.recordingSince = null;
        this.onRecorded(this.wavOf(m, input.device), m.samples.length / m.rate);
        this.onChange();
      }
    };
    input.onEnded(() => {
      if (this.input !== input) return;
      this.close();
      this.state = 'failed';
      this.failure = 'missing';
      this.onChange();
    });
    this.configure();
    this.state = 'on';
    this.onChange();
    return true;
  }

  close(): void {
    this.input?.close();
    this.input = null;
    this.meter = null;
    this.recordingSince = null;
    if (this.state !== 'off') {
      this.state = 'off';
      this.onChange();
    }
  }

  /** Applies a changed tuning or setup to the open input. */
  configure(): void {
    this.input?.configure(this.setup());
  }

  /** Whether any input has been through the setup, so a first-timer can be walked through it. */
  static everSetUp(): boolean {
    return Object.keys(load<Saved>('guitar-setup', {})).length > 0;
  }

  /** Uses a setup now; `keep` saves it for this device. */
  calibrate(patch: Partial<Calibration>, keep = false): void {
    this.calibration = { ...this.calibration, ...patch };
    this.configure();
    const device = this.input?.device;
    if (keep && device) {
      const saved = load<Saved>('guitar-setup', {});
      save('guitar-setup', { ...saved, [keyOf(device)]: this.calibration });
      this.calibrated = true;
    }
    this.onChange();
  }

  capture(seconds: number): Promise<Captured> | null {
    return this.input?.capture(seconds) ?? null;
  }

  /** Records what the detector gets, until stopped or LISTEN.recordLongest; false if not listening. */
  record(): boolean {
    if (!this.input || this.recordingSince !== null) return false;
    this.input.record(LISTEN.recordLongest);
    this.recordingSince = performance.now();
    this.onChange();
    return true;
  }

  /** Ends the recording; it arrives through onRecorded. */
  stopRecording(): void {
    this.input?.stopRecording();
  }

  private wavOf(m: Recorded, device: InputDevice): Uint8Array<ArrayBuffer> {
    const note: RecordingNote = {
      format: RECORDING_FORMAT,
      version: 1,
      created: Date.now(),
      device: device.label,
      channel: this.calibration.channel,
      tuning: [...this.host.tuning()],
      config: this.setup().config,
      offset: this.offset,
      heard: m.heard,
    };
    return recordingToWav(m.samples, m.rate, note);
  }

  private setup(): Setup {
    const tuning = this.host.tuning();
    const { channel, gateDb, ampGateDb, loudDb, hum } = this.calibration;
    const config: ListenConfig = {
      lo: Math.min(...tuning),
      hi: Math.max(...tuning) + GUITAR.frets,
      gateDb,
      loudDb,
      hum,
    };
    return { config, channel, ampGateDb };
  }

  private async openOn(ctx: AudioContext, into: AudioNode, id: string | null) {
    const setup = this.setup();
    try {
      return await GuitarInput.open(ctx, into, id, setup);
    } catch (e) {
      if (id && e instanceof OpenError && e.failure === 'missing') {
        return GuitarInput.open(ctx, into, null, setup);
      }
      throw e;
    }
  }
}

/** Device ids can change when site data is cleared; the label is what the person recognises. */
const keyOf = (d: InputDevice): string => d.label || d.id;
