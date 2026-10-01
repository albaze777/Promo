// Shared geometry for the Origin → World hand-off. The universe's matter converges on C; Origin's camera
// ends at CAM_END looking at C; World draws the planet exactly where that sphere projects. The line's
// orbit is defined once here, in 3D, and both scenes project it with the same end camera.
import * as THREE from 'three';
import { CUE } from '../timeline/cues';
import { clamp, ease, lerp, TAU } from '../utils/math';

export const FOV = 50;
export const C = new THREE.Vector3(0, 0, -520);
export const RP = 20; // planet radius (world units)
export const CAM_DIST = 100;
export const CAM_END = new THREE.Vector3(C.x, C.y, C.z + CAM_DIST);
export const FOCAL = 540 / Math.tan(((FOV / 2) * Math.PI) / 180);
/** Apparent radius of the planet (px) from the end camera. */
export const R0 = (FOCAL * RP) / Math.sqrt(CAM_DIST * CAM_DIST - RP * RP);

export function makeCamera() {
  const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 6000);
  return cam;
}
const endCam = makeCamera();
endCam.position.copy(CAM_END);
endCam.lookAt(C);
endCam.updateMatrixWorld();
endCam.updateProjectionMatrix();

const tmp = new THREE.Vector3();
/** Project a world point to logical px with a camera. Returns [x, y, depth(w)]. */
export function project(cam: THREE.Camera, p: THREE.Vector3): [number, number, number] {
  tmp.copy(p).applyMatrix4(cam.matrixWorldInverse);
  const w = -tmp.z;
  tmp.applyMatrix4((cam as THREE.PerspectiveCamera).projectionMatrix);
  return [(tmp.x * 0.5 + 0.5) * 1920, (0.5 - tmp.y * 0.5) * 1080, w];
}
export const projectEnd = (p: THREE.Vector3) => project(endCam, p);

// ---- the orbit -------------------------------------------------------------------------------
const INCL = 0.42; // radians: tilt of the orbital plane toward camera
const ROLL = -0.22;
export const ORBIT_W = 2.35; // rad/s
const LAND_T = CUE.life; // the line touches down at 4.0
/** Angle on the orbit at time t: chosen so that at LAND_T the line is on the near side, lower right. */
export const orbitAngle = (t: number) => Math.PI * 0.5 - 0.55 + ORBIT_W * (t - LAND_T) * 1.0;

/** Orbit radius over time: wide orbit, then a spiral descent onto the surface at LAND_T. */
export function orbitRadius(t: number) {
  const r0 = RP * 1.75;
  if (t < CUE.land) return r0;
  const k = ease.inCubic(clamp((t - CUE.land) / (LAND_T - CUE.land)));
  return lerp(r0, RP * 1.0, k);
}

/** 3D position of the line's head on its orbit around C at time t. */
export function orbitPoint(t: number, out = new THREE.Vector3()) {
  const a = orbitAngle(t), r = orbitRadius(t);
  // descent also flattens the inclination so the touch-down is on the visible face
  const k = clamp((t - CUE.land) / (LAND_T - CUE.land));
  const incl = lerp(INCL, 0.1, ease.inOutCubic(k));
  out.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  out.applyAxisAngle(new THREE.Vector3(1, 0, 0), incl);
  out.applyAxisAngle(new THREE.Vector3(0, 0, 1), ROLL);
  return out.add(C);
}

/** Is a point on the orbit behind the planet (hidden) from the end camera? */
export function occluded(p: THREE.Vector3) {
  // ray from camera to p intersects sphere before reaching p?
  const d = tmp.copy(p).sub(CAM_END);
  const L = d.length();
  d.divideScalar(L);
  const oc = CAM_END.clone().sub(C);
  const b = oc.dot(d), c = oc.lengthSq() - RP * RP;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t0 = -b - Math.sqrt(disc);
  return t0 > 0 && t0 < L - 0.05;
}

export const TAU_ = TAU;
