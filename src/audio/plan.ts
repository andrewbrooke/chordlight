// What the backing band plays on each eighth note, worked out without playing it: the live backing
// and a clip's replay sound these, and a clip's MIDI export writes them down. Voicings are worked
// out once per progression, each moving as little as possible from the last.

import type { Style } from '../presets/library.js';
import type { Step } from '../theory/roman.js';
import { BACKING } from '../tuning.js';
import type { Position } from './timeline.js';
import { bassNote, powerChord, voice } from './voicing.js';

export type Sound = 'pad' | 'piano' | 'drive' | 'bass';

export interface Planned {
  sound: Sound;
  notes: number[];
  start: number;
  end: number;
  velocity: number;
}

export class BackingPlan {
  style: Style = 'pad';
  bassOn = true;
  private steps: Step[] = [];
  private voicings: number[][] = [];

  setSteps(steps: readonly Step[]): void {
    this.steps = [...steps];
    this.voicings = [];
    let prev: number[] | null = null;
    for (const s of steps) {
      prev = voice(s.chord, prev, BACKING.chordLo, BACKING.chordHi);
      this.voicings.push(prev);
    }
  }

  /** `eighth` counts from the loop's start. */
  at(eighth: number, pos: Position, time: number, spb: number): Planned[] {
    const step = this.steps[pos.step];
    const chord = this.voicings[pos.step];
    if (!step || !chord) return [];
    const out: Planned[] = [];
    const add = (sound: Sound, notes: number[], length: number, velocity = BACKING.heldVelocity) =>
      out.push({ sound, notes, start: time, end: time + length, velocity });
    const onBeat = eighth % 2 === 0;
    const startsStep = onBeat && pos.beatInStep < 0.01;
    const half = onBeat && Math.round(pos.beatInStep) % 2 === 0;
    const beatsLeft = pos.beatsLeft;

    switch (this.style) {
      case 'pad':
        if (startsStep) add('pad', chord, beatsLeft * spb);
        break;
      case 'piano':
        if (half) {
          const vel = BACKING.pianoVelocity * (startsStep ? 1 : 0.8);
          add('piano', chord, Math.min(2, beatsLeft) * spb * 0.92, vel);
        }
        break;
      case 'arp': {
        const tones = [...chord, chord[0]! + 12];
        const path = [...tones, ...tones.slice(1, -1).reverse()];
        const i = Math.round(pos.beatInStep * 2) % path.length;
        add('piano', [path[i]!], spb * 0.75, BACKING.arpVelocity);
        break;
      }
      case 'drive':
        add('drive', powerChord(step.chord, BACKING.driveLo), spb * 0.45);
        break;
    }

    if (this.bassOn && (this.style === 'drive' || half)) {
      const length = this.style === 'drive' ? spb * 0.4 : Math.min(2, beatsLeft) * spb * 0.9;
      add('bass', [bassNote(step.chord, BACKING.bassLo)], length);
    }
    return out;
  }

  /** Starting partway through a chord: a pad gets its remaining beats; other styles pick up on the beat. */
  join(pos: Position, time: number, spb: number): Planned[] {
    const chord = this.voicings[pos.step];
    if (this.style !== 'pad' || !chord || pos.beatInStep < 0.01) return [];
    const end = time + pos.beatsLeft * spb;
    return [{ sound: 'pad', notes: chord, start: time, end, velocity: BACKING.heldVelocity }];
  }
}
