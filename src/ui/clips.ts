import type { App } from '../app.js';
import { type Clip, clipFromJson, clipToJson } from '../clips/file.js';
import { clipToMidi } from '../clips/midifile.js';
import { ClipShelf, newId } from '../clips/shelf.js';
import type { Binding } from '../input/midi.js';
import type { MidiButton } from '../settings.js';
import { CLIPS } from '../tuning.js';
import { $, download, el, onToggle } from './dom.js';

const BOARD: [MidiButton, string, string][] = [
  ['record', 'Record', 'starts or stops a recording'],
  ['clip', 'Clip', 'keeps the last seconds of playing'],
  ['play', 'Play', 'plays the progression from the top, or stops it'],
  ['pause', 'Pause', 'pauses or resumes the progression where it is'],
];

export function bindClips(app: App): void {
  const shelf = new ClipShelf(app);
  const button = $<HTMLButtonElement>('#clip');
  const open = $<HTMLButtonElement>('#clips-open');
  const list = $('#clip-list');
  const note = $('#clips-note');
  let armed: string | null = null;
  let problem = '';

  const picker = $<HTMLInputElement>('#clip-import-file');
  $('#clip-import').addEventListener('click', (e) => {
    picker.click();
    (e.currentTarget as HTMLElement).blur();
  });
  picker.addEventListener('change', async () => {
    const refused: string[] = [];
    for (const file of [...(picker.files ?? [])].reverse()) {
      const clip = clipFromJson(await file.text(), newId());
      if (clip) shelf.add(clip);
      else refused.push(file.name);
    }
    picker.value = '';
    problem = refused.length > 0 ? `Not a Chordlight clip: ${refused.join(', ')}.` : '';
    render();
  });

  const rec = $<HTMLButtonElement>('#record');
  const board = $('#board-buttons');
  const flashing = new Set<HTMLButtonElement>();
  const flash = (b: HTMLButtonElement, text: string, after: () => void) => {
    flashing.add(b);
    b.classList.add('flash');
    b.textContent = text;
    setTimeout(() => {
      flashing.delete(b);
      b.classList.remove('flash');
      after();
    }, 1100);
  };

  const take = () => {
    app.startAudio();
    const clip = shelf.take();
    flash(button, clip ? '✓ Clipped' : 'Nothing to clip', () => (button.textContent = 'Clip'));
  };

  const recLabel = () => {
    if (flashing.has(rec)) return;
    const start = shelf.recording;
    rec.classList.toggle('recording', start !== null);
    const s = start === null ? 0 : Math.floor((app.audio?.engine.now ?? start) - start);
    const text =
      start === null
        ? '● Record'
        : `■ Stop ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    // Runs every frame while recording; only touch the DOM when the second changes.
    if (rec.textContent !== text) rec.textContent = text;
  };
  const finish = () => {
    const clip = shelf.stopRecording();
    rec.classList.remove('recording');
    flash(rec, clip ? '✓ Recorded' : 'Nothing recorded', recLabel);
  };
  const toggleRecord = () => (shelf.recording === null ? shelf.record() : finish());
  rec.addEventListener('click', () => {
    toggleRecord();
    rec.blur();
  });
  app.on('record', toggleRecord);
  app.on('frame', () => {
    const start = shelf.recording;
    if (start === null) return;
    if ((app.audio?.engine.now ?? start) - start >= CLIPS.longest) finish();
    else recLabel();
  });
  button.addEventListener('click', () => {
    take();
    button.blur();
  });
  app.on('clip', take);

  const backing = $<HTMLInputElement>('#clip-backing');
  onToggle(backing, (on) => {
    app.set({ clipBacking: on });
    if (shelf.playing === null) return;
    // Turning it off mid-clip just drops the backing; turning it on restarts the clip with it.
    if (on) shelf.play(shelf.playing);
    else shelf.dropBacking();
  });

  const render = () => {
    open.textContent = `Clips (${shelf.clips.length})`;
    recLabel();
    board.replaceChildren(...BOARD.map(([action, name, does]) => boardRow(action, name, does)));
    backing.checked = app.s.clipBacking;
    note.textContent = problem
      ? problem
      : !shelf.kept
        ? 'The browser refused to save the last clip, so these will be lost on reload.'
        : shelf.clips.length === 0
          ? `Play something, then press Clip or Enter to keep the last ${app.s.clipSeconds} seconds.`
          : '';
    list.replaceChildren(
      ...shelf.clips.map((clip, i) => {
        const playing = shelf.playing === clip.id;
        const play = el('button', { text: playing ? '■' : '▶', title: playing ? 'Stop' : 'Play' });
        play.addEventListener('click', () => {
          if (playing) shelf.stop();
          else shelf.play(clip.id);
          play.blur();
        });
        const del = el('button', { text: armed === clip.id ? 'Really?' : 'Delete' });
        del.addEventListener('click', () => {
          if (armed !== clip.id) {
            armed = clip.id;
            render();
            return;
          }
          armed = null;
          shelf.remove(clip.id);
        });
        const json = el('button', { text: 'JSON', title: 'Save as a Chordlight clip file' });
        json.addEventListener('click', () => {
          download(`${fileName(clip)}.json`, 'application/json', clipToJson(clip));
          json.blur();
        });
        const midi = el('button', { text: 'MIDI', title: 'Save as a MIDI file' });
        midi.addEventListener('click', () => {
          download(`${fileName(clip)}.mid`, 'audio/midi', clipToMidi(clip));
          midi.blur();
        });
        const when = new Date(clip.created).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const notes = clip.events.filter((e) => e.on).length;
        const details = [when, `${clip.duration.toFixed(1)} s`, `${notes} notes`];
        if (clip.backing) details.push('with backing');
        return el('li', {}, [
          play,
          el('span', { className: 'what' }, [
            `Clip ${shelf.clips.length - i} · ${clip.where}`,
            el('small', { text: details.join(' · ') }),
          ]),
          json,
          midi,
          del,
        ]);
      }),
    );
  };
  const boardRow = (action: MidiButton, name: string, does: string) => {
    const bound = app.s.midiButtons[action];
    const learning = app.learning === action;
    const learn = el('button', {
      text: learning ? 'Press it on the board…' : bound ? 'Relearn' : 'Learn',
      title: learning ? 'Click again to cancel' : '',
    });
    learn.addEventListener('click', () => {
      app.learn(learning ? null : action);
      learn.blur();
    });
    const clear = el('button', { text: 'Clear' });
    clear.hidden = !bound;
    clear.addEventListener('click', () => {
      const { [action]: _, ...rest } = app.s.midiButtons;
      app.set({ midiButtons: rest });
    });
    return el('div', { className: 'board-button' }, [
      el('span', { className: 'what' }, [
        `${name}: ${does}`,
        el('small', { text: bound ? describe(bound) : 'not set' }),
      ]),
      learn,
      clear,
    ]);
  };

  shelf.onChange = () => {
    problem = '';
    render();
  };
  app.on('settings', render);
  render();
}

/** `chordlight-creep-in-c-major-2026-11-04-1530` */
function fileName(clip: Clip): string {
  const d = new Date(clip.created);
  const two = (n: number) => String(n).padStart(2, '0');
  const when = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  const where = clip.where
    .toLowerCase()
    .replace(/♯/g, 's')
    .replace(/♭/g, 'b')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `chordlight-${where}-${when}`;
}

function describe(b: Binding): string {
  return `${b.kind === 'cc' ? 'CC' : 'note'} ${b.number}, channel ${b.channel + 1}`;
}
