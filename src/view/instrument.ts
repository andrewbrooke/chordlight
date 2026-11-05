// What the stage draws: the keyboard or the guitar neck. Both light every note by pitch class and
// show presses, hints and the backing; the neck also takes where on it a note was played.

import type * as THREE from 'three';
import type { Lights } from '../theory/guide.js';
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
  /** Meshes the pointer picks, each with a Target in its userData. */
  readonly faces: THREE.Object3D[];
  /** Width in cm, and the depth range the stage may stretch it over to fill the height. */
  readonly width: number;
  readonly minLength: number;
  readonly maxLength: number;
  /** The lowest and highest notes it shows. */
  readonly lo: number;
  readonly hi: number;
  place(length: number, grid: PixelGrid): void;
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
