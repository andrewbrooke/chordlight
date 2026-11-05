// The strip above the stage while it shows only a section of the instrument: the whole instrument
// in miniature, with the section outlined. Pressing or dragging on the strip centres the section
// there; a sideways scroll over the stage (a trackpad, or Shift and the wheel) moves it too.

import { COLOURS } from '../tuning.js';
import type { Stage } from './stage.js';

/** What a wheel's line or page step is worth in pixels. */
const WHEEL_STEP = [1, 16, 400];

export class Overview {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    host: HTMLElement,
    private readonly stage: Stage,
  ) {
    const canvas = this.canvas;
    canvas.id = 'overview';
    canvas.title = 'Drag to move along the instrument';
    host.prepend(canvas);
    this.ctx = canvas.getContext('2d')!;
    stage.onFit = () => this.draw();

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.centreAt(e.clientX);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) this.centreAt(e.clientX);
    });
    host.addEventListener(
      'wheel',
      (e) => {
        const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
        if (!stage.section || dx === 0) return;
        e.preventDefault();
        stage.nudge(dx * (WHEEL_STEP[e.deltaMode] ?? 1));
      },
      { passive: false },
    );
  }

  private centreAt(clientX: number): void {
    const view = this.stage.instrument;
    const section = this.stage.section;
    if (!view || !section) return;
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width - 0.5) * view.shape.width;
    this.stage.pan(x - (section.to - section.from) / 2);
  }

  private draw(): void {
    const view = this.stage.instrument;
    const section = this.stage.section;
    const c = this.canvas;
    const dpr = devicePixelRatio;
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!view || !section || w === 0 || h === 0) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const { width } = view.shape;
    const x = (cm: number) => ((cm + width / 2) / width) * w;
    view.sketch(ctx, x, h);

    const [a, b] = [Math.round(x(section.from)), Math.round(x(section.to))];
    ctx.fillStyle = 'rgba(13, 11, 9, 0.62)';
    ctx.fillRect(0, 0, a, h);
    ctx.fillRect(b, 0, w - b, h);
    const line = Math.max(1, Math.round(1.5 * dpr));
    ctx.strokeStyle = COLOURS.home;
    ctx.lineWidth = line;
    ctx.strokeRect(a + line / 2, line / 2, b - a - line, h - line);
  }
}
