// 05c TOWARD AI — a panel scene, hosted by the gallery.
// A drawing board (ink, a faint engineering grid, bone hairlines, red joints). The camera travels along a
// baseline while the line draws the history of making: a hand axe, a hammer, a pulley; gears that mesh and
// turn; a chip whose traces carry ones and zeros drawn as geometry (a bar, a ring); then three robots built
// part by part on construction guides — a biped, a wheeled one, an arm. The arm's hand, an echo of the
// human hand, draws the circle of the first mark.
import * as THREE from 'three';
import { PanelScene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { LineBatch, type RGBA } from '../engine/lines';
import { LineMotif, RED, BONE, ASH, rgba, arc } from '../motifs/line';
import { bodyCommon, bodyGLSL, PartArray, boxOf, MAT, type Part } from '../shaders/relief';
import { MARK } from '../motifs/world';
import { CUE } from '../timeline/cues';
import { clamp, ease, keys, lerp, smoothstep, TAU, catmull, polyLengths, type V2 } from '../utils/math';

const T0 = CUE.aiIn, GEARS = CUE.gears, CIRC = CUE.circuits, ROBOTS = CUE.robots, HAND = CUE.robotHand, OUT = CUE.aiOut;
const BASE = 860;                              // the baseline (world y)
// parts per robot (each robot is its own group with its own bounding box: a pixel only walks the robot near it)
const G0 = 0, N0 = 104, G1 = 104, N1 = 72, G2 = 176, N2 = 88;
const NBONES = G2 + N2;
const R3: V2 = [2980, BASE];                   // the arm's base
const SHOULDER: V2 = [R3[0], BASE - 222];
const CIRCLE = { c: [3232, 528] as V2, r: 92 };
const DRAW0 = HAND + 0.05, DRAW1 = OUT - 0.1;

interface Item { pts: V2[]; t0: number; t1: number; w: number; col: RGBA; pen?: boolean }

/** Camera: world → screen = (w − x)·s + centre (y about the baseline's frame). */
function camAt(t: number) {
  const x = keys(t, [[T0, 520], [T0 + 1.9, 640, ease.inOutSine], [GEARS - 0.1, 1290, ease.inOutCubic], [CIRC - 0.15, 1330, ease.linear], [CIRC + 0.1, 1950, ease.inOutCubic],
    [ROBOTS - 0.1, 1990, ease.linear], [ROBOTS + 0.2, 2690, ease.inOutCubic], [HAND - 0.3, 2830, ease.linear], [HAND + 0.2, 3120, ease.inOutCubic], [OUT, 3150, ease.linear]]);
  const s = keys(t, [[T0, 1.3], [HAND - 0.3, 1.3], [HAND + 0.25, 1.72, ease.inOutCubic], [OUT, 1.78, ease.linear]]);
  const y = keys(t, [[T0, 610], [ROBOTS - 0.1, 610], [ROBOTS + 0.2, 640, ease.inOutCubic], [HAND - 0.3, 640], [HAND + 0.25, 570, ease.inOutCubic]]);
  return { x, y, s };
}

const circlePts = (c: V2, r: number, a0 = -Math.PI / 2, n = 96, dir = 1): V2[] => Array.from({ length: n + 1 }, (_, i) => [c[0] + Math.cos(a0 + dir * (i / n) * TAU) * r, c[1] + Math.sin(a0 + dir * (i / n) * TAU) * r] as V2);
function gearPts(c: V2, r: number, teeth: number, rot: number): V2[] {
  const out: V2[] = [];
  const n = teeth * 8;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const ph = ((a * teeth) / TAU) % 1;
    const tooth = ph < 0.18 ? ph / 0.18 : ph < 0.5 ? 1 : ph < 0.68 ? 1 - (ph - 0.5) / 0.18 : 0;
    const rr = r + 9 * tooth;
    out.push([c[0] + Math.cos(a + rot) * rr, c[1] + Math.sin(a + rot) * rr]);
  }
  return out;
}
/** Prefix of a polyline by fraction k (by length), and its end point. */
function prefix(pts: V2[], k: number): { pts: V2[]; end: V2 } {
  if (k <= 0) return { pts: [], end: pts[0]! };
  const L = polyLengths(pts), total = L[L.length - 1]!, s = total * clamp(k);
  const out: V2[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    if (L[i]! <= s) { out.push(pts[i]!); continue; }
    const u = (s - L[i - 1]!) / Math.max(1e-6, L[i]! - L[i - 1]!);
    const e: V2 = [lerp(pts[i - 1]![0], pts[i]![0], u), lerp(pts[i - 1]![1], pts[i]![1], u)];
    out.push(e);
    return { pts: out, end: e };
  }
  return { pts: out, end: pts[pts.length - 1]! };
}

// gears: three that mesh (pitch circles touch), each turns once it is drawn
const GEAR = [
  { c: [1180, 560] as V2, r: 110, teeth: 22 },
  { c: [1350, 500] as V2, r: 70, teeth: 14 },
  { c: [1447, 593] as V2, r: 50, teeth: 10 },
];

export default class SceneTowardAI extends PanelScene {
  bones = new PartArray(NBONES);
  L = new LineBatch(16000);
  dots = new LineBatch(800);
  motif = new LineMotif();
  items: Item[] = [];
  traces: { pts: V2[]; t0: number; t1: number }[] = [];
  pass = new FSPass(/* glsl */ `
    uniform vec2 cam; uniform float camS, t; uniform vec4 rbox[3]; uniform vec3 robK; uniform float r2x;
    ${bodyCommon('mech')}
    ${bodyGLSL('rb', NBONES)}
    void main() {
      vec2 px = FRAG_PX;
      vec2 w = cam + (px - vec2(960.0, 540.0)) / camS;
      const float BASE = ${BASE.toFixed(1)};
      // ---- the drawing board: warm dark card with fibres and stains, under a lamp that hangs over the work ----
      vec3 c = vec3(0.0105, 0.0095, 0.0085);
      float fib = vnoise(vec2(w.x / 40.0, w.y / 2.2)) * 0.5 + vnoise(w / 7.0) * 0.5;
      c *= 0.88 + 0.22 * fib;
      c *= 0.85 + 0.3 * fbm(w / 420.0 + 3.0, 4);                          // stains and wear
      vec2 lamp = vec2(960.0, 380.0);
      float pool = exp(-pow(length((px - lamp) * vec2(0.75, 1.0)) / 820.0, 2.0));
      c *= 0.55 + 1.1 * pool;
      c += vec3(0.012, 0.008, 0.004) * pool;                              // warm lamplight
      // the engineering grid: fine and major lines
      vec2 g = abs(fract(w / 66.0 + 0.5) - 0.5) * 66.0 * camS;
      vec2 g2 = abs(fract(w / 330.0 + 0.5) - 0.5) * 330.0 * camS;
      c += C_BONE * (0.012 * sat(1.0 - min(g.x, g.y)) + 0.02 * sat(1.2 - min(g2.x, g2.y))) * (0.6 + 0.6 * pool);
      // ghost drawings from earlier work, half rubbed out: construction circles with centre marks, arcs with
      // their radius, dimension lines with arrowheads and a scale bar (a few per 700 px cell, on a slower layer)
      vec2 wg = cam * 0.55 + (px - vec2(960.0, 540.0)) / camS + vec2(0.0, 120.0);
      vec2 ci = floor(wg / 700.0);
      vec2 cf = wg - (ci + 0.5) * 700.0;
      float kind = hash12(ci + 7.0);
      vec2 cc = (hash22(ci) - 0.5) * 300.0;
      vec2 q = cf - cc;
      float R = 70.0 + 120.0 * hash12(ci + 3.0);
      float gh = 0.0;
      if (kind < 0.4) {
        gh = pxLine((length(q) - R) * camS, 1.0) + pxLine((length(q) - R * 0.62) * camS, 0.8) * 0.6;
        gh += (pxLine(q.x * camS, 0.8) * step(abs(q.y), R * 1.15) + pxLine(q.y * camS, 0.8) * step(abs(q.x), R * 1.15)) * 0.7;
      } else if (kind < 0.7) {
        float a = atan(q.y, q.x), a0 = hash12(ci + 9.0) * 6.28;
        gh = pxLine((length(q) - R) * camS, 1.0) * step(mod(a - a0, 6.2832), 2.2);
        vec2 dr = vec2(cos(a0 + 1.1), sin(a0 + 1.1));
        gh += pxLine(abs(dot(q, vec2(-dr.y, dr.x))) * camS, 0.8) * step(0.0, dot(q, dr)) * step(dot(q, dr), R);
      } else {
        // a dimension line with end ticks, arrowheads and a little scale bar of alternating blocks
        float L = R * 1.8;
        gh = pxLine(q.y * camS, 0.9) * step(abs(q.x), L);
        gh += pxLine((abs(q.x) - L) * camS, 0.9) * step(abs(q.y), 18.0);
        float ah = abs(q.x) - (L - 22.0);
        gh += step(0.0, ah) * step(abs(q.y), (22.0 - ah) * 0.35) * step(ah, 22.0) * 0.8;
        vec2 sb = q - vec2(-L * 0.5, 46.0);
        gh += step(abs(sb.y), 4.0) * step(abs(sb.x), 90.0) * step(0.5, fract(sb.x / 30.0)) * 0.7 + pxLine((abs(sb.y) - 4.0) * camS, 0.7) * step(abs(sb.x), 90.0);
      }
      float rub = smoothstep(0.3, 0.7, fbm(wg / 90.0 + ci, 3));         // half rubbed out
      c += C_BONE * 0.06 * gh * rub * (0.5 + 0.7 * pool);
      // pencil smudges and a few registration marks
      c += C_GRAPHITE * 0.01 * smoothstep(0.62, 0.8, fbm(w / 160.0 + 11.0, 4));
      vec2 rm = w - (floor(w / 990.0) + 0.5) * 990.0 + vec2(0.0, 300.0);
      c += C_LINE * 0.08 * (pxLine((length(rm) - 9.0) * camS, 1.0) + (pxLine(rm.x * camS, 0.8) + pxLine(rm.y * camS, 0.8)) * step(length(rm), 16.0));
      // ---- below the baseline: the workbench, a steel edge, a soft floor reflection of the light ----
      if (w.y > BASE) {
        float dy = w.y - BASE;
        vec3 bench = vec3(0.016, 0.0125, 0.01) * (0.8 + 0.4 * vnoise(vec2(w.x / 90.0, dy / 4.0)));
        bench *= 0.9 + 0.2 * vnoise(vec2(w.x / 3.0, dy / 30.0));                     // grain
        bench += vec3(0.02, 0.014, 0.008) * exp(-dy / 30.0) * pool;                    // the light caught in the top
        bench += vec3(0.04, 0.035, 0.03) * exp(-pow(dy - 6.0, 2.0) / 6.0);           // the steel edge strip
        float seam = pxLine((abs(fract(w.x / 520.0 + 0.5) - 0.5) * 520.0) * camS, 1.0) * step(14.0, dy);
        bench *= 1.0 - 0.5 * seam;
        // contact shadows under each robot as it is built
        float sh = 0.0;
        sh += robK.x * exp(-pow((w.x - 2412.0) / 70.0, 2.0)) * exp(-dy / 14.0);
        sh += robK.y * exp(-pow((w.x - r2x) / 60.0, 2.0)) * exp(-dy / 14.0);
        sh += robK.z * exp(-pow((w.x - ${R3[0].toFixed(1)}) / 95.0, 2.0)) * exp(-dy / 14.0);
        bench *= 1.0 - 0.75 * sat(sh);
        c = mix(c, bench, smoothstep(0.0, 1.5 / camS, dy));
      } else {
        // the robots cast soft shadows on the board behind them, offset away from the lamp
        float sh = 0.0;
        sh += robK.x * exp(-pow((w.x - 2440.0) / 40.0, 2.0)) * smoothstep(BASE - 430.0, BASE - 200.0, w.y);
        sh += robK.y * exp(-pow(length(vec2(w.x - r2x - 30.0, w.y - BASE + 150.0)) / 90.0, 2.0));
        c *= 1.0 - 0.3 * sat(sh);
      }
      float base = pxLine((w.y - BASE) * camS, 1.0);
      float tick = step(abs(fract(w.x / 132.0 + 0.5) - 0.5) * 132.0 * camS, 0.6) * step(abs(w.y - BASE - 8.0), 8.0);
      c += C_BONE * 0.22 * (base + tick * 0.6);
      // dust drifting through the lamplight (screen space)
      vec2 dg = (px + vec2(t * 9.0, -t * 14.0)) / 26.0;
      vec2 di = floor(dg);
      vec2 dp = (fract(dg) - 0.5 - (hash22(di) - 0.5) * 0.7) * 26.0;
      float mote = step(0.965, hash12(di + 4.0)) * exp(-dot(dp, dp) / 0.9);
      c += vec3(1.0, 0.9, 0.75) * 0.05 * mote * pool * (0.5 + 0.5 * sin(t * 2.0 + hash12(di) * 20.0));
      // the robots: the same relief as every body in the film, in blueprint tones
      vec3 Ld = normalize(vec3(-0.5, -0.65, 0.6));
      Body B = rbBody(px, ${G0}, ${N0}, rbox[0]);
      Body B1 = rbBody(px, ${G1}, ${N1}, rbox[1]); if (B1.d < B.d) B = B1;
      Body B2 = rbBody(px, ${G2}, ${N2}, rbox[2]); if (B2.d < B.d) B = B2;
      // steel; ivory enamel; industrial ochre
      c = bodyShade(c, B, Ld, vec3(1.0, 0.97, 0.92) * 1.1, vec3(0.15, 0.148, 0.145), vec3(0.6, 0.56, 0.48), vec3(0.5, 0.24, 0.035), 0.0, 1.0, C_BONE * 0.85, 6.0, 1.0);
      fragColor = vec4(c, 1.0);
    }`, { cam: { value: new THREE.Vector2() }, camS: { value: 1 }, t: { value: 0 }, rbox: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, robK: { value: new THREE.Vector3() }, r2x: { value: 2690 }, ...this.bones.uniforms('rb') });

  override init() {
    const bone = rgba(BONE, 0.85, 0.75), ash = rgba(ASH, 0.6, 0.6);
    const add = (pts: V2[], t0: number, t1: number, w = 1.4, col = bone, pen = true) => this.items.push({ pts, t0, t1, w, col, pen });
    // a hand axe: teardrop outline, then its flake scars
    const axe = catmull([[300, 858], [250, 800], [236, 720], [262, 660], [300, 640], [338, 660], [364, 720], [350, 800], [300, 858]], 12);
    add(axe, T0 + 0.05, T0 + 0.5);
    for (let k = 0; k < 5; k++) add(catmull([[300 + (k - 2) * 18, 846 - k * 8], [290 + (k - 2) * 8, 760 - k * 14], [300 - (k - 2) * 6, 690 + k * 6]], 6), T0 + 0.45 + k * 0.04, T0 + 0.6 + k * 0.04, 1, ash, false);
    // a hammer
    add([[470, 852], [612, 700], [622, 712], [480, 862], [470, 852]], T0 + 0.6, T0 + 0.95);
    add([[574, 690], [640, 640], [672, 676], [606, 728], [574, 690]], T0 + 0.95, T0 + 1.2);
    // a pulley: beam, wheel (a circle again), rope, weight
    add([[700, 380], [900, 380]], T0 + 1.3, T0 + 1.45);
    add([[800, 380], [800, 430]], T0 + 1.45, T0 + 1.5);
    add(circlePts([800, 470], 40, -Math.PI / 2, 64), T0 + 1.5, T0 + 1.85);
    add([[760, 470], [760, 700], [732, 700], [732, 760], [788, 760], [788, 700], [760, 700]], T0 + 1.85, T0 + 2.1);
    add([[840, 470], [840, 640], [880, 600]], T0 + 2.1, T0 + 2.3, 1.2, ash, false);
    // gears are drawn in render() (they turn); their reveal windows
    // a chip with pins and traces
    const cx = 1950, cy = 560;
    add([[cx - 110, cy - 80], [cx + 110, cy - 80], [cx + 110, cy + 80], [cx - 110, cy + 80], [cx - 110, cy - 80]], CIRC, CIRC + 0.3);
    add(circlePts([cx - 86, cy - 56], 6, 0, 16), CIRC + 0.3, CIRC + 0.35, 1, ash, false);
    for (let k = 0; k < 8; k++) {
      for (const side of [-1, 1]) {
        const y = cy - 63 + k * 18;
        this.items.push({ pts: [[cx + side * 110, y], [cx + side * 124, y]], t0: CIRC + 0.3 + k * 0.02, t1: CIRC + 0.36 + k * 0.02, w: 2.2, col: bone });
        // traces route out with 45° bends
        const x1 = cx + side * (150 + k * 12), y2 = y + (k - 3.5) * 26, x3 = cx + side * (330 + (k % 3) * 40);
        const tr: V2[] = [[cx + side * 124, y], [x1, y], [x1 + side * Math.abs(y2 - y), y2], [x3, y2]];
        this.traces.push({ pts: tr, t0: CIRC + 0.4 + k * 0.05 + (side > 0 ? 0.02 : 0), t1: CIRC + 0.9 + k * 0.05 });
      }
    }
  }

  /** Gear rotation (rad) once drawn; meshing ratios keep the teeth together. */
  gearRot(i: number, t: number) {
    const run = Math.max(0, t - (GEARS + 1.05));
    const w0 = 0.9 * run + 0.25 * run * run;
    const ratio = [1, -GEAR[0]!.r / GEAR[1]!.r, (GEAR[0]!.r / GEAR[1]!.r) * (GEAR[1]!.r / GEAR[2]!.r)][i]!;
    return w0 * ratio + [0, Math.PI / 14, 0.1][i]!;
  }
  gearWin(i: number): [number, number] { return [GEARS + i * 0.35, GEARS + i * 0.35 + 0.38]; }

  // ---- robots ----
  armIK(t: number) {
    // fingertip target: on the circle once drawing, resting at its start before
    const k = ease.inOutSine(clamp((t - DRAW0) / (DRAW1 - DRAW0)));
    const a = MARK.startAngle + MARK.dir * TAU * 0.985 * k;
    const tip: V2 = [CIRCLE.c[0] + Math.cos(a) * CIRCLE.r, CIRCLE.c[1] + Math.sin(a) * CIRCLE.r];
    const handDir = 0.42 + 0.12 * Math.sin(a);
    const HL = 92;
    const wrist: V2 = [tip[0] - Math.cos(handDir) * HL, tip[1] - Math.sin(handDir) * HL];
    const L1 = 200, L2 = 178;
    const dx = wrist[0] - SHOULDER[0], dy = wrist[1] - SHOULDER[1], D = Math.min(L1 + L2 - 1, Math.hypot(dx, dy));
    const base = Math.atan2(dy, dx);
    const ca = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const a1 = base - ca; // elbow up
    const elbow: V2 = [SHOULDER[0] + Math.cos(a1) * L1, SHOULDER[1] + Math.sin(a1) * L1];
    return { tip, wrist, elbow, handDir, k };
  }
  robots(t: number): { caps: Part[]; joints: V2[]; guides: [V2, V2, number][]; split: [number, number] } {
    const caps: Part[] = [], joints: V2[] = [], guides: [V2, V2, number][] = [];
    const M = MAT.METAL, J = MAT.JOINT, DK = MAT.DARK, IV = MAT.PAINT, OC = MAT.PAINT2, BR = MAT.BRASS, LP = MAT.LAMP;
    /** One part, growing in on its construction guide from time t0. */
    const part = (a: V2, b: V2, ra: number, rb: number, t0: number, mat: number = M, k = 3, guide = true) => {
      const g = ease.outBack(clamp((t - t0) / 0.18));
      const gk = clamp((t - (t0 - 0.12)) / 0.12) * (1 - smoothstep(t0 + 0.35, t0 + 0.7, t));
      if (gk > 0 && guide) guides.push([a, b, gk]);
      if (g <= 0) return;
      caps.push({ a, b, ra: ra * g, rb: rb * g, mat, k });
    };
    // a joint: a metal hub in the silhouette, with a red disc on top of whatever limb it sits in
    const joint = (p: V2, r: number, t0: number) => { part(p, [p[0] + 0.01, p[1]], r, r, t0, M, 0, false); part(p, [p[0] + 0.01, p[1]], r * 0.8, r * 0.8, t0, J, -1, false); };
    const off = (a: V2, b: V2, o: number): [V2, V2] => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [[a[0] - dy / L * o, a[1] + dx / L * o], [b[0] - dy / L * o, b[1] + dx / L * o]]; };
    const lerp2 = (a: V2, b: V2, k: number): V2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

    // R1: a slender biped — plated limbs with pistons, a segmented spine, a chest plate with a red core, a visor
    const b0 = ROBOTS;
    const x1 = 2400, sw = Math.sin(t * 1.4) * 4;
    const pel: V2 = [x1 + sw * 0.5, BASE - 212], ch: V2 = [x1 + sw, BASE - 338], hd: V2 = [x1 + sw + 4 * Math.sin(t * 0.9), BASE - 406];
    for (const [ox, k] of [[-12, 0], [12, 0.35]] as const) {
      const hip: V2 = [x1 + ox, BASE - 208], knee: V2 = [x1 + ox + 6, BASE - 112], ank: V2 = [x1 + ox, BASE - 18];
      part([ank[0] - 14, BASE - 8], [ank[0] + 34, BASE - 6], 9, 7, b0 + 0.05 + k, M, 2);
      part([ank[0] + 30, BASE - 7], [ank[0] + 40, BASE - 5], 6, 5, b0 + 0.06 + k, DK, 0, false);
      joint(ank, 8, b0 + 0.08 + k);
      part(knee, ank, 15, 11, b0 + 0.1 + k, IV);
      const [pa, pb] = off(knee, ank, -15); part(lerp2(pa, pb, 0.1), lerp2(pa, pb, 0.85), 3.5, 3, b0 + 0.12 + k, DK, 0, false);
      part(lerp2(pa, pb, 0.08), lerp2(pa, pb, 0.45), 6, 6, b0 + 0.12 + k, M, 0, false);
      joint(knee, 11, b0 + 0.13 + k);
      part([knee[0] + 9, knee[1] - 9], [knee[0] + 11, knee[1] + 5], 8, 7, b0 + 0.135 + k, M, 3, false);          // knee cap
      part([ank[0] - 16, BASE - 12], [ank[0] - 20, BASE - 4], 5, 4, b0 + 0.06 + k, M, 0, false);                 // heel spur
      part(hip, knee, 19, 15, b0 + 0.15 + k, IV);
      part(lerp2(hip, knee, 0.3), lerp2(hip, knee, 0.42), 19.5, 18.5, b0 + 0.16 + k, OC, -1, false);
      joint(hip, 12, b0 + 0.17 + k);
    }
    part([pel[0] - 26, pel[1]], [pel[0] + 26, pel[1]], 19, 19, b0 + 0.2, M, 6);
    part([pel[0], pel[1] - 10], [ch[0], ch[1] + 20], 9, 9, b0 + 0.22, DK, 0, false);
    for (let k = 0; k < 3; k++) { const y = pel[1] - 26 - k * 22; part([pel[0] - 2, y], [pel[0] + 2, y], 15 - k, 15 - k, b0 + 0.24 + k * 0.02, M, 0, false); }
    part([ch[0], ch[1] + 40], [ch[0] + 2, ch[1] - 10], 36, 44, b0 + 0.3, IV, 8);
    part([ch[0] - 30, ch[1] + 22], [ch[0] + 32, ch[1] + 22], 6, 6, b0 + 0.31, OC, -1, false);
    part([ch[0] - 34, ch[1] - 2], [ch[0] - 34, ch[1] + 14], 3, 3, b0 + 0.31, DK, -1, false);
    part([ch[0] + 16, ch[1] + 4], [ch[0] + 17, ch[1] + 4], 22, 22, b0 + 0.32, OC, 4, false);
    part([ch[0] + 22, ch[1] + 6], [ch[0] + 22.01, ch[1] + 6], 6, 6, b0 + 0.34, J, -1, false);
    for (const o of [-7, 7]) part([ch[0] + o, ch[1] - 40], [hd[0] + o * 0.6, hd[1] + 28], 3.5, 3, b0 + 0.36, DK, 0, false);
    joint([hd[0] - 2, hd[1] + 30], 7, b0 + 0.37);
    part([hd[0] - 14, hd[1]], [hd[0] + 18, hd[1] - 2], 26, 23, b0 + 0.4, IV, 6);
    part([hd[0] - 18, hd[1] - 20], [hd[0] + 12, hd[1] - 23], 7, 6, b0 + 0.41, OC, -1, false);
    part([hd[0] + 4, hd[1] - 2], [hd[0] + 30, hd[1] - 3], 8, 7, b0 + 0.42, MAT.GLASS, -1, false);
    part([hd[0] + 22, hd[1] - 3], [hd[0] + 22.01, hd[1] - 3], 4.5, 4.5, b0 + 0.44, LP, -1, false);
    part([hd[0] - 6, hd[1] - 24], [hd[0] - 10, hd[1] - 44], 1.6, 1.2, b0 + 0.45, M, 0, false);
    part([hd[0] - 10, hd[1] - 46], [hd[0] - 10.01, hd[1] - 46], 3, 3, b0 + 0.46, LP, 0, false);
    joint([hd[0] - 10, hd[1] + 2], 6, b0 + 0.43);
    const sh: V2 = [ch[0] + 8, ch[1] + 6], el: V2 = [sh[0] + 26 + 6 * Math.sin(t * 1.4), sh[1] + 90], wr: V2 = [el[0] + 30, el[1] + 74];
    joint(sh, 13, b0 + 0.5);
    part(sh, el, 14, 11, b0 + 0.52, IV);
    joint(el, 9, b0 + 0.54);
    part(el, wr, 11, 9, b0 + 0.56, IV);
    joint(wr, 6, b0 + 0.58);
    const pd: V2 = [wr[0] + 6, wr[1] + 16];
    part(wr, pd, 8, 7, b0 + 0.6, M, 2);
    for (let f = 0; f < 3; f++) { const f1: V2 = [pd[0] + 2 + f * 3, pd[1] + 12], f2: V2 = [f1[0] - 1 + f, f1[1] + 10]; part(pd, f1, 3.5, 3, b0 + 0.62, M, 0, false); part(f1, f2, 3, 2.4, b0 + 0.63, M, 0, false); }

    // R1 detail: a shoulder plate, a hose down the back, chest vents and status lights, a cheek grille, a thumb
    part([sh[0] - 20, sh[1] - 12], [sh[0] + 18, sh[1] - 16], 15, 12, b0 + 0.51, OC, 4, false);
    part([sh[0] - 14, sh[1] - 16], [sh[0] + 12, sh[1] - 19], 2, 2, b0 + 0.51, DK, -1, false);
    { const hz: V2[] = [[ch[0] - 34, ch[1] + 30], [x1 - 30 + sw * 0.7, BASE - 285], [pel[0] - 26, pel[1] - 14]];
      for (let k = 0; k < 2; k++) part(hz[k]!, hz[k + 1]!, 3.2, 3.2, b0 + 0.33, DK, 0, false);
      for (const q of hz) part(q, [q[0] + 0.01, q[1]], 4.2, 4.2, b0 + 0.33, BR, 0, false); }
    for (let k = 0; k < 3; k++) part([ch[0] - 24, ch[1] - 20 + k * 7], [ch[0] - 6, ch[1] - 20 + k * 7], 1.6, 1.6, b0 + 0.31, DK, -1, false);
    for (let k = 0; k < 2; k++) part([ch[0] - 20 + k * 8, ch[1] + 4], [ch[0] - 20 + k * 8 + 0.01, ch[1] + 4], 2.3, 2.3, b0 + 0.33, k ? J : LP, -1, false);
    for (let k = 0; k < 3; k++) part([hd[0] + 6, hd[1] + 9 + k * 4], [hd[0] + 22, hd[1] + 9 + k * 4], 1.1, 1.1, b0 + 0.43, DK, -1, false);
    part(pd, [pd[0] - 9, pd[1] + 9], 3.2, 2.4, b0 + 0.62, M, 0, false);
    const split1 = caps.length;

    // R2: a wheeled one — a sphere on a tyred wheel, a sensor dome with one eye, a gripper arm; rocking
    const b1 = ROBOTS + 0.75;
    const x2 = 2690 + 24 * Math.sin((t - b1) * 1.1);
    const wc: V2 = [x2, BASE - 46], rot = -(x2 - 2690) / 45;
    part(wc, [wc[0] + 0.01, wc[1]], 45, 45, b1 + 0.05, MAT.RUBBER, 0, false);
    part(wc, [wc[0] + 0.01, wc[1]], 22, 22, b1 + 0.08, M, -1, false);
    for (let k = 0; k < 4; k++) { const a = rot + (k * Math.PI) / 2, p: V2 = [wc[0] + Math.cos(a) * 14, wc[1] + Math.sin(a) * 14]; part(p, [p[0] + 0.01, p[1]], 3, 3, b1 + 0.1, DK, -1, false); }
    joint(wc, 6, b1 + 0.1);
    for (const o of [-30, 30]) part([x2 + o, BASE - 110], [x2 + o * 0.4, BASE - 50], 7, 6, b1 + 0.12, BR);
    part([x2, BASE - 156], [x2 + 0.01, BASE - 156], 66, 66, b1 + 0.15, OC, 6);
    part([x2 - 64, BASE - 152], [x2 + 64, BASE - 152], 4, 4, b1 + 0.18, DK, -1, false);
    part([x2 - 60, BASE - 140], [x2 + 60, BASE - 140], 7, 7, b1 + 0.18, IV, -1, false);
    for (let k = 0; k < 4; k++) part([x2 - 34 + k * 9, BASE - 196], [x2 - 34 + k * 9, BASE - 178], 2, 2, b1 + 0.19, DK, -1, false);
    part([x2 + 30, BASE - 186], [x2 + 30.01, BASE - 186], 7, 7, b1 + 0.2, J, -1, false);
    joint([x2, BASE - 230], 9, b1 + 0.25);
    part([x2 - 26, BASE - 262], [x2 + 26, BASE - 262], 21, 21, b1 + 0.3, IV, 4);
    part([x2 + 14, BASE - 264], [x2 + 14.01, BASE - 264], 9, 9, b1 + 0.33, MAT.GLASS, -1, false);
    part([x2 + 15, BASE - 265], [x2 + 15.01, BASE - 265], 4.5, 4.5, b1 + 0.34, LP, -1, false);
    const ra: V2 = [x2 + 52, BASE - 170], re: V2 = [ra[0] + 46, ra[1] + 26 + 10 * Math.sin(t * 2)];
    joint(ra, 10, b1 + 0.36);
    part(ra, re, 11, 9, b1 + 0.38, IV);
    joint(re, 8, b1 + 0.4);
    const gp: V2 = [re[0] + 30, re[1] - 24], op = 0.25 + 0.2 * Math.sin(t * 2.5);
    part(re, gp, 8, 6, b1 + 0.42);
    for (const sgn of [-1, 1]) { const a = Math.atan2(gp[1] - re[1], gp[0] - re[0]) + sgn * op; part(gp, [gp[0] + Math.cos(a) * 18, gp[1] + Math.sin(a) * 18], 4, 2, b1 + 0.44, M, 0, false); }

    // R2 detail: an antenna, a headlamp, an exhaust, a hatch with screws
    part([x2 - 10, BASE - 280], [x2 - 16, BASE - 322], 1.8, 1.3, b1 + 0.31, M, 0, false);
    part([x2 - 16, BASE - 324], [x2 - 16.01, BASE - 324], 3.4, 3.4, b1 + 0.32, LP, 0, false);
    part([x2 + 52, BASE - 196], [x2 + 52.01, BASE - 196], 8, 8, b1 + 0.2, BR, -1, false);
    part([x2 + 52, BASE - 196], [x2 + 52.01, BASE - 196], 4.5, 4.5, b1 + 0.21, LP, -1, false);
    part([x2 - 58, BASE - 180], [x2 - 80, BASE - 206], 5.5, 4.5, b1 + 0.21, BR, 2);
    part([x2 - 80, BASE - 206], [x2 - 81, BASE - 207], 3, 3, b1 + 0.22, DK, -1, false);
    for (const [a, b] of [[[-36, -126], [-8, -126]], [[-36, -104], [-8, -104]], [[-36, -126], [-36, -104]], [[-8, -126], [-8, -104]]] as [V2, V2][])
      part([x2 + a[0], BASE + a[1]], [x2 + b[0], BASE + b[1]], 1.1, 1.1, b1 + 0.19, DK, -1, false);
    for (const q of [[-31, -121], [-13, -121], [-31, -109], [-13, -109]] as V2[]) part([x2 + q[0], BASE + q[1]], [x2 + q[0] + 0.01, BASE + q[1]], 1.8, 1.8, b1 + 0.19, M, -1, false);
    const split2 = caps.length;

    // R3: an industrial arm — bolted base, turret, links with a hydraulic piston and cables, a hand with jointed fingers
    const b2 = ROBOTS + 1.45;
    const ik = this.armIK(t);
    part([R3[0] - 70, BASE - 14], [R3[0] + 70, BASE - 14], 18, 18, b2 + 0.0, M, 4);
    for (let k = 0; k < 4; k++) part([R3[0] - 54 + k * 36, BASE - 24], [R3[0] - 54 + k * 36 + 0.01, BASE - 24], 4, 4, b2 + 0.02, DK, -1, false);
    for (let k = 0; k < 7; k++) part([R3[0] - 66 + k * 22, BASE - 2], [R3[0] - 56 + k * 22, BASE - 26], 4, 4, b2 + 0.03, OC, -1, false);
    part([R3[0], BASE - 30], [R3[0], BASE - 130], 36, 32, b2 + 0.06, OC, 6);
    part([R3[0], BASE - 130], SHOULDER, 30, 26, b2 + 0.08, OC);
    joint(SHOULDER, 22, b2 + 0.12);
    part(SHOULDER, ik.elbow, 27, 21, b2 + 0.16, OC);
    const [pa1, pb1] = off(SHOULDER, ik.elbow, 25);
    part(lerp2(pa1, pb1, 0.12), lerp2(pa1, pb1, 0.55), 9, 9, b2 + 0.18, M, 0, false);
    part(lerp2(pa1, pb1, 0.5), lerp2(pa1, pb1, 0.88), 4, 4, b2 + 0.19, DK, 0, false);
    const [ca, cb] = off(SHOULDER, ik.elbow, -22);
    part(lerp2(ca, cb, 0.05), lerp2(ca, cb, 0.95), 3, 3, b2 + 0.2, DK, 0, false);
    joint(ik.elbow, 17, b2 + 0.22);
    part(ik.elbow, ik.wrist, 20, 15, b2 + 0.24, OC);
    const [cc, cd] = off(ik.elbow, ik.wrist, -17);
    part(lerp2(cc, cd, 0.08), lerp2(cc, cd, 0.92), 2.6, 2.6, b2 + 0.26, DK, 0, false);
    joint(ik.wrist, 12, b2 + 0.28);
    const hc = Math.cos(ik.handDir), hs = Math.sin(ik.handDir);
    const palm: V2 = [ik.wrist[0] + hc * 44, ik.wrist[1] + hs * 44];
    part(ik.wrist, palm, 17, 15, b2 + 0.3, M, 3);
    // the index finger, extended: three segments with knuckles; it holds the point
    const k1: V2 = [palm[0] + hc * 2, palm[1] + hs * 2], k2: V2 = lerp2(k1, ik.tip, 0.4), k3: V2 = lerp2(k1, ik.tip, 0.72);
    part(k1, k2, 8, 7, b2 + 0.34, M, 2); part(k2, k3, 7, 6, b2 + 0.35, M, 2); part(k3, ik.tip, 6, 4.5, b2 + 0.36, M, 2);
    for (const kk of [k2, k3]) part(kk, [kk[0] + 0.01, kk[1]], 3.5, 3.5, b2 + 0.37, J, -1, false);
    for (let f = 0; f < 3; f++) {
      const o: V2 = [palm[0] - hs * (9 + f * 8) - hc * 4, palm[1] + hc * (9 + f * 8) - hs * 4];
      const m: V2 = [o[0] + hc * 20, o[1] + hs * 20], e: V2 = [m[0] - hs * 13 - hc * 6, m[1] + hc * 13 - hs * 6];
      part(o, m, 7, 6, b2 + 0.4 + f * 0.03, M, 2); part(m, e, 6, 4.5, b2 + 0.42 + f * 0.03, M, 2, false);
    }
    const th: V2 = [ik.wrist[0] + hc * 20 + hs * 14, ik.wrist[1] + hs * 20 - hc * 14], th2: V2 = [th[0] + hc * 22 + hs * 8, th[1] + hs * 22 - hc * 8];
    part(th, th2, 7, 6, b2 + 0.46, M, 2); part(th2, [th2[0] + hc * 16, th2[1] + hs * 16], 6, 4.5, b2 + 0.47, M, 2, false);
    // R3 detail: a cable loop up the column, a turret ring, a warning plate, a second piston on the forearm
    { const cl: V2[] = [[R3[0] - 40, BASE - 34], [R3[0] - 52, BASE - 96], [R3[0] - 46, BASE - 168], [R3[0] - 30, BASE - 222]];
      for (let k = 0; k < 3; k++) part(cl[k]!, cl[k + 1]!, 3.6, 3.6, b2 + 0.09, DK, 0, false);
      for (const q of cl.slice(1, 3)) part([q[0] - 2, q[1]], [q[0] + 12, q[1]], 2.6, 2.6, b2 + 0.1, M, 0, false); }
    part([R3[0] - 34, BASE - 130], [R3[0] + 34, BASE - 130], 4, 4, b2 + 0.08, M, -1, false);
    part([R3[0] - 12, BASE - 78], [R3[0] + 12, BASE - 78], 8, 8, b2 + 0.07, IV, -1, false);
    part([R3[0] - 6, BASE - 78], [R3[0] + 6, BASE - 78], 1.6, 1.6, b2 + 0.07, DK, -1, false);
    const [fa, fb] = off(ik.elbow, ik.wrist, 18);
    part(lerp2(fa, fb, 0.15), lerp2(fa, fb, 0.5), 6, 6, b2 + 0.25, M, 0, false);
    part(lerp2(fa, fb, 0.45), lerp2(fa, fb, 0.82), 2.6, 2.6, b2 + 0.25, DK, 0, false);
    return { caps, joints, guides, split: [split1, split2] };
  }

  /** The pen: each drawn element in order; between them it travels. */
  penPath(t: number): V2 {
    type K = [number, V2];
    const keysP: K[] = [];
    for (const it of this.items) if (it.pen) {
      const n = 6;
      for (let i = 0; i <= n; i++) keysP.push([lerp(it.t0, it.t1, i / n), prefix(it.pts, i / n).end]);
    }
    GEAR.forEach((g, i) => {
      const [a, b] = this.gearWin(i);
      for (let s = 0; s <= 8; s++) { const ang = -Math.PI / 2 + (s / 8) * TAU; keysP.push([lerp(a, b, s / 8), [g.c[0] + Math.cos(ang) * (g.r + 5), g.c[1] + Math.sin(ang) * (g.r + 5)]]); }
    });
    const main = this.traces[7]!;
    for (let s = 0; s <= 6; s++) keysP.push([lerp(main.t0, main.t1, s / 6), prefix(main.pts, s / 6).end]);
    // robots: the head visits each new joint as it appears
    keysP.push([ROBOTS + 0.05, [2388, BASE - 206]], [ROBOTS + 0.25, [2400, BASE - 336]], [ROBOTS + 0.45, [2420, BASE - 404]], [ROBOTS + 0.7, [2440, BASE - 240]]);
    keysP.push([ROBOTS + 0.85, [2690, BASE - 46]], [ROBOTS + 1.1, [2690, BASE - 222]], [ROBOTS + 1.3, [2760, BASE - 150]]);
    keysP.push([ROBOTS + 1.5, [R3[0], BASE - 30]], [ROBOTS + 1.65, SHOULDER]);
    keysP.sort((a, b) => a[0] - b[0]);
    if (t >= ROBOTS + 1.8) {
      const ik = this.armIK(t);
      const go = ease.inOutCubic(clamp((t - (ROBOTS + 1.65)) / 0.4));
      return go < 1 ? [lerp(SHOULDER[0], ik.tip[0], go), lerp(SHOULDER[1], ik.tip[1], go)] : ik.tip;
    }
    if (t <= keysP[0]![0]) return keysP[0]![1];
    for (let i = 1; i < keysP.length; i++) {
      const [t1, p1] = keysP[i]!, [t0, p0] = keysP[i - 1]!;
      if (t <= t1) { const e = ease.inOutSine((t - t0) / Math.max(1e-4, t1 - t0)); return [lerp(p0[0], p1[0], e), lerp(p0[1], p1[1], e)]; }
    }
    return keysP[keysP.length - 1]![1];
  }
  scr(t: number, p: V2): V2 { const c = camAt(t); return [(p[0] - c.x) * c.s + 960, (p[1] - c.y) * c.s + 540]; }
  override headAt(t: number): V2 { return this.scr(t, this.penPath(t)); }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, u = this.pass.u;
    const cam = camAt(t);
    (u.cam!.value as THREE.Vector2).set(cam.x, cam.y);
    u.camS!.value = cam.s; u.t!.value = t;
    // how built each robot is (for its shadows), and where the wheeled one rolls (as in robots())
    const bk = (t0: number) => ease.outCubic(clamp((t - t0) / 0.5));
    (u.robK!.value as THREE.Vector3).set(bk(ROBOTS + 0.1), bk(ROBOTS + 0.8), bk(ROBOTS + 1.5));
    u.r2x!.value = 2690 + 24 * Math.sin((t - (ROBOTS + 0.75)) * 1.1);
    const rb = this.robots(t);
    const S = (p: V2) => this.scr(t, p);
    const caps = rb.caps.map((c) => ({ ...c, a: S(c.a), b: S(c.b), ra: c.ra * cam.s, rb: c.rb * cam.s, k: (c.k ?? 3) * cam.s }));
    const grp = [caps.slice(0, rb.split[0]), caps.slice(rb.split[0], rb.split[1]), caps.slice(rb.split[1])];
    const slots: [number, number][] = [[G0, N0], [G1, N1], [G2, N2]];
    grp.forEach((g, i) => { this.bones.set(slots[i]![0], slots[i]![1], g); (u.rbox!.value as THREE.Vector4[])[i]!.copy(boxOf(g, 10)); });
    this.pass.render(r, out);

    const L = this.L, D = this.dots;
    L.clear(); D.clear();
    const draw = (pts: V2[], k: number, w: number, col: RGBA) => { const p = prefix(pts, k).pts; if (p.length > 1) L.polyline(p.map(S), () => w * cam.s, () => col); };
    for (const it of this.items) draw(it.pts, (t - it.t0) / (it.t1 - it.t0), it.w, it.col);
    // gears
    GEAR.forEach((g, i) => {
      const [a, b] = this.gearWin(i);
      const k = (t - a) / (b - a);
      if (k <= 0) return;
      const rot = this.gearRot(i, t);
      draw(gearPts(g.c, g.r, g.teeth, rot), k, 1.4, rgba(BONE, 0.85, 0.75));
      const hub = clamp((t - b) / 0.25);
      if (hub > 0) {
        draw(circlePts(g.c, g.r * 0.32, rot, 48), hub, 1.1, rgba(BONE, 0.7, 0.6));
        for (let s = 0; s < 4; s++) { const q = rot + (s * TAU) / 4; L.seg2(...S([g.c[0] + Math.cos(q) * g.r * 0.32, g.c[1] + Math.sin(q) * g.r * 0.32]), ...S([g.c[0] + Math.cos(q) * (g.r - 14), g.c[1] + Math.sin(q) * (g.r - 14)]), 1.1 * cam.s, rgba(ASH, 0.7 * hub, 0.6)); }
        D.dot(...S(g.c), 8 * cam.s, rgba(RED, hub, 1.2));
      }
    });
    // traces, and the ones and zeros they carry (a bar, a ring)
    this.traces.forEach((tr, i) => {
      const k = (t - tr.t0) / (tr.t1 - tr.t0);
      draw(tr.pts, k, 1.2, rgba(BONE, 0.6, 0.6));
      if (k >= 1) {
        D.dot(...S(tr.pts[tr.pts.length - 1]!), 7 * cam.s, rgba(RED, 1, 1.1));
        for (let q = 0; q < 2; q++) {
          const ph = (t * 0.8 + i * 0.137 + q * 0.5) % 1;
          const p = S(prefix(tr.pts, ph).end);
          if ((i + q) % 2) L.seg2(p[0], p[1] - 6 * cam.s, p[0], p[1] + 6 * cam.s, 2 * cam.s, rgba(BONE, 0.95, 1));
          else L.polyline(circlePts(p, 5 * cam.s, 0, 16), () => 1.6 * cam.s, () => rgba(BONE, 0.95, 1));
        }
      }
    });
    // construction guides of the robots, then their red joints
    for (const [a, b, k] of rb.guides) {
      const A = S(a), B = S(b), n = Math.max(1, Math.floor(Math.hypot(B[0] - A[0], B[1] - A[1]) / 10));
      for (let s = 0; s < n; s += 2) L.seg2(lerp(A[0], B[0], s / n), lerp(A[1], B[1], s / n), lerp(A[0], B[0], (s + 1) / n), lerp(A[1], B[1], (s + 1) / n), 1, rgba(ASH, 0.7 * k, 0.8));
      L.polyline(circlePts(A, 14 * cam.s, 0, 24), () => 1, () => rgba(ASH, 0.6 * k, 0.8));
    }
    for (const j of rb.joints) D.dot(...S(j), 9 * cam.s, rgba(RED, 1, 1.15));
    L.render(r, out);
    D.render(r, out);

    // the circle drawn by the robot's hand (the first mark, again)
    const m = this.motif;
    m.clear();
    const ik = this.armIK(t);
    if (t > DRAW0) {
      const a1 = MARK.startAngle + MARK.dir * TAU * 0.985 * ik.k;
      const pts = arc(CIRCLE.c[0], CIRCLE.c[1], CIRCLE.r, MARK.startAngle, a1, 140).map(S);
      m.path(pts, 2.4 * cam.s, 1.1);
    }
    if (this.drawHead) {
      const pts: V2[] = [];
      for (let j = 20; j >= 0; j--) pts.push(this.headAt(Math.max(T0, t - (0.3 * j) / 20)));
      m.trail(pts, 2.2, 1.35);
      const h = this.headAt(t);
      m.head(h[0], h[1], 1.15, 1);
    }
    m.render(r, out);
    return { bloom: 0.55, bloomThreshold: 0.9, vignette: 0.4, grain: 0.04, warmth: -0.05 };
  }
}
