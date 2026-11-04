// A clip as sheet music: snapped (score.ts), notated (notate.ts), drawn (engrave.ts), written
// (pdf.ts). Null if the clip has nothing to write.

import { engrave } from './engrave.js';
import type { Clip } from './file.js';
import { notate } from './notate.js';
import { sheetToPdf } from './pdf.js';
import { scoreOf } from './score.js';

export function clipToPdf(clip: Clip): Uint8Array<ArrayBuffer> | null {
  const score = scoreOf(clip);
  return score ? sheetToPdf(engrave(score, notate(score))) : null;
}
