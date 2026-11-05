// Orthographic top-down view. The instrument fills the width and stretches to fill the height,
// within its own minLength and maxLength; at the minimum it is fitted by height instead. Where all
// of it would be too small to play, a section of whole keys or frets is shown instead (framing.ts),
// with drawing cut off at its edges, and the host gets the class `windowed`, which makes room for
// the overview strip above the canvas.
//
// Whether to show a section is judged on the host, not the canvas: the strip shrinks the canvas,
// and judging on that could flip the answer back and forth at the edge.
//
// The drawing buffer is sized from the canvas's exact device-pixel box rather than CSS size times
// devicePixelRatio: a fractional layout width or a 125% display scale otherwise leaves the buffer a
// fraction of a pixel off, and the browser resamples the whole frame, which blurs small text.

import * as THREE from 'three';
import { COLOURS, STAGE } from '../tuning.js';
import { frame, widest } from './framing.js';
import type { InstrumentView, Target } from './instrument.js';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Called after every fit, as the section shown moves or resizes. */
  onFit: (() => void) | null = null;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private readonly finger = matchMedia('(pointer: coarse)');
  private view: InstrumentView | null = null;
  /** Device pixels. */
  private width = 0;
  private height = 0;
  private windowed = false;
  /** Where the section was asked to start, in cm across; it starts at the nearest key or fret. */
  private want = -Infinity;
  /** The section shown, and how far it can move, in cm across the instrument. */
  private from = -Infinity;
  private to = Infinity;
  private first = -Infinity;
  private last = Infinity;
  /** Device pixels per cm, and the section's left and right edges on the canvas. */
  private perCm = 1;
  private cut: [number, number] | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    host.appendChild(this.renderer.domElement);
    this.renderer.setClearColor(COLOURS.background);
    this.scene.background = new THREE.Color(COLOURS.background);
    this.camera.position.set(0, 50, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.observe();
    new ResizeObserver(() => this.decide()).observe(host);
    this.finger.addEventListener('change', () => {
      this.decide();
      this.fit();
    });
  }

  get instrument(): InstrumentView | null {
    return this.view;
  }

  /** The part of the instrument shown, in cm across it, while it doesn't all fit. */
  get section(): { from: number; to: number } | null {
    return this.windowed && this.view ? { from: this.from, to: this.to } : null;
  }

  setView(view: InstrumentView): void {
    if (this.view) this.scene.remove(this.view.group);
    this.view = view;
    this.scene.add(view.group);
    this.want = -Infinity;
    this.decide();
    this.fit();
  }

  /** Moves the section shown to start at the key or fret nearest `from` cm across the instrument. */
  pan(from: number): void {
    this.want = from;
    this.fit();
  }

  /** Moves the section shown by `px` CSS pixels' worth of the stage, a key or fret at a time. */
  nudge(px: number): void {
    // Held to the ends, so scrolling past one doesn't bank movement that has to be scrolled back.
    const want = this.want + (px * devicePixelRatio) / this.perCm;
    this.pan(Math.min(this.last, Math.max(this.first, want)));
  }

  render(): void {
    const r = this.renderer;
    r.setScissorTest(false);
    if (this.cut) {
      r.clear();
      const [a, b] = this.cut;
      r.setScissor(a, 0, b - a, this.height);
      r.setScissorTest(true);
    }
    r.render(this.scene, this.camera);
  }

  pick(clientX: number, clientY: number): Target | null {
    if (!this.view) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.view.faces, false);
    const hit = hits.find((h) => this.shows(h));
    return hit ? (hit.object.userData as Target) : null;
  }

  /** Whether a hit lands on something drawn: inside the section, and not on a key it hides. */
  private shows(hit: THREE.Intersection): boolean {
    if (this.cut && (hit.point.x < this.from || hit.point.x > this.to)) return false;
    // Only the parents: the neck's pick faces are invisible themselves.
    for (let o = hit.object.parent; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  /** Also fires when only the pixel density changes, as on moving to another screen. */
  private observe(): void {
    const canvas = this.renderer.domElement;
    const observer = new ResizeObserver(([entry]) => {
      const exact = entry?.devicePixelContentBoxSize?.[0];
      const rect = canvas.getBoundingClientRect();
      this.width = exact ? exact.inlineSize : Math.round(rect.width * window.devicePixelRatio);
      this.height = exact ? exact.blockSize : Math.round(rect.height * window.devicePixelRatio);
      if (this.width > 0 && this.height > 0) this.renderer.setSize(this.width, this.height, false);
      this.fit();
    });
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      observer.observe(canvas); // Safari
    }
  }

  /** The narrowest a target may be drawn, in device pixels. */
  private target(): number {
    return (this.finger.matches ? STAGE.finger : STAGE.mouse) * devicePixelRatio;
  }

  private decide(): void {
    const view = this.view;
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!view || w === 0 || h === 0) return;
    const dpr = devicePixelRatio;
    const windowed = widest(view.shape, w * dpr, h * dpr, this.target()) < view.shape.width;
    if (windowed === this.windowed) return;
    this.windowed = windowed;
    this.host.classList.toggle('windowed', windowed);
    this.fit();
  }

  private fit(): void {
    const { width: w, height: h, view } = this;
    if (w === 0 || h === 0 || !view) return;
    const { shape } = view;
    const shown = this.windowed ? widest(shape, w, h, this.target()) : shape.width;
    const f = frame(shape, w, h, shown, this.want);
    ({ from: this.from, to: this.to, first: this.first, last: this.last } = f);
    this.perCm = w / f.viewW;
    const edge = (x: number) => Math.round((x - f.x0) * this.perCm);
    this.cut = this.windowed ? [edge(f.from), edge(f.to)] : null;
    view.clip(this.cut ? f.from : -Infinity, this.cut ? f.to : Infinity);
    Object.assign(this.camera, {
      left: f.x0,
      right: f.x0 + f.viewW,
      top: f.viewH / 2,
      bottom: -f.viewH / 2,
    });
    this.camera.updateProjectionMatrix();
    view.place(f.length, { x0: f.x0, z0: -f.viewH / 2, px: this.perCm, pz: h / f.viewH });
    this.onFit?.();
  }
}
