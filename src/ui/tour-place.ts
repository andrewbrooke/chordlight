// Where the tour's card goes: beside its target if a side has room, else on the roomiest side,
// overlapping the target as little as the viewport allows. A step with several targets that fill
// the screen between them (the readout and the keys, on a phone) puts the card beside its first one
// instead, so that one at least stays in sight.

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function union(rects: readonly Rect[]): Rect {
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}

export function grow(r: Rect, by: number): Rect {
  return { left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/** Top-left corner for a `w` × `h` card in a `vw` × `vh` viewport. */
export function placeCard(
  target: Rect | null,
  w: number,
  h: number,
  vw: number,
  vh: number,
  gap: number,
  margin: number,
): { x: number; y: number } {
  if (!target) return { x: mid(0, vw, w, vw, margin), y: mid(0, vh, h, vh, margin) };
  const options = sides(target, w, h, vw, vh, gap, margin);
  const clear = options.find((s) => s.room >= s.need + gap + margin);
  if (clear) return clear.at;
  const roomiest = options.reduce((a, b) => (b.room / b.need > a.room / a.need ? b : a));
  const { x, y } = roomiest.at;
  return { x: clamp(x, margin, vw - w - margin), y: clamp(y, margin, vh - h - margin) };
}

/** As placeCard for several targets, the one to keep in sight first. */
export function placeCardFor(
  targets: readonly Rect[],
  w: number,
  h: number,
  vw: number,
  vh: number,
  gap: number,
  margin: number,
): { x: number; y: number } {
  if (targets.length === 0) return placeCard(null, w, h, vw, vh, gap, margin);
  const all = union(targets);
  for (const target of targets.length > 1 ? [all, targets[0]!] : [all]) {
    const clear = sides(target, w, h, vw, vh, gap, margin).find(
      (s) => s.room >= s.need + gap + margin,
    );
    if (clear) return clear.at;
  }
  return placeCard(all, w, h, vw, vh, gap, margin);
}

const mid = (a: number, b: number, size: number, view: number, margin: number) =>
  clamp((a + b) / 2 - size / 2, margin, view - size - margin);

/** Below, above, right and left of the target, in that order of preference. */
function sides(t: Rect, w: number, h: number, vw: number, vh: number, gap: number, margin: number) {
  const x = mid(t.left, t.right, w, vw, margin);
  const y = mid(t.top, t.bottom, h, vh, margin);
  return [
    { room: vh - t.bottom, need: h, at: { x, y: t.bottom + gap } },
    { room: t.top, need: h, at: { x, y: t.top - gap - h } },
    { room: vw - t.right, need: w, at: { x: t.right + gap, y } },
    { room: t.left, need: w, at: { x: t.left - gap - w, y } },
  ];
}
