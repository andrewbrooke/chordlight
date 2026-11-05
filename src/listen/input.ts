// Opens the guitar's audio input and wires it: the device's channels into the worklet, which picks
// the guitar's, gates it into the amp and listens to it. The browser's voice processing (echo
// cancelling, noise suppression, automatic gain) is turned off: each treats a guitar as noise to
// clean up, and echo cancelling adds delay of its own.

import type { Captured, FromWorklet, Setup, ToWorklet } from './messages.js';

export type OpenFailure = 'unsupported' | 'denied' | 'missing' | 'busy' | 'failed';

export class OpenError extends Error {
  constructor(readonly failure: OpenFailure) {
    super(failure);
  }
}

export interface InputDevice {
  id: string;
  label: string;
}

/** Audio inputs, labelled once the page has been allowed to listen. */
export async function listInputs(): Promise<InputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
}

const modules = new WeakMap<BaseAudioContext, Promise<void>>();

function loadWorklet(ctx: AudioContext): Promise<void> {
  let p = modules.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
    modules.set(ctx, p);
  }
  return p;
}

export class GuitarInput {
  onMessage: (m: FromWorklet) => void = () => {};
  private captured: ((c: Captured) => void) | null = null;

  private constructor(
    private readonly stream: MediaStream,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly node: AudioWorkletNode,
    readonly device: InputDevice,
    /** Seconds between sound reaching the interface and the audio clock, as the browser reports. */
    readonly latency: number,
  ) {
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      const m = e.data;
      if (m.kind === 'captured') {
        this.captured?.(m);
        this.captured = null;
      } else this.onMessage(m);
    };
  }

  /** `deviceId` null opens the browser's default input. */
  static async open(
    ctx: AudioContext,
    into: AudioNode,
    deviceId: string | null,
    setup: Setup,
  ): Promise<GuitarInput> {
    if (!navigator.mediaDevices?.getUserMedia || !ctx.audioWorklet) {
      throw new OpenError('unsupported');
    }
    // `latency` is in the spec and Chrome, but not in TypeScript's DOM types yet.
    const audio: MediaTrackConstraints & { latency?: ConstrainDouble } = {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      latency: { ideal: 0 },
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e) {
      throw new OpenError(failureOf(e));
    }
    try {
      await loadWorklet(ctx);
      const track = stream.getAudioTracks()[0];
      const settings = (track?.getSettings() ?? {}) as MediaTrackSettings & { latency?: number };
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'chordlight-guitar', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
        processorOptions: setup,
      });
      source.connect(node).connect(into);
      const device = { id: settings.deviceId ?? deviceId ?? '', label: track?.label ?? '' };
      return new GuitarInput(stream, source, node, device, settings.latency ?? 0);
    } catch {
      for (const t of stream.getTracks()) t.stop();
      throw new OpenError('failed');
    }
  }

  /** The guitar's ended if the device is unplugged or the browser revokes access. */
  onEnded(fn: () => void): void {
    for (const t of this.stream.getTracks()) t.addEventListener('ended', fn);
  }

  configure(setup: Setup): void {
    this.post({ kind: 'setup', ...setup });
  }

  /** Detector-rate samples of whatever the guitar plays next, for `seconds`. */
  capture(seconds: number): Promise<Captured> {
    return new Promise((resolve) => {
      this.captured = resolve;
      this.post({ kind: 'capture', seconds });
    });
  }

  /** Starts recording the guitar channel; it arrives through onMessage when stopped or full. */
  record(seconds: number): void {
    this.post({ kind: 'record', seconds });
  }

  stopRecording(): void {
    this.post({ kind: 'record', seconds: 0 });
  }

  close(): void {
    this.node.port.onmessage = null;
    this.source.disconnect();
    this.node.disconnect();
    for (const t of this.stream.getTracks()) t.stop();
  }

  private post(m: ToWorklet): void {
    this.node.port.postMessage(m);
  }
}

function failureOf(e: unknown): OpenFailure {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}
