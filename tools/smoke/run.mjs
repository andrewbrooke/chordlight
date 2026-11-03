// Runs each smoke in its own process against dist/.
//
//   npm run smoke            all of them
//   npm run smoke -- theory  just one
//
// Refuses to run if dist/ holds modules whose source is gone, since tsc never deletes outputs.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ALL = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs')
  .map((f) => basename(f, '.mjs'))
  .sort();

const dist = join(here, '../../dist');
const orphans = readdirSync(dist, { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !existsSync(join(here, '../../src', f.replace(/\.js$/, '.ts'))));
if (orphans.length > 0) {
  console.log(
    `dist/ holds modules whose source is gone: ${orphans.join(', ')}; delete dist/ and build`,
  );
  process.exit(2);
}

const asked = process.argv.slice(2);
const unknown = asked.filter((n) => !ALL.includes(n));
if (unknown.length > 0) {
  console.log(`no smoke called ${unknown.join(', ')}; there are: ${ALL.join(' ')}`);
  process.exit(2);
}

let failed = 0;
for (const name of asked.length > 0 ? asked : ALL) {
  const started = performance.now();
  const r = spawnSync(process.execPath, [join(here, `${name}.mjs`)], { encoding: 'utf8' });
  const ms = (performance.now() - started).toFixed(0);
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  (${ms} ms)`);
  const said = (r.stdout + r.stderr).trim();
  if (said && (!ok || process.env['VERBOSE'])) console.log(said.replace(/^/gm, '      '));
}
process.exit(failed > 0 ? 1 : 0);
