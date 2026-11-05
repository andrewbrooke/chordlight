// Orthographic top-down view. The instrument fills the width and stretches to fill the height,
// within its own minLength and maxLength; at the minimum it is fitted by height instead.
//
// The drawing buffer is sized from the canvas's exact device-pixel box rather than CSS size times
// devicePixelRatio: a fractional layout width or a 125% display scale otherwise leaves the buffer a
// fraction of a pixel off, and the browser resamples the whole frame, which blurs small text.

import * as THREE from 'three';
import { COLOURS, KEYS } from '../tuning.js';
import type { InstrumentView, Target } from './instrument.js';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private view: InstrumentView | null = null;
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

  setView(view: InstrumentView): void {
    if (this.view) this.scene.remove(this.view.group);
    this.view = view;
    this.scene.add(view.group);
    this.fit();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  pick(clientX: number, clientY: number): Target | null {
    if (!this.view) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.view.faces, false)[0];
    return hit ? (hit.object.userData as Target) : null;
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
    const view = this.view;
    if (w === 0 || h === 0 || !view) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const m = KEYS.margin;
    const wide = view.width + 2 * m;
    const room = wide / aspect - 2 * m;
    const length = Math.min(view.maxLength, Math.max(view.minLength, room));

    const viewH = Math.max(wide / aspect, length + 2 * m);
    const viewW = viewH * aspect;
    Object.assign(this.camera, {
      left: -viewW / 2,
      right: viewW / 2,
      top: viewH / 2,
      bottom: -viewH / 2,
    });
    this.camera.updateProjectionMatrix();

    view.place(length, { x0: -viewW / 2, z0: -viewH / 2, px: w / viewW, pz: h / viewH });
  }
}
