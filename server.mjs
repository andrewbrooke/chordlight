// Static dev server for index.html, style.css, dist/ and three.js. It binds to 127.0.0.1 only;
// PORT sets the port. Responses carry a Content-Security-Policy that limits the page to this
// origin, with the inline import map allowed by its hash.

import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, posix, resolve, sep } from 'node:path';
import { policy } from './tools/site/policy.mjs';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT ?? 5190);
const HOST = '127.0.0.1';

// An allowlist, since ROOT is the whole repository: src/, node_modules/, .git/ and so on.
const SERVABLE = ['/index.html', '/style.css', '/dist/', '/node_modules/three/build/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function header() {
  return policy(await readFile(resolve(ROOT, 'index.html'), 'utf8'));
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  // Normalise before matching, or /dist/../src/x would pass the prefix test.
  pathname = posix.normalize(pathname.replaceAll('\\', '/'));
  if (!SERVABLE.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  const target = resolve(ROOT, '.' + pathname);
  try {
    // Resolve symlinks first: the prefix test shows where a link is, not where it points.
    const real = await realpath(target);
    if (real !== ROOT && !real.startsWith(ROOT + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(real);
    if (info.isDirectory()) throw new Error('is a directory');
    res.writeHead(200, {
      'content-type': MIME[extname(real)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
      'content-security-policy': await header(),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-opener-policy': 'same-origin',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(real).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, HOST, () => {
  const { address, port } = server.address();
  console.log(`Chordlight running at http://${address}:${port}`);
});
