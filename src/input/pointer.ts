// Mouse and touch: one note per pointer, dragging glides across keys, hovering reports the key
// under the cursor. Only the primary button plays, since a right-click's context menu can swallow
// the pointerup and leave a note stuck.

import type { Stage } from '../view/stage.js';

export interface PointerActions {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  hover(midi: number | null): void;
}

export function attachPointer(stage: Stage, actions: PointerActions): void {
  const canvas = stage.renderer.domElement;
  const held = new Map<number, number>();

  const end = (e: PointerEvent) => {
    const was = held.get(e.pointerId);
    if (was === undefined) return;
    held.delete(e.pointerId);
    actions.noteOff(was);
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    end(e);
    const midi = stage.pick(e.clientX, e.clientY);
    if (midi === null) return;
    canvas.setPointerCapture(e.pointerId);
    held.set(e.pointerId, midi);
    actions.noteOn(midi);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const midi = stage.pick(e.clientX, e.clientY);
    const was = held.get(e.pointerId);
    if (was === undefined) {
      if (e.pointerType === 'mouse') actions.hover(midi);
      return;
    }
    if (midi === null || midi === was) return;
    actions.noteOff(was);
    held.set(e.pointerId, midi);
    actions.noteOn(midi);
  });

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !held.has(e.pointerId)) actions.hover(null);
  });
}
