// The browser loads dist/ without a bundler, so every relative import must exist with its .js
// extension and every bare import must be in the import map.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, done } from './kit/check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(root, 'dist');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
const bare = Object.keys(map);

const files = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith('.js'));
let imports = 0;
for (const file of files) {
  const source = readFileSync(join(dist, file), 'utf8');
  const specifiers = [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/new URL\(\s*['"]([^'"]+)['"],\s*import\.meta\.url\s*\)/g),
  ].map((m) => m[1]);
  for (const spec of specifiers) {
    imports++;
    if (spec.startsWith('.')) {
      const target = resolve(dirname(join(dist, file)), spec);
      check(existsSync(target), `${file} imports ${spec}, which isn't there`);
      check(spec.endsWith('.js'), `${file} imports ${spec} without .js`);
    } else {
      check(
        bare.some((b) => spec === b || (b.endsWith('/') && spec.startsWith(b))),
        `${file} imports ${spec}, which the import map doesn't provide`,
      );
    }
  }
}
check(existsSync(resolve(root, map['three'])), 'the import map points three at a missing file');

done(`${files.length} modules, ${imports} imports, all resolvable in the browser`);
