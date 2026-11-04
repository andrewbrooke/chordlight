// Shared geometry. Keys are unit planes scaled to size, so a resize only rescales meshes.

import * as THREE from 'three';

export interface Geometries {
  unit: THREE.BufferGeometry;
  shaded: THREE.BufferGeometry;
  whiteRail: THREE.BufferGeometry;
  blackRail: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
  arrow: THREE.BufferGeometry;
  star: THREE.BufferGeometry;
  dot: THREE.BufferGeometry;
}

export const LABEL_ASPECT = 1.25;
/** Label widths in cm. */
export const LABEL_WIDTH = { white: 1.9, black: 1.15 };

export function build(): Geometries {
  return {
    unit: new THREE.PlaneGeometry(1, 1),
    shaded: shaded(),
    whiteRail: new THREE.PlaneGeometry(1.8, 0.42),
    blackRail: new THREE.PlaneGeometry(0.8, 0.45),
    ring: new THREE.RingGeometry(0.36, 0.52, 40),
    arrow: arrow(),
    star: star(),
    dot: new THREE.CircleGeometry(0.2, 24),
  };
}

/** Unit plane shaded darker at the back (local +y, which lies flat as -z). */
function shaded(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  const pos = g.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) > 0 ? 0.88 : 1;
    colours.push(v, v, v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return g;
}

/** A chevron like `>`, pointing along +x; flipped, it reads `<`. Stroked as heavily as the ring. */
function arrow(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.12, 0.42);
  s.lineTo(0.3, 0);
  s.lineTo(-0.12, -0.42);
  s.lineTo(-0.34, -0.42);
  s.lineTo(0.08, 0);
  s.lineTo(-0.34, 0.42);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function star(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.48 : 0.2;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
    else s.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function dispose(geo: Geometries): void {
  for (const g of Object.values(geo)) g.dispose();
}
