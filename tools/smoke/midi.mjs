// MIDI message parsing.

import { readMessage } from 'chordlight/input/midi.js';
import { done, same } from './kit/check.mjs';

same(readMessage([0x90, 60, 127]), { kind: 'on', note: 60, velocity: 1 }, 'note-on');
same(readMessage([0x9a, 62, 0]), { kind: 'off', note: 62 }, 'note-on at velocity 0, channel 11');
same(readMessage([0x83, 64, 40]), { kind: 'off', note: 64 }, 'note-off, channel 4');
same(readMessage([0xb0, 64, 127]), { kind: 'pedal', down: true }, 'pedal down');
same(readMessage([0xb0, 64, 0]), { kind: 'pedal', down: false }, 'pedal up');
same(readMessage([0xb2, 123, 0]), { kind: 'all-off' }, 'all notes off');
same(readMessage([0xb0, 1, 90]), { kind: 'other' }, 'the mod wheel');
same(readMessage([0xf8]), { kind: 'other' }, 'clock');
same(readMessage([0xfe]), { kind: 'other' }, 'active sensing');
same(readMessage([0xe0, 0, 64]), { kind: 'other' }, 'pitch bend');

done('MIDI messages read as a keyboard sends them');
