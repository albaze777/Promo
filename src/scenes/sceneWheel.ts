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
    uniform vec2 w1, w2; uniform float rot, discK, discA, holeK, spokeK, w2K, tNorm, build, pb, loadK;
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
      // (a crisp distance in px from the spoke's edge and from the rings, so the cut is sharp)
      float dSpoke = abs(sa) * r - R * 0.13;
      float dOpen = min(dSpoke, min(r - R * 0.3, R * 0.78 - r));   // > 0 inside an opening between spokes
      float cut = spokeK * fill(-dOpen);
      float hole = holeK * smoothstep(11.0, 9.0, r);
      float body = smoothstep(R + 0.8, R - 0.8, r) * m * k * (1.0 - cut) * (1.0 - hole);
      vec3 wood = mix(C_TERRACOTTA, C_OCHRE, 0.45) * 0.55;
      wood *= 0.82 + 0.22 * fbm(vec2(r / 6.0, a * 3.0 + rot), 3);
      // growth rings: contour lines of the radius (they turn with the wheel's grain), and radial checks (cracks)
      float rr = r + 2.5 * sin(a * 3.0 - rot * 3.0);
      float ring = isoLine(rr, 11.0, 0.8) * 0.35;
      float check = smoothstep(0.035, 0.0, abs(fract((a - rot) * 7.0 / TAU + 0.13 * sin(r / 9.0)) - 0.5) - 0.465) * smoothstep(R * 0.35, R * 0.8, r) * 0.5;
      vec3 w = wood * (1.0 - ring) * (1.0 - check * 0.6);
      // a darker felloe (the rim band) once the spokes are cut, fixed with wooden pegs
      float felloe = smoothstep(R * 0.79, R * 0.81, r) * spokeK;
      w = mix(w, wood * 0.62 * (0.9 + 0.2 * vnoise(vec2(a * 30.0 - rot * 30.0, r))), felloe);
      float pa = mod(a - rot + PI / 8.0, PI / 4.0) - PI / 8.0;
      float peg = smoothstep(3.6, 2.4, length(vec2(pa * R * 0.895, r - R * 0.895))) * spokeK;
      w = mix(w, vec3(0.05, 0.03, 0.018), peg);
      // the hub: a raised boss with a dark axle hole
      float hub = smoothstep(R * 0.3, R * 0.27, r) * spokeK;
      w = mix(w, wood * 1.25 * (1.0 - 0.4 * smoothstep(R * 0.15, R * 0.28, r)), hub);
      // bevel light from the upper left: the edges catch the light, the lower right falls into shade
      float bev = smoothstep(R - 9.0, R - 1.0, r) * dot(normalize(d), vec2(-0.7, -0.7));
      w *= 1.0 + 0.35 * bev;
      w *= 0.85 + 0.15 * smoothstep(R, R * 0.2, length(d - vec2(-0.3, -0.3) * R));
      w = mix(w, ${'vec3'}(${INK.map((v) => v.toFixed(4)).join(', ')}), sat(pxLine(r - R + 1.0, 2.2) + pxLine(dOpen, 1.4) * spokeK + pxLine(r - 10.0, 1.4) * holeK));
      return mix(c, w, body);
    }
    float ease3(float k) { return 1.0 - pow(1.0 - k, 3.0); }
    /** wood along a direction: grain, knots, a lit upper edge; d: SDF of the part, h: its half-thickness */
    vec3 woodC(vec2 q, float d, float h, float tone) {
      vec3 wd = mix(C_TERRACOTTA, C_OCHRE, 0.5) * 0.5 * tone;
      float g = fbm(vec2(q.x / 50.0, q.y / 1.3), 4);
      wd *= 0.78 + 0.4 * g;
      wd *= 1.0 - 0.35 * smoothstep(0.75, 0.9, vnoise(q / 9.0 + 4.0));          // knots
      wd *= 0.8 + 0.35 * smoothstep(-h, h * 0.6, -q.y);                          // the upper side is lit
      return wd;
    }
    vec3 cart(vec3 c, vec2 px) {
      if (build <= 0.0) return c;
      vec3 ink = ${'vec3'}(${INK.map((v) => v.toFixed(4)).join(', ')});
      float y = w1.y - R - 10.0, x0 = w1.x - R - 30.0, x1 = w2.x + R + 30.0;
      float xm = mix(x0, x1, build);
      if (px.x < x0 - 80.0 || px.x > x1 + 10.0 || px.y < y - 140.0 || px.y > w1.y + 14.0) return c;
      float dAll = 1e5;
      // the bearers: a block from each axle up to the deck, with a peg through the hub
      for (int k = 0; k < 2; k++) {
        vec2 a = k == 0 ? w1 : w2;
        if (a.x > xm + R) continue;
        float db = sdBox(px - vec2(a.x, (a.y + y) * 0.5), vec2(7.0, (a.y - y) * 0.5));
        if (db < 1.0) c = mix(c, woodC(px - a, db, 7.0, 0.75), fill(db));
        dAll = min(dAll, db);
        float dp = length(px - a) - 6.5;
        c = mix(c, vec3(0.06, 0.035, 0.02) + vec3(0.1, 0.07, 0.04) * smoothstep(4.0, 0.0, length(px - a + vec2(2.0))), fill(dp));
        dAll = min(dAll, dp);
      }
      // the deck: a thick side board with nails, plank ends showing as seams
      float dd = sdBox(px - vec2((x0 + xm) * 0.5, y), vec2((xm - x0) * 0.5, 7.0));
      if (dd < 1.0) {
        vec3 wd = woodC(px - vec2(x0, y), dd, 7.0, 1.0);
        float seam = 1.0 - smoothstep(0.0, 1.2, abs(mod(px.x - x0, 58.0) - 29.0) - 27.8);
        wd *= 1.0 - 0.5 * seam;
        float nail = smoothstep(2.0, 1.0, length(vec2(mod(px.x - x0 + 22.0, 58.0) - 7.0, px.y - y)));
        wd = mix(wd, vec3(0.04, 0.035, 0.03) + 0.05 * step(px.y, y - 0.5), nail);
        c = mix(c, wd, fill(dd));
      }
      dAll = min(dAll, dd);
      // the side rail on posts, tied with rope at every post
      float dr = sdBox(px - vec2((x0 + mix(x0, x1, build * build)) * 0.5, y - 22.0), vec2((mix(x0, x1, build * build) - x0) * 0.5, 3.0));
      for (int k = 0; k <= 6; k++) {
        float xk = mix(x0 + 4.0, x1 - 4.0, float(k) / 6.0);
        if (xk > xm) continue;
        float dpst = sdBox(px - vec2(xk, y - 13.0), vec2(2.6, 11.0));
        dr = min(dr, dpst);
        // a rope lashing where post meets rail
        vec2 lq = px - vec2(xk, y - 22.0);
        float lash = sdBox(lq, vec2(5.0, 5.0));
        if (lash < 1.0) {
          vec3 rope = vec3(0.42, 0.33, 0.2) * (0.7 + 0.5 * smoothstep(0.3, 0.7, fract((lq.x + lq.y) / 3.0)));
          c = mix(c, rope, fill(lash) * 0.95);
          dAll = min(dAll, lash);
        }
      }
      if (dr < 1.0) c = mix(c, woodC(px - vec2(x0, y - 22.0), dr, 3.0, 0.85), fill(dr) * (1.0 - fill(dAll)));
      dAll = min(dAll, dr);
      // the push bar, with a grip wrapped in rope
      if (pb > 0.0) {
        vec2 a = vec2(x0, y - 4.0), b = vec2(x0 - 60.0 * pb, y - 54.0 * pb);
        float dbar = sdCapsule(px, a, b, 3.6, 3.2);
        vec2 ba = normalize(b - a);
        float along = dot(px - a, ba);
        vec3 bc = woodC(vec2(along, dot(px - a, vec2(-ba.y, ba.x))), dbar, 3.6, 0.9);
        float grip = smoothstep(52.0, 56.0, along) * smoothstep(80.0, 76.0, along);
        bc = mix(bc, vec3(0.42, 0.33, 0.2) * (0.7 + 0.5 * step(0.5, fract(along / 3.0))), grip);
        c = mix(c, bc, fill(dbar));
        dAll = min(dAll, dbar);
      }
      // the load: a bundle of firewood tied with rope, a clay pot with an ochre band, stones
      if (loadK > 0.0) {
        float s = ease3(loadK);
        float top = y - 7.0;
        for (int k = 0; k < 5; k++) {
          float fk = float(k);
          vec2 lc = vec2(x0 + 70.0 + mod(fk, 3.0) * 4.0, top - 7.0 - floor(fk / 3.0) * 12.0 - mod(fk, 3.0) * 0.0) + vec2(fk * 6.0 - 12.0, 0.0);
          vec2 la = lc - vec2(55.0, 0.0) * s, lb = lc + vec2(55.0, -2.0 + fk) * s;
          float dl = sdCapsule(px, la, lb, 6.0 * s, 6.0 * s);
          if (dl < 1.0) {
            vec3 bark = vec3(0.16, 0.1, 0.06) * (0.7 + 0.5 * vnoise(vec2((px.x - la.x) / 6.0, (px.y - la.y) / 1.5) + fk));
            // the cut end shows its rings
            float endR = length(px - lb);
            bark = mix(bark, vec3(0.5, 0.36, 0.2) * (0.85 + 0.15 * sin(endR * 2.2)), smoothstep(6.5, 5.0, endR) * step(lb.x - 1.0, px.x));
            c = mix(c, bark, fill(dl));
          }
          dAll = min(dAll, dl);
        }
        float rope = sdBox(px - vec2(x0 + 70.0, top - 12.0), vec2(2.0, 14.0 * s));
        c = mix(c, vec3(0.45, 0.35, 0.21), fill(rope));
        // the pot
        vec2 pc = vec2(x0 + 230.0, top - 30.0 * s);
        vec2 pq = (px - pc) / max(s, 0.01);
        float dpot = (length(pq * vec2(1.0, 1.15)) - 28.0) * s;
        dpot = min(dpot, sdBox(px - (pc + vec2(0.0, -28.0 * s)), vec2(13.0, 6.0) * s));
        if (dpot < 1.0) {
          vec3 clay = C_TERRACOTTA * 0.55 * (0.7 + 0.5 * smoothstep(20.0, -20.0, pq.x + pq.y * 0.5));
          clay = mix(clay, C_OCHRE * 0.6, smoothstep(2.5, 1.5, abs(pq.y + 6.0) - 3.0));
          clay = mix(clay, ink, pxLine(abs(pq.y + 6.0) - 6.0, 1.0) * 0.5);
          clay = mix(clay, vec3(0.03, 0.015, 0.01), smoothstep(1.0, -1.0, sdBox(pq - vec2(0.0, -32.0), vec2(9.0, 2.5))));
          c = mix(c, clay, fill(dpot));
        }
        dAll = min(dAll, dpot);
        for (int k = 0; k < 3; k++) {
          vec2 sc = vec2(x0 + 300.0 + float(k) * 26.0, top - 8.0 - float(k == 1) * 6.0);
          float dst = (length((px - sc) * vec2(1.0, 1.4)) - 11.0 + float(k) * 2.0) ;
          dst = dst > 0.0 ? dst : dst * s;
          if (s < 0.99) dst += (1.0 - s) * 14.0;
          vec3 st = vec3(0.32, 0.31, 0.29) * (0.6 + 0.6 * smoothstep(6.0, -6.0, px.x - sc.x + px.y - sc.y));
          c = mix(c, st, fill(dst));
          dAll = min(dAll, dst);
        }
      }
      // one ink outline around everything
      c = mix(c, ink, pxLine(dAll, 1.6) * 0.9);
      return c;
    }
    void main() {
      vec2 px = FRAG_PX;
      vec3 paper = C_PAPER * (0.95 + 0.04 * fbm(px / 300.0, 3)) * (0.985 + 0.015 * vnoise(px / 1.7));
      vec3 c = paper;
      vec3 ink = vec3(${INK.map((v) => v.toFixed(4)).join(', ')});
      const float HZ = ${HORIZON.toFixed(1)};
      // watercolour washes on the paper: pigment pools at the edges of each wash and granulates
      float gran = 0.9 + 0.2 * vnoise(px / 2.3) * vnoise(px / 7.0 + 3.0);
      // the sky: a blue-grey wash fading to warm paper at the horizon, with soft blooms
      float skyW = smoothstep(HZ - 60.0, 80.0, px.y) * (0.75 + 0.5 * fbm(px / 260.0 + 7.0, 4));
      c = mix(c, c * vec3(0.72, 0.8, 0.88), skyW * 0.55 * gran);
      // two birds drifting
      for (int k = 0; k < 2; k++) {
        float tb = t - ${TA.toFixed(3)};
        vec2 bp = vec2(620.0 + float(k) * 70.0 + tb * 26.0, 230.0 + float(k) * 34.0 + 6.0 * sin(t * 1.3 + float(k)));
        vec2 q = px - bp;
        float flap = 0.35 + 0.25 * sin(t * 9.0 + float(k) * 2.0);
        float bd = min(sdSeg(vec2(abs(q.x), q.y), vec2(0.0), vec2(9.0, -9.0 * flap)), 99.0);
        c = mix(c, ink, pxLine(bd, 1.4) * 0.7);
      }
      // a low sun: a warm ochre wash inside the graphite circle, a pale halo around it
      vec2 sp = px - vec2(430.0, 330.0);
      float sr = length(sp);
      c = mix(c, c * vec3(1.0, 0.86, 0.6), smoothstep(106.0, 98.0, sr) * 0.7 * gran);
      c = mix(c, c * vec3(1.02, 0.97, 0.9), smoothstep(260.0, 110.0, sr) * 0.6);
      c = mix(c, ink, pxLine(sr - 105.0, 1.3) * 0.45 + isoLine(sp.y + sp.x * 0.35, 9.0, 0.7) * 0.1 * smoothstep(104.0, 100.0, sr));
      // distant hills: a sage wash (bluer and paler further away) under graphite contour lines
      float hy = HZ - 60.0 - 70.0 * fbm(vec2(px.x / 380.0, 1.0), 4);
      float hy2 = HZ - 110.0 - 60.0 * fbm(vec2(px.x / 300.0 + 9.0, 4.0), 4);
      if (px.y > hy2 && px.y < hy) c = mix(c, c * vec3(0.78, 0.84, 0.88), 0.45 * gran * (0.8 + 0.4 * fbm(px / 90.0, 3)));
      c = mix(c, ink, pxLine(px.y - hy2, 1.0) * 0.25 * step(px.y, hy));
      if (px.y > hy && px.y < HZ) {
        float v = (px.y - hy) / (HZ - hy);
        c = mix(c, c * vec3(0.66, 0.76, 0.6), (0.55 + 0.2 * v) * gran * (0.8 + 0.4 * fbm(px / 70.0 + 2.0, 3)));
        // scattered trees on the hills: small dabs of darker green
        vec2 tc = vec2(px.x / 16.0, (px.y - hy) / 10.0);
        vec2 ti = floor(tc);
        float tr = step(0.8, hash12(ti)) * smoothstep(0.42, 0.2, length(fract(tc) - 0.5)) * step(px.y, HZ - 6.0);
        c = mix(c, c * vec3(0.55, 0.66, 0.5), tr * 0.8);
        c = mix(c, ink, 0.05 + 0.2 * isoLine(v * 6.0, 1.0, 0.7) * (1.0 - v));
      }
      c = mix(c, ink, pxLine(px.y - hy, 1.1) * 0.5 * step(px.y, HZ + 1.0));
      // ground: an ochre and sienna wash, darker and greener toward us, with grass, pebbles and wheel ruts
      if (px.y > HZ) {
        float dy = px.y - HZ;
        float near = smoothstep(HZ, 1080.0, px.y);
        float wn = fbm(vec2(px.x / 220.0, dy / 40.0) + 3.0, 4);
        vec3 wash = mix(vec3(0.92, 0.8, 0.58), vec3(0.78, 0.8, 0.58), smoothstep(0.4, 0.7, wn));
        c = mix(c, c * wash, (0.45 + 0.35 * near) * gran);
        float lv = log(dy + 4.0) * 4.0 + fbm(vec2(px.x / 300.0, dy / 60.0), 3) * 1.2;
        c = mix(c, ink, isoLine(lv, 1.0, 0.7) * 0.16);
        // grass tufts: little graphite ticks with a green wash, bigger toward us
        // (on perspective rows: one tuft size per row, so the cells never shear)
        float rv = log(dy + 20.0) * 9.0;
        float row = floor(rv), fy = fract(rv);
        float dyc = exp((row + 0.5) / 9.0) - 20.0;
        float gs = mix(10.0, 26.0, smoothstep(0.0, 1080.0 - HZ, dyc));
        float rowH = (dyc + 20.0) / 9.0;
        float gx = px.x / gs + hash12(vec2(row, 5.0)) * 7.0;
        vec2 gi = vec2(floor(gx), row);
        if (hash12(gi + 7.0) > 0.8) {
          vec2 gq = vec2((fract(gx) - 0.5) * gs, (fy - 0.9) * rowH);
          float tuft = 1e5;
          for (int k = -2; k <= 2; k++) tuft = min(tuft, sdSeg(gq, vec2(float(k) * 1.5, 0.0), vec2(float(k) * 3.5, -gs * (0.35 - 0.05 * abs(float(k))))));
          c = mix(c, c * vec3(0.7, 0.8, 0.6), smoothstep(gs * 0.4, 0.0, length(gq - vec2(0.0, -gs * 0.12))) * 0.5);
          c = mix(c, ink, pxLine(tuft, 1.0) * 0.45);
        }
        // pebbles
        vec2 pc2 = vec2(px.x / 34.0, dy / 14.0);
        vec2 pi2 = floor(pc2), pf2 = fract(pc2) - 0.5 - (hash22(pi2) - 0.5) * 0.4;
        float peb = length(pf2 * vec2(34.0, 14.0) * vec2(1.0, 1.6)) - (2.0 + 2.0 * hash12(pi2 + 3.0)) * (0.5 + near);
        if (hash12(pi2 + 1.0) > 0.88) { c = mix(c, c * vec3(0.8, 0.78, 0.75), fill(peb)); c = mix(c, ink, pxLine(peb, 0.9) * 0.35); }
        c *= 0.97 - 0.04 * near;
        // ruts left by the rolling wheels, and the cart's shadow
        float rut = step(${D0[0].toFixed(1)}, px.x) * step(px.x, w1.x) * pxLine(px.y - ${(GROUND + 3).toFixed(1)}, 1.2);
        c = mix(c, ink, rut * 0.35 * discK);
        if (build > 0.0) {
          float x0 = w1.x - R - 30.0, x1 = w2.x + R + 30.0;
          float sh = smoothstep(0.0, 30.0, min(px.x - x0, x1 - px.x)) * exp(-pow((px.y - ${(GROUND + 4).toFixed(1)}) / 7.0, 2.0)) * build;
          c *= 1.0 - 0.25 * sh;
        }
        float wsh = exp(-pow((px.y - ${(GROUND + 3).toFixed(1)}) / 5.0, 2.0)) * (smoothstep(R, 0.0, abs(px.x - w1.x)) * discK + smoothstep(R, 0.0, abs(px.x - w2.x)) * w2K);
        c *= 1.0 - 0.3 * wsh;
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
      c = cart(c, px);
      c = bodyShade(c, fgBody(px, 0, ${NB}, fbox[0]), Ld, Lc, vec3(0.035, 0.026, 0.02), vec3(0.28, 0.16, 0.09), vec3(0.27, 0.095, 0.045), 0.0, 0.0, lineC, 6.0, 1.0);
      fragColor = vec4(c, 1.0);
    }`, {
    t: { value: 0 }, paint: { value: null }, order: { value: null }, w1: { value: new THREE.Vector2() }, w2: { value: new THREE.Vector2() },
    rot: { value: 0 }, discK: { value: 0 }, discA: { value: 0 }, build: { value: 0 }, pb: { value: 0 }, loadK: { value: 0 }, holeK: { value: 0 }, spokeK: { value: 0 }, w2K: { value: 0 }, tNorm: { value: 0 },
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
    u.build!.value = ease.inOutCubic(clamp((t - (CART + 0.15)) / 0.5));
    u.pb!.value = ease.outCubic(clamp((t - (CART + 0.45)) / 0.3));
    u.loadK!.value = clamp((t - (CART + 0.6)) / 0.35);
    const ppl = this.people(t);
    ppl.forEach((p, i) => { this.bones.set(i * NB, NB, p); (u.fbox!.value as THREE.Vector4[])[i]!.copy(boxOf(p, 10)); });
    this.pass.render(r, out);

    // the cart is drawn in the shader above (wood, rope, a load); here only the chips of the strikes
    const L = this.lines;
    L.clear();
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
