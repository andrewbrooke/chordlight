import type { App } from '../app.js';
import { ClipShelf } from '../clips/shelf.js';
import { $, el, onToggle } from './dom.js';

export function bindClips(app: App): void {
  const shelf = new ClipShelf(app);
  const button = $<HTMLButtonElement>('#clip');
  const open = $<HTMLButtonElement>('#clips-open');
  const list = $('#clip-list');
  const note = $('#clips-note');
  let armed: string | null = null;

  const take = () => {
    app.startAudio();
    const clip = shelf.take();
    button.classList.add('flash');
    button.textContent = clip ? '✓ Clipped' : 'Nothing to clip';
    setTimeout(() => {
      button.classList.remove('flash');
      button.textContent = '⏺ Clip';
    }, 1100);
  };
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
    backing.checked = app.s.clipBacking;
    note.textContent = !shelf.kept
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
          del,
        ]);
      }),
    );
  };
  shelf.onChange = render;
  app.on('settings', render);
  render();
}
