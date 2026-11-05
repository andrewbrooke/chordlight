// Biquads from the RBJ cookbook, run a sample at a time in transposed direct form II: the
// detector's anti-alias low-pass, its high-pass and the mains-hum notches, and the offline amp's
// filters. The peaking and shelf forms are the ones Web Audio uses (shelves at slope 1), so the
// offline amp matches the live one.

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  z1: number;
  z2: number;
}

function design(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, z1: 0, z2: 0 };
}

function prewarp(f: number, rate: number, q: number): { cos: number; alpha: number } {
  const w = (2 * Math.PI * f) / rate;
  return { cos: Math.cos(w), alpha: Math.sin(w) / (2 * q) };
}

export function lowpass(f: number, rate: number, q: number): Biquad {
  const { cos, alpha } = prewarp(f, rate, q);
  return design((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
}

export function highpass(f: number, rate: number, q: number): Biquad {
  const { cos, alpha } = prewarp(f, rate, q);
  return design((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
}

export function notch(f: number, rate: number, q: number): Biquad {
  const { cos, alpha } = prewarp(f, rate, q);
  return design(1, -2 * cos, 1, 1 + alpha, -2 * cos, 1 - alpha);
}

export function peaking(f: number, rate: number, q: number, db: number): Biquad {
  const { cos, alpha } = prewarp(f, rate, q);
  const a = Math.pow(10, db / 40);
  return design(1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a);
}

export function lowshelf(f: number, rate: number, db: number): Biquad {
  const { cos, alpha } = prewarp(f, rate, Math.SQRT1_2);
  const a = Math.pow(10, db / 40);
  const k = 2 * Math.sqrt(a) * alpha;
  return design(
    a * (a + 1 - (a - 1) * cos + k),
    2 * a * (a - 1 - (a + 1) * cos),
    a * (a + 1 - (a - 1) * cos - k),
    a + 1 + (a - 1) * cos + k,
    -2 * (a - 1 + (a + 1) * cos),
    a + 1 + (a - 1) * cos - k,
  );
}

export function highshelf(f: number, rate: number, db: number): Biquad {
  const { cos, alpha } = prewarp(f, rate, Math.SQRT1_2);
  const a = Math.pow(10, db / 40);
  const k = 2 * Math.sqrt(a) * alpha;
  return design(
    a * (a + 1 + (a - 1) * cos + k),
    -2 * a * (a - 1 + (a + 1) * cos),
    a * (a + 1 + (a - 1) * cos - k),
    a + 1 - (a - 1) * cos + k,
    2 * (a - 1 - (a + 1) * cos),
    a + 1 - (a - 1) * cos - k,
  );
}

export function step(f: Biquad, x: number): number {
  const y = f.b0 * x + f.z1;
  f.z1 = f.b1 * x - f.a1 * y + f.z2;
  f.z2 = f.b2 * x - f.a2 * y;
  return y;
}

export const dbOf = (amplitude: number): number => 20 * Math.log10(Math.max(1e-9, amplitude));
export const amplitudeOf = (db: number): number => Math.pow(10, db / 20);
export const midiOf = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
export const hzOf = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
