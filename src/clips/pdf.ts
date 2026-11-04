// Engraved pages written as a PDF 1.4 file: vector paths and the two standard Helvetica fonts,
// which every reader has, so nothing is embedded. The pages are drawn with y running down, as
// engrave.ts lays them out, by flipping the page's coordinates once; text is flipped back.
//
// Text goes out in WinAnsiEncoding, which has ° and ø but not ♯ or ♭; those are written # and b.

import type { Anchor, Cmd, Op, Sheet } from './engrave.js';

export function sheetToPdf(sheet: Sheet): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // the page tree, once the pages are numbered
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  add(`<< /Title (${escape(sheet.title)}) /Producer (Chordlight) >>`);
  const kids: number[] = [];
  for (const ops of sheet.pages) {
    const content = `1 0 0 -1 0 ${n(sheet.height)} cm 1 J 1 j\n${ops.map(draw).join('\n')}\n`;
    add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(sheet.width)} ${n(sheet.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${objects.length} 0 R >>`,
    );
    kids.push(objects.length);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return bytes;
}

/** A number in as few characters as keep a hundredth of a point. */
const n = (v: number) => String(Math.round(v * 100) / 100);

function draw(op: Op): string {
  switch (op.k) {
    case 'line':
      return `${n(op.w)} w ${n(op.x1)} ${n(op.y1)} m ${n(op.x2)} ${n(op.y2)} l S`;
    case 'path':
      return `${n(op.w)} w ${op.cmds.map(cmd).join(' ')} ${op.fill ? 'f' : 'S'}`;
    case 'ellipse':
      return `${n(op.w)} w ${ellipse(op.x, op.y, op.rx, op.ry, op.rot).map(cmd).join(' ')} ${op.fill ? 'f' : 'S'}`;
    case 'text': {
      const x = op.x - offset(op.text, op.size, op.bold, op.anchor);
      return `BT /${op.bold ? 'F2' : 'F1'} ${n(op.size)} Tf 1 0 0 -1 ${n(x)} ${n(op.y)} Tm (${escape(op.text)}) Tj ET`;
    }
  }
}

function cmd(c: Cmd): string {
  if (c[0] === 'Z') return 'h';
  const [op, ...v] = c;
  return `${v.map(n).join(' ')} ${op === 'M' ? 'm' : op === 'L' ? 'l' : 'c'}`;
}

/** Four Bézier quarters, rotated by `deg`. */
function ellipse(x: number, y: number, rx: number, ry: number, deg: number): Cmd[] {
  const k = 0.5523;
  const a = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  const p = (u: number, v: number): [number, number] => [
    x + u * cos - v * sin,
    y + u * sin + v * cos,
  ];
  const c = (...uv: number[]): Cmd => [
    'C',
    ...p(uv[0]!, uv[1]!),
    ...p(uv[2]!, uv[3]!),
    ...p(uv[4]!, uv[5]!),
  ];
  return [
    ['M', ...p(rx, 0)],
    c(rx, k * ry, k * rx, ry, 0, ry),
    c(-k * rx, ry, -rx, k * ry, -rx, 0),
    c(-rx, -k * ry, -k * rx, -ry, 0, -ry),
    c(k * rx, -ry, rx, -k * ry, rx, 0),
    ['Z'],
  ];
}

/** Text for a PDF string: WinAnsi octal escapes, music signs spelled out. */
function escape(text: string): string {
  let out = '';
  for (const ch of plain(text)) {
    const code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code >= 32 && code < 127) out += ch;
    else if (code >= 128 && code < 256) out += `\\${code.toString(8)}`;
    else out += '?';
  }
  return out;
}

const plain = (text: string) =>
  text.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[𝄪]/gu, 'x').replace(/[𝄫]/gu, 'bb');

/** Characters whose WinAnsi code isn't their Unicode one, among those a clip's name can hold. */
const WIN_ANSI: Record<string, number> = { '–': 150, '—': 151, '’': 146, '·': 183 };

function offset(text: string, size: number, bold: boolean, anchor: Anchor): number {
  if (anchor === 'start') return 0;
  const w = [...plain(text)].reduce((sum, ch) => sum + (WIDTHS[ch.charCodeAt(0) - 32] ?? 556), 0);
  const width = (w * size * (bold ? 1.05 : 1)) / 1000;
  return anchor === 'middle' ? width / 2 : width;
}

/** Helvetica's advance widths for ASCII 32 to 126, in thousandths of the size. */
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
