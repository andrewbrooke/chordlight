// MIDI message parsing.

import { buttonOf, readMessage, sameBinding } from 'chordlight/input/midi.js';
import { check, done, same } from './kit/check.mjs';

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

// Board buttons.
same(
  buttonOf([0xb0, 117, 127]),
  { binding: { kind: 'cc', channel: 0, number: 117 }, down: true },
  'a CC button pressed',
);
same(buttonOf([0xbf, 117, 0])?.down, false, 'a CC button let go, channel 16');
same(
  buttonOf([0x99, 94, 100]),
  { binding: { kind: 'note', channel: 9, number: 94 }, down: true },
  'a button sending a note',
);
same(buttonOf([0x90, 94, 0])?.down, false, 'its release as a velocity-0 note-on');
same(buttonOf([0x80, 94, 0])?.down, false, 'its release as a note-off');
same(buttonOf([0xb0, 64, 127]), null, 'the pedal is never a button');
same(buttonOf([0xb0, 123, 0]), null, 'nor is all-notes-off');
same(buttonOf([0xf0, 0x7f, 0x7f, 0x06, 0x02, 0xf7]), null, 'system messages are not');
const play = { kind: 'cc', channel: 0, number: 115 };
check(sameBinding(play, { ...play }), 'a binding matches itself');
check(!sameBinding(play, { ...play, channel: 1 }), 'but not on another channel');
check(!sameBinding(play, { ...play, kind: 'note' }), 'or as a note');

done('MIDI messages read as a keyboard sends them');
