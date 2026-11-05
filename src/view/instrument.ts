// What the stage draws: the keyboard or the guitar neck. Both light every note by pitch class and
// show presses, hints and the backing; the neck also takes where on it a note was played.

import type * as THREE from 'three';
import type { Lights } from '../theory/guide.js';
import type { Shape } from './framing.js';
import type { PixelGrid } from './labels.js';

/** `heard` is a note the guitar input picked up, kept apart so it never releases a played one. */
export type PressSource = 'user' | 'clip' | 'heard';

/** What the pointer finds: a note, and on the neck which place plays it. */
export interface Target {
  midi: number;
  where?: number;
}

export interface InstrumentView {
  readonly group: THREE.Group;
  /** Its size, for the stage to frame. */
  readonly shape: Shape;
  /** Meshes the pointer picks, each with a Target in its userData. */
  readonly faces: THREE.Object3D[];
  /** The lowest and highest notes it shows. */
  readonly lo: number;
  readonly hi: number;
  place(length: number, grid: PixelGrid): void;
  /** Hides what the stage would cut in two at the edges of the section it shows, in cm across. */
  clip(from: number, to: number): void;
  /** Where a section that shows the notes from `lowest` up starts, in cm across. */
  sectionFrom(lowest: number): number;
  /** The instrument in miniature, `x` taking cm across to pixels, `h` pixels tall. */
  sketch(ctx: CanvasRenderingContext2D, x: (cm: number) => number, h: number): void;
  setLights(lights: Lights, songHome: number): void;
  setLabels(text: (midi: number) => [string, string]): void;
  /** null clears the marks. */
  setNext(has: readonly boolean[] | null): void;
  press(midi: number, source: PressSource, down: boolean, where?: number): void;
  ghost(midi: number, delta: number): void;
  flash(midi: number): void;
  update(dt: number): void;
  dispose(): void;
}
