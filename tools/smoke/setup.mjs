// The guitar setup's measurements on made-up signals: the channel the guitar is on, the level
// advice, the quiet level and which mains hum is in it, the gate, tuning verdicts, the timing offset
// from plucks played along to clicks, and which input looks like an audio interface.

import {
  adviseLevel,
  analyseQuiet,
  gateFor,
  likelyInterface,
  pickChannel,
  timingOffset,
  tuneTo,
} from 'chordlight/listen/calibrate.js';
import { SETUP } from 'chordlight/tuning.js';
import { check, done, same } from './kit/check.mjs';

// Channels
same(pickChannel([-90, -88], [-89, -20]), 1, 'the channel that rose is the guitar');
same(pickChannel([-90, -88], [-85, -86]), null, 'nothing rose enough');
same(pickChannel([-40], [-38]), null, 'a loud channel that did not rise is not it');
same(pickChannel([-90, -90], [-30, -12]), 1, 'two rose: the one that rose most');

// Level
same(adviseLevel(-40), 'quiet', 'a quiet pluck');
same(adviseLevel(-12), 'good', 'a good pluck');
same(adviseLevel(-2), 'loud', 'a loud pluck');
same(adviseLevel(0), 'clipping', 'a clipping pluck');

// Quiet: noise, with and without mains hum.
const RATE = 12000;
function quiet(rms, mains, humAmp) {
  const out = new Float32Array(RATE * SETUP.quietSeconds);
  let s = 11;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const t = i / RATE;
    let v = (s / 2147483648 - 1) * rms * Math.sqrt(3);
    if (mains) {
      v += humAmp * Math.sin(2 * Math.PI * mains * t);
      v += humAmp * 0.6 * Math.sin(2 * Math.PI * 2 * mains * t);
      v += humAmp * 0.4 * Math.sin(2 * Math.PI * 3 * mains * t);
    }
    out[i] = v;
  }
  return out;
}
const db = (x) => Math.pow(10, x / 20);

const plain = analyseQuiet(quiet(db(-70), null, 0), RATE);
check(Math.abs(plain.floorDb + 70) < 1.5, `noise at -70 dB reads ${plain.floorDb.toFixed(1)}`);
same([plain.mains, plain.hum, plain.noisy], [null, [], false], 'plain noise has no hum');

const sixty = analyseQuiet(quiet(db(-70), 60, db(-55)), RATE);
same(sixty.mains, 60, '60 Hz mains');
same(sixty.hum.slice(0, 3), [60, 120, 180], 'its harmonics');
check(sixty.floorDb > -60, `the hum sets the raw floor: ${sixty.floorDb.toFixed(1)}`);
check(Math.abs(sixty.cleanDb + 70) < 2, `filtered, the noise is left: ${sixty.cleanDb.toFixed(1)}`);
const fifty = analyseQuiet(quiet(db(-70), 50, db(-55)), RATE);
same([fifty.mains, fifty.hum.slice(0, 3)], [50, [50, 100, 150]], '50 Hz mains');
check(analyseQuiet(quiet(db(-40), null, 0), RATE).noisy, 'loud noise is noisy');

// Gate
same(gateFor(-80), -70, 'the gate sits a margin over a quiet floor');
same(gateFor(-100), SETUP.gateLowest, 'but never below its lowest');
same(gateFor(-20), SETUP.gateHighest, 'or above its highest');

// Tuning
same(tuneTo(40.02, 40).verdict, 'in tune', 'two cents is in tune');
same(tuneTo(39.8, 40).verdict, 'flat', 'twenty cents low is flat');
same(tuneTo(40.3, 40).verdict, 'sharp', 'thirty cents high is sharp');

// Timing: plucks 42 ms after each click, a few ms of wobble, one missed, one stray.
const clicks = Array.from({ length: 8 }, (_, i) => 1 + i * 0.75);
const wobble = [3, -2, 4, -4, 1, 0, -3];
const hits = clicks.slice(0, 7).map((c, i) => c + 0.042 + wobble[i] / 1000);
hits.push(2.2);
const timing = timingOffset(clicks, hits);
check(timing !== null, 'enough plucks to time');
if (timing) {
  check(Math.abs(timing.offset - 0.042) < 0.003, `timing offset ${timing.offset.toFixed(4)}`);
  same(timing.matched, 7, 'seven plucks paired, the stray left out');
  check(timing.spread < 0.005, `steady plucks have a small spread: ${timing.spread.toFixed(4)}`);
}
same(timingOffset(clicks, hits.slice(0, 3)), null, 'three plucks are too few');

// Which input
same(
  likelyInterface([
    'Default - Microphone (Focusrite USB Audio)',
    'Microphone Array (Realtek Audio)',
    'Analogue 1 + 2 (Focusrite USB Audio)',
  ]),
  2,
  'the interface, not its Default alias or the laptop microphone',
);
same(likelyInterface(['Built-in Microphone']), 0, 'the only input');

done('the setup measures what it should from made-up signals');
