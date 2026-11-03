// Per-key label textures, drawn at the size they appear on screen so each texel covers one device
// pixel; a larger canvas scaled down through mipmaps reads soft. Redrawn when the text or the size
// changes.

import * as THREE from 'three';
import { LABEL_ASPECT } from './shapes.js';

/** Where device pixels fall in the world: the screen's top-left corner, and pixels per cm. */
export interface PixelGrid {
  x0: number;
  z0: number;
  px: number;
  pz: number;
}

export class Label {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private main = '';
  private sub = '';

  constructor(private readonly black: boolean) {
    const canvas = document.createElement('canvas');
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
  }

  set(main: string, sub: string): void {
    if (main === this.main && sub === this.sub) return;
    this.main = main;
    this.sub = sub;
    this.draw();
  }

  /** Sizes the canvas for a label `width` cm wide on the grid; returns its size in pixels. */
  fit(width: number, grid: PixelGrid): { w: number; h: number } {
    const w = Math.max(1, Math.round(width * grid.px));
    const h = Math.max(1, Math.round(width * LABEL_ASPECT * grid.pz));
    const canvas = this.ctx.canvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      // The GPU copy can't change size in place; disposing makes the next render reallocate it.
      this.texture.dispose();
      this.draw();
    }
    return { w, h };
  }

  private draw(): void {
    const { ctx, main, sub } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.black ? '#f2ece1' : '#2b241e';
    const size = Math.round(((main.length > 3 ? 40 : main.length > 2 ? 48 : 60) / 128) * w);
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillText(main, w / 2, Math.round(h * 0.36));
    if (sub) {
      ctx.fillStyle = this.black ? 'rgba(242,236,225,0.55)' : 'rgba(43,36,30,0.5)';
      ctx.font = `500 ${Math.round((34 / 128) * w)}px ui-monospace, monospace`;
      ctx.fillText(sub, w / 2, Math.round(h * 0.78));
    }
    this.texture.needsUpdate = true;
  }
}
