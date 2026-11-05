import { App } from './app.js';
import { attachMidi } from './input/midi.js';
import { PLAY } from './tuning.js';
import { bindClips } from './ui/clips.js';
import { bindControls } from './ui/controls.js';
import { $ } from './ui/dom.js';
import { bindGuitar } from './ui/guitar.js';
import { bindLane } from './ui/lane.js';
import { bindPalette } from './ui/palette.js';
import { GuitarSetup } from './ui/setup.js';
import { bindTour, markTourSeen, startTour, tourSeen } from './ui/tour.js';
import { bindWhy } from './ui/why.js';

const app = new App($('#stage'));
bindControls(app);
bindLane(app);
bindPalette(app);
bindWhy(app);
bindClips(app);
bindGuitar(app, new GuitarSetup(app));
bindTour(app);

// A first visit gets the start card, which offers the tour; any key takes it too, except Esc.
// After that the page opens straight to the piano. Audio is made at once so the piano tunes in
// the background, but the browser holds it suspended until the first click or key press.
const firstVisit = !tourSeen();
const listenToMidi = () =>
  void attachMidi(
    {
      noteOn: (m, v) => app.noteOn(m, app.s.midiFull ? PLAY.midiFull : v),
      noteOff: (m) => app.noteOff(m),
      pedal: (down) => app.pedal(down),
      button: (binding, down) => app.midiButton(binding, down),
      status: (text) => {
        app.midi = text;
        app.emit('audio');
      },
    },
    () => app.s.pedalReversed,
  );

if (firstVisit) {
  const start = $('#start');
  start.hidden = false;
  $('#start-button').textContent = 'Start, with a quick tour';
  $('#start-plain').hidden = false;
  const begin = (tour: boolean) => {
    app.startAudio();
    start.remove();
    window.removeEventListener('keydown', onKey);
    if (tour) startTour(app);
    else markTourSeen();
    listenToMidi();
  };
  const onKey = (e: KeyboardEvent) => begin(e.key !== 'Escape');
  $('#start-button').addEventListener('click', () => begin(true));
  $('#start-plain').addEventListener('click', () => begin(false));
  window.addEventListener('keydown', onKey);
} else {
  $('#start').remove();
  app.startAudio();
  listenToMidi();
  const wake = () => {
    app.startAudio();
    window.removeEventListener('pointerdown', wake, true);
    window.removeEventListener('keydown', wake, true);
  };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);
}
