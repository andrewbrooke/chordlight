// Per-key label textures. A canvas is redrawn only when its text changes.

import * as THREE from 'three';
import { LABEL_ASPECT } from './shapes.js';

/** Canvas width in pixels; enough for a large key on a high-density screen. */
const SIZE = 192;

export class Label {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private text = '';

  constructor(private readonly black: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE * LABEL_ASPECT;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  set(main: string, sub: string): void {
    const text = `${main}|${sub}`;
    if (text === this.text) return;
    this.text = text;
    const { ctx } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.black ? '#f2ece1' : '#2b241e';
    const size = (main.length > 3 ? 40 : main.length > 2 ? 48 : 60) * (SIZE / 128);
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillText(main, w / 2, h * 0.36);
    if (sub) {
      ctx.fillStyle = this.black ? 'rgba(242,236,225,0.55)' : 'rgba(43,36,30,0.5)';
      ctx.font = `500 ${34 * (SIZE / 128)}px ui-monospace, monospace`;
      ctx.fillText(sub, w / 2, h * 0.78);
    }
    this.texture.needsUpdate = true;
  }
}
