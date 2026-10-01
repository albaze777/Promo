// Shared state of the world across 02 World and 03 Human: rotation, the touchdown point (where the
// line lands; it lies exactly on the coastline), the sea level, the dive. Pure functions of t.
import * as THREE from 'three';
import { CUE } from '../timeline/cues';
import { R0, orbitPoint, projectEnd } from './orbit';
import { clamp, ease, lerp } from '../utils/math';
import { terrain } from '../utils/noise32';

export const C0: [number, number] = [960, 540];
/** The first mark: a circle. Its centre/radius are shared by Human and Art Evolution. */
export const MARK = { cx: 880, cy: 520, r: 172, startAngle: Math.PI / 3 };
export const MARK_START: [number, number] = [MARK.cx + Math.cos(MARK.startAngle) * MARK.r, MARK.cy + Math.sin(MARK.startAngle) * MARK.r];
export const Z_END = 170;
const TILT = 0.38;

function spinAngle(t: number, phi0: number) {
  const L = CUE.life;
  if (t >= L) return phi0;
  if (t >= L - 1) return phi0 - 0.16 * (L - t) ** 2;
  return phi0 - 0.16 - 0.32 * (L - 1 - t);
}

/** view → body rotation for a spin angle. */
export function rotMatrix(phi: number) {
  const bodyToView = new THREE.Matrix4().makeRotationZ(TILT).multiply(new THREE.Matrix4().makeRotationY(phi));
  return new THREE.Matrix3().setFromMatrix4(bodyToView).transpose();
}

/** View-space normal under a screen point of the undived planet. */
export function viewNormal(px: number, py: number) {
  const qx = (px - C0[0]) / R0, qy = (py - C0[1]) / R0;
  return new THREE.Vector3(qx, -qy, Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy)));
}

/** Touchdown on screen (the orbit's projection at LAND_T). */
export const TOUCH = (() => { const s = projectEnd(orbitPoint(CUE.life)); return [s[0], s[1]] as [number, number]; })();

/** Pick the spin phase so the touchdown point's height makes a balanced coast (sea ≈ 0.5). */
export const WORLD = (() => {
  const nv = viewNormal(TOUCH[0], TOUCH[1]);
  let best = { phi0: 0, sea: 0.5, err: Infinity, land: new THREE.Vector3() };
  for (let k = 0; k < 64; k++) {
    const phi0 = 0.7 + k * 0.05;
    const land = nv.clone().applyMatrix3(rotMatrix(phi0));
    const h = terrain(land.x, land.y, land.z, 13);
    // also prefer a land mass that is mostly land around the point (coast, not an islet)
    const h2 = terrain(land.x * 1.02, land.y, land.z, 6);
    const err = Math.abs(h - 0.5) + Math.abs(h2 - 0.53) * 0.5;
    if (err < best.err) best = { phi0, sea: h, err, land };
  }
  return best;
})();

export const rotAt = (t: number) => rotMatrix(spinAngle(t, WORLD.phi0));

/** Planet disc on screen at t (the dive), and the screen position of the touchdown point. */
export function dive(t: number) {
  const u = clamp((t - CUE.dive) / (CUE.human - CUE.dive));
  let zoom = Math.exp(Math.log(Z_END) * ease.inOutCubic(u));
  if (t > CUE.human) zoom = Z_END * Math.exp(0.06 * (t - CUE.human));
  const k = ease.inOutCubic(clamp((t - CUE.dive) / (CUE.human - CUE.dive)));
  const L: [number, number] = [lerp(TOUCH[0], MARK_START[0], k), lerp(TOUCH[1], MARK_START[1], k)];
  const center: [number, number] = [L[0] - (TOUCH[0] - C0[0]) * zoom, L[1] - (TOUCH[1] - C0[1]) * zoom];
  return { center, radius: R0 * zoom, zoom, touch: L };
}
