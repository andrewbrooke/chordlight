// Cuts a clip from the note log: the notes that started in the last N seconds, shifted to begin
// just before the first one. Notes still held end at the cut.

export type ClipVoice = 'piano' | 'pad';

export interface NoteEvent {
  /** Audio-clock seconds in the log; seconds from the clip start once extracted. */
  t: number;
  on: boolean;
  midi: number;
  vel: number;
  voice: ClipVoice;
}

const LEAD = 0.1;
const TAIL = 0.6;

export function extractClip(
  log: readonly NoteEvent[],
  now: number,
  seconds: number,
): { events: NoteEvent[]; duration: number; start: number } | null {
  const from = now - seconds;
  const open = new Map<string, NoteEvent>();
  const notes: { on: NoteEvent; off: number }[] = [];
  for (const e of log) {
    const id = `${e.voice}:${e.midi}`;
    if (e.on) {
      const prev = open.get(id);
      if (prev) notes.push({ on: prev, off: e.t });
      if (e.t >= from && e.t <= now) open.set(id, e);
      else open.delete(id);
    } else {
      const start = open.get(id);
      if (start) notes.push({ on: start, off: Math.min(e.t, now) });
      open.delete(id);
    }
  }
  for (const start of open.values()) notes.push({ on: start, off: now });
  if (notes.length === 0) return null;

  const t0 = Math.min(...notes.map((n) => n.on.t)) - LEAD;
  const events: NoteEvent[] = [];
  for (const n of notes) {
    events.push({ ...n.on, t: n.on.t - t0 });
    events.push({ ...n.on, on: false, t: Math.max(n.off, n.on.t + 0.02) - t0 });
  }
  events.sort((a, b) => a.t - b.t || Number(a.on) - Number(b.on));
  const end = Math.max(...events.map((e) => e.t));
  return { events, duration: end + TAIL, start: t0 };
}
