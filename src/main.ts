import { App } from './app.js';
import { attachMidi } from './input/midi.js';
import { bindClips } from './ui/clips.js';
import { bindControls } from './ui/controls.js';
import { $ } from './ui/dom.js';
import { bindLane } from './ui/lane.js';
import { bindPalette } from './ui/palette.js';
import { bindWhy } from './ui/why.js';

const app = new App($('#stage'));
bindControls(app);
bindLane(app);
bindPalette(app);
bindWhy(app);
bindClips(app);

// Audio and MIDI can only start from a user gesture, hence the start overlay.
const start = $('#start');
const begin = () => {
  app.startAudio();
  start.remove();
  window.removeEventListener('keydown', begin);
  void attachMidi(
    {
      noteOn: (m, v) => app.noteOn(m, v),
      noteOff: (m) => app.noteOff(m),
      pedal: (down) => app.pedal(down),
      status: (text) => {
        app.midi = text;
        app.emit('audio');
      },
    },
    () => app.s.pedalReversed,
  );
};
$('#start-button').addEventListener('click', begin);
window.addEventListener('keydown', begin);
