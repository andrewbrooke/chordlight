// Orthographic top-down view. The keyboard fills the width and its keys stretch to fill the height,
// within KEYS.minLength and maxLength; at the minimum it is fitted by height instead.
//
// The drawing buffer is sized from the canvas's exact device-pixel box rather than CSS size times
// devicePixelRatio: a fractional layout width or a 125% display scale otherwise leaves the buffer a
// fraction of a pixel off, and the browser resamples the whole frame, which blurs small text.

import * as THREE from 'three';
import { COLOURS, KEYS } from '../tuning.js';
import type { KeyboardView } from './keyboard.js';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private keyboard: KeyboardView | null = null;
  /** Device pixels. */
  private width = 0;
  private height = 0;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(COLOURS.background);
    this.camera.position.set(0, 50, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.observe();
  }

  setKeyboard(kb: KeyboardView): void {
    if (this.keyboard) this.scene.remove(this.keyboard.group);
    this.keyboard = kb;
    this.scene.add(kb.group);
    this.fit();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  pick(clientX: number, clientY: number): number | null {
    if (!this.keyboard) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.keyboard.faces, false)[0];
    return hit ? (hit.object.userData['midi'] as number) : null;
  }

  /** Also fires when only the pixel density changes, as on moving to another screen. */
  private observe(): void {
    const canvas = this.renderer.domElement;
    const observer = new ResizeObserver(([entry]) => {
      const exact = entry?.devicePixelContentBoxSize?.[0];
      const rect = canvas.getBoundingClientRect();
      this.width = exact ? exact.inlineSize : Math.round(rect.width * window.devicePixelRatio);
      this.height = exact ? exact.blockSize : Math.round(rect.height * window.devicePixelRatio);
      this.fit();
    });
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      observer.observe(canvas); // Safari
    }
  }

  private fit(): void {
    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0 || !this.keyboard) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const m = KEYS.margin;
    const wide = this.keyboard.width + 2 * m;
    const room = wide / aspect - 2 * m;
    const length = Math.min(KEYS.maxLength, Math.max(KEYS.minLength, room));

    const viewH = Math.max(wide / aspect, length + 2 * m);
    const viewW = viewH * aspect;
    Object.assign(this.camera, {
      left: -viewW / 2,
      right: viewW / 2,
      top: viewH / 2,
      bottom: -viewH / 2,
    });
    this.camera.updateProjectionMatrix();

    this.keyboard.place(length, { x0: -viewW / 2, z0: -viewH / 2, px: w / viewW, pz: h / viewH });
  }
}
