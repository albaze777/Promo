// THE LINE — the film's DNA. One red point with an ember core, dragging a tapered hairline.
// Every scene draws it through this module so it is identical everywhere.
import type * as THREE from 'three';
import { LineBatch, type RGBA } from '../engine/lines';
import { PAL } from '../brand';
import { hexLin, clamp } from '../utils/math';

export const RED = hexLin(PAL.line);
export const EMBER = hexLin(PAL.ember);
export const BONE = hexLin(PAL.bone);
export const ASH = hexLin(PAL.ash);
export const INK = hexLin(PAL.ink);

export const rgba = (c: readonly number[], a = 1, gain = 1): RGBA => [c[0]! * gain, c[1]! * gain, c[2]! * gain, a];

/** Screen-space hand-off positions of the point between scenes (logical px). */
export const HANDOFF = {
  center: [960, 540] as [number, number],
};

export class LineMotif {
  soft: LineBatch;
  hard: LineBatch;
  constructor(cap = 4096) {
    this.soft = new LineBatch(256, { soft: true });
    this.hard = new LineBatch(cap);
  }
  clear() { this.soft.clear(); this.hard.clear(); }

  /** The head. `i` = intensity (0..~1.5), `s` = size multiplier. z for 3D batches. */
  head(x: number, y: number, i = 1, s = 1, z = 0) {
    if (i <= 0.001) return;
    const so = this.soft;
    so.dot(x, y, 70 * s, rgba(RED, 1, 0.045 * i), z);
    so.dot(x, y, 16 * s, rgba(RED, 1, 0.7 * i), z);
    so.dot(x, y, 9 * s, rgba(EMBER, 1, 1.6 * i), z);
    so.dot(x, y, 3.2 * s, [3.2 * i, 2.6 * i, 2.3 * i, 1], z);
  }

  /**
   * The line behind the head: a polyline (head last). Width tapers toward the tail, brightness fades.
   * `w` = width at the head (px), `gain` = brightness at the head.
   */
  trail(pts: readonly (readonly number[])[], w = 2, gain = 1.4, tailFade = 1, minW = 0.7) {
    const n = pts.length;
    if (n < 2) return;
    this.hard.polyline(
      pts,
      (k) => minW + (w - minW) * k,
      (k) => {
        const a = clamp(1 - (1 - k) * tailFade);
        return rgba(RED, a * a, gain);
      },
    );
  }

  /** A settled, uniform line (e.g. a finished circle) in red. */
  path(pts: readonly (readonly number[])[], w = 1.6, gain = 1, alpha = 1) {
    this.hard.polyline(pts, () => w, () => rgba(RED, alpha, gain));
  }

  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam?: THREE.Camera) {
    this.hard.render(r, out, cam);
    this.soft.render(r, out, cam);
  }
}

/** Points of a circle arc (angles in radians, screen y down). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 128): [number, number][] {
  const pts: [number, number][] = [];
  const steps = Math.max(2, Math.ceil(n * Math.abs(a1 - a0) / (Math.PI * 2)));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
