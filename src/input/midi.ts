// Web MIDI input: every input and channel, with hot-plugging. Unplugging a device releases its held
// notes. CC64 is sustain; some pedals report inverted polarity, which a setting flips.

export type Message =
  | { kind: 'on'; note: number; velocity: number }
  | { kind: 'off'; note: number }
  | { kind: 'pedal'; down: boolean }
  | { kind: 'all-off' }
  | { kind: 'other' };

export function readMessage(data: ArrayLike<number>): Message {
  const status = data[0] ?? 0;
  const [a = 0, b = 0] = [data[1], data[2]];
  // System messages (clock, active sensing) carry no notes.
  if (status >= 0xf0) return { kind: 'other' };
  switch (status & 0xf0) {
    case 0x90:
      // Many keyboards send note-off as a note-on with velocity 0.
      return b > 0 ? { kind: 'on', note: a, velocity: b / 127 } : { kind: 'off', note: a };
    case 0x80:
      return { kind: 'off', note: a };
    case 0xb0:
      if (a === 64) return { kind: 'pedal', down: b >= 64 };
      if (a === 120 || a === 123) return { kind: 'all-off' };
      return { kind: 'other' };
    default:
      return { kind: 'other' };
  }
}

export interface MidiActions {
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
  pedal(down: boolean): void;
  status(text: string): void;
}

export async function attachMidi(actions: MidiActions, reversed: () => boolean): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    actions.status('');
    return;
  }
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    actions.status('MIDI blocked: allow it in the site settings');
    return;
  }

  const held = new Map<string, Set<number>>();
  const release = (id: string) => {
    for (const note of held.get(id) ?? []) actions.noteOff(note);
    held.delete(id);
  };
  const listen = (input: MIDIInput) => {
    input.onmidimessage = (e) => {
      if (!e.data) return;
      const m = readMessage(e.data);
      const notes = held.get(input.id) ?? new Set<number>();
      held.set(input.id, notes);
      if (m.kind === 'on') {
        notes.add(m.note);
        actions.noteOn(m.note, m.velocity);
      } else if (m.kind === 'off') {
        if (notes.delete(m.note)) actions.noteOff(m.note);
      } else if (m.kind === 'pedal') actions.pedal(m.down !== reversed());
      else if (m.kind === 'all-off') release(input.id);
    };
  };
  const report = () => {
    const names = [...access.inputs.values()]
      .filter((i) => i.state === 'connected')
      .map((i) => i.name ?? 'MIDI keyboard');
    actions.status(names.length > 0 ? `MIDI: ${names.join(', ')}` : '');
  };

  for (const input of access.inputs.values()) listen(input);
  access.onstatechange = (e) => {
    const port = (e as MIDIConnectionEvent).port;
    if (!port || port.type !== 'input') return;
    if (port.state === 'connected') listen(port as MIDIInput);
    else release(port.id);
    report();
  };
  report();
}
