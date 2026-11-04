// The static build: every file the page loads is in it, paths work from a sub-path (a project
// site is served from /<repo>/), and the CSP meta tag's hash matches the import map.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../site/build.mjs';
import { importMapHash } from '../site/policy.mjs';
import { check, done } from './kit/check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = mkdtempSync(join(tmpdir(), 'chordlight-site-'));
try {
  buildSite(root, out);
  const html = readFileSync(join(out, 'index.html'), 'utf8');

  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
  for (const [name, target] of Object.entries(map)) {
    check(target.startsWith('./'), `import map entry ${name} isn't relative: ${target}`);
    check(
      existsSync(resolve(out, target)),
      `import map entry ${name} points at a missing ${target}`,
    );
  }
  for (const [, tag, attr, path] of html.matchAll(/<(\w+)[^>]*?\s(src|href)="([^"]+)"/g)) {
    check(!path.startsWith('/'), `${attr}="${path}" is root-relative`);
    // A link out is somewhere the reader can go, not something the page loads.
    if (tag === 'a' && path.startsWith('https://')) continue;
    check(existsSync(resolve(out, path)), `${attr}="${path}" is missing from the site`);
  }
  check(
    html.includes(`'sha256-${importMapHash(html)}'`),
    "the CSP meta tag doesn't allow the import map",
  );
  const csp = html.indexOf('Content-Security-Policy');
  check(csp > 0 && csp < html.indexOf('<script'), 'the CSP meta tag must come before any script');
  check(existsSync(join(out, 'vendor/three/three.core.js')), 'three.core.js is missing');
  const maps = readdirSync(out, { recursive: true }).filter((f) => f.endsWith('.map'));
  check(maps.length === 0, `source maps were published: ${maps.slice(0, 3).join(', ')}`);
  check(!existsSync(join(out, 'src')), 'src/ was published');
} finally {
  rmSync(out, { recursive: true, force: true });
}

done('the static site is complete, relative and covered by its CSP');
