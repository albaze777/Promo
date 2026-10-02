// The walking figure of 03a Evolution: one capsule rig whose proportions, posture and gait morph continuously
// from a knuckle-walking ape (m = 0) through a hunched hominid (m = 1) to an upright human (m = 2).
// Pure functions of (m, gait phase, reach); the scene places it on screen and the topo shader turns the
// capsules into a contour relief (the same language as the hand). Also used by the wheel panel's people.
import { clamp, lerp, ease, smoothstep } from '../utils/math';

export type P2 = [number, number];
/** A capsule from a to b with radii ra, rb (figure units: y up, ground at 0, human height ≈ 1), with the
 * smoothing (k, figure units; negative = decal) and material of shaders/relief.ts MAT. */
export interface Bone { a: P2; b: P2; ra: number; rb: number; k: number; mat: number }

// materials (shaders/relief.ts MAT)
const SKIN = 1, HORN = 2, MOUTH = 12, NAIL = 20, EYE = 3, FUR = 4, CLOTH = 7, HAIR = 8, DARK = 9, PELT = 17, OCHRE = 18, EYE_H = 19;

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
  /** how the upright form dresses (ignored on the ape) */
  look?: Look;
}

/** What a person wears and how they look: these only appear as the figure becomes human. */
export interface Look {
  /** a beard along the jaw */
  beard?: boolean;
  /** hair down to the shoulders (else a short cap) */
  long?: boolean;
  /** the loincloth is a spotted pelt (else leather in the accent colour) */
  pelt?: boolean;
  /** a pelt strap across the chest */
  strap?: boolean;
  /** a necklace of bone beads */
  beads?: boolean;
  /** red-ochre paint: a stripe on the cheek */
  paint?: boolean;
}
export const LOOK_DEFAULT: Look = { paint: true, pelt: true };

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
  const push = (a: P2, b: P2, ra: number, rb: number, mat = FUR, k = 0.012) => { if (ra > 1e-5) bones.push({ a: U(a), b: U([b[0] + 1e-4, b[1]]), ra, rb, k, mat }); };
  const perp = (d: P2): P2 => [-d[1], d[0]];
  /** rotate a direction counter-clockwise (figure units, y up) */
  const rot = (d: P2, a: number): P2 => [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];
  const unit = (a: P2, b: P2): P2 => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const q = P.quad;
  const human = smoothstep(1.35, 1.9, m);           // hair, cloth, a nose: what the upright form gains
  // limbs, far side first: thigh, calf muscle, shin, heel, foot, toes; deltoid, upper arm, forearm, palm, fingers, thumb
  const limbs = (i: number, s: number) => {
    const l = legs[i]!, a = arms[i]!;
    // (perp of the shin, which points down, is the front of the leg)
    const dS = unit(l.knee, l.ankle), front = perp(dS), back: P2 = [-front[0], -front[1]];
    // the upright leg tapers: a full thigh to a slim knee, a calf that swells behind the shin, a narrow ankle
    push(l.hip, l.knee, (0.052 + 0.012 * q) * s, (0.03 + 0.014 * q) * s);
    // the thigh's front muscle and the hamstring behind it
    const dTh = unit(l.hip, l.knee), thF = perp(dTh);
    push(add(add(l.hip, dTh, 0.06), thF, 0.012), add(add(l.hip, dTh, 0.17), thF, 0.008), 0.042 * s, 0.03 * s, FUR, 0.014);
    // the calf behind the shin, the kneecap in front of it
    // (the calf starts below the knee, swells in its upper third and tapers into the Achilles tendon)
    push(add(l.knee, dS, 0.045), add(add(l.knee, dS, 0.095), back, 0.01 + 0.004 * (1 - q)), (0.026 + 0.012 * q) * s, (0.03 + 0.008 * q) * s, FUR, 0.02);
    push(add(add(l.knee, dS, 0.095), back, 0.01 + 0.004 * (1 - q)), add(add(l.knee, dS, 0.19), back, 0.006), (0.03 + 0.008 * q) * s, (0.018 + 0.006 * q) * s, FUR, 0.02);
    push(add(l.knee, front, 0.022), add(add(l.knee, front, 0.022), dS, 0.012), 0.017 * s, 0.015 * s, FUR, 0.008);
    push(l.knee, l.ankle, (0.027 + 0.013 * q) * s, (0.016 + 0.006 * q) * s);
    const dF = unit(l.ankle, l.toe), fUp = perp(dF);           // (perp of the foot, which points forward, is up)
    const heel = add(add(l.ankle, dF, -0.016), [0, -1], 0.008);
    // (the top of the foot and the back of the hand carry the coat, so on the ape only toes, fingers and soles
    // are bare; on the human the coat is skin anyway)
    push(add(l.ankle, dF, -0.012), l.toe, 0.024 * s, 0.017 * s, FUR, 0.008);                       // the instep
    push(add(l.ankle, dF, -0.016), heel, 0.021 * s, 0.02 * s, FUR, 0.006);                           // the heel
    push(add(heel, dF, 0.01), add(add(l.toe, fUp, -0.01), dF, -0.012), 0.013 * s, 0.014 * s, SKIN, 0.008);   // the sole
    push(add(add(l.toe, fUp, -0.006), dF, -0.006), add(add(l.toe, fUp, -0.006), dF, -0.005), 0.016 * s, 0.016 * s, SKIN, 0.005);   // the ball of the foot
    // the ankle bone, and the Achilles tendon from the calf down to the heel
    push(add(l.ankle, front, 0.004), add(add(l.ankle, front, 0.004), dS, 0.004), 0.02 * s, 0.019 * s, SKIN, 0.006);
    push(add(add(l.ankle, dS, -0.07), back, 0.012), add(heel, [0, 1], 0.012), 0.012 * s, 0.013 * s, SKIN, 0.008);
    // the toes: the big toe, and two smaller rows behind it (in depth), each a little shorter and higher
    push(l.toe, add(add(l.toe, dF, 0.02), fUp, -0.002), 0.0125 * s, 0.0098 * s, SKIN, 0.003);
    push(add(l.toe, fUp, 0.004), add(add(l.toe, dF, 0.013), fUp, 0.002), 0.0095 * s, 0.0078 * s, SKIN, 0.0025);
    push(add(add(l.toe, fUp, 0.007), dF, -0.006), add(add(l.toe, dF, 0.004), fUp, 0.005), 0.0085 * s, 0.007 * s, SKIN, 0.0025);
    if (human > 0.5) push(add(add(l.toe, dF, 0.014), fUp, 0.0055), add(add(l.toe, dF, 0.02), fUp, 0.004), 0.0048 * s, 0.0042 * s, NAIL, -1);   // the big toenail
    // the ape's grasping big toe, set apart from the others
    if (q > 0.05) { const bt = add(l.ankle, dF, 0.035); push(bt, add(add(bt, dF, 0.03), [0, -1], 0.012), 0.012 * q * s, 0.009 * q * s, SKIN, 0.004); }
    push(a.sh, add(a.sh, unit(a.sh, a.el), 0.01), (0.043 + 0.012 * q) * s, (0.04 + 0.01 * q) * s);
    push(a.sh, a.el, (0.034 + 0.02 * q) * s, (0.027 + 0.01 * q) * s);
    push(a.el, a.wr, (0.028 + 0.012 * q) * s, (0.02 + 0.006 * q) * s);
    const dH = unit(a.wr, a.tip), side = perp(dH);
    const palmEnd = add(a.wr, dH, 0.042 + 0.01 * q);
    push(a.wr, palmEnd, (0.02 + 0.004 * q) * s, (0.019 + 0.005 * q) * s, FUR, 0.006);
    push(add(add(a.wr, dH, 0.012), side, 0.011), add(add(a.wr, dH, 0.022), side, 0.012), 0.013 * s, 0.012 * s, SKIN, 0.005);   // the thumb's pad
    push(add(palmEnd, side, -0.012), add(palmEnd, side, 0.012), (0.0105 + 0.003 * q) * s, (0.0105 + 0.003 * q) * s, SKIN, 0.003);   // the knuckles
    // the fingers: three segments each, curling by pose — loosely when the arm swings, round a grip, folded
    // under the palm for the ape's knuckle-walk; on the reaching hand the index stays straight and the rest
    // close into a fist. curl > 0 turns them toward the palm (clockwise on a forward arm).
    const reaching = i === 0 && reach > 0.3, ov = i === 0 ? o.armNear : o.armFar;
    const curlDir = ov || reaching || q > 0.5 ? -1 : 1;
    const curl = ov ? 0.95 : lerp(0.25, 1.15, q);
    const Lf = Math.max(0.03, Math.hypot(a.tip[0] - palmEnd[0], a.tip[1] - palmEnd[1]));
    let nailAt: [P2, P2] | null = null;
    for (let f = 0; f < 4; f++) {
      const off = (-0.011 + f * 0.0075) * (1 + 1.2 * q), L = Lf * (1 - 0.08 * Math.abs(f - 1.3));   // (the ape's knuckles fan out on the ground)
      const c = reaching ? (f === 0 ? 0 : 1.1) : curl;
      const r0 = (0.0085 + 0.003 * q) * s;
      const b0 = add(palmEnd, side, off * 0.8);
      const p1 = add(b0, rot(dH, curlDir * c * 0.45), L * 0.45);
      const p2 = add(p1, rot(dH, curlDir * c * 1.35), L * 0.3);
      const p3 = add(p2, rot(dH, curlDir * c * 2.2), L * 0.25);
      push(b0, p1, r0, r0 * 0.88, SKIN, 0.003); push(p1, p2, r0 * 0.88, r0 * 0.76, SKIN, 0.0025); push(p2, p3, r0 * 0.76, r0 * 0.66, SKIN, 0.002);
      if (f === 0) nailAt = [p2, p3];
    }
    // the thumb: two segments from the base of the palm, closing over the fingers in a grip
    const tb = add(a.wr, side, 0.014), tc = ov || reaching ? 0.9 : 0.3;
    const t1 = add(tb, rot(dH, curlDir * -0.35), 0.024), t2 = add(t1, rot(dH, curlDir * (tc - 0.3)), 0.02);
    push(tb, t1, 0.0098 * s, 0.0085 * s, SKIN, 0.004); push(t1, t2, 0.0085 * s, 0.0072 * s, SKIN, 0.003);
    // nails on the human hand: the nearest finger and the thumb
    if (human > 0.5 && nailAt) {
      const [n0, n1] = nailAt as [P2, P2];
      const nd = unit(n0, n1), nb = perp(nd);
      const ns = curlDir > 0 ? -1 : 1;                       // the back of the finger: away from the curl
      push(add(add(n1, nd, -0.006), nb, ns * 0.0035), add(add(n1, nd, -0.001), nb, ns * 0.0035), 0.0042 * s, 0.0038 * s, NAIL, -1);
      const td = unit(t1, t2), tn = perp(td);
      push(add(add(t2, td, -0.005), tn, ns * 0.003), add(add(t2, td, -0.001), tn, ns * 0.003), 0.004 * s, 0.0036 * s, NAIL, -1);
    }
    // a plaited band round the near wrist (with the beads)
    if (i === 0 && human > 0.01 && (o.look ?? LOOK_DEFAULT).beads) { const dA = unit(a.el, a.wr); push(add(a.wr, dA, -0.026), add(a.wr, dA, -0.012), 0.026 * s * human, 0.025 * s * human, CLOTH, -1); }
  };
  limbs(1, 0.92);
  // torso: pelvis, belly, rib cage, buttock; the shoulders' bulk
  const dT = unit(pelvis, chest), bk = perp(dT);
  push(pelvis, add(pelvis, dT, 0.001), P.rPelvis, P.rPelvis, FUR, 0.03);
  push(pelvis, add(pelvis, dT, P.torso * 0.5), P.rPelvis * 0.98, (P.rPelvis + P.rChest) * 0.5, FUR, 0.03);
  push(add(pelvis, dT, P.torso * 0.45), chest, (P.rPelvis + P.rChest) * 0.5, P.rChest, FUR, 0.03);
  push(add(add(pelvis, bk, -0.035), dT, -0.01), add(add(pelvis, bk, -0.035), dT, -0.009), 0.055 - 0.012 * (1 - q), 0.055 - 0.012 * (1 - q), FUR, 0.02);   // the belly
  const up01 = 1 - q;                                  // what the upright forms gain: buttocks, a chest, a navel
  if (up01 > 0.05) {
    push(add(add(pelvis, bk, 0.03), dT, -0.015), add(add(pelvis, bk, 0.03), dT, -0.014), 0.05 * up01, 0.05 * up01, FUR, 0.02);
    push(add(add(chest, dT, -0.035), bk, -P.rChest * 0.5), add(add(chest, dT, -0.05), bk, -P.rChest * 0.52), 0.045 * up01, 0.04 * up01, FUR, 0.02);
    push(add(add(chest, dT, -0.01), bk, P.rChest * 0.45), add(add(chest, dT, -0.07), bk, P.rChest * 0.42), 0.04 * up01, 0.035 * up01, FUR, 0.02);   // the shoulder blade
  }
  // loincloth on the upright form
  const look = o.look ?? LOOK_DEFAULT;
  if (human > 0.01) push(add(pelvis, dT, 0.01), add(add(pelvis, dT, -0.09), bk, 0.012), P.rPelvis * 1.05 * human, P.rPelvis * 0.8 * human, look.pelt ? PELT : CLOTH, 0.006);
  // a strap across the chest, from the far shoulder to the near hip (a decal: it does not change the silhouette)
  if (human > 0.01 && look.strap) push(add(add(chest, bk, 0.03), dT, -0.02), add(add(pelvis, bk, -0.045), dT, 0.06), 0.013 * human, 0.012 * human, PELT, -1);
  // neck and head: cranium, face and muzzle, jaw, brow, nose, ear, eye, hair
  push(chest, neckTop, 0.04, 0.034, FUR, 0.015);
  const dN: P2 = [Math.sin(nAng), Math.cos(nAng)];
  const fwd: P2 = [Math.sin(nAng + 0.9), Math.cos(nAng + 0.9)];
  const down: P2 = [Math.sin(nAng + 2.2), Math.cos(nAng + 2.2)];
  push(head, add(head, dN, 0.001), P.headR, P.headR, FUR, 0.01);
  const face0 = add(head, fwd, P.headR * 0.25);
  const faceEnd = add(head, fwd, P.headR * (0.55 + 0.6 * P.muzzle));
  push(face0, faceEnd, P.headR * (0.62 + 0.2 * P.muzzle), P.headR * (0.34 + 0.22 * P.muzzle), SKIN, 0.008);
  push(add(face0, down, P.headR * 0.35), add(faceEnd, down, P.headR * 0.28), P.headR * (0.38 + 0.12 * P.muzzle), P.headR * (0.26 + 0.1 * P.muzzle), SKIN, 0.008);
  const browD: P2 = [Math.sin(nAng + 0.35), Math.cos(nAng + 0.35)];
  push(add(head, browD, P.headR * 0.55), add(head, browD, P.headR * (0.6 + 0.35 * P.brow)), P.headR * 0.35, P.headR * 0.3 * (0.4 + 0.6 * P.brow), SKIN, 0.006);
  const noseP = add(add(head, fwd, P.headR * (0.95 + 0.25 * P.muzzle)), down, P.headR * 0.05);
  push(noseP, add(noseP, down, P.headR * 0.22), P.headR * (0.1 + 0.12 * human), P.headR * (0.14 + 0.08 * human), SKIN, 0.004);
  const earP = add(head, [-fwd[0], -fwd[1]], P.headR * 0.15);
  push(earP, add(earP, down, P.headR * 0.12), P.headR * (0.2 + 0.06 * q), P.headR * (0.16 + 0.05 * q), SKIN, 0.003);
  if (human > 0.5) push(add(earP, down, P.headR * 0.03), add(earP, down, P.headR * 0.1), P.headR * 0.06, P.headR * 0.045, DARK, -1);   // the ear's hollow
  // nostrils: on the tip of the ape's muzzle, under the human's nose
  const rEnd = P.headR * (0.34 + 0.22 * P.muzzle);
  const nosA = add(add(faceEnd, fwd, rEnd * 0.55), dN, rEnd * 0.2), nosH = add(add(noseP, down, P.headR * 0.2), fwd, P.headR * 0.02);
  const nos: P2 = [lerp(nosA[0], nosH[0], human), lerp(nosA[1], nosH[1], human)];
  push(nos, add(nos, fwd, P.headR * 0.05), P.headR * (0.06 - 0.02 * human), P.headR * (0.05 - 0.02 * human), DARK, -1);
  // the ape's mouth: a long line between the muzzle and the jaw
  if (human < 0.99) {
    const m0 = add(add(faceEnd, down, P.headR * 0.3), fwd, -P.headR * 0.35), m1 = add(add(faceEnd, down, P.headR * 0.22), fwd, rEnd * 0.45);
    push(m0, m1, P.headR * 0.02 * (1 - human), P.headR * 0.018 * (1 - human), DARK, -1);
  }

  const eyeP = add(add(head, fwd, P.headR * 0.72), browD, P.headR * 0.12);
  push(eyeP, add(eyeP, fwd, 1e-4), P.headR * 0.12, P.headR * 0.12, human > 0.5 ? EYE_H : EYE, -1);
  // hair: a cap over the crown and the back of the head, clear of the face
  const crown = add(add(head, dN, P.headR * 0.2), fwd, -P.headR * 0.2), nape = add(add(head, dN, -P.headR * 0.22), fwd, -P.headR * 0.42);
  if (human > 0.01) push(crown, nape, P.headR * 0.93 * human, P.headR * 0.7 * human, HAIR, 0.006);
  if (human > 0.01 && look.long) push(nape, add(add(nape, dN, -P.headR * 1.25), fwd, -P.headR * 0.12), P.headR * 0.5 * human, P.headR * 0.32 * human, HAIR, 0.006);
  // face: a brow of hair above the eye, the mouth's crease, a beard along the jaw
  if (human > 0.01) {
    const bw = add(add(eyeP, browD, P.headR * 0.2), fwd, -P.headR * 0.12);
    push(bw, add(bw, fwd, P.headR * 0.3), P.headR * 0.075 * human, P.headR * 0.06 * human, HAIR, -1);
    const mo = add(add(head, fwd, P.headR * 0.98), down, P.headR * 0.42);
    push(add(mo, down, P.headR * 0.05), add(add(mo, fwd, -P.headR * 0.18), down, P.headR * 0.03), P.headR * 0.07 * human, P.headR * 0.05 * human, MOUTH, -1);   // the lower lip
    push(mo, add(add(mo, fwd, -P.headR * 0.22), dN, P.headR * 0.02), P.headR * 0.045 * human, P.headR * 0.03 * human, DARK, -1);
    // the navel (a decal on the belly)
    const nv = add(add(pelvis, dT, 0.075), bk, -(P.rPelvis + P.rChest) * 0.5 * 0.9);
    push(nv, add(nv, dT, -0.004), 0.0055 * human, 0.0045 * human, DARK, -1);
    if (look.beard) {
      const ch = add(add(head, fwd, P.headR * 0.6), down, P.headR * 0.84);
      push(add(add(head, down, P.headR * 0.6), fwd, -P.headR * 0.2), ch, P.headR * 0.28 * human, P.headR * 0.25 * human, HAIR, 0.006);
    }
    if (look.paint) { const ck = add(add(head, fwd, P.headR * 0.55), down, P.headR * 0.12); push(ck, add(ck, fwd, P.headR * 0.4), P.headR * 0.07 * human, P.headR * 0.06 * human, OCHRE, -1); }
    // a necklace: beads from the front of the neck down to the breastbone, along the front of the chest
    if (look.beads) for (let b = 0; b < 4; b++) { const k = b / 3, bp = add(add(chest, dT, lerp(0.01, -0.065, k)), [-bk[0], -bk[1]], lerp(0.045, 0.078, k)); push(bp, add(bp, dT, 1e-3), 0.01 * human, 0.01 * human, HORN, -1); }
  }
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
export const NB = 112;

export const _ = { smoothstep };
