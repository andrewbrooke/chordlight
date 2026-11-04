// Where the tour's card goes: beside its target if a side has room, else on the roomiest side,
// overlapping the target as little as the viewport allows.

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
  const midX = (r: Rect) => clamp((r.left + r.right) / 2 - w / 2, margin, vw - w - margin);
  const midY = (r: Rect) => clamp((r.top + r.bottom) / 2 - h / 2, margin, vh - h - margin);
  if (!target) {
    const all = { left: 0, top: 0, right: vw, bottom: vh };
    return { x: midX(all), y: midY(all) };
  }
  const sides = [
    { room: vh - target.bottom, need: h, at: () => ({ x: midX(target), y: target.bottom + gap }) },
    { room: target.top, need: h, at: () => ({ x: midX(target), y: target.top - gap - h }) },
    { room: vw - target.right, need: w, at: () => ({ x: target.right + gap, y: midY(target) }) },
    { room: target.left, need: w, at: () => ({ x: target.left - gap - w, y: midY(target) }) },
  ];
  const clear = sides.find((s) => s.room >= s.need + gap + margin);
  if (clear) return clear.at();
  const roomiest = sides.reduce((a, b) => (b.room / b.need > a.room / a.need ? b : a));
  const { x, y } = roomiest.at();
  return { x: clamp(x, margin, vw - w - margin), y: clamp(y, margin, vh - h - margin) };
}
