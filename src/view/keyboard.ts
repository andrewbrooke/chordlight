// Flat, top-down keyboard. Depth is implied by a front lip on every key, plus a lighter top and a
// drop shadow on black keys; a press shrinks the lip and darkens the key. A light is a rail near the key's front plus
// a marker for some (a ring on home, an arrow on lean). The stage sets the key length; below
// KEYS.decorLength the markings shrink with it, since they have to fit in front of the black keys.
//
// The mood star shares the dot row: it only shows with no chord sounding, the dots only with one.

import * as THREE from 'three';
import type { Light, Lights } from '../theory/guide.js';
import { pcOf } from '../theory/pitch.js';
import { COLOURS, GLOW, KEYS } from '../tuning.js';
import type { Shape } from './framing.js';
import type { InstrumentView, PressSource } from './instrument.js';
import { Label, type PixelGrid } from './labels.js';
import { keyboardShape, layoutKeys } from './layout.js';
import * as shapes from './shapes.js';

const LIGHT_COLOUR: Record<Light, THREE.Color> = {
  home: new THREE.Color(COLOURS.home),
  land: new THREE.Color(COLOURS.land),
  wander: new THREE.Color(COLOURS.wander),
  lean: new THREE.Color(COLOURS.lean),
  out: new THREE.Color('#000000'),
};
const LIGHT_COLOUR_ON_WHITE: Record<Light, THREE.Color> = {
  ...LIGHT_COLOUR,
  home: new THREE.Color(COLOURS.homeOnWhite),
};
const WHITE = new THREE.Color('#ffffff');

/** Positions in cm back from each key's front edge. */
const SPOTS = {
  white: { rail: 1.3, label: 3.55, marker: 5.6, next: 6.45 },
  black: { rail: 1.15, label: 2.45, marker: 4, next: 5 },
};

/** Layer heights: later entries draw on top. */
const Y = {
  white: { face: 0, lip: 0.01, rail: 0.02, label: 0.03, marker: 0.04 },
  black: { shadow: 0.1, face: 0.11, top: 0.12, lip: 0.13, rail: 0.14, label: 0.15, marker: 0.16 },
};

type Flat = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

function flat(geo: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, y: number): Flat {
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

function basic(colour: string, extra: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, ...extra });
}

class KeyView {
  readonly group = new THREE.Group();
  readonly face: Flat;
  readonly label: Label;
  private readonly top: Flat | null;
  private readonly lip: Flat;
  private readonly shadow: Flat | null;
  private readonly rail: Flat;
  private readonly ring: Flat;
  private readonly arrow: Flat;
  private readonly star: Flat;
  private readonly nextDot: Flat;
  private readonly homeDot: Flat;
  private readonly labelMesh: Flat;
  private readonly lights: Record<Light, THREE.Color>;

  private readonly glow = new THREE.Color();
  private readonly targetGlow = new THREE.Color();
  private railLevel = 0;
  private targetRail = 0;
  private press = 0;
  private pulse = 0;
  private readonly pressed = new Set<PressSource>();
  private ghosts = 0;
  private front = 0;
  private back = 0;
  private lipFull = 0;

  constructor(
    readonly midi: number,
    readonly black: boolean,
    x: number,
    geo: shapes.Geometries,
  ) {
    this.group.position.x = x;
    this.lights = black ? LIGHT_COLOUR : LIGHT_COLOUR_ON_WHITE;
    const y = black ? Y.black : Y.white;
    const width = black ? KEYS.black : KEYS.white - KEYS.gap;

    this.face = flat(
      black ? geo.unit : geo.shaded,
      basic(black ? COLOURS.ebony : COLOURS.ivory, { vertexColors: !black }),
      y.face,
    );
    this.face.scale.x = width;
    this.face.userData = { midi };
    this.lip = flat(geo.unit, basic(black ? COLOURS.ebonyLip : COLOURS.ivoryLip), y.lip);
    this.lip.scale.x = black ? width - 0.3 : width;
    this.top = black
      ? flat(geo.shaded, basic(COLOURS.ebonyTop, { vertexColors: true }), Y.black.top)
      : null;
    if (this.top) this.top.scale.x = width - 0.36;
    this.shadow = black
      ? flat(
          geo.unit,
          basic('#000000', { transparent: true, opacity: 0.35, depthWrite: false }),
          Y.black.shadow,
        )
      : null;
    if (this.shadow) {
      this.shadow.scale.x = width + 0.1;
      this.shadow.position.x = KEYS.shadow * 0.6;
    }

    this.rail = flat(
      black ? geo.blackRail : geo.whiteRail,
      basic('#000000', { transparent: true, opacity: 0, depthWrite: false }),
      y.rail,
    );
    this.label = new Label(black);
    this.labelMesh = flat(
      geo.unit,
      basic('#ffffff', { map: this.label.texture, transparent: true, depthWrite: false }),
      y.label,
    );
    const marker = (g: THREE.BufferGeometry, colour: string) => {
      const m = flat(g, basic(colour), y.marker);
      m.visible = false;
      return m;
    };
    const home = black ? COLOURS.home : COLOURS.homeOnWhite;
    this.ring = marker(geo.ring, home);
    this.arrow = marker(geo.arrow, COLOURS.lean);
    this.star = marker(geo.star, COLOURS.star);
    this.nextDot = marker(geo.dot, black ? COLOURS.nextOnBlack : COLOURS.nextOnWhite);
    this.homeDot = marker(geo.dot, home);

    this.group.add(this.face, this.lip, this.rail, this.labelMesh);
    this.group.add(this.ring, this.arrow, this.star, this.nextDot, this.homeDot);
    if (this.top) this.group.add(this.top);
    if (this.shadow) this.group.add(this.shadow);
  }

  place(length: number, grid: PixelGrid): void {
    const k = Math.min(1, length / KEYS.decorLength);
    this.back = -length / 2;
    this.front = this.black ? this.back + length * KEYS.blackRatio : length / 2;
    this.lipFull = (this.black ? KEYS.lipBlack : KEYS.lipWhite) * k;
    span(this.face, this.back, this.front);
    if (this.top) span(this.top, this.back + 0.1, this.front - this.lipFull);
    if (this.shadow) span(this.shadow, this.back, this.front + KEYS.shadow);
    const s = this.black ? SPOTS.black : SPOTS.white;
    const at = (m: THREE.Object3D, fromFront: number) =>
      (m.position.z = this.front - fromFront * k);
    at(this.rail, s.rail);
    // Only the rail's depth shrinks: its width is the light, and the key is as wide as ever.
    this.rail.scale.y = k;
    at(this.labelMesh, s.label);
    this.fitLabel(grid, k);
    const size = (this.black ? 0.75 : 1) * k;
    for (const m of [this.ring, this.star, this.nextDot, this.homeDot]) m.scale.setScalar(size);
    this.arrow.scale.set(Math.sign(this.arrow.scale.x) * size, size, size);
    for (const m of [this.ring, this.arrow]) at(m, s.marker);
    at(this.star, s.next);
    at(this.nextDot, s.next);
    at(this.homeDot, this.black ? s.next + 0.75 : s.next);
    if (!this.black) {
      this.nextDot.position.x = -0.45 * k;
      this.homeDot.position.x = 0.45 * k;
    }
    this.layLip();
  }

  setLight(light: Light, leanTo: number, moodNote: boolean, songHome: boolean): void {
    this.targetGlow.copy(light === 'out' ? this.glow : this.lights[light]);
    this.targetRail = GLOW[light];
    this.ring.visible = light === 'home';
    this.arrow.visible = light === 'lean' && leanTo !== 0;
    this.arrow.scale.x = Math.abs(this.arrow.scale.x) * (leanTo < 0 ? -1 : 1);
    this.star.visible = moodNote && light !== 'home';
    this.homeDot.visible = songHome;
  }

  setNext(on: boolean): void {
    this.nextDot.visible = on;
  }

  setPressed(source: PressSource, down: boolean): void {
    if (down) this.pressed.add(source);
    else this.pressed.delete(source);
  }

  ghost(delta: number): void {
    this.ghosts = Math.max(0, this.ghosts + delta);
  }

  flash(): void {
    this.pulse = 1;
  }

  update(dt: number): void {
    const target = this.pressed.size > 0 ? 1 : this.ghosts > 0 ? KEYS.ghost : 0;
    const tau = target > this.press ? KEYS.down : KEYS.up;
    this.press += (target - this.press) * (1 - Math.exp(-dt / tau));
    this.layLip();

    const k = 1 - Math.exp(-dt / KEYS.fade);
    this.glow.lerp(this.targetGlow, k);
    this.railLevel += (this.targetRail - this.railLevel) * k;
    this.pulse *= Math.exp(-dt / (KEYS.pulse / 3));

    const rail = Math.min(1, this.railLevel * (1 + 0.25 * this.press) + 0.5 * this.pulse);
    this.rail.material.color.copy(this.glow).lerp(WHITE, 0.45 * this.pulse);
    this.rail.material.opacity = rail;

    const dim = 1 - KEYS.pressDim * this.press;
    if (this.top) {
      shade(this.face, COLOURS.ebony, dim);
      shade(this.top, COLOURS.ebonyTop, dim);
      shade(this.lip, COLOURS.ebonyLip, dim);
    } else {
      shade(this.face, COLOURS.ivory, dim);
      shade(this.lip, COLOURS.ivoryLip, dim);
    }
  }

  /** One texel per device pixel, with the label's corner on a pixel corner. */
  private fitLabel(grid: PixelGrid, k: number): void {
    const { w, h } = this.label.fit(shapes.LABEL_WIDTH[this.black ? 'black' : 'white'] * k, grid);
    const m = this.labelMesh;
    const x = this.group.position.x;
    m.scale.set(w / grid.px, h / grid.pz, 1);
    m.position.x = snap(x, w, grid.x0, grid.px) - x;
    m.position.z = snap(m.position.z, h, grid.z0, grid.pz);
  }

  private layLip(): void {
    const h = this.lipFull * (1 - (1 - KEYS.pressedLip) * this.press);
    span(this.lip, this.front - h, this.front);
  }

  dispose(): void {
    this.label.texture.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
  }
}

/** Stretches a flat unit plane between two z values. */
function span(m: THREE.Object3D, back: number, front: number): void {
  m.position.z = (back + front) / 2;
  m.scale.y = Math.max(0.001, front - back);
}

/** Moves a centre so a span `size` pixels across starts on a pixel boundary. */
function snap(centre: number, size: number, origin: number, perCm: number): number {
  const start = Math.round((centre - origin) * perCm - size / 2);
  return origin + (start + size / 2) / perCm;
}

function shade(m: Flat, base: string, dim: number): void {
  m.material.color.set(base).multiplyScalar(dim);
}

export class KeyboardView implements InstrumentView {
  readonly group = new THREE.Group();
  readonly shape: Shape;
  readonly faces: THREE.Object3D[] = [];
  private readonly keys = new Map<number, KeyView>();
  private readonly geo: shapes.Geometries;

  constructor(
    readonly lo: number,
    readonly hi: number,
  ) {
    const { spots, width } = layoutKeys(lo, hi);
    this.shape = keyboardShape(width);
    this.geo = shapes.build();
    for (const spot of spots) {
      const key = new KeyView(spot.midi, spot.black, spot.x, this.geo);
      this.keys.set(spot.midi, key);
      this.faces.push(key.face);
      this.group.add(key.group);
    }
    this.place(20, { x0: 0, z0: 0, px: 20, pz: 20 });
  }

  place(length: number, grid: PixelGrid): void {
    for (const key of this.keys.values()) key.place(length, grid);
  }

  /** A black key on the edge of a section would be cut in half, so it goes. */
  clip(from: number, to: number): void {
    const half = KEYS.black / 2 + 1e-6;
    for (const key of this.keys.values()) {
      const x = key.group.position.x;
      key.group.visible = !key.black || (x - half >= from && x + half <= to);
    }
  }

  /** At the white key that is `lowest`, or the one below it. */
  sectionFrom(lowest: number): number {
    for (let m = lowest; m >= this.lo; m--) {
      const key = this.keys.get(m);
      if (key && !key.black) return key.group.position.x - KEYS.white / 2;
    }
    return -Infinity;
  }

  sketch(ctx: CanvasRenderingContext2D, x: (cm: number) => number, h: number): void {
    const keys = [...this.keys.values()];
    const box = (centre: number, width: number, height: number) => {
      const a = Math.round(x(centre - width / 2));
      ctx.fillRect(a, 0, Math.max(1, Math.round(x(centre + width / 2)) - a), height);
    };
    ctx.fillStyle = COLOURS.ivory;
    for (const key of keys) if (!key.black) box(key.group.position.x, KEYS.white - KEYS.gap, h);
    ctx.fillStyle = COLOURS.ebony;
    const tall = Math.round(h * KEYS.blackRatio);
    for (const key of keys) if (key.black) box(key.group.position.x, KEYS.black, tall);
  }

  setLights(lights: Lights, songHome: number): void {
    for (const key of this.keys.values()) {
      const pc = pcOf(key.midi);
      key.setLight(lights.light[pc]!, lights.leanTo[pc]!, lights.moodNote === pc, songHome === pc);
    }
  }

  setLabels(text: (midi: number) => [string, string]): void {
    for (const key of this.keys.values()) key.label.set(...text(key.midi));
  }

  setNext(has: readonly boolean[] | null): void {
    for (const key of this.keys.values()) key.setNext(has?.[pcOf(key.midi)] === true);
  }

  press(midi: number, source: PressSource, down: boolean): void {
    this.keys.get(midi)?.setPressed(source, down);
  }

  ghost(midi: number, delta: number): void {
    this.keys.get(midi)?.ghost(delta);
  }

  flash(midi: number): void {
    this.keys.get(midi)?.flash();
  }

  update(dt: number): void {
    for (const key of this.keys.values()) key.update(dt);
  }

  dispose(): void {
    for (const key of this.keys.values()) key.dispose();
    shapes.dispose(this.geo);
  }
}
