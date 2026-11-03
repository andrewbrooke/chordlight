// Every preset parses, transposes to all twelve keys, and lights its chord tones.

import { PRESETS } from 'chordlight/presets/library.js';
import { chordName, chordPcs } from 'chordlight/theory/chords.js';
import { chordLights } from 'chordlight/theory/guide.js';
import { nameOf } from 'chordlight/theory/pitch.js';
import { parseProgression, progressionText, transpose } from 'chordlight/theory/roman.js';
import { spellKey } from 'chordlight/theory/scales.js';
import { check, done, same } from './kit/check.mjs';

const ids = new Set();
for (const p of PRESETS) {
  check(!ids.has(p.id), `two presets are called ${p.id}`);
  ids.add(p.id);
  const start = spellKey({ home: p.home, mood: p.mood });
  const parsed = parseProgression(p.text, start);
  if (!parsed.ok) {
    check(false, `${p.id} doesn't parse: ${parsed.token}`);
    continue;
  }
  same(progressionText(parsed.steps, start), p.text, `${p.id} prints back as written`);
  for (let home = 0; home < 12; home++) {
    const key = spellKey({ home, mood: p.mood });
    const steps = transpose(parsed.steps, start, key);
    same(progressionText(steps, key), p.text, `${p.id} in ${key.name} keeps its numerals`);
    for (const step of steps) {
      const lights = chordLights(key, step.chord, p.palette);
      const where = `${chordName(step.chord)} in ${p.id}, ${key.name}`;
      for (const pc of chordPcs(step.chord)) {
        const l = lights.light[pc];
        check(l === 'home' || l === 'land', `${where}: a chord tone is ${l}`);
      }
      lights.light.forEach((l, pc) => {
        const name = nameOf(lights.names[pc]);
        check(l === 'out' || !/[𝄫𝄪]/.test(name), `${where}: lit ${name}`);
      });
      check(lights.light.filter((l) => l !== 'out').length >= 5, `${where}: fewer than 5 lit`);
    }
  }
}

done(`${PRESETS.length} presets read, transpose and light correctly in all twelve keys`);
