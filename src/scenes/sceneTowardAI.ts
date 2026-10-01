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
import { bonesGLSL, RELIEF_SHADE_GLSL, BoneArray, type Capsule } from '../shaders/relief';
import { MARK } from '../motifs/world';
import { CUE } from '../timeline/cues';
import { clamp, ease, keys, lerp, smoothstep, TAU, catmull, polyLengths, type V2 } from '../utils/math';

const T0 = CUE.aiIn, GEARS = CUE.gears, CIRC = CUE.circuits, ROBOTS = CUE.robots, HAND = CUE.robotHand, OUT = CUE.aiOut;
const BASE = 860;                              // the baseline (world y)
const NBONES = 42;
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
  bones = new BoneArray(NBONES);
  L = new LineBatch(16000);
  dots = new LineBatch(800);
  motif = new LineMotif();
  items: Item[] = [];
  traces: { pts: V2[]; t0: number; t1: number }[] = [];
  pass = new FSPass(/* glsl */ `
    uniform vec2 cam; uniform float camS, t;
    ${bonesGLSL('rb', NBONES)}
    ${RELIEF_SHADE_GLSL}
    void main() {
      vec2 px = FRAG_PX;
      vec2 w = cam + (px - vec2(960.0, 540.0)) / camS;
      vec3 c = C_INK * 0.62;
      // the drawing board: a faint engineering grid, a baseline with ticks
      vec2 g = abs(fract(w / 66.0 + 0.5) - 0.5) * 66.0 * camS;
      c += C_BONE * 0.016 * sat(1.0 - min(g.x, g.y));
      float base = pxLine((w.y - ${BASE.toFixed(1)}) * camS, 1.0);
      float tick = step(abs(fract(w.x / 132.0 + 0.5) - 0.5) * 132.0 * camS, 0.6) * step(abs(w.y - ${BASE.toFixed(1)} - 8.0), 8.0);
      c += C_BONE * 0.22 * (base + tick * 0.6);
      // the robots: the same relief as every body in the film, in blueprint tones
      vec3 Ld = normalize(vec3(-0.5, -0.65, 0.6));
      float d = rbSD(px, 0, ${NBONES}, 4.0);
      c = reliefShade(c, d, C_INK2 * 1.7 + C_GRAPHITE * 0.05, C_BONE * 0.85, 6.0, Ld, 1.0);
      fragColor = vec4(c, 1.0);
    }`, { cam: { value: new THREE.Vector2() }, camS: { value: 1 }, t: { value: 0 }, ...this.bones.uniforms('rb') });

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
  robots(t: number): { caps: Capsule[]; joints: V2[]; guides: [V2, V2, number][] } {
    const caps: Capsule[] = [], joints: V2[] = [], guides: [V2, V2, number][] = [];
    const part = (a: V2, b: V2, ra: number, rb: number, t0: number, joint = true) => {
      const g = ease.outBack(clamp((t - t0) / 0.18));
      const gk = clamp((t - (t0 - 0.12)) / 0.12) * (1 - smoothstep(t0 + 0.35, t0 + 0.7, t));
      if (gk > 0) guides.push([a, b, gk]);
      if (g <= 0) return;
      caps.push({ a, b, ra: ra * g, rb: rb * g });
      if (joint && g > 0.6) joints.push(a);
    };
    // R1: a slender biped (idle sway, a turn of the head)
    const b0 = ROBOTS;
    const x1 = 2400, sw = Math.sin(t * 1.4) * 4;
    const pel: V2 = [x1 + sw * 0.5, BASE - 210], ch: V2 = [x1 + sw, BASE - 336], hd: V2 = [x1 + sw + 4 * Math.sin(t * 0.9), BASE - 404];
    part([x1 - 12, BASE - 206], [x1 - 6, BASE - 108], 17, 14, b0 + 0.05);
    part([x1 - 6, BASE - 108], [x1 - 12, BASE - 14], 13, 11, b0 + 0.1);
    part([x1 - 12, BASE - 10], [x1 + 22, BASE - 8], 9, 8, b0 + 0.15, false);
    part(pel, ch, 30, 40, b0 + 0.2);
    part([ch[0], ch[1] - 8], [hd[0], hd[1] + 30], 9, 8, b0 + 0.28);
    part([hd[0] - 16, hd[1]], [hd[0] + 22, hd[1] - 2], 27, 24, b0 + 0.33, false);
    part([x1 + 10, BASE - 206], [x1 + 18, BASE - 108], 18, 14, b0 + 0.4);
    part([x1 + 18, BASE - 108], [x1 + 10, BASE - 14], 14, 11, b0 + 0.45);
    part([x1 + 10, BASE - 10], [x1 + 44, BASE - 8], 9, 8, b0 + 0.48, false);
    const sh: V2 = [ch[0] + 8, ch[1] + 6], el: V2 = [sh[0] + 26 + 6 * Math.sin(t * 1.4), sh[1] + 90], wr: V2 = [el[0] + 30, el[1] + 74];
    part(sh, el, 13, 11, b0 + 0.52);
    part(el, wr, 11, 9, b0 + 0.56);
    part(wr, [wr[0] + 10, wr[1] + 22], 9, 6, b0 + 0.6);
    // R2: a wheeled one (a sphere on a wheel), rocking
    const b1 = ROBOTS + 0.75;
    const x2 = 2690 + 24 * Math.sin((t - b1) * 1.1);
    part([x2, BASE - 46], [x2 + 0.1, BASE - 46], 45, 45, b1 + 0.05, false);
    part([x2, BASE - 156], [x2 + 0.1, BASE - 156], 66, 66, b1 + 0.15, false);
    part([x2, BASE - 222], [x2, BASE - 246], 10, 9, b1 + 0.25);
    part([x2 - 26, BASE - 262], [x2 + 26, BASE - 262], 21, 21, b1 + 0.3, false);
    const ra: V2 = [x2 + 52, BASE - 170], re: V2 = [ra[0] + 46, ra[1] + 26 + 10 * Math.sin(t * 2)];
    part(ra, re, 11, 9, b1 + 0.38);
    part(re, [re[0] + 30, re[1] - 24], 9, 6, b1 + 0.42);
    joints.push([x2, BASE - 46]);
    // R3: an arm, whose hand will draw the circle
    const b2 = ROBOTS + 1.45;
    const ik = this.armIK(t);
    part([R3[0] - 66, BASE - 18], [R3[0] + 66, BASE - 18], 20, 20, b2 + 0.0, false);
    part([R3[0], BASE - 30], SHOULDER, 30, 26, b2 + 0.08);
    part(SHOULDER, ik.elbow, 27, 22, b2 + 0.16);
    part(ik.elbow, ik.wrist, 21, 16, b2 + 0.24);
    const hc = Math.cos(ik.handDir), hs = Math.sin(ik.handDir);
    const palm: V2 = [ik.wrist[0] + hc * 44, ik.wrist[1] + hs * 44];
    part(ik.wrist, palm, 17, 15, b2 + 0.3);
    // fingers: the index extended (it holds the point), the others curled under, a thumb
    part(palm, ik.tip, 8, 6, b2 + 0.36);
    for (let f = 0; f < 2; f++) {
      const o: V2 = [palm[0] - hs * (8 + f * 9) - hc * 4, palm[1] + hc * (8 + f * 9) - hs * 4];
      const m: V2 = [o[0] + hc * 22, o[1] + hs * 22], e: V2 = [m[0] - hs * 14 - hc * 6, m[1] + hc * 14 - hs * 6];
      part(o, m, 7, 6, b2 + 0.4 + f * 0.03); part(m, e, 6, 5, b2 + 0.42 + f * 0.03, false);
    }
    const th: V2 = [ik.wrist[0] + hc * 20 + hs * 14, ik.wrist[1] + hs * 20 - hc * 14];
    part(th, [th[0] + hc * 30 + hs * 10, th[1] + hs * 30 - hc * 10], 7, 5, b2 + 0.46);
    return { caps, joints, guides };
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
    const rb = this.robots(t);
    const S = (p: V2) => this.scr(t, p);
    this.bones.set(0, NBONES, rb.caps.map((c) => ({ a: S(c.a), b: S(c.b), ra: c.ra * cam.s, rb: c.rb * cam.s })));
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
