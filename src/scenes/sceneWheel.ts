// 05b THE WHEEL — a panel scene, hosted by the gallery.
// A drawing on warm paper. A kneeling maker strikes a stone tool; the line draws a circle on the ground and
// the circle becomes a disc of wood (its growth rings are contour lines again). The point drops into the
// centre and becomes the axle; four spokes are cut; a second wheel and a platform are drawn; the maker
// stands and pushes the first cart. Behind them, two people paint on a rock face: animals, runners, and a
// wheel — strokes revealed in their painting order by the brushes of art/paint.ts.
import * as THREE from 'three';
import { PanelScene, type Frame } from '../engine/scene';
import { FSPass, canvasTexture, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, arc, rgba } from '../motifs/line';
import { pose, NB, type P2, type PoseOpts, type Look } from '../motifs/figure';
import { BODY_COMMON_GLSL, bodyGLSL, PartArray, boxOf, type Part } from '../shaders/relief';
import { makeCanvas, dabStroke, splatter, wobblyCircle, hexRGB, mixRGB, resample, type RGB } from '../art/paint';
import { CUE } from '../timeline/cues';
import { clamp, ease, lerp, smoothstep, TAU, catmull, hexLin, Rng, type V2 } from '../utils/math';

const T_IN = CUE.wheelIn + 0.6, T_FULL = CUE.wheel, DISC = CUE.disc, AXLE = CUE.axle, CART = CUE.cart, OUT = CUE.wheelOut;
const TA = CUE.wheelIn, TB = OUT + 0.5;          // the paint-order encoding spans [TA, TB]
const R = 92;                                   // wheel radius
const GROUND = 935, BACK_GROUND = 770, HORIZON = 700;
const D0: V2 = [600, GROUND - R];               // where the disc is made
const GAP = 290;                                // axle distance of the cart
const ROLL = 230;
const DRAW = 1.0;                               // the line draws the circle in one second
const INK = hexLin('#1C1A18');

interface Stroke { pts: V2[]; w: number; col: RGB; who: 0 | 1; t0: number; t1: number }

export default class SceneWheel extends PanelScene {
  bones = new PartArray(3 * NB);
  lines = new LineBatch(4000, { blend: 'normal' });
  motif = new LineMotif();
  strokes: Stroke[] = [];
  pass = new FSPass(/* glsl */ `
    uniform float t; uniform sampler2D paint, order; uniform vec4 fbox[3];
    uniform vec2 w1, w2; uniform float rot, discK, discA, holeK, spokeK, w2K, tNorm;
    ${BODY_COMMON_GLSL}
    ${bodyGLSL('fg', 3 * NB)}
    const float R = ${R.toFixed(1)};
    float wallEdge(float y) { return 1210.0 + 50.0 * sin(y / 150.0) + 70.0 * fbm(vec2(y / 220.0, 2.0), 3) - (700.0 - y) * 0.12; }
    vec3 wheel(vec3 c, vec2 px, vec2 cen, float k, float ang0, float sweep) {
      vec2 d = px - cen;
      float r = length(d);
      if (k <= 0.0 || r > R + 3.0) return c;
      float a = atan(d.y, d.x);
      // reveal: the disc follows the pen (counter-clockwise from angle 0)
      float da = mod(-(a - ang0), TAU);
      float m = sweep >= 1.0 ? 1.0 : smoothstep(sweep * TAU + 0.05, sweep * TAU, da);
      // spokes: four sectors cut out between rim and hub
      float sa = mod(a - rot, PI * 0.5) - PI * 0.25;
      float cut = spokeK * smoothstep(R * 0.24, R * 0.3, r) * smoothstep(R * 0.8, R * 0.74, r) * smoothstep(0.16, 0.24, abs(sa) * r / R);
      float hole = holeK * smoothstep(11.0, 9.0, r);
      float body = smoothstep(R + 0.8, R - 0.8, r) * m * k * (1.0 - cut) * (1.0 - hole);
      vec3 wood = mix(C_TERRACOTTA, C_OCHRE, 0.45) * 0.55;
      wood *= 0.85 + 0.15 * fbm(vec2(r / 6.0, a * 3.0 + rot), 3);
      // growth rings: contour lines of the radius (they turn with the wheel's grain)
      float rr = r + 2.5 * sin(a * 3.0 - rot * 3.0);
      float ring = isoLine(rr, 11.0, 0.8) * 0.35;
      vec3 w = wood * (1.0 - ring);
      w = mix(w, ${'vec3'}(${INK.map((v) => v.toFixed(4)).join(', ')}), pxLine(r - R + 1.0, 2.2) + pxLine(r - R * 0.3, 1.0) * spokeK + pxLine(r - 10.0, 1.4) * holeK);
      return mix(c, w, body);
    }
    void main() {
      vec2 px = FRAG_PX;
      vec3 paper = C_PAPER * (0.95 + 0.04 * fbm(px / 300.0, 3)) * (0.985 + 0.015 * vnoise(px / 1.7));
      vec3 c = paper;
      vec3 ink = vec3(${INK.map((v) => v.toFixed(4)).join(', ')});
      // a low sun, drawn in graphite: a circle with a hatch
      vec2 sp = px - vec2(430.0, 330.0);
      float sr = length(sp);
      c = mix(c, ink, pxLine(sr - 105.0, 1.3) * 0.45 + isoLine(sp.y + sp.x * 0.35, 9.0, 0.7) * 0.12 * smoothstep(104.0, 100.0, sr));
      // distant hills: graphite contour lines
      float hy = ${HORIZON.toFixed(1)} - 60.0 - 70.0 * fbm(vec2(px.x / 380.0, 1.0), 4);
      if (px.y > hy && px.y < ${HORIZON.toFixed(1)}) {
        float v = (px.y - hy) / (${HORIZON.toFixed(1)} - hy);
        c = mix(c, ink, 0.05 + 0.25 * isoLine(v * 6.0, 1.0, 0.7) * (1.0 - v));
      }
      c = mix(c, ink, pxLine(px.y - hy, 1.1) * 0.5 * step(px.y, ${HORIZON.toFixed(1)} + 1.0));
      // ground: a few perspective contour lines
      if (px.y > ${HORIZON.toFixed(1)}) {
        float dy = px.y - ${HORIZON.toFixed(1)};
        float lv = log(dy + 4.0) * 4.0 + fbm(vec2(px.x / 300.0, dy / 60.0), 3) * 1.2;
        c = mix(c, ink, isoLine(lv, 1.0, 0.7) * 0.18);
        c *= 0.97 - 0.04 * smoothstep(700.0, 1080.0, px.y);
      }
      // the rock face, with its paintings revealed in painting order
      float we = wallEdge(px.y);
      if (px.x > we && px.y < ${HORIZON.toFixed(1)} + 8.0 && px.y > 110.0 + 0.1 * (px.x - 1200.0)) {
        float n = fbm(px / 140.0, 5), m = fbm(px / 26.0 + 3.0, 4);
        vec3 rock = mix(vec3(0.42, 0.30, 0.19), vec3(0.62, 0.48, 0.32), smoothstep(0.25, 0.8, n * 0.8 + m * 0.35));
        float v = 1.0 - abs(fbm(px / 210.0 + 9.0, 4) * 2.0 - 1.0);
        rock *= 1.0 - smoothstep(0.96, 0.99, v) * 0.35;
        rock *= 0.82 + 0.25 * smoothstep(we, we + 200.0, px.x);
        vec2 uv = vec2(px.x / RES.x, 1.0 - px.y / RES.y);
        vec4 pa = texture(paint, uv);
        float ord = texture(order, uv).r;
        float shown = ord > 0.999 ? 0.0 : smoothstep(ord - 0.004, ord, tNorm);
        rock = mix(rock, pa.rgb, pa.a * shown);
        float edge = smoothstep(we - 1.0, we + 1.5, px.x);
        c = mix(c, rock, edge);
        c = mix(c, ink, pxLine(px.x - we, 1.6) * 0.8);
      }
      // the people
      vec3 Ld = normalize(vec3(-0.5, -0.6, 0.6));
      vec3 Lc = vec3(1.0, 0.95, 0.86);
      // three people, three looks: skin, hair and what they wear
      vec3 lineC = vec3(0.0);
      c = bodyShade(c, fgBody(px, ${NB * 2}, ${NB}, fbox[2]), Ld, Lc, vec3(0.13, 0.045, 0.018), vec3(0.4, 0.25, 0.155), vec3(0.11, 0.13, 0.075), 0.0, 0.0, lineC, 6.0, 1.0);
      c = bodyShade(c, fgBody(px, ${NB}, ${NB}, fbox[1]), Ld, Lc, vec3(0.018, 0.015, 0.013), vec3(0.15, 0.08, 0.047), vec3(0.4, 0.23, 0.065), 0.0, 0.0, lineC, 6.0, 1.0);
      // the wheels (and the cart's maker in front of them)
      c = wheel(c, px, w2, w2K, 0.0, 1.0);
      c = wheel(c, px, w1, discK, 0.0, discA);
      c = bodyShade(c, fgBody(px, 0, ${NB}, fbox[0]), Ld, Lc, vec3(0.035, 0.026, 0.02), vec3(0.28, 0.16, 0.09), vec3(0.27, 0.095, 0.045), 0.0, 0.0, lineC, 6.0, 1.0);
      fragColor = vec4(c, 1.0);
    }`, {
    t: { value: 0 }, paint: { value: null }, order: { value: null }, w1: { value: new THREE.Vector2() }, w2: { value: new THREE.Vector2() },
    rot: { value: 0 }, discK: { value: 0 }, discA: { value: 0 }, holeK: { value: 0 }, spokeK: { value: 0 }, w2K: { value: 0 }, tNorm: { value: 0 },
    fbox: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    ...this.bones.uniforms('fg'),
  });

  override init() {
    const r = new Rng(905);
    const ochre = hexRGB('#B4532E'), earth = hexRGB('#8E3B22'), charcoal = hexRGB('#2A2420'), red = hexRGB('#C2412B'), yellow = hexRGB('#C98A2E');
    const S: Omit<Stroke, 't0' | 't1'>[] = [];
    const add = (pts: V2[], w: number, col: RGB, who: 0 | 1) => S.push({ pts: catmull(pts, 10), w, col, who });
    // painter A (upper): an aurochs, then a wheel sign
    const bx = 1440, by = 330;
    add([[bx - 120, by + 10], [bx - 60, by - 30], [bx + 40, by - 34], [bx + 120, by - 10], [bx + 150, by + 20]], 9, charcoal, 0); // back
    add([[bx + 150, by + 20], [bx + 160, by + 50], [bx + 130, by + 70]], 8, charcoal, 0);                         // head
    add([[bx + 140, by - 4], [bx + 170, by - 40], [bx + 200, by - 44]], 5, charcoal, 0);                          // horn
    add([[bx - 120, by + 10], [bx - 116, by + 70], [bx - 60, by + 92], [bx + 60, by + 92], [bx + 120, by + 70]], 8, charcoal, 0); // belly
    add([[bx - 90, by + 84], [bx - 96, by + 150]], 7, charcoal, 0);
    add([[bx - 50, by + 92], [bx - 40, by + 152]], 7, charcoal, 0);
    add([[bx + 60, by + 92], [bx + 54, by + 150]], 7, charcoal, 0);
    add([[bx + 100, by + 80], [bx + 112, by + 140]], 7, charcoal, 0);
    add([[bx - 90, by + 20], [bx - 20, by + 50], [bx + 60, by + 30], [bx + 100, by + 50]], 26, ochre, 0);       // body wash
    const wc: V2 = [1700, 300];
    S.push({ pts: wobblyCircle(wc[0], wc[1], 56, -Math.PI / 2, TAU * 1.02, 0.03, 5, 80), w: 9, col: red, who: 0 });
    add([[wc[0] - 50, wc[1]], [wc[0] + 50, wc[1]]], 7, red, 0);
    add([[wc[0], wc[1] - 50], [wc[0], wc[1] + 50]], 7, red, 0);
    // painter B (lower): runners and a row of dots
    for (let k = 0; k < 3; k++) {
      const x = 1450 + k * 95, y = 560 + (k % 2) * 10;
      add([[x, y - 46], [x + 4, y - 10]], 6, earth, 1);
      add([[x - 26, y + 22], [x + 2, y - 10], [x + 30, y + 24]], 6, earth, 1);
      add([[x - 24, y - 34], [x + 4, y - 30], [x + 28, y - 44]], 5, earth, 1);
    }
    S.push({ pts: Array.from({ length: 9 }, (_, i) => [1440 + i * 34, 640 + Math.sin(i) * 4] as V2), w: 12, col: yellow, who: 1 });
    // timing: each painter paints their strokes in order over the scene
    for (const who of [0, 1] as const) {
      const list = S.filter((s) => s.who === who);
      const a0 = who === 0 ? TA + 0.6 : TA + 1.1, a1 = OUT - 0.2;
      const len = list.map((s) => s.pts.length + 20);
      const total = len.reduce((x, y) => x + y, 0);
      let acc = 0;
      for (let i = 0; i < list.length; i++) {
        const s = list[i]!;
        const t0 = a0 + ((a1 - a0) * acc) / total; acc += len[i]!;
        const t1 = a0 + ((a1 - a0) * (acc - 12)) / total;
        this.strokes.push({ ...s, t0, t1 });
      }
    }
    // older paintings, already there: a hand stencil and a deer
    const { c: pc, ctx: px } = makeCanvas(W, H);
    const { c: oc, ctx: ox } = makeCanvas(W, H);
    ox.fillStyle = '#ffffff'; ox.fillRect(0, 0, W, H);
    ox.globalCompositeOperation = 'darken';
    ox.lineCap = 'round'; ox.lineJoin = 'round';
    const enc = (tt: number) => { const v = Math.round(clamp((tt - TA) / (TB - TA)) * 254); return `rgb(${v},${v},${v})`; };
    splatter(px, 1290, 470, 60, 260, earth, 0.55, 3);
    px.globalCompositeOperation = 'destination-out';
    px.beginPath(); px.ellipse(1290, 480, 22, 30, 0, 0, TAU); px.fill();
    for (let k = 0; k < 5; k++) { const a = -2.4 + k * 0.42; px.beginPath(); px.ellipse(1290 + Math.cos(a) * 42, 470 + Math.sin(a) * 42, 6, 18, a + Math.PI / 2, 0, TAU); px.fill(); }
    px.globalCompositeOperation = 'source-over';
    ox.fillStyle = 'rgb(0,0,0)'; ox.fillRect(1210, 400, 160, 150);
    const deer = catmull([[1330, 640], [1350, 600], [1400, 596], [1430, 610], [1446, 586]], 10);
    dabStroke(px, deer, { width: () => 6, color: () => mixRGB(earth, ochre, 0.3), alpha: 0.18, rough: 0.5, seed: 3 });
    ox.strokeStyle = 'rgb(0,0,0)'; ox.lineWidth = 16; ox.beginPath(); deer.forEach(([x, y], i) => (i ? ox.lineTo(x, y) : ox.moveTo(x, y))); ox.stroke();
    // the new paintings + their order map
    this.strokes.forEach((s, i) => {
      dabStroke(px, s.pts, { width: (k) => s.w * (1 - 0.3 * k) * (0.8 + 0.4 * r.next()), color: (_k, rr) => mixRGB(s.col, earth, rr.next() * 0.2), alpha: 0.2, rough: 0.6, spacing: 1.6, seed: 40 + i });
      const sp = resample(s.pts, 3);
      ox.lineWidth = s.w * 1.7 + 6;
      for (let j = 1; j < sp.length; j++) {
        ox.strokeStyle = enc(lerp(s.t0, s.t1, j / (sp.length - 1)));
        ox.beginPath(); ox.moveTo(sp[j - 1]![0], sp[j - 1]![1]); ox.lineTo(sp[j]![0], sp[j]![1]); ox.stroke();
      }
    });
    this.pass.u.paint!.value = canvasTexture(pc);
    this.pass.u.order!.value = canvasTexture(oc, false);
  }

  /** Cart position: the made wheel's centre (it rolls right once the cart exists). */
  w1(t: number): V2 {
    const k = ease.inOutSine(clamp((t - (CART + 0.45)) / (OUT + 0.6 - CART - 0.45)));
    return [D0[0] + ROLL * k, D0[1]];
  }

  override headAt(t: number): V2 {
    if (t < DISC) return [D0[0] + R, D0[1]];
    if (t < DISC + DRAW) { const a = -TAU * ease.inOutSine((t - DISC) / DRAW); return [D0[0] + Math.cos(a) * R, D0[1] + Math.sin(a) * R]; }
    const w = this.w1(t);
    const go = ease.inOutCubic(clamp((t - AXLE) / 0.35));
    return [lerp(D0[0] + R, w[0], go), lerp(D0[1], w[1], go)];
  }

  /** The people: the maker (kneels and strikes, then stands and pushes), two painters at the rock face. */
  people(t: number): Part[][] {
    const out: Part[][] = [];
    const place = (H_: number, root: P2, ps: ReturnType<typeof pose>): Part[] => ps.bones.map((b) => ({
      a: [root[0] + b.a[0] * H_, root[1] - b.a[1] * H_], b: [root[0] + b.b[0] * H_, root[1] - b.b[1] * H_], ra: b.ra * H_, rb: b.rb * H_, k: b.k * H_, mat: b.mat,
    }));
    // the maker
    const stand = ease.inOutCubic(clamp((t - (AXLE + 0.55)) / 0.6));
    const carving = (t < DISC) || (t > DISC + DRAW && t < AXLE + 0.4);
    const strike = carving ? Math.max(0, Math.sin(t * 13)) : 0;
    const w = this.w1(t);
    const mx = lerp(D0[0] - 215, w[0] - R - 175, stand);
    const walk = clamp((w[0] - D0[0]) / ROLL);
    const o: PoseOpts = {
      kneel: 1 - stand, lean: lerp(0.35, 0.42, stand), look: { beard: true, beads: true },
      armNear: [lerp(lerp(1.0, 2.5, strike) , 1.45, stand), lerp(0.5, 0.15, stand)],
      armFar: [lerp(1.1, 1.5, stand), lerp(0.6, 0.2, stand)],
    };
    out.push(place(330, [mx, GROUND], pose(2, (TAU * walk * ROLL) / 230, stand * Math.min(1, walk * 8) * (walk < 0.995 ? 1 : 0), 0, o)));
    // the painters: arms reach for the point of the stroke they are painting
    const target = (who: 0 | 1): P2 | null => {
      const s = this.strokes.find((q) => q.who === who && t >= q.t0 - 0.15 && t <= q.t1 + 0.1);
      if (!s) return null;
      const k = clamp((t - s.t0) / (s.t1 - s.t0));
      return s.pts[Math.min(s.pts.length - 1, Math.floor(k * (s.pts.length - 1)))]!;
    };
    const painters: [P2, number, number, 0 | 1][] = [[[1290, BACK_GROUND], 250, 0, 0], [[1360, BACK_GROUND + 6], 250, 1, 1]];
    const looks: Look[] = [{ long: true, pelt: true, paint: true }, { beads: true, paint: true, pelt: true }];
    for (const [root, H_, kneel, who] of painters) {
      const tg = target(who);
      const sh: P2 = [root[0] + 0.03 * H_, root[1] - (kneel ? 0.56 : 0.78) * H_];
      // shoulder angle from straight down (forward +) that points the arm at the target
      const arm: [number, number] = tg ? [Math.atan2(tg[0] - sh[0], tg[1] - sh[1]), 0.06] : [0.3, 0.3];
      out.push(place(H_, root, pose(2, 0, 0, 0, { kneel, lean: kneel ? 0.15 : 0.05, armNear: arm, armFar: [0.15 + 0.1 * Math.sin(t), 0.4], look: looks[who] })));
    }
    return out;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, u = this.pass.u;
    u.t!.value = t;
    u.tNorm!.value = (t - TA) / (TB - TA);
    const w1 = this.w1(t), w2: V2 = [w1[0] + GAP, w1[1]];
    (u.w1!.value as THREE.Vector2).set(w1[0], w1[1]);
    (u.w2!.value as THREE.Vector2).set(w2[0], w2[1]);
    u.rot!.value = (w1[0] - D0[0]) / R;
    u.discK!.value = t >= DISC ? 1 : 0;
    u.discA!.value = ease.inOutSine(clamp((t - DISC) / DRAW));
    u.holeK!.value = smoothstep(AXLE + 0.3, AXLE + 0.45, t);
    u.spokeK!.value = smoothstep(AXLE + 0.6, AXLE + 1.0, t);
    u.w2K!.value = ease.outCubic(clamp((t - (CART + 0.1)) / 0.4));
    const ppl = this.people(t);
    ppl.forEach((p, i) => { this.bones.set(i * NB, NB, p); (u.fbox!.value as THREE.Vector4[])[i]!.copy(boxOf(p, 10)); });
    this.pass.render(r, out);

    // the cart: platform, pole, drawn in ink as it is built
    const L = this.lines;
    L.clear();
    const ink = rgba(INK, 1, 1);
    const build = ease.inOutCubic(clamp((t - (CART + 0.15)) / 0.5));
    if (build > 0) {
      const y = w1[1] - R - 10, x0 = w1[0] - R - 30, x1 = w2[0] + R + 30;
      const xm = lerp(x0, x1, build);
      L.seg2(x0, y, xm, y, 7, ink);
      L.seg2(x0, y - 20, lerp(x0, x1, build * build), y - 20, 2.4, ink);
      for (let k = 0; k <= 6; k++) { const x = lerp(x0, x1, k / 6); if (x <= xm) L.seg2(x, y, x, y - 20, 2, ink); }
      // the axles hold the platform
      for (const c of [w1, w2]) if (c[0] <= xm + R) L.seg2(c[0], c[1], c[0], y, 4, ink);
      // the push bar
      const pb = ease.outCubic(clamp((t - (CART + 0.45)) / 0.3));
      if (pb > 0) L.seg2(x0, y - 4, x0 - 60 * pb, y - 54 * pb, 5, ink);
    }
    // chips from the strikes
    const strikes = Math.floor(t * 13 / TAU);
    for (let k = Math.max(0, strikes - 3); k <= strikes; k++) {
      const ts = (k * TAU + Math.PI / 2) / 13;
      const age = t - ts;
      if (age < 0 || age > 0.35 || !((ts < DISC) || (ts > DISC + DRAW && ts < AXLE + 0.4))) continue;
      for (let j = 0; j < 4; j++) {
        const a = -Math.PI / 2 + (j - 1.5) * 0.5 + Math.sin(k * 3 + j) * 0.3;
        const d = age * 260;
        const x = D0[0] - R * 0.6 + Math.cos(a) * d, y = D0[1] + 20 + Math.sin(a) * d + 900 * age * age;
        L.dot(x, y, 3, rgba(INK, 1 - age / 0.35, 1));
      }
    }
    L.render(r, out);

    // the line: draws the circle, drops into the axle, rides the turning wheel
    const m = this.motif;
    m.clear();
    if (this.drawHead) {
      const h = this.headAt(t);
      if (t >= DISC && t < DISC + DRAW + 0.3) {
        const k = ease.inOutSine(clamp((t - DISC) / DRAW));
        const back = Math.min(1.4, TAU * k);
        if (back > 0.02) m.trail(arc(D0[0], D0[1], R, -TAU * k + back, -TAU * k, 60), 2.4, 1.3);
      }
      const land = t > AXLE + 0.35 ? Math.exp(-(t - AXLE - 0.35) / 0.12) : 0;
      m.head(h[0], h[1], 1.1 + 1.2 * land, 1 + 0.4 * land);
    }
    m.render(r, out);
    return { bloom: 0.4, bloomThreshold: 0.95, vignette: 0.42, grain: 0.04, warmth: 0.1 };
  }
}
