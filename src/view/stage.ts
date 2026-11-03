// Orthographic top-down view. The keyboard fills the width and its keys stretch to fill the height,
// within KEYS.minLength and maxLength; at the minimum it is fitted by height instead.

import * as THREE from 'three';
import { COLOURS, KEYS } from '../tuning.js';
import type { KeyboardView } from './keyboard.js';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private keyboard: KeyboardView | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(COLOURS.background);
    this.camera.position.set(0, 50, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    new ResizeObserver(() => this.fit()).observe(host);
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

  private fit(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0 || !this.keyboard) return;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const m = KEYS.margin;
    const wide = this.keyboard.width + 2 * m;
    const room = wide / aspect - 2 * m;
    const length = Math.min(KEYS.maxLength, Math.max(KEYS.minLength, room));
    this.keyboard.place(length);

    const viewH = Math.max(wide / aspect, length + 2 * m);
    const viewW = viewH * aspect;
    Object.assign(this.camera, {
      left: -viewW / 2,
      right: viewW / 2,
      top: viewH / 2,
      bottom: -viewH / 2,
    });
    this.camera.updateProjectionMatrix();
  }
}
