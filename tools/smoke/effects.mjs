// The piano's effects, as far as they're arithmetic: saved settings are made whole, presets sit on
// the sliders' steps and match themselves, the EQ draws the curve its filters make (and always has
// the same seven, since the live chain builds them once), the echo follows the tempo and dies away,
// the drive holds a played chord's loudness while it adds distortion, and the reverb's impulse
// falls 60 dB over its size, at unit energy, with the two sides apart and the tone darkening it.

import {
  DIVISIONS,
  DRY,
  driveCurve,
  driveGains,
  echoFeedback,
  echoSeconds,
  eqCurve,
  eqFilters,
  FX_KINDS,
  fxSettings,
  mixGains,
  RANGES,
  reverbImpulse,
  sameSound,
  snap,
} from 'chordlight/audio/fx-model.js';
import { renderNote } from 'chordlight/audio/piano-model.js';
import { highpass, step } from 'chordlight/listen/filters.js';
import { FX_PRESETS, fxPresetOf } from 'chordlight/presets/effects.js';
import { FX, PLAY } from 'chordlight/tuning.js';
import { check, done, same } from './kit/check.mjs';

const RATE = 48000;
const db = (x) => 20 * Math.log10(x);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Saved settings.
same(fxSettings(undefined), DRY, 'nothing saved is DRY');
same(fxSettings('junk'), DRY, 'junk saved is DRY');
const mangled = fxSettings({
  on: 'yes',
  eq: { low: 40, midHz: 3, steep: 1, lowCut: 'x' },
  echo: { sync: '1/3', ms: Number.NaN, pingPong: false },
  reverb: { size: 2.345, mix: 0.574 },
});
same(mangled.on, DRY.on, 'a mistyped switch takes DRY');
same(mangled.eq.low, FX.eq.range, 'a band past its range is held at the end');
same(mangled.eq.midHz, FX.eq.midHz[0], 'a frequency below its range is held at the bottom');
same(mangled.eq.steep, DRY.eq.steep, 'a mistyped check takes DRY');
same(mangled.eq.lowCut, DRY.eq.lowCut, 'a mistyped number takes DRY');
same(mangled.echo.sync, DRY.echo.sync, 'an unknown note length takes DRY');
same(mangled.echo.ms, DRY.echo.ms, 'NaN takes DRY');
same(mangled.echo.pingPong, false, 'a saved check is kept');
same(mangled.reverb.size, 2.35, 'a log value keeps three figures');
same(mangled.reverb.mix, 0.57, 'a linear value lands on its step as written');
same(mangled.drive, DRY.drive, 'a section not saved is DRY');
for (const kind of FX_KINDS) {
  for (const [key, r] of Object.entries(RANGES[kind])) {
    const v = DRY[kind][key];
    same(snap(v, r), v, `DRY's ${kind}.${key} sits on its slider`);
  }
}

// Presets.
const ids = new Set();
for (const p of FX_PRESETS) {
  check(!ids.has(p.id), `two presets are called ${p.id}`);
  ids.add(p.id);
  same(fxSettings(p.fx), p.fx, `${p.id} sits on the sliders' steps and in range`);
  same(fxPresetOf(p.fx)?.id, p.id, `${p.id} is recognised as itself`);
  for (const q of FX_PRESETS) {
    check(p === q || !sameSound(p.fx, q.fx), `${p.id} and ${q.id} sound the same`);
  }
}
same(fxPresetOf(DRY)?.id, 'dry', 'DRY is the dry preset');
const tweaked = { ...DRY, reverb: { ...DRY.reverb, size: 3 } };
same(fxPresetOf(tweaked)?.id, 'dry', 'a change to an effect that is off changes nothing heard');

// Mix and echo.
for (const m of [0, 0.3, 0.5, 1]) {
  const [dry, wet] = mixGains(m);
  check(near(dry * dry + wet * wet, 1, 1e-9), `mix ${m} isn't equal power`);
}
same(mixGains(0), [1, 0], 'mix 0 is dry');
check(near(echoSeconds({ ...DRY.echo, sync: '1/4' }, 120), 0.5, 1e-9), 'a quarter at 120 BPM');
check(near(echoSeconds({ ...DRY.echo, sync: '1/8.' }, 120), 0.375, 1e-9), 'a dotted eighth');
check(near(echoSeconds({ ...DRY.echo, sync: 'free', ms: 250 }, 120), 0.25, 1e-9), 'free time');
for (const sync of DIVISIONS) {
  const s = echoSeconds({ ...DRY.echo, sync }, 40);
  check(s <= FX.echo.longest, `${sync} at 40 BPM is longer than the delay lines`);
}
check(echoFeedback({ ...DRY.echo, repeats: 1 }) < 1, 'full repeats would never die away');

// EQ.
const freqs = Array.from({ length: 200 }, (_, i) => 20 * Math.pow(1000, i / 199));
const at = (eq, hz) => eqCurve(eq, RATE, [hz])[0];
const flat = eqCurve(DRY.eq, RATE, freqs);
check(Math.max(...flat.map(Math.abs)) < 0.01, 'a flat EQ bends the sound');
check(near(at({ ...DRY.eq, low: 6 }, 30), 6, 0.3), 'Low +6 is +6 in the bass');
check(near(at({ ...DRY.eq, low: 6 }, 10000), 0, 0.1), 'Low +6 reaches the treble');
check(near(at({ ...DRY.eq, mid: -6, midHz: 800 }, 800), -6, 0.05), 'Mid -6 at 800 Hz');
check(near(at({ ...DRY.eq, high: -6 }, 18000), -6, 0.4), 'High -6 is -6 in the treble');
for (const steep of [false, true]) {
  const slope = steep ? 24 : 12;
  const low = { ...DRY.eq, lowCut: 200, steep };
  // Kept well below Nyquist, where a digital lowpass falls faster than its slope.
  const high = { ...DRY.eq, highCut: 1000, steep };
  check(near(at(low, 200), -3, 0.2), `a ${slope} dB low cut isn't -3 dB at its corner`);
  check(near(at(low, 100), -slope, 0.5), `a ${slope} dB low cut isn't -${slope} an octave down`);
  check(near(at(low, 2000), 0, 0.1), `a ${slope} dB low cut reaches the middle`);
  check(near(at(high, 1000), -3, 0.2), `a ${slope} dB high cut isn't -3 dB at its corner`);
  check(near(at(high, 2000), -slope, 0.5), `a ${slope} dB high cut isn't -${slope} an octave up`);
}
const shape = (eq) => eqFilters(eq, RATE).map((f) => f.type);
for (const eq of [DRY.eq, { ...DRY.eq, lowCut: 300, highCut: 2000, steep: true }]) {
  same(shape(eq), shape(DRY.eq), 'the EQ changes which filters it has');
}

// Drive: a chord from the computer keys, as the piano voices it (centre-panned), stays as loud.
const chord = (velocity) => {
  const g = (0.15 + 0.85 * Math.pow(velocity, 1.7)) * Math.SQRT1_2;
  const out = new Float32Array(RATE * 2);
  for (const m of [48, 60, 64, 67]) {
    const n = renderNote(m, velocity < 0.6 ? 0 : 1, RATE);
    for (let i = 0; i < out.length && i < n.length; i++) out[i] += n[i] * g;
  }
  return out;
};
const lookup = (curve, u) => {
  const pos = ((Math.max(-1, Math.min(1, u)) + 1) / 2) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(pos));
  return curve[i] + (curve[i + 1] - curve[i]) * (pos - i);
};
const played = chord(PLAY.velocity);
let last = -Infinity;
for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
  const { pre, post } = driveGains(amount);
  const y = played.map((s) => lookup(driveCurve(), s * pre) * post);
  const change = db(rms(y)) - db(rms(played));
  check(Math.abs(change) < 1.5, `drive ${amount} moves a played chord ${change.toFixed(1)} dB`);
  // Distortion: what's left once the best straight-line fit to the dry chord is taken away.
  let xy = 0;
  let xx = 0;
  for (let i = 0; i < y.length; i++) [xy, xx] = [xy + played[i] * y[i], xx + played[i] ** 2];
  const k = xy / xx;
  const left = db(rms(y.map((v, i) => v - k * played[i])) / rms(y));
  check(left > last + 3, `drive ${amount} distorts no more than the step below it`);
  last = left;
}

// Reverb, at a lower rate so the long ones are quick.
const R = 16000;
for (const size of [0.5, 2, 6]) {
  const [l, r] = reverbImpulse(R, size, 0.5);
  same(l.length, Math.ceil(R * size), `reverb ${size} s is that long`);
  check(
    [...l, ...r].every((x) => Number.isFinite(x)),
    `reverb ${size} s has a non-finite sample`,
  );
  const energy = (a) => a.reduce((s, x) => s + x * x, 0);
  check(near(energy(l) + energy(r), 2, 1e-3), `reverb ${size} s isn't at unit energy`);
  // Schroeder: the energy still to come, from -5 to -35 dB, twice over is the time to -60.
  const left = new Float64Array(l.length + 1);
  for (let i = l.length - 1; i >= 0; i--) left[i] = left[i + 1] + l[i] * l[i] + r[i] * r[i];
  const when = (down) => left.findIndex((e) => 10 * Math.log10(e / left[0]) < -down) / R;
  const rt60 = (when(35) - when(5)) * 2;
  check(near(rt60, size, size * 0.15), `reverb ${size} s falls 60 dB in ${rt60.toFixed(2)} s`);
  let lr = 0;
  for (let i = 0; i < l.length; i++) lr += l[i] * r[i];
  const corr = lr / Math.sqrt(energy(l) * energy(r));
  check(Math.abs(corr) < 0.2, `reverb ${size} s sides correlate at ${corr.toFixed(2)}`);
}
same(reverbImpulse(R, 1, 0.5)[0], reverbImpulse(R, 1, 0.5)[0], 'an impulse is the same twice');
const treble = (tone) => {
  const [l] = reverbImpulse(RATE, 2, tone);
  const hp = highpass(4000, RATE, Math.SQRT1_2);
  const tail = l.subarray(Math.floor(l.length / 4));
  return rms(tail.map((x) => step(hp, x))) / rms(tail);
};
check(treble(0) < treble(1) * 0.6, `a dark reverb keeps ${treble(0).toFixed(2)} of its treble`);

done(
  `${FX_PRESETS.length} presets, EQ curves, echo times, drive within 1.5 dB, reverbs within 15%`,
);
