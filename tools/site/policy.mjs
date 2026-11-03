// The Content-Security-Policy, shared by the dev server (sent as a header) and the static build
// (written as a meta tag). The page may load only from its own origin, plus its inline import map,
// which is allowed by hash.

import { createHash } from 'node:crypto';

const IMPORT_MAP = /<script type="importmap">([\s\S]*?)<\/script>/;

export function importMapHash(html) {
  const map = IMPORT_MAP.exec(html)?.[1] ?? '';
  return createHash('sha256').update(map).digest('base64');
}

export function policy(html, { meta = false } = {}) {
  const rules = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${importMapHash(html)}'`,
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  // Browsers ignore frame-ancestors in a meta tag.
  if (!meta) rules.push("frame-ancestors 'none'");
  return rules.join('; ');
}
