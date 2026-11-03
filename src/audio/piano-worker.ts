// Renders piano buffers off the main thread, posting each one as soon as it is done.

import { renderNote } from './piano-model.js';

interface Job {
  sampleRate: number;
  notes: { root: number; layer: number }[];
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Job>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { sampleRate, notes } = e.data;
  for (const { root, layer } of notes) {
    const data = renderNote(root, layer, sampleRate);
    scope.postMessage({ root, layer, data }, [data.buffer]);
  }
};
