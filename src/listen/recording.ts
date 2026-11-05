// A recording of the guitar input, for replaying through the detector: the guitar channel exactly as
// the Listener got it, as a 16-bit mono WAV, with a JSON note of how it was being heard (the tuning,
// the setup, and the notes heard live) in the file's comment (a LIST/INFO ICMT chunk, which audio
// programs show and otherwise ignore). One file carries both what was played and what was heard.
//
// Pure, for the replay tool (`npm run hear`) and the smokes.

import type { ListenConfig } from './listener.js';
import type { Heard } from './tracker.js';

export const RECORDING_FORMAT = 'chordlight-guitar-input';

export interface RecordingNote {
  format: typeof RECORDING_FORMAT;
  version: 1;
  created: number;
  device: string;
  /** The input channel the guitar was on, from 0. */
  channel: number;
  tuning: number[];
  config: ListenConfig;
  /** Seconds heard notes were dated back by in the page. */
  offset: number;
  /** What the detector heard as it was recorded, timed from the recording's start. */
  heard: Heard[];
}

export interface Recording {
  samples: Float32Array;
  rate: number;
  note: RecordingNote | null;
}

export function recordingToWav(
  samples: Float32Array,
  rate: number,
  note: RecordingNote,
): Uint8Array<ArrayBuffer> {
  return encodeWav(samples, rate, JSON.stringify(note));
}

/** null unless the bytes are a WAV this can read; `note` is null if it isn't one of ours. */
export function recordingFromWav(bytes: Uint8Array): Recording | null {
  const wav = decodeWav(bytes);
  if (!wav) return null;
  let note: RecordingNote | null = null;
  try {
    const parsed = wav.comment ? (JSON.parse(wav.comment) as RecordingNote) : null;
    if (parsed?.format === RECORDING_FORMAT) note = parsed;
  } catch {
    note = null;
  }
  return { samples: wav.samples, rate: wav.rate, note };
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function encodeWav(
  samples: Float32Array,
  rate: number,
  comment = '',
): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder().encode(comment);
  // ICMT holds the text and a terminating zero; every chunk is padded to an even length.
  const icmt = text.length + 1;
  const icmtPadded = icmt + (icmt % 2);
  const list = comment ? 4 + 8 + icmtPadded : 0;
  const data = samples.length * 2;
  const size = 4 + (8 + 16) + (list ? 8 + list : 0) + (8 + data);
  const out = new Uint8Array(8 + size);
  const view = new DataView(out.buffer);
  let at = 0;
  const tag = (s: string) => {
    out.set(ascii(s), at);
    at += 4;
  };
  const u32 = (n: number) => {
    view.setUint32(at, n, true);
    at += 4;
  };
  const u16 = (n: number) => {
    view.setUint16(at, n, true);
    at += 2;
  };
  tag('RIFF');
  u32(size);
  tag('WAVE');
  tag('fmt ');
  u32(16);
  u16(1);
  u16(1);
  u32(rate);
  u32(rate * 2);
  u16(2);
  u16(16);
  if (list) {
    tag('LIST');
    u32(list);
    tag('INFO');
    tag('ICMT');
    u32(icmt);
    out.set(text, at);
    at += icmtPadded;
  }
  tag('data');
  u32(data);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(at, Math.round(v * 32767), true);
    at += 2;
  }
  return out;
}

/** 16-bit PCM or 32-bit float, the first channel; null for anything else. */
export function decodeWav(
  bytes: Uint8Array,
): { samples: Float32Array; rate: number; comment: string | null } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let format = 0;
  let channels = 1;
  let rate = 0;
  let bits = 0;
  let data: { at: number; size: number } | null = null;
  let comment: string | null = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      data = { at: body, size: Math.min(size, bytes.length - body) };
    } else if (id === 'LIST' && tag(body) === 'INFO') {
      for (let sub = body + 4; sub + 8 <= body + size;) {
        const subSize = view.getUint32(sub + 4, true);
        if (tag(sub) === 'ICMT') {
          const raw = bytes.subarray(sub + 8, sub + 8 + subSize);
          const end = raw.indexOf(0);
          comment = new TextDecoder().decode(end >= 0 ? raw.subarray(0, end) : raw);
        }
        sub += 8 + subSize + (subSize % 2);
      }
    }
    at = body + size + (size % 2);
  }
  if (!data || !rate) return null;
  const pcm = format === 1 && bits === 16;
  const float = format === 3 && bits === 32;
  if (!pcm && !float) return null;
  const step = (bits / 8) * channels;
  const samples = new Float32Array(Math.floor(data.size / step));
  for (let i = 0; i < samples.length; i++) {
    const at = data.at + i * step;
    samples[i] = pcm ? Math.max(-1, view.getInt16(at, true) / 32767) : view.getFloat32(at, true);
  }
  return { samples, rate, comment };
}
