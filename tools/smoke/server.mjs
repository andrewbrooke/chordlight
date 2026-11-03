// The server binds 127.0.0.1 only (even with HOST set), serves only its allowlist, and sends a CSP
// whose hash matches the import map. Every non-loopback IPv4 address must refuse the connection.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, symlinkSync } from 'node:fs';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, done, same } from './kit/check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const child = spawn(process.execPath, [join(root, 'server.mjs')], {
  env: { ...process.env, PORT: '0', HOST: '0.0.0.0' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const banner = await new Promise((resolve, reject) => {
  child.stdout.on('data', (d) => resolve(String(d)));
  child.on('exit', () => reject(new Error('the server exited')));
  setTimeout(() => reject(new Error('the server never said where it was')), 5000);
});
const m = /http:\/\/([\d.]+):(\d+)/.exec(banner);
const [host, port] = [m?.[1], Number(m?.[2])];
same(host, '127.0.0.1', 'the address it listens on, even with HOST=0.0.0.0 set');

const get = (path, method = 'GET') =>
  fetch(`http://127.0.0.1:${port}${path}`, { method }).then((r) => ({
    status: r.status,
    csp: r.headers.get('content-security-policy') ?? '',
  }));

let others = [];
try {
  for (const path of [
    '/',
    '/index.html',
    '/style.css',
    '/dist/main.js',
    '/node_modules/three/build/three.module.js',
  ]) {
    same((await get(path)).status, 200, `GET ${path}`);
  }
  for (const path of [
    '/src/main.ts',
    '/package.json',
    '/server.mjs',
    '/README.md',
    '/dist/../package.json',
    '/%2e%2e/package.json',
    '/dist/%2e%2e/server.mjs',
    '/node_modules/three/package.json',
    '/.git/config',
  ]) {
    check((await get(path)).status >= 400, `GET ${path} is refused`);
  }
  same((await get('/', 'POST')).status, 405, 'POST is refused');

  const link = join(root, 'dist', '__smoke-link.txt');
  try {
    symlinkSync('/etc/hostname', link);
    same((await get('/dist/__smoke-link.txt')).status, 403, 'a symlink out of the repo');
  } finally {
    rmSync(link, { force: true });
  }

  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1];
  const hash = createHash('sha256').update(map).digest('base64');
  const { csp } = await get('/');
  check(csp.includes(`'sha256-${hash}'`), 'the policy allows the import map by its hash');
  check(csp.includes("connect-src 'self'"), 'the page can only connect to its own origin');

  others = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
  for (const address of others) {
    const reached = await new Promise((resolve) => {
      const s = connect({ host: address, port, timeout: 1500 });
      s.on('connect', () => {
        s.destroy();
        resolve(true);
      });
      s.on('error', () => resolve(false));
      s.on('timeout', () => {
        s.destroy();
        resolve(false);
      });
    });
    check(!reached, `the server answered on ${address}`);
  }
} finally {
  child.kill();
}
done(`listens on 127.0.0.1:${port} only, refused on ${others.length} other addresses`);
process.exit(0);
