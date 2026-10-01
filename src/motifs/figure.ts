// The walking figure of 03a Evolution: one capsule rig whose proportions, posture and gait morph continuously
// from a knuckle-walking ape (m = 0) through a hunched hominid (m = 1) to an upright human (m = 2).
// Pure functions of (m, gait phase, reach); the scene places it on screen and the topo shader turns the
// capsules into a contour relief (the same language as the hand). Also used by the wheel panel's people.
import { clamp, lerp, ease, smoothstep } from '../utils/math';

export type P2 = [number, number];
/** A capsule from a to b with radii ra, rb (figure units: y up, ground at 0, human height ≈ 1). */
export interface Bone { a: P2; b: P2; ra: number; rb: number }

interface Params {
  thigh: number; shin: number; foot: number; armU: number; armF: number; hand: number;
  torso: number; torsoAng: number; rPelvis: number; rChest: number;
  neck: number; neckAng: number; headR: number; muzzle: number; brow: number;
  kneeBase: number; hipSwing: number; kneeSwing: number;
  armBase: number; armSwing: number; elbowBase: number; armPhase: number; quad: number; stride: number;
}

const APE: Params = {
  thigh: 0.15, shin: 0.14, foot: 0.08, armU: 0.2, armF: 0.19, hand: 0.055,
  torso: 0.33, torsoAng: 0.98, rPelvis: 0.092, rChest: 0.135,
  neck: 0.035, neckAng: 0.45, headR: 0.078, muzzle: 1.0, brow: 1,
  kneeBase: 0.85, hipSwing: 0.5, kneeSwing: 0.5,
  armBase: 0.05, armSwing: 0.4, elbowBase: 0.1, armPhase: Math.PI * 0.5, quad: 1, stride: 0.55,
};
const HOMINID: Params = {
  thigh: 0.21, shin: 0.2, foot: 0.075, armU: 0.19, armF: 0.18, hand: 0.06,
  torso: 0.29, torsoAng: 0.42, rPelvis: 0.078, rChest: 0.1,
  neck: 0.05, neckAng: 0.38, headR: 0.061, muzzle: 0.45, brow: 0.6,
  kneeBase: 0.36, hipSwing: 0.4, kneeSwing: 0.5,
  armBase: 0.22, armSwing: 0.3, elbowBase: 0.3, armPhase: Math.PI, quad: 0, stride: 0.62,
};
const HUMAN: Params = {
  thigh: 0.245, shin: 0.235, foot: 0.075, armU: 0.175, armF: 0.152, hand: 0.066,
  torso: 0.29, torsoAng: 0.03, rPelvis: 0.072, rChest: 0.088,
  neck: 0.06, neckAng: 0.08, headR: 0.06, muzzle: 0.06, brow: 0,
  kneeBase: 0.06, hipSwing: 0.36, kneeSwing: 0.55,
  armBase: 0.04, armSwing: 0.3, elbowBase: 0.18, armPhase: Math.PI, quad: 0, stride: 0.75,
};

function mixP(a: Params, b: Params, k: number): Params {
  const o = {} as Params;
  for (const key of Object.keys(a) as (keyof Params)[]) o[key] = lerp(a[key], b[key], k);
  return o;
}
/** Proportions and posture at morph m ∈ [0, 2] (smooth through the hominid). */
export function params(m: number): Params {
  m = clamp(m, 0, 2);
  return m <= 1 ? mixP(APE, HOMINID, ease.inOutSine(m)) : mixP(HOMINID, HUMAN, ease.inOutSine(m - 1));
}
export const AVG_STRIDE = 0.64;

const dir = (ang: number): P2 => [Math.sin(ang), -Math.cos(ang)]; // angle from straight down, forward (+x) positive
const add = (p: P2, d: P2, s: number): P2 => [p[0] + d[0] * s, p[1] + d[1] * s];

export interface Pose {
  bones: Bone[];
  /** near hand (the line rides here), fingertip of the near hand, head centre */
  hand: P2; tip: P2; head: P2;
  /** bounding box (figure units, includes radii) */
  box: [number, number, number, number];
}

/**
 * The figure at morph m, gait phase phi (radians), gait amplitude amp (0 = standing), reach (0..1: the near
 * arm extends forward-down at REACH_ANG with the index finger out, the body leans in).
 */
export interface PoseOpts {
  /** 0..1: kneel on the far knee, near foot planted forward */
  kneel?: number;
  /** extra forward lean of the torso (rad) */
  lean?: number;
  /** arm overrides: [shoulder angle from straight down (forward +), elbow flex] */
  armNear?: [number, number];
  armFar?: [number, number];
}

export function pose(m: number, phi: number, amp = 1, reach = 0, o: PoseOpts = {}): Pose {
  const P = params(m);
  const bones: Bone[] = [];
  const legs: { hip: P2; knee: P2; ankle: P2; toe: P2 }[] = [];
  const pelvis: P2 = [0, 0];
  const kneel = o.kneel ?? 0;
  const lean = P.torsoAng + 0.16 * reach + (o.lean ?? 0);
  const chest = add(pelvis, [Math.sin(lean), Math.cos(lean)], P.torso);
  const shoulder = add(chest, [Math.sin(lean), Math.cos(lean)], -0.02);
  for (let i = 0; i < 2; i++) {
    const ph = phi + Math.PI * i;
    const crouch = 0.22 * reach * (i === 0 ? 1 : 0.7);
    const a = P.hipSwing * amp * Math.sin(ph) + crouch * 0.6 * (i === 0 ? 1 : -0.4);
    const kn = P.kneeBase + crouch + P.kneeSwing * amp * Math.max(0, Math.cos(ph)) ** 1.5;
    const hip = pelvis;
    const knee = add(hip, dir(a), P.thigh);
    const ankle = add(knee, dir(a - kn), P.shin);
    let toe = add(ankle, dir(Math.PI / 2 - 0.25 + 0.3 * amp * Math.max(0, Math.cos(ph))), P.foot);
    if (kneel > 0) {
      // near leg: thigh forward, shin down, foot flat; far leg: knee on the ground, shin back along it
      const ka = i === 0 ? lerp(a, 1.35, kneel) : lerp(a, 0.05, kneel);
      const kk = i === 0 ? lerp(kn, 1.35, kneel) : lerp(kn, 1.62, kneel);
      const k2 = add(hip, dir(ka), P.thigh);
      const a2 = add(k2, dir(ka - kk), P.shin);
      legs.push({ hip, knee: k2, ankle: a2, toe: add(a2, dir(i === 0 ? Math.PI / 2 - 0.1 : -Math.PI / 2 + 0.3), P.foot) });
      continue;
    }
    legs.push({ hip, knee, ankle, toe });
  }
  const arms: { sh: P2; el: P2; wr: P2; tip: P2 }[] = [];
  for (let i = 0; i < 2; i++) {
    const ph = phi + Math.PI * i + P.armPhase;
    let a = P.armBase + P.armSwing * amp * Math.sin(ph);
    let el = P.elbowBase + (P.quad * 0.35 + 0.15) * amp * Math.max(0, Math.cos(ph)) ** 2;
    let hd = 0.25 - 0.6 * P.quad; // hand angle relative to forearm
    if (i === 0 && reach > 0) {
      const r = ease.inOutCubic(reach);
      a = lerp(a, REACH_ANG, r); el = lerp(el, 0.02, r); hd = lerp(hd, 0, r);
    }
    const ov = i === 0 ? o.armNear : o.armFar;
    if (ov) { a = ov[0]; el = ov[1]; hd = 0.1; }
    const sh = shoulder;
    const elb = add(sh, dir(a), P.armU);
    const wr = add(elb, dir(a + el), P.armF);
    const tip = add(wr, dir(a + el + hd), P.hand + 0.035 * reach * (i === 0 ? 1 : 0));
    arms.push({ sh, el: elb, wr, tip });
  }
  // head: forward and low on the ape, balanced over the spine on the human
  const nAng = lean + P.neckAng - 0.25 * reach;
  const neckTop = add(chest, [Math.sin(nAng), Math.cos(nAng)], P.neck + P.headR * 0.6);
  const head = add(neckTop, [Math.sin(nAng), Math.cos(nAng)], P.headR * 0.55);
  // ground contact: the lowest foot (and, on all fours, the knuckles) touches y = 0
  let low = Infinity;
  for (const l of legs) low = Math.min(low, l.ankle[1] - 0.02, l.toe[1] - 0.012);
  for (const a of arms) low = Math.min(low, a.tip[1] - 0.015 + (1 - P.quad) * 2);
  const up = -low;
  const U = (p: P2): P2 => [p[0], p[1] + up];
  const push = (a: P2, b: P2, ra: number, rb: number) => bones.push({ a: U(a), b: U([b[0] + 1e-4, b[1]]), ra, rb });
  // far limbs first (the shader treats all bones alike; order only matters for readability)
  const limbs = (i: number, s: number) => {
    const l = legs[i]!, a = arms[i]!;
    const q = P.quad;
    push(l.hip, l.knee, (0.05 + 0.012 * q) * s, (0.04 + 0.006 * q) * s);
    push(l.knee, l.ankle, (0.037 + 0.006 * q) * s, 0.026 * s);
    push(l.ankle, l.toe, 0.024 * s, 0.017 * s);
    push(a.sh, a.el, (0.036 + 0.02 * q) * s, (0.029 + 0.01 * q) * s);
    push(a.el, a.wr, (0.029 + 0.012 * q) * s, (0.022 + 0.006 * q) * s);
    push(a.wr, a.tip, 0.021 * s, (0.012 + 0.005 * P.quad) * s);
  };
  limbs(1, 0.92);
  push(pelvis, chest, P.rPelvis, P.rChest);
  push(chest, neckTop, 0.04, 0.034);
  push(head, head, P.headR, P.headR);
  // muzzle / jaw (ape), brow ridge
  const fwd: P2 = [Math.sin(nAng + 0.9), Math.cos(nAng + 0.9)];
  push(head, add(head, fwd, P.headR * (0.4 + 0.6 * P.muzzle)), P.headR * (0.55 + 0.25 * P.muzzle), P.headR * (0.32 + 0.22 * P.muzzle));
  push(add(head, [Math.sin(nAng + 0.35), Math.cos(nAng + 0.35)], P.headR * 0.55), add(head, [Math.sin(nAng + 0.35), Math.cos(nAng + 0.35)], P.headR * (0.6 + 0.35 * P.brow)), P.headR * 0.35, P.headR * 0.3 * (0.4 + 0.6 * P.brow));
  limbs(0, 1);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of bones) {
    const r = Math.max(b.ra, b.rb);
    x0 = Math.min(x0, b.a[0] - r, b.b[0] - r); x1 = Math.max(x1, b.a[0] + r, b.b[0] + r);
    y0 = Math.min(y0, b.a[1] - r, b.b[1] - r); y1 = Math.max(y1, b.a[1] + r, b.b[1] + r);
  }
  return { bones, hand: U(arms[0]!.wr), tip: U(arms[0]!.tip), head: U(head), box: [x0, y0, x1, y1] };
}

/** Reach direction of the near arm (from straight down, forward positive): 30° below horizontal. */
export const REACH_ANG = Math.PI / 2 - Math.PI / 6;
export const NB = 18;

export const _ = { smoothstep };
