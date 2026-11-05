// The instrument switch and the guitar panel: listening on and off, which input, a meter with the
// note being heard, the amp, and the tuning. Guitar mode is marked experimental wherever it shows.

import type { App } from '../app.js';
import { AMP_SOUNDS, type AmpKnobs, type AmpSound, FLAT } from '../audio/amp-model.js';
import { listInputs, type OpenFailure } from '../listen/input.js';
import { GuitarLink } from '../listen/link.js';
import { STRING_RANGE, stringLabel, stringName, TUNINGS, tuningOf } from '../presets/tunings.js';
import type { Instrument } from '../settings.js';
import { LISTEN } from '../tuning.js';
import { $, download, el, onPick, onToggle, options } from './dom.js';
import type { GuitarSetup } from './setup.js';

export function failureText(f: OpenFailure | null): string {
  switch (f) {
    case 'unsupported':
      return "This browser can't listen to an audio input. Chrome, Edge or Firefox on a computer can.";
    case 'denied':
      return "Chordlight wasn't allowed to listen. Click the lock or microphone icon beside the address, allow the microphone, then try again.";
    case 'missing':
      return 'No audio input was found. Check the interface is plugged in (and switched on, if it has a switch), then try again.';
    case 'busy':
      return 'Another program is using the input. Close any recording software that might have it, then try again.';
    default:
      return "The input couldn't be opened. Unplug the interface, plug it back in, then try again.";
  }
}

const SOUND_NAMES: Record<AmpSound, string> = {
  clean: 'Clean: bright and open',
  crunch: 'Crunch: an amp just breaking up',
  punk: 'Punk: tight, saturated, mids forward',
  fuzz: 'Fuzz: thick, scooped, endless sustain',
};

const KNOBS: (keyof AmpKnobs)[] = ['drive', 'bass', 'mid', 'treble'];

export function bindGuitar(app: App, setup: GuitarSetup): void {
  const link = app.guitar;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#instrument button')) {
    b.addEventListener('click', () => {
      app.set({ instrument: b.dataset['instrument'] as Instrument });
      b.blur();
    });
  }

  const panel = $('#guitar');
  const opener = $<HTMLButtonElement>('#guitar-open');
  opener.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    opener.blur();
  });
  $('#guitar-close').addEventListener('click', () => (panel.hidden = true));

  const listen = $<HTMLButtonElement>('#guitar-listen');
  listen.addEventListener('click', async () => {
    listen.blur();
    if (!GuitarLink.everSetUp()) return setup.start('connect');
    app.set({ guitarOn: true });
    if ((await link.open(app.s.guitarDevice || null)) && !link.calibrated) setup.start('find');
  });
  const stop = $<HTMLButtonElement>('#guitar-stop');
  stop.addEventListener('click', () => {
    app.set({ guitarOn: false });
    link.close();
    stop.blur();
  });
  $('#guitar-setup-open').addEventListener('click', (e) => {
    (e.currentTarget as HTMLElement).blur();
    setup.start(link.state === 'on' ? 'find' : 'connect');
  });

  const device = $<HTMLSelectElement>('#guitar-device');
  onPick(device, (id) => {
    app.set({ guitarDevice: id });
    void link.open(id);
  });

  const fill = $('#guitar-meter i');
  const heard = $('#guitar-heard');
  link.onMeter.add((m) => {
    fill.style.width = `${Math.max(0, Math.min(100, ((m.peaks[link.calibration.channel] ?? -120) + 60) / 0.6))}%`;
    const clear =
      m.pitch !== null && m.clarity >= LISTEN.clarity && m.level > link.calibration.gateDb;
    heard.textContent = clear
      ? describe(m.pitch!)
      : m.note !== null
        ? stringName(m.note, true)
        : '';
  });

  const record = $<HTMLButtonElement>('#guitar-record');
  record.addEventListener('click', () => {
    record.blur();
    if (link.recordingSince === null) link.record();
    else link.stopRecording();
  });
  link.onRecorded = (wav) => download(`${recordingName()}.wav`, 'audio/wav', wav);
  const recordLabel = () => {
    const since = link.recordingSince;
    const s = since === null ? 0 : Math.floor((performance.now() - since) / 1000);
    const text =
      since === null
        ? '● Record input'
        : `■ Stop and save ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    // Runs every frame while recording; only touch the DOM when the second changes.
    if (record.textContent !== text) record.textContent = text;
    record.classList.toggle('recording', since !== null);
  };
  app.on('frame', () => {
    if (link.recordingSince !== null) recordLabel();
  });

  onToggle($('#amp-monitor'), (on) => app.set({ amp: { ...app.s.amp, monitor: on } }));
  const sound = $<HTMLSelectElement>('#amp-sound');
  options(
    sound,
    AMP_SOUNDS.map((k) => [k, SOUND_NAMES[k]]),
  );
  // A new sound starts as voiced: knobs set for one sound would mean something else on another.
  onPick(sound, (v) => app.set({ amp: { ...app.s.amp, sound: v as AmpSound, ...FLAT } }));
  $('#amp-reset').addEventListener('click', (e) => {
    app.set({ amp: { ...app.s.amp, ...FLAT } });
    (e.currentTarget as HTMLElement).blur();
  });
  for (const key of KNOBS) {
    const input = $<HTMLInputElement>(`#amp-${key}`);
    input.addEventListener('input', () => {
      app.set({ amp: { ...app.s.amp, [key]: Number(input.value) } });
    });
    input.addEventListener('change', () => input.blur());
  }
  const volume = $<HTMLInputElement>('#level-guitar');
  volume.addEventListener('input', () => {
    app.set({ levels: { ...app.s.levels, guitar: Number(volume.value) } });
  });
  volume.addEventListener('change', () => volume.blur());

  const preset = $<HTMLSelectElement>('#tuning-preset');
  onPick(preset, (id) => {
    const t = TUNINGS.find((x) => x.id === id);
    if (t) app.set({ tuning: [...t.notes] });
  });
  const strings = $('#tuning-strings');
  const notes: [string, string][] = [];
  for (let n = STRING_RANGE[0]; n <= STRING_RANGE[1]; n++)
    notes.push([String(n), stringName(n, true)]);
  const selects = app.s.tuning.map((_, i) => {
    const s = el('select');
    options(s, notes);
    onPick(s, (v) => {
      const tuning = [...app.s.tuning];
      tuning[i] = Number(v);
      app.set({ tuning });
    });
    strings.append(el('label', {}, [stringLabel(i), s]));
    return s;
  });

  let listed = '';
  const refresh = () => {
    const s = app.s;
    const guitar = s.instrument === 'guitar';
    document.body.classList.toggle('instrument-guitar', guitar);
    document.body.classList.toggle('instrument-piano', !guitar);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#instrument button')) {
      b.classList.toggle('on', b.dataset['instrument'] === s.instrument);
    }
    if (!guitar) panel.hidden = true;

    const state = link.state;
    opener.classList.toggle('listening', state === 'on');
    $('#guitar-status').textContent = status(app);
    listen.hidden = state === 'on';
    listen.disabled = state === 'opening';
    listen.textContent = state === 'failed' ? 'Try again' : 'Plug in my guitar';
    stop.hidden = state !== 'on';
    $('#guitar-device-row').hidden = state !== 'on';
    $('#guitar-meter-row').hidden = state !== 'on';
    $('#guitar-record-row').hidden = state !== 'on';
    recordLabel();
    if (state === 'on' && listed !== link.device?.id) {
      listed = link.device?.id ?? '';
      void listInputs().then((inputs) => {
        options(
          device,
          inputs.map((i) => [i.id, i.label]),
        );
        device.value = link.device?.id ?? '';
      });
    }
    if (state !== 'on') listed = '';

    $<HTMLInputElement>('#amp-monitor').checked = s.amp.monitor;
    sound.value = s.amp.sound;
    for (const key of KNOBS) $<HTMLInputElement>(`#amp-${key}`).value = String(s.amp[key]);
    volume.value = String(s.levels.guitar);

    const named = tuningOf(s.tuning);
    options(preset, [
      ...TUNINGS.map((t): [string, string] => [t.id, t.name]),
      ...(named ? [] : [['custom', 'Your own'] as [string, string]]),
    ]);
    preset.value = named?.id ?? 'custom';
    selects.forEach((sel, i) => (sel.value = String(s.tuning[i])));
  };
  app.on('settings', refresh);
  app.on('guitar', refresh);
  refresh();
}

function status(app: App): string {
  const link = app.guitar;
  switch (link.state) {
    case 'opening':
      return 'Opening the input…';
    case 'failed':
      return failureText(link.failure);
    case 'on': {
      const where = `Listening to ${link.device?.label || 'your input'}, input ${link.calibration.channel + 1}.`;
      return link.calibrated ? where : `${where} It hasn't been set up yet: press Set up.`;
    }
    default:
      return 'Not listening. Plug your guitar into your audio interface, then press Plug in my guitar.';
  }
}

/** `chordlight-guitar-2026-11-04-195830` */
function recordingName(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  return `chordlight-guitar-${day}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

/** `A2, 12 cents flat` */
function describe(pitch: number): string {
  const midi = Math.round(pitch);
  const cents = Math.round((pitch - midi) * 100);
  const off =
    Math.abs(cents) <= 5 ? 'in tune' : `${Math.abs(cents)} cents ${cents < 0 ? 'flat' : 'sharp'}`;
  return `${stringName(midi, true)}, ${off}`;
}
