// Assembles the static site in site/ for GitHub Pages or any static host: index.html, style.css,
// the compiled dist/ and three.js's build files. Static hosts can't send headers, so the
// Content-Security-Policy goes into a meta tag.
//
//   npm run site

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { policy } from './policy.mjs';

const THREE_DEV = './node_modules/three/build/three.module.js';
const THREE_SITE = './vendor/three/three.module.js';
const THREE_FILES = ['three.module.js', 'three.core.js'];

export function buildSite(root, out) {
  if (!existsSync(join(root, 'dist/main.js')))
    throw new Error('dist/ is missing: run npm run build');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'vendor/three'), { recursive: true });

  let html = readFileSync(join(root, 'index.html'), 'utf8');
  // A project site is served from /<repo>/, so a path starting with / would miss it.
  if (/\s(src|href)="\//.test(html) || /"\/(dist|node_modules)\//.test(html)) {
    throw new Error('index.html uses a root-relative path, which breaks on a project site');
  }
  if (!html.includes(THREE_DEV)) throw new Error(`index.html no longer maps three to ${THREE_DEV}`);
  html = html.replace(THREE_DEV, THREE_SITE);
  const csp = `<meta http-equiv="Content-Security-Policy" content="${policy(html, { meta: true })}" />`;
  html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    ${csp}`);
  writeFileSync(join(out, 'index.html'), html);

  cpSync(join(root, 'style.css'), join(out, 'style.css'));
  // Source maps point at src/, which isn't published.
  cpSync(join(root, 'dist'), join(out, 'dist'), {
    recursive: true,
    filter: (path) => !path.endsWith('.map'),
  });
  for (const file of THREE_FILES) {
    cpSync(join(root, 'node_modules/three/build', file), join(out, 'vendor/three', file));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const out = join(root, 'site');
  buildSite(root, out);
  console.log(`site built in ${out}`);
}
