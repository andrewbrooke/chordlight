// Pitch by YIN (de Cheveigné and Kawahara, 2002): the cumulative mean normalised difference of a
// frame against itself, the first dip under a threshold, then a parabola through the dip. With no
// dip under the threshold the deepest one is reported, with the low clarity it deserves.
//
// YIN's answer is then one candidate among its multiples and fractions: twice it, and a half, a
// third and a quarter of it. The shortest candidate that explains the frame nearly as well as the
// best one wins. Twice catches a low string whose second harmonic outweighs its first, which YIN
// reads an octave up. The fractions catch a note plucked over another still ringing (an open
// string left by a lifted finger): the two together repeat at a period they share, an octave or
// more below the new note. Candidates are compared at their fractional lengths with the delayed
// copy interpolated; at whole-sample lags a period between samples (A3 is 54.5 at 12 kHz) matched
// worse at once than at twice, which once dropped real notes an octave.

import { LISTEN } from '../tuning.js';

export interface Estimate {
  /** In samples, interpolated. */
  period: number;
  /** 1 for a perfectly periodic frame, falling towards 0 for noise. */
  clarity: number;
}

export class Yin {
  private readonly raw: Float64Array;
  private readonly norm: Float64Array;

  /** `window` samples are compared at each lag from `minLag` to `maxLag`. */
  constructor(
    readonly window: number,
    readonly minLag: number,
    readonly maxLag: number,
  ) {
    this.raw = new Float64Array(maxLag + 2);
    this.norm = new Float64Array(maxLag + 2);
  }

  get frameLength(): number {
    return this.window + this.maxLag + 1;
  }

  /** `frame` holds frameLength samples, oldest first. */
  estimate(frame: Float32Array): Estimate {
    const { window, minLag, maxLag, raw, norm } = this;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        const d = frame[j]! - frame[j + tau]!;
        sum += d * d;
      }
      raw[tau] = sum;
    }
    norm[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      running += raw[tau]!;
      norm[tau] = running > 0 ? (raw[tau]! * tau) / running : 1;
    }

    let tau = -1;
    for (let t = minLag; t <= maxLag; t++) {
      if (norm[t]! < LISTEN.yinThreshold) {
        while (t + 1 <= maxLag && norm[t + 1]! < norm[t]!) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      tau = minLag;
      for (let t = minLag + 1; t <= maxLag; t++) if (norm[t]! < norm[tau]!) tau = t;
    }

    const found = tau + this.vertex(tau);
    const scored: { period: number; mismatch: number }[] = [];
    for (const k of [0.5, 1, 2, 3, 4]) {
      const period = this.near(found / k);
      if (period !== null) scored.push({ period, mismatch: this.mismatch(frame, period) });
    }
    if (scored.length === 0) {
      return { period: found, clarity: Math.max(0, Math.min(1, 1 - norm[tau]!)) };
    }
    const best = Math.min(...scored.map((s) => s.mismatch));
    const enough = Math.max(best * LISTEN.periodRatio, LISTEN.periodFloor);
    const pick = scored
      .filter((s) => s.mismatch <= enough)
      .reduce((a, b) => (b.period < a.period ? b : a));
    return { period: pick.period, clarity: Math.max(0, Math.min(1, 1 - pick.mismatch)) };
  }

  /**
   * How unlike itself the frame is `lag` samples on: 0 the same, 1 unrelated. The delayed copy is
   * interpolated by Catmull-Rom; a straight line between samples dulls the top harmonics enough to
   * count against a high note.
   */
  private mismatch(frame: Float32Array, lag: number): number {
    const i = Math.floor(lag);
    const f = lag - i;
    let diff = 0;
    let energy = 0;
    for (let j = 0; j < this.window; j++) {
      const a = frame[j]!;
      const y0 = frame[j + i - 1]!;
      const y1 = frame[j + i]!;
      const y2 = frame[j + i + 1]!;
      const y3 = frame[j + i + 2]!;
      const b =
        y1 +
        0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
      diff += (a - b) * (a - b);
      energy += a * a + b * b;
    }
    return energy > 0 ? diff / energy : 1;
  }

  /** The dip nearest `guess`, interpolated, if it and its neighbours are in range. */
  private near(guess: number): number | null {
    const centre = Math.round(guess);
    const reach = Math.max(1, Math.round(guess * 0.03));
    if (centre - reach < Math.max(2, this.minLag) || centre + reach > this.maxLag - 1) return null;
    let best = centre - reach;
    for (let t = best + 1; t <= centre + reach; t++) if (this.norm[t]! < this.norm[best]!) best = t;
    return best + this.vertex(best);
  }

  /** Offset of the parabola's vertex through the dip at `tau`, within half a sample. */
  private vertex(tau: number): number {
    if (tau <= 1 || tau >= this.maxLag + 1) return 0;
    const a = this.norm[tau - 1]!;
    const b = this.norm[tau]!;
    const c = this.norm[tau + 1]!;
    const denom = a - 2 * b + c;
    if (denom <= 0) return 0;
    return Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  }
}
