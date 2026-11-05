// The guitar neck, flat and top-down like the keyboard. Strings run left to right, thinnest at the
// top as in tab, with the open strings left of the nut. Every place whose note is lit gets a dot in
// its light's colour, labelled with the note. Markers sit around the dot: the home ring, the lean
// arrow below it (pointing to the nut for down a half step), the mood star, the next-chord dot.
//
// A press brightens the dot where it was played. A note whose place isn't known goes where it is
// nearest the hand (neck-layout.ts); hints and the backing's notes go there too, without moving it.

import * as THREE from 'three';
import { STRINGS, stringName } from '../presets/tunings.js';
import type { Light, Lights } from '../theory/guide.js';
import { pcOf } from '../theory/pitch.js';
import { COLOURS, GLOW, GUITAR, KEYS } from '../tuning.js';
import type { Shape } from './framing.js';
import type { InstrumentView, PressSource } from './instrument.js';
import { Label, type PixelGrid } from './labels.js';
import {
  follow,
  type NeckColumns,
  neckColumns,
  neckShape,
  nearestPlace,
  type Spot,
  spotId,
  spotOf,
} from './neck-layout.js';
import * as shapes from './shapes.js';

const LIGHT_COLOUR: Record<Light, THREE.Color> = {
  home: new THREE.Color(COLOURS.home),
  land: new THREE.Color(COLOURS.land),
  wander: new THREE.Color(COLOURS.wander),
  lean: new THREE.Color(COLOURS.lean),
  out: new THREE.Color('#000000'),
};
const WHITE = new THREE.Color('#ffffff');
const NEUTRAL = new THREE.Color(COLOURS.ivory);

/** Layer heights: later entries draw on top. */
const Y = {
  board: 0,
  inlay: 0.01,
  wire: 0.02,
  string: 0.03,
  ghost: 0.04,
  dot: 0.05,
  label: 0.06,
  marker: 0.07,
};

/** The lean chevron's half-height at scale 1 (shapes.ts draws it over ±0.42). */
const ARROW_HALF = 0.42;

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];

type Flat = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

function flat(geo: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, y: number): Flat {
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

function basic(colour: string | THREE.Color, extra: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, ...extra });
}

const faded = (colour: string | THREE.Color, opacity = 0) =>
  basic(colour, { transparent: true, opacity, depthWrite: false });

const printed = (label: Label, opacity = 1) =>
  basic('#ffffff', { map: label.texture, transparent: true, opacity, depthWrite: false });

interface Geo extends shapes.Geometries {
  hoop: THREE.BufferGeometry;
}

/** Stretches a flat unit plane over a box. */
function box(m: THREE.Object3D, x0: number, x1: number, z0: number, z1: number): void {
  m.position.x = (x0 + x1) / 2;
  m.position.z = (z0 + z1) / 2;
  m.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, z1 - z0), 1);
}

/** A label `width` cm square, centred on (x, z), one texel per device pixel. */
function fitLabel(mesh: Flat, label: Label, x: number, z: number, width: number, grid: PixelGrid) {
  const { w, h } = label.fit(width, grid);
  mesh.scale.set(w / grid.px, h / grid.pz, 1);
  mesh.position.x = snap(x, w, grid.x0, grid.px);
  mesh.position.z = snap(z, h, grid.z0, grid.pz);
}

function snap(centre: number, size: number, origin: number, perCm: number): number {
  const start = Math.round((centre - origin) * perCm - size / 2);
  return origin + (start + size / 2) / perCm;
}

/** One place on the neck: a string at a fret. */
class Place {
  readonly face: Flat;
  readonly label = new Label(false, true);
  readonly meshes: Flat[];
  private readonly dot: Flat;
  private readonly labelMesh: Flat;
  private readonly ring: Flat;
  private readonly arrow: Flat;
  private readonly star: Flat;
  private readonly nextDot: Flat;
  private readonly homeDot: Flat;
  private readonly touch: Flat;
  private readonly ghostRing: Flat;

  private readonly glow = new THREE.Color();
  private readonly targetGlow = new THREE.Color();
  private readonly colour = new THREE.Color();
  private level = 0;
  private targetLevel = 0;
  private press = 0;
  private ghostLevel = 0;
  private pulse = 0;
  private readonly pressed = new Set<PressSource>();
  private ghosts = 0;
  private size = 1;

  constructor(
    readonly midi: number,
    readonly spot: Spot,
    where: number,
    geo: Geo,
  ) {
    this.face = flat(geo.unit, basic('#000000'), Y.board);
    this.face.visible = false;
    this.face.userData = { midi, where };
    this.dot = flat(geo.disc, faded(NEUTRAL), Y.dot);
    this.labelMesh = flat(geo.unit, printed(this.label), Y.label);
    this.touch = flat(geo.hoop, faded(WHITE), Y.marker);
    this.ghostRing = flat(geo.hoop, faded(WHITE), Y.ghost);
    const marker = (g: THREE.BufferGeometry, colour: string) => {
      const m = flat(g, basic(colour), Y.marker);
      m.visible = false;
      return m;
    };
    this.ring = marker(geo.hoop, COLOURS.home);
    this.arrow = marker(geo.arrow, COLOURS.lean);
    this.star = marker(geo.star, COLOURS.star);
    this.nextDot = marker(geo.dot, COLOURS.nextOnBlack);
    this.homeDot = marker(geo.dot, COLOURS.home);
    this.meshes = [
      this.face,
      this.dot,
      this.labelMesh,
      this.touch,
      this.ghostRing,
      this.ring,
      this.arrow,
      this.star,
      this.nextDot,
      this.homeDot,
    ];
  }

  /** Centred on (x, z), in a cell `cellW` by `cellH`, with a dot `size` across. */
  place(x: number, z: number, cellW: number, cellH: number, size: number, grid: PixelGrid): void {
    this.size = size;
    box(this.face, x - cellW / 2, x + cellW / 2, z - cellH / 2, z + cellH / 2);
    for (const m of [this.dot, this.touch, this.ghostRing, this.ring]) {
      m.position.set(x, m.position.y, z);
    }
    this.dot.scale.setScalar(size);
    this.ring.scale.setScalar(size * 1.18);
    this.ghostRing.scale.setScalar(size * 1.05);
    fitLabel(this.labelMesh, this.label, x, z, size * 0.92, grid);
    // The marker row clears the dot at its pressed size; the arrow is centred on the row.
    const arrow = size * GUITAR.arrowSize;
    const below = z + size * 0.5 * (1 + GUITAR.pressGrow) + GUITAR.markerGap + arrow * ARROW_HALF;
    this.arrow.position.set(x, Y.marker, below);
    this.arrow.scale.set(arrow * Math.sign(this.arrow.scale.x || 1), arrow, 1);
    this.star.position.set(x + size * 0.5, Y.marker, z - size * 0.5);
    this.star.scale.setScalar(size * 0.4);
    this.nextDot.position.set(x + size * 0.55, Y.marker, below);
    this.homeDot.position.set(x - size * 0.55, Y.marker, below);
  }

  setLight(light: Light, leanTo: number, moodNote: boolean, songHome: boolean): void {
    this.targetGlow.copy(light === 'out' ? this.glow : LIGHT_COLOUR[light]);
    this.targetLevel = GLOW[light];
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
    const pressTarget = this.pressed.size > 0 ? 1 : 0;
    const tau = pressTarget > this.press ? KEYS.down : KEYS.up;
    this.press += (pressTarget - this.press) * (1 - Math.exp(-dt / tau));
    const ghostTarget = this.ghosts > 0 ? 1 : 0;
    this.ghostLevel += (ghostTarget - this.ghostLevel) * (1 - Math.exp(-dt / KEYS.up));
    const k = 1 - Math.exp(-dt / KEYS.fade);
    this.glow.lerp(this.targetGlow, k);
    this.level += (this.targetLevel - this.level) * k;
    this.pulse *= Math.exp(-dt / (KEYS.pulse / 3));

    // An unlit place still shows a dot while pressed, in the neutral colour.
    const shown = Math.min(1, Math.max(this.level, this.press, 0.6 * this.pulse));
    this.colour
      .copy(NEUTRAL)
      .lerp(this.glow, Math.min(1, this.level / 0.3))
      .lerp(WHITE, 0.35 * this.press + 0.45 * this.pulse);
    this.dot.material.color.copy(this.colour);
    this.dot.material.opacity = shown;
    this.dot.scale.setScalar(this.size * (1 + GUITAR.pressGrow * this.press));
    this.labelMesh.material.opacity = Math.min(1, shown * 1.3);
    this.touch.material.opacity = this.press;
    this.touch.scale.setScalar(this.size * (1.3 + 0.1 * this.press));
    this.ghostRing.material.opacity = GUITAR.ghost * this.ghostLevel;
  }

  /** Materials go with the neck's; the label's texture is this place's own. */
  dispose(): void {
    this.label.texture.dispose();
  }
}

export class NeckView implements InstrumentView {
  readonly group = new THREE.Group();
  readonly faces: THREE.Object3D[] = [];
  readonly shape: Shape;
  readonly lo: number;
  readonly hi: number;
  private readonly cols: NeckColumns;
  private readonly geo: Geo;
  private readonly places = new Map<number, Place>();
  private readonly board: Flat;
  private readonly nut: Flat;
  private readonly wires: Flat[] = [];
  private readonly strings: Flat[] = [];
  private readonly inlays: { fret: number; between: [number, number]; mesh: Flat }[] = [];
  private readonly names: { label: Label; mesh: Flat }[] = [];
  private readonly numbers: { fret: number; label: Label; mesh: Flat }[] = [];
  private readonly pressedAt = new Map<string, number>();
  private readonly ghosted = new Map<number, number[]>();
  private hand: number = GUITAR.handStart;

  constructor(
    private readonly tuning: readonly number[],
    private readonly frets: number,
  ) {
    const g = GUITAR;
    this.cols = neckColumns(frets);
    this.shape = neckShape(this.cols);
    this.lo = Math.min(...tuning);
    this.hi = Math.max(...tuning) + frets;
    this.geo = { ...shapes.build(), hoop: new THREE.RingGeometry(0.5, 0.58, 48) };
    const geo = this.geo;

    this.board = flat(geo.unit, basic(COLOURS.board), Y.board);
    this.nut = flat(geo.unit, basic(COLOURS.nut), Y.wire);
    this.group.add(this.board, this.nut);
    for (let f = 1; f <= frets; f++) {
      const wire = flat(geo.unit, basic(COLOURS.fret), Y.wire);
      this.wires.push(wire);
      this.group.add(wire);
    }
    for (const fret of [...INLAYS, ...DOUBLE_INLAYS].filter((f) => f <= frets)) {
      const pairs: [number, number][] = DOUBLE_INLAYS.includes(fret)
        ? [
            [1, 2],
            [3, 4],
          ]
        : [[2, 3]];
      for (const between of pairs) {
        const mesh = flat(geo.disc, faded(COLOURS.inlay, g.inlayOpacity), Y.inlay);
        this.inlays.push({ fret, between, mesh });
        this.group.add(mesh);
      }
    }
    tuning.forEach((open, s) => {
      const wound = s < g.wound;
      const string = flat(geo.unit, basic(wound ? COLOURS.wound : COLOURS.plain), Y.string);
      this.strings.push(string);
      const label = new Label(true, true);
      label.set(stringName(open), '');
      const mesh = flat(geo.unit, printed(label), Y.label);
      this.names.push({ label, mesh });
      this.group.add(string, mesh);
    });
    for (const fret of [...INLAYS, ...DOUBLE_INLAYS].filter((f) => f <= frets)) {
      const label = new Label(true, true);
      label.set(String(fret), '');
      const mesh = flat(geo.unit, printed(label, 0.6), Y.label);
      this.numbers.push({ fret, label, mesh });
      this.group.add(mesh);
    }

    tuning.forEach((open, string) => {
      for (let fret = 0; fret <= frets; fret++) {
        const spot = { string, fret };
        const where = spotId(spot, frets);
        const place = new Place(open + fret, spot, where, geo);
        this.places.set(where, place);
        this.faces.push(place.face);
        this.group.add(...place.meshes);
      }
    });
    this.place(this.shape.minLength, { x0: 0, z0: 0, px: 20, pz: 20 });
  }

  place(length: number, grid: PixelGrid): void {
    const g = GUITAR;
    const { cols } = this;
    const spacing = (length - g.numberRow) / STRINGS;
    const top = -length / 2;
    /** Thinnest string at the top, as in tab. */
    const zOf = (s: number) => top + (STRINGS - 1 - s + 0.5) * spacing;
    const z0 = top;
    const z1 = top + STRINGS * spacing;
    const end = cols.wires[cols.wires.length - 1]! + g.overhang;

    box(this.board, cols.nut.x0, end, z0, z1);
    box(this.nut, cols.nut.x0, cols.nut.x1, z0, z1);
    this.wires.forEach((w, i) => {
      const x = cols.wires[i]!;
      box(w, x - g.wireWidth / 2, x + g.wireWidth / 2, z0, z1);
    });
    for (const { fret, between, mesh } of this.inlays) {
      const cell = cols.cells[fret]!;
      mesh.position.set((cell.x0 + cell.x1) / 2, Y.inlay, (zOf(between[0]) + zOf(between[1])) / 2);
      mesh.scale.setScalar(spacing * g.inlaySize);
    }
    this.strings.forEach((m, s) => {
      const gauge = g.gauges[s] ?? g.gauges[g.gauges.length - 1]!;
      box(m, cols.cells[0]!.x0 + 0.2, end, zOf(s) - gauge / 2, zOf(s) + gauge / 2);
    });
    const namesX = (cols.names.x0 + cols.names.x1) / 2;
    const nameSize = Math.min(spacing * 0.7, (cols.names.x1 - cols.names.x0) * 0.95);
    this.names.forEach(({ label, mesh }, s) =>
      fitLabel(mesh, label, namesX, zOf(s), nameSize, grid),
    );
    const numberZ = z1 + g.numberRow / 2;
    for (const { fret, label, mesh } of this.numbers) {
      const cell = cols.cells[fret]!;
      fitLabel(mesh, label, (cell.x0 + cell.x1) / 2, numberZ, g.numberRow * 0.8, grid);
    }

    const narrowest = Math.min(...cols.cells.map((c) => c.x1 - c.x0));
    const size = Math.min(spacing * g.dotShare, narrowest * 0.9, g.dotMax);
    for (const place of this.places.values()) {
      const cell = cols.cells[place.spot.fret]!;
      const x = (cell.x0 + cell.x1) / 2;
      place.place(x, zOf(place.spot.string), cell.x1 - cell.x0, spacing, size, grid);
    }
  }

  /** Nothing to hide: sections end at fret wires, and everything else sits inside a fret. */
  clip(): void {}

  /** At the string names: any note can be played near the nut. */
  sectionFrom(): number {
    return this.cols.names.x0;
  }

  sketch(ctx: CanvasRenderingContext2D, x: (cm: number) => number, h: number): void {
    const g = GUITAR;
    const { cols } = this;
    const band = (x0: number, x1: number, colour: string, y0 = 0, y1 = h) => {
      const a = Math.round(x(x0));
      ctx.fillStyle = colour;
      ctx.fillRect(a, y0, Math.max(1, Math.round(x(x1)) - a), y1 - y0);
    };
    band(cols.nut.x0, cols.wires[this.frets - 1]! + g.overhang, COLOURS.board);
    band(cols.nut.x0, cols.nut.x1, COLOURS.nut);
    for (const wire of cols.wires)
      band(wire - g.wireWidth / 2, wire + g.wireWidth / 2, COLOURS.fret);
    ctx.fillStyle = COLOURS.inlay;
    for (const { fret, between } of this.inlays) {
      const cell = cols.cells[fret]!;
      ctx.beginPath();
      const y = ((between[0] + between[1] + 1) / 2 / STRINGS) * h;
      ctx.arc(x((cell.x0 + cell.x1) / 2), y, Math.max(1.5, h * 0.08), 0, 2 * Math.PI);
      ctx.fill();
    }
    for (let s = 0; s < STRINGS; s++) {
      const y = Math.round(((s + 0.5) / STRINGS) * h);
      band(cols.cells[0]!.x0, cols.wires[this.frets - 1]!, COLOURS.plain, y, y + 1);
    }
  }

  setLights(lights: Lights, songHome: number): void {
    for (const place of this.places.values()) {
      const pc = pcOf(place.midi);
      place.setLight(
        lights.light[pc]!,
        lights.leanTo[pc]!,
        lights.moodNote === pc,
        songHome === pc,
      );
    }
  }

  /** Only the note name: the neck has no room for computer-key caps. */
  setLabels(text: (midi: number) => [string, string]): void {
    for (const place of this.places.values()) place.label.set(text(place.midi)[0], '');
  }

  setNext(has: readonly boolean[] | null): void {
    for (const place of this.places.values()) place.setNext(has?.[pcOf(place.midi)] === true);
  }

  press(midi: number, source: PressSource, down: boolean, where?: number): void {
    const key = `${source}:${midi}`;
    if (!down) {
      const id = this.pressedAt.get(key);
      if (id === undefined) return;
      this.pressedAt.delete(key);
      this.places.get(id)?.setPressed(source, false);
      return;
    }
    const spot = this.spotFor(midi, where);
    if (!spot) return;
    const id = spotId(spot, this.frets);
    this.pressedAt.set(key, id);
    this.places.get(id)?.setPressed(source, true);
    this.hand = follow(this.hand, spot);
  }

  ghost(midi: number, delta: number): void {
    const ids = this.ghosted.get(midi) ?? [];
    if (delta > 0) {
      const spot = this.spotFor(midi);
      if (!spot) return;
      const id = spotId(spot, this.frets);
      ids.push(id);
      this.ghosted.set(midi, ids);
      this.places.get(id)?.ghost(1);
    } else {
      const id = ids.shift();
      if (id !== undefined) this.places.get(id)?.ghost(-1);
    }
  }

  flash(midi: number): void {
    const spot = this.spotFor(midi);
    if (spot) this.places.get(spotId(spot, this.frets))?.flash();
  }

  update(dt: number): void {
    for (const place of this.places.values()) place.update(dt);
  }

  dispose(): void {
    for (const place of this.places.values()) place.dispose();
    for (const { label } of [...this.names, ...this.numbers]) label.texture.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
    shapes.dispose(this.geo);
  }

  /** The place `where` names if it plays `midi`, else the one nearest the hand. */
  private spotFor(midi: number, where?: number): Spot | null {
    if (where !== undefined) {
      const spot = spotOf(where, this.frets);
      if (
        this.tuning[spot.string] !== undefined &&
        this.tuning[spot.string]! + spot.fret === midi
      ) {
        return spot;
      }
    }
    return nearestPlace(midi, this.tuning, this.frets, this.hand);
  }
}
