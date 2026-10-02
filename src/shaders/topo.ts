// The topography shader shared by World (02) and Human (03): a planet drawn only with iso-height
// contour hairlines, hillshade and a thin atmosphere; an infinite-zoom dive (octaves and contour levels
// are added as the zoom deepens); the relief of a hand that rises out of the same field; a stone wall.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { NB } from '../motifs/figure';
import { bodyCommon, bodyGLSL } from './relief';
import { SPACE_GLSL, spaceDrift } from './space';
import { CAM_END } from '../motifs/orbit';

/** Where Origin's sky ends up: the planet's sky continues it exactly. */
const SKY = spaceDrift(CAM_END.x, CAM_END.z);

export const TERRAIN_GLSL = /* glsl */ `
float terrain(vec3 p, float oct) {
  float s = 0.0, a = 0.5, fr = 1.7;
  for (int i = 0; i < 13; i++) {
    float w = sat(oct - float(i));
    if (w <= 0.0) break;
    s += a * w * (vnoise3(p * fr + vec3(float(i) * 7.31, float(i) * 3.17, float(i) * 5.13)) - 0.5);
    fr *= 2.03; a *= 0.5;
  }
  return 0.5 + s;
}`;

/** The hand: capsules in a canonical frame (fingers along +x, index finger extended), px units. */
export const HAND_GLSL = /* glsl */ `
float sdHand(vec2 p) {
  float d = sdCapsule(p, vec2(-900.0, 8.0), vec2(-150.0, 0.0), 82.0, 64.0);              // forearm
  d = smin(d, sdCapsule(p, vec2(-40.0, -28.0), vec2(70.0, -30.0), 70.0, 60.0), 40.0);      // palm
  d = smin(d, sdCapsule(p, vec2(-40.0, 30.0), vec2(60.0, 40.0), 64.0, 52.0), 40.0);
  d = smin(d, sdCapsule(p, vec2(80.0, -46.0), vec2(215.0, -54.0), 25.0, 22.0), 16.0);      // index proximal
  d = smin(d, sdCapsule(p, vec2(215.0, -54.0), vec2(330.0, -50.0), 22.0, 18.5), 10.0);     // index distal
  d = smin(d, sdCapsule(p, vec2(92.0, -10.0), vec2(150.0, -4.0), 26.0, 23.0), 16.0);       // middle (curled)
  d = smin(d, sdCapsule(p, vec2(150.0, -4.0), vec2(118.0, 22.0), 23.0, 20.0), 10.0);
  d = smin(d, sdCapsule(p, vec2(86.0, 26.0), vec2(138.0, 36.0), 24.0, 21.0), 16.0);        // ring
  d = smin(d, sdCapsule(p, vec2(138.0, 36.0), vec2(108.0, 56.0), 21.0, 18.0), 10.0);
  d = smin(d, sdCapsule(p, vec2(72.0, 58.0), vec2(112.0, 72.0), 20.0, 17.0), 14.0);        // little
  d = smin(d, sdCapsule(p, vec2(112.0, 72.0), vec2(90.0, 86.0), 17.0, 15.0), 8.0);
  d = smin(d, sdCapsule(p, vec2(-30.0, -60.0), vec2(55.0, -100.0), 32.0, 25.0), 26.0);     // thumb
  d = smin(d, sdCapsule(p, vec2(55.0, -100.0), vec2(112.0, -98.0), 24.0, 20.0), 12.0);
  return d;
}`;
/** Shared cave-wall stone (also the ground of the first art era). */
export const STONE_GLSL = /* glsl */ `
vec3 stoneColor(vec2 px) {
  float n = fbm(px / 260.0, 5);
  float m = fbm(px / 46.0 + 3.7, 4);
  float grain = vnoise(px / 2.2) * 0.6 + vnoise(px / 5.0) * 0.4;
  float v = 1.0 - abs(fbm(px / 230.0 + 11.0, 4) * 2.0 - 1.0);
  float crack = smoothstep(0.965, 0.992, v);
  vec3 a = vec3(0.052, 0.034, 0.021), b = vec3(0.175, 0.118, 0.072);
  vec3 c = mix(a, b, smoothstep(0.2, 0.85, n * 0.75 + m * 0.4));
  c *= 0.84 + 0.26 * grain;
  float dx = fbm((px + vec2(2.5, 0.0)) / 46.0 + 3.7, 4) - m;
  c *= 1.0 - dx * 5.0;
  c *= 1.0 - crack * 0.4;
  // torchlight pooled around the first mark
  float d = length(px - vec2(880.0, 520.0));
  c *= 0.5 + 0.75 * exp(-d / 760.0);
  return c;
}`;
export const HAND_TIP: [number, number] = [348, -50];

export interface TopoState {
  center: [number, number];
  radius: number;
  /** view → body rotation */
  rot: THREE.Matrix3;
  sea: number;
  zoom: number;
  land: THREE.Vector3;
  life: number;         // angular radius (rad) reached by life
  ripple: number;       // angular radius of the touchdown ripple
  rippleAmp: number;
  redCoast: number;
  reveal: number;       // contour draw-in
  warm: number;
  handMix: number;
  handPos: [number, number];
  handRot: number;
  handScale: number;
  /** −1 mirrors the canonical hand (it reaches in from the upper left) */
  handFlip: number;
  /** 03a: the walking figure (bones of the main figure + 2 ghosts), its visibility, and the morph into the hand */
  figMix: number;
  handMorph: number;
  figGrow: number;
  figSmooth: number;
  echoR: number;
  ghostA: [number, number];
  bones: Float32Array;   // 3 × NB × (ax, ay, bx, by) screen px
  radii: Float32Array;   // 3 × NB × (ra, rb, smoothing, material) px (ra 0 = unused)
  /** 1 = the ape's fur, 0 = bare skin */
  furK: number;
  boxes: Float32Array;   // 3 × (x0, y0, x1, y1)
  recede: number;
  stone: number;
  drainCenter: [number, number];
  drainR: number;
  atmo: number;
  /** story time (waves, clouds, twinkle) */
  time: number;
}

export function defaultTopo(): TopoState {
  return {
    center: [960, 540], radius: 236, rot: new THREE.Matrix3(), sea: 0.5, zoom: 1, land: new THREE.Vector3(0, 0, 1),
    life: 0, ripple: 0, rippleAmp: 0, redCoast: 0, reveal: 1, warm: 0, handMix: 0, handPos: [0, 0], handRot: 0, handScale: 1,
    stone: 0, drainCenter: [0, 0], drainR: 1e5, atmo: 1, handFlip: 1, time: 0,
    figMix: 0, handMorph: 1, figGrow: 0, figSmooth: 6, echoR: 95, ghostA: [0, 0],
    bones: new Float32Array(3 * NB * 4), radii: new Float32Array(3 * NB * 4), furK: 1, boxes: new Float32Array(12).fill(-1e5), recede: 0.3,
  };
}

export class TopoPass {
  pass = new FSPass(/* glsl */ `
    uniform vec2 center; uniform float radius; uniform mat3 rot; uniform float sea; uniform float zoom;
    uniform vec3 land; uniform float life, ripple, rippleAmp, redCoast, reveal, warm;
    uniform float handMix; uniform vec2 handPos; uniform float handRot, handScale; uniform float stone;
    uniform vec2 drainCenter; uniform float drainR; uniform float atmo; uniform float handFlip;
    uniform vec4 fBox[3];
    uniform float figMix, handMorph, figGrow, figSmooth, echoR, recede, furK; uniform vec2 ghostA;
    uniform float time;
    ${TERRAIN_GLSL}
    ${SPACE_GLSL}
    ${bodyCommon('organic')}
    ${bodyGLSL('fg', 3 * NB)}
    float sdFig(vec2 p, int f) { return fgBody(p, f * ${NB}, ${NB}, fBox[f]).d; }
    ${HAND_GLSL}
    ${STONE_GLSL}
    float iso(float h, float stepU, float w) {
      float x = h / stepU;
      float fw = max(fwidth(x), 1e-5);
      float d = abs(fract(x - 0.5) - 0.5) / fw;
      // lines narrower than a pixel apart fade out instead of moiré
      float density = sat(1.6 - fw * 3.0);
      return sat(w * PX_SCALE * 0.5 + 0.5 - d) * density;
    }
    void main() {
      vec2 px = FRAG_PX;
      vec2 q = (px - center) / radius;
      float r2 = dot(q, q);
      vec3 col = C_INK * 0.55;
      float lvl = log2(max(zoom, 1.0));
      // warm grade for the human chapter
      vec3 inkW = mix(C_INK * 0.55, C_WARMINK * 0.9, warm);
      col = inkW;
      // atmosphere: thin, warm-white, outside the limb (fades with the dive)
      float rr = sqrt(r2);
      if (rr > 1.0) {
        col += spaceBg(px / RES.y + vec2(${SKY[0].toFixed(5)}, ${SKY[1].toFixed(5)}), 0.5 * atmo * (1.0 - warm), time);
        float g = exp(-(rr - 1.0) * 26.0) * 0.08 + exp(-(rr - 1.0) * 6.0) * 0.015;
        vec2 ld = normalize(vec2(-0.6, -0.55));
        float lit = 0.35 + 0.65 * sat(dot(normalize(q), ld) * 0.8 + 0.5);
        // a thin blue scattering rim inside a warm-white halo
        vec3 atC = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.93, 0.86), smoothstep(0.0, 0.03, rr - 1.0));
        col += atC * g * lit * atmo * reveal;
        fragColor = vec4(col, 1.0);
        return;
      }
      vec3 nv = vec3(q.x, -q.y, sqrt(max(0.0, 1.0 - r2)));     // view-space normal (y up)
      vec3 p = rot * nv;                                       // body coordinates
      float oct = clamp(log2(radius / 11.0), 3.0, 13.0);
      float h = terrain(p, oct);
      // the hand: relief rising out of the same field (screen space)
      // the body: the walking figure (03a), the hand (03b), or the morph between them
      float bodyK = max(handMix, figMix);
      float hd = 1e5;
      vec2 hcan = vec2(1e5);                                   // the pixel in the hand's canonical frame
      Body fig; fig.d = 1e5; fig.mat = 1.0; fig.uv = vec2(0.0); fig.r = 1.0; fig.t = vec2(1.0, 0.0); fig.round = 0.0; fig.n = vec3(0.0, 0.0, 1.0); fig.p = vec2(0.0); fig.ao = 0.0;
      if (bodyK > 0.0) {
        float dH = 1e5, dF = 1e5;
        if (handMorph > 0.0) { vec2 hp = rot2(-handRot) * (px - handPos) / handScale; hp.y *= handFlip; dH = sdHand(hp) * handScale; hcan = hp; }
        if (handMorph < 1.0) { fig = fgBody(px, 0, ${NB}, fBox[0]); dF = fig.d + figGrow; }
        hd = handMorph <= 0.0 ? dF : handMorph >= 1.0 ? dH : mix(dF, dH, handMorph);
      }
      float stepU = 0.05 / pow(2.0, floor(lvl));
      float stepF = stepU * 0.5;
      float fineK = fract(lvl);
      float land01 = smoothstep(sea - 0.0015, sea + 0.0015, h);
      // lighting: sphere terminator × hillshade from the height gradient
      vec3 L = normalize(vec3(-0.55, 0.5, 0.67));
      float sphereLit = sat(dot(nv, L) * 1.2 + 0.25);
      sphereLit = mix(sphereLit, 1.0, sat(lvl / 3.0));       // deep in the dive the sphere is flat & lit
      vec2 g = vec2(dFdx(h), dFdy(h)) / max(stepU, 1e-6);
      float shade = sat(0.6 + dot(normalize(vec3(-g * 0.9, 1.0)), normalize(vec3(-0.6, 0.6, 0.55))) * 0.55 - 0.15);
      float hs = h - sea;                                      // height above the sea
      float ang = acos(clamp(dot(normalize(p), normalize(land)), -1.0, 1.0));
      float aliveK = smoothstep(life, life - 0.15, ang);      // life spreads from the touchdown point
      float alive = aliveK * land01;
      // fine texture that stays put on the ground: noise in body coordinates, an octave finer per zoom level
      float fz = 70.0 * pow(2.0, floor(lvl));
      float tex1 = vnoise3(p * fz + 3.1), tex2 = vnoise3(p * fz * 2.0 + 8.7);
      float tex = mix(tex1, tex2, fineK);
      float texW = fwidth(tex);
      float moist = vnoise3(p * 5.0 + 11.0) * 0.7 + vnoise3(p * 13.0 + 2.0) * 0.3;
      // rivers: a large field whose sample point is warped by a finer one, so they meander at every zoom
      vec3 pw = p;
      for (int k = 0; k < 2; k++) {
        float f = fz * (k == 0 ? 0.05 : 0.1);
        vec3 wv = vec3(vnoise3(pw * f + 1.7), vnoise3(pw * f + 4.3), vnoise3(pw * f + 8.1)) - 0.5;
        pw += wv * (k == 0 ? 1.0 - fineK : fineK) * 2.4 / f;
      }
      float rv = vnoise3(pw * 12.0 + 5.0) * 0.65 + vnoise3(pw * 29.0 + 9.0) * 0.35;
      // forest patches that keep their size on screen
      float fpatch = mix(vnoise3(p * fz * 0.09 + 6.1), vnoise3(p * fz * 0.18 + 2.9), fineK);
      float rvW = fwidth(rv);
      float pole = smoothstep(0.82, 0.9, abs(p.y) + 0.06 * (vnoise3(p * 9.0) - 0.5));
      // ---- the sea: a turquoise shelf falling to a deep ultramarine, waves rolling in, surf at the shore ----
      float depth = sat(-hs / 0.08);
      vec3 ocean = mix(vec3(0.010, 0.034, 0.038), vec3(0.004, 0.010, 0.022), smoothstep(0.0, 0.55, depth));
      ocean = mix(ocean, vec3(0.0018, 0.0035, 0.010), smoothstep(0.5, 1.0, depth));
      float dd = -hs / stepU;                                    // depth in contour steps (the same at every zoom)
      // map coordinates that pan and zoom with the ground (two octaves cross-faded per zoom level)
      vec2 m1 = (px - center) * pow(2.0, -fineK);
      vec2 mr = rot2(0.35) * m1;
      float near = 1.0 - smoothstep(0.2, 1.2, 1.0 - lvl);       // only once we are close to the surface
      // wind ripples: short bright streaks drifting across the water
      float rip1 = vnoise(vec2(mr.x / 38.0, mr.y / 2.6) + vec2(time * 0.7, 0.0));
      float rip2 = vnoise(vec2(mr.x / 19.0, mr.y / 1.3) + vec2(time * 1.4, 3.0));
      float ripple = smoothstep(0.66, 0.92, mix(rip1, rip2, fineK)) * (0.5 + 0.5 * smoothstep(0.3, 0.7, fpatch));
      // glints: points of sun that flicker
      vec2 gc = floor(m1 / 7.0);
      float glit = step(0.992, hash12(gc + floor(time * 6.0 + hash12(gc) * 6.0))) * smoothstep(2.4, 0.0, length(m1 - (gc + 0.5) * 7.0));
      // surf: a broken white fringe at the shore and a second line that runs in and out
      float fn = vnoise(m1 / 9.0 + vec2(time * 0.9, -time * 0.4)) * 0.6 + vnoise(m1 / 3.5 - time) * 0.4;
      // (near this coast a depth step is only a few px, so the bands are a few steps wide)
      float fringe = smoothstep(1.6, 0.4, dd + 1.2 * (fn - 0.5)) * step(0.0, dd);
      float runup = 2.6 + 0.9 * sin(time * 1.7 + fpatch * 6.0);
      float surfL = smoothstep(0.45, 0.0, abs(dd - runup) - 0.2 + 0.5 * (fn - 0.5)) * smoothstep(0.35, 0.6, fn);
      float sea01 = 1.0 - land01;
      ocean += vec3(0.02, 0.03, 0.032) * ripple * (1.0 - 0.6 * depth) * near * sea01;
      ocean += vec3(1.0, 0.95, 0.85) * 0.25 * glit * near * sea01;
      ocean = mix(ocean, vec3(0.13, 0.15, 0.15) * (0.8 + 0.4 * fn), (fringe * 0.7 + surfL * 0.45) * near * sea01);
      ocean += vec3(0.006, 0.01, 0.012) * (tex - 0.5) * (1.0 - depth * 0.5);   // ripples
      // ---- the land: bare rock until life reaches it; then green lowlands, forests, ochre uplands, pale peaks ----
      float el = sat(hs / 0.32);
      vec3 rock = mix(vec3(0.016, 0.014, 0.012), vec3(0.03, 0.026, 0.021), smoothstep(0.0, 0.6, el)) * (0.85 + 0.3 * tex);
      vec3 veg = mix(vec3(0.014, 0.027, 0.012), vec3(0.03, 0.03, 0.013), smoothstep(0.08, 0.38, el - 0.12 * (moist - 0.5)));
      veg = mix(veg, vec3(0.034, 0.024, 0.016), smoothstep(0.4, 0.65, el));
      // dry belts either side of the equator: savanna, then sand deserts with dunes
      float lat = abs(normalize(p).y);
      float dry = smoothstep(0.42, 0.25, moist + 0.25 * (1.0 - smoothstep(0.15, 0.45, abs(lat - 0.42)))) * (1.0 - smoothstep(0.3, 0.5, el));
      vec3 sand = vec3(0.07, 0.05, 0.028) * (0.85 + 0.25 * sin(dot(p, vec3(40.0, 0.0, 30.0)) * fz * 0.02 + tex * 2.0));
      veg = mix(veg, mix(vec3(0.042, 0.036, 0.018), sand, smoothstep(0.4, 0.9, dry)), smoothstep(0.1, 0.5, dry));
      float forest = smoothstep(0.52, 0.64, moist * 0.55 + fpatch * 0.45) * (1.0 - smoothstep(0.35, 0.55, el)) * smoothstep(0.0, 0.03, hs) * (1.0 - smoothstep(0.1, 0.4, dry));
      float stip = smoothstep(0.58 - texW, 0.66 + texW, tex);
      veg = mix(veg, vec3(0.006, 0.016, 0.007), forest * (0.45 + 0.55 * stip));
      vec3 ground = mix(rock, veg, aliveK);
      ground = mix(ground, vec3(0.062, 0.05, 0.034), smoothstep(0.012, 0.0, hs) * land01);      // a beach
      ground = mix(ground, vec3(0.1, 0.1, 0.1), smoothstep(0.86, 0.94, el + 0.08 * (tex - 0.5)));  // snow on the peaks
      ground = mix(ground, mix(ground, C_WARMBONE * 0.045, 0.5), warm * 0.6);
      vec3 base = mix(ocean, ground * (0.55 + 0.9 * shade), land01);
      // seen from close above: tree crowns in the forests and scattered shrubs and rocks in the open, each with a
      // shadow to the lower right (cells in map space, so they pan and zoom with the ground)
      if (near > 0.0 && land01 > 0.0) {
        for (int k = 0; k < 2; k++) {
          float cs = k == 0 ? 15.0 : 30.0;                     // two sizes, cross-faded with the zoom
          float wk = k == 0 ? 1.0 - fineK : fineK;
          vec2 g = m1 / cs, gi = floor(g);
          vec2 o = hash22(gi + float(k) * 17.0) * 0.6 + 0.2;
          vec2 d = (g - gi - o) * cs;
          float hsh = hash12(gi + 3.0 + float(k) * 9.0);
          float treeK = forest * aliveK;
          float isTree = step(1.0 - smoothstep(0.0, 0.6, treeK) * 0.9, hsh);
          float isBush = step(0.8, hsh) * (1.0 - isTree) * aliveK * (1.0 - smoothstep(0.4, 0.6, el)) * (1.0 - pole);
          float isRock = step(hash12(gi + 11.0), 0.05) * (1.0 - isTree) * (1.0 - isBush);
          float r = cs * (isTree > 0.5 ? 0.36 + 0.1 * hash12(gi + 5.0) : isBush > 0.5 ? 0.18 : 0.14);
          float on = max(isTree, max(isBush, isRock)) * wk * near * land01 * smoothstep(0.0, 0.01, hs);
          if (on <= 0.0) continue;
          float ds = length(d - vec2(r * 0.35, r * 0.45)) - r;      // the shadow
          base *= 1.0 - 0.65 * on * smoothstep(1.0, -1.5, ds);
          float dc = length(d) - r;
          vec3 col = isRock > 0.5 ? vec3(0.09, 0.085, 0.078) : isTree > 0.5 ? vec3(0.016, 0.05, 0.018) : vec3(0.045, 0.06, 0.02);
          float lit = sat(0.55 - dot(d / max(r, 1.0), vec2(0.6, 0.6)) * 0.6);      // lit from the upper left
          col *= 0.45 + 1.4 * lit;
          col *= 0.85 + 0.3 * vnoise(d * 0.6 + gi);                               // leaf clumps
          base = mix(base, col, on * smoothstep(1.0, -1.0, dc));
        }
      }
      // rivers: meandering lines that run through the lowlands to the sea
      float rwid = min(0.0035, rvW * 1.6);
      float lowland = land01 * (1.0 - smoothstep(0.1, 0.3, el)) * smoothstep(0.35, 0.6, moist + 0.2);
      float river = (1.0 - smoothstep(rwid, rwid + rvW, abs(rv - 0.5))) * lowland;
      base = mix(base, vec3(0.014, 0.045, 0.052), river * 0.9 * aliveK);
      // ice at the poles
      base = mix(base, vec3(0.11, 0.115, 0.12) * (0.6 + 0.6 * shade), pole);
      base = mix(base, base + C_OCHRE * 0.012 * (0.5 + 0.5 * shade), alive);
      // contours: major + minor levels, cross-faded so the zoom reveals ever finer lines
      float cMaj = iso(h - sea, stepU, 1.05);
      float cMin = iso(h - sea, stepF, 0.8) * fineK;
      float lineK = mix(0.10, 0.34, land01) * mix(0.55, 1.0, smoothstep(0.3, 1.5, lvl));
      vec3 lineC = mix(C_BONE, C_WARMBONE, warm);
      float lines = (cMaj * lineK + cMin * lineK * 0.45);
      // terrain recedes while the hand is present
      lines *= mix(1.0, recede, bodyK);
      lines *= mix(1.0, 0.1, bodyK * smoothstep(echoR + 15.0, 0.0, hd));
      // coastline
      float coast = iso(h - sea, 1.0, 1.4) * step(abs(h - sea), 0.5);
      coast = max(coast, 0.0);
      vec3 c = base;
      c += lineC * lines * reveal;
      c += lineC * coast * 0.55 * reveal * (1.0 - redCoast * alive);
      // the red coast: the line, spread by life, drained back into the fingertip later
      float drain = smoothstep(drainR, drainR - 40.0, length(px - drainCenter));
      c += C_LINE * coast * redCoast * alive * drain * 1.6;
      // touchdown ripple, drawn on the sphere (foreshortens for free)
      float rip = exp(-pow((ang - ripple) * radius * 0.6, 2.0) * 0.5) * rippleAmp;
      c += C_LINE * rip * 0.6 + C_BONE * rip * 0.15;
      // the hand: its own contour system — a dome over its silhouette, sculpted by concentric lines
      if (bodyK > 0.0) {
        vec3 c0 = c;
        float inside = smoothstep(1.5, -1.5, hd);
        float hh = sqrt(max(0.0, -hd) * 34.0);
        vec2 hg = vec2(dFdx(hh), dFdy(hh));
        vec3 hn = normalize(vec3(-hg * 1.4, 1.0));
        float hs = sat(dot(hn, normalize(vec3(-0.55, 0.65, 0.6))));
        // skin: the walking human's (03a), lit and warm at the rims, with fine texture
        vec3 skinH = vec3(0.21, 0.115, 0.068);
        float rimH = pow(1.0 - hn.z, 2.0);
        vec3 skin = skinH * (0.22 + 1.05 * hs) * vec3(1.0, 0.92, 0.84) + skinH * vec3(1.0, 0.45, 0.3) * rimH * 0.4;
        skin *= 0.93 + 0.1 * vnoise(hcan / 1.8) + 0.05 * vnoise(hcan / 7.0);
        // veins on the back of the hand and the wrist
        float vn = abs(vnoise(vec2(hcan.x / 75.0, hcan.y / 24.0) + 3.0) - 0.5);
        float vein = smoothstep(0.04, 0.0, vn) * smoothstep(-260.0, -80.0, hcan.x) * (1.0 - smoothstep(40.0, 85.0, hcan.x));
        skin = mix(skin, skin * vec3(0.62, 0.7, 0.92), vein * 0.7);
        // knuckles: the skin stretched bright over the curled fingers and the base of the index
        float kn = 0.0;
        kn += exp(-dot(hcan - vec2(150.0, -4.0), hcan - vec2(150.0, -4.0)) / 260.0);
        kn += exp(-dot(hcan - vec2(138.0, 36.0), hcan - vec2(138.0, 36.0)) / 230.0);
        kn += exp(-dot(hcan - vec2(112.0, 72.0), hcan - vec2(112.0, 72.0)) / 190.0);
        kn += exp(-dot(hcan - vec2(84.0, -46.0), hcan - vec2(84.0, -46.0)) / 300.0);
        skin *= 1.0 + 0.3 * kn;
        // tendons fanning from the wrist to each knuckle on the back of the hand: a lit ridge with a shadow beside it
        float tend = 0.0, tendS = 0.0;
        for (int j = 0; j < 4; j++) {
          float yk = j == 0 ? -46.0 : j == 1 ? -10.0 : j == 2 ? 26.0 : 62.0;
          float k = sat((hcan.x + 110.0) / 190.0);
          float yl = mix(yk * 0.35, yk, k);
          float dy = hcan.y - yl;
          float m = smoothstep(-110.0, -60.0, hcan.x) * smoothstep(80.0, 50.0, hcan.x);
          tend += exp(-dy * dy / 22.0) * m; tendS += exp(-(dy - 7.0) * (dy - 7.0) / 18.0) * m;
        }
        skin *= 1.0 + 0.32 * tend * hs - 0.22 * tendS;
        // wrinkles over each knuckle: short lines across the finger, bunched where the skin folds
        float kw = 0.0;
        for (int j = 0; j < 4; j++) {
          vec2 kc = j == 0 ? vec2(150.0, -4.0) : j == 1 ? vec2(138.0, 36.0) : j == 2 ? vec2(112.0, 72.0) : vec2(82.0, -46.0);
          vec2 fd = j == 0 ? normalize(vec2(1.0, 0.1)) : j == 1 ? normalize(vec2(1.0, 0.2)) : j == 2 ? normalize(vec2(1.0, 0.35)) : vec2(1.0, -0.05);
          vec2 q = hcan - kc;
          float a = dot(q, fd), b = dot(q, vec2(-fd.y, fd.x));
          for (int k = 0; k < 3; k++) {
            float len = 13.0 - abs(float(k) - 1.0) * 4.0;
            kw += pxLine((a + 6.0 - float(k) * 5.0 - 1.8 * sin(b * 0.3 + float(j))) * handScale, 1.4) * smoothstep(len, len - 4.0, abs(b));
          }
        }
        skin *= 1.0 - 0.7 * sat(kw);
        // the skin's fine diamond texture, faint pores, a few freckles; fine hair on the forearm
        float dia = pxLine((abs(fract((hcan.x + hcan.y * 0.8) / 7.0) - 0.5) * 7.0) * handScale * 0.5, 0.8) + pxLine((abs(fract((hcan.x - hcan.y * 0.8) / 9.0) - 0.5) * 9.0) * handScale * 0.5, 0.8);
        skin *= 1.0 - 0.13 * sat(dia) * smoothstep(-40.0, -12.0, hd);
        vec2 fc = floor(hcan / 18.0);
        float frk = step(0.975, hash12(fc + 7.0)) * smoothstep(2.6, 1.2, length(hcan - (fc + 0.5 + (hash22(fc) - 0.5) * 0.6) * 18.0));
        skin = mix(skin, skin * vec3(0.7, 0.55, 0.45), frk * 0.6);
        float hair = smoothstep(0.82, 0.92, vnoise(vec2(hcan.x / 9.0 + hcan.y / 30.0, hcan.y / 1.1))) * smoothstep(-120.0, -200.0, hcan.x);
        skin = mix(skin, skin * 0.55, hair * 0.6);
        // creases across the index finger's joints
        float cr = 0.0;
        for (int j = 0; j < 2; j++) {
          float xj = j == 0 ? 215.0 : 276.0;
          for (int k = -1; k <= 1; k++) {
            float len = (j == 0 ? 15.0 : 12.0) - abs(float(k)) * 4.0;
            cr += pxLine((hcan.x - xj - float(k) * 5.0 - 2.5 * sin(hcan.y * 0.25)) * handScale, 1.4) * smoothstep(len, len - 4.0, abs(hcan.y + 52.0));
          }
        }
        skin *= 1.0 - 0.6 * sat(cr);
        // nails: the index finger and the thumb (a pale bed, a lunula, a white free edge, a fine rim)
        float dn1 = sdCapsule(hcan, vec2(304.0, -51.0), vec2(328.0, -50.0), 9.5, 8.5) * handScale;
        float dn2 = sdCapsule(hcan, vec2(90.0, -100.0), vec2(108.0, -99.0), 8.0, 7.0) * handScale;
        float dn = min(dn1, dn2);
        float nail = smoothstep(1.0, -1.0, dn);
        float tipK = smoothstep(326.0, 334.0, hcan.x) * step(-80.0, hcan.y) + smoothstep(106.0, 113.0, hcan.x) * step(hcan.y, -80.0);
        vec3 nailC = mix(vec3(0.26, 0.14, 0.11), vec3(0.42, 0.34, 0.27), tipK);                           // a pink bed, a pale free edge
        nailC = mix(nailC, vec3(0.32, 0.21, 0.17), smoothstep(310.0, 305.0, hcan.x) * step(-80.0, hcan.y)); // the lunula
        nailC *= 0.35 + 1.0 * hs;
        nailC += vec3(1.0, 0.95, 0.9) * 0.06 * smoothstep(2.5, 0.0, abs(hcan.y + 54.0 + (hcan.y < -80.0 ? 48.0 : 0.0))) * hs;   // a sheen
        skin = mix(skin, nailC, nail * 0.85);
        skin *= 1.0 - 0.3 * pxLine(dn, 1.0);
        c = mix(c, skin, inside * bodyK * 0.95);
        float rings = iso(hh, 6.5, 0.9) * inside * smoothstep(0.0, 6.0, -hd) * (1.0 - nail);
        float outline = pxLine(hd, 1.7);
        float echo = iso(hd, 15.0 * echoR / 95.0, 0.8) * smoothstep(echoR, 4.0, hd) * step(0.0, hd);
        vec3 lc = mix(C_BONE, C_WARMBONE, 0.6);
        c += lc * bodyK * (rings * (0.08 + 0.18 * hs) + outline * 0.75 + echo * 0.16);
        // 03a: the walking figure in full detail — fur that thins to skin, a face, hands and feet, hair, cloth
        if (handMorph < 1.0) {
          Body fb = fig; fb.d = hd;
          // the ape: near-black fur with auburn tips over a bare, dark grey face; the human: warm brown skin,
          // dark hair, a leather loincloth
          vec3 skinF = mix(vec3(0.21, 0.115, 0.068), vec3(0.15, 0.115, 0.095), furK);
          vec3 cf = bodyShade(c0, fb, normalize(vec3(-0.55, -0.6, 0.6)), vec3(1.0, 0.86, 0.7) * 0.85,
                              mix(vec3(0.045, 0.028, 0.018), vec3(0.068, 0.034, 0.018), furK), skinF, vec3(0.2, 0.1, 0.045), 0.0, furK, lc * 0.9, 6.5, bodyK);
          cf += lc * bodyK * echo * 0.16;
          c = mix(cf, c, handMorph);
        }
      }
      // ghosts: the earlier forms of the figure, left behind as fading contour echoes
      for (int g = 0; g < 2; g++) {
        float ga = g == 0 ? ghostA.x : ghostA.y;
        if (ga <= 0.0) continue;
        float dg = sdFig(px, g + 1);
        float ins = smoothstep(1.5, -1.5, dg);
        c = mix(c, c * 0.55, ins * ga * 0.6);
        float e = iso(dg, 11.0, 0.7) * smoothstep(34.0, 3.0, dg) * step(0.0, dg);
        c += mix(C_BONE, C_WARMBONE, 0.6) * ga * (pxLine(dg, 1.2) * 0.5 + e * 0.12);
      }
      // stone: contours dissolve into a cave wall
      if (stone > 0.0) {
        c = mix(c, stoneColor(px), stone);
      }
      // the planet seen whole: the sun's glint on the sea, drifting clouds with their shadows, a hazy limb
      float whole = 1.0 - smoothstep(0.3, 1.8, lvl);
      if (whole > 0.0) {
        vec3 nw = normalize(nv + vec3(tex1 - 0.5, tex2 - 0.5, 0.0) * 0.06);
        float glint = pow(sat(dot(reflect(-L, nw), vec3(0.0, 0.0, 1.0))), 60.0) * (1.0 - land01) * (1.0 - pole);
        c += vec3(1.0, 0.9, 0.75) * glint * 0.5 * whole;
        vec3 pc = p + vec3(time * 0.03, 0.0, 0.0);
        // two storms: the sample point spirals around their centres
        for (int k = 0; k < 2; k++) {
          // (centres on the visible hemisphere: view directions taken into body coordinates)
          vec3 sc = normalize(rot * normalize(k == 0 ? vec3(-0.35, 0.3, 0.88) : vec3(0.3, -0.45, 0.84)));
          float ds = length(normalize(p) - sc);
          float tw = exp(-ds * ds / 0.045) * 5.0 * (k == 0 ? 1.0 : -1.0) * (1.0 - 0.5 * ds);
          vec3 ax = sc;
          float ca = cos(tw), sa = sin(tw);
          vec3 q0 = pc - ax * dot(pc, ax);
          pc = ax * dot(pc, ax) + q0 * ca + cross(ax, q0) * sa;
        }
        float band = 0.12 * sin(normalize(p).y * 18.0 + vnoise3(p * 3.0) * 4.0);   // trade-wind streaks
        float cn = vnoise3(pc * vec3(5.0, 9.0, 5.0)) * 0.45 + vnoise3(pc * vec3(12.0, 20.0, 12.0) + 4.0) * 0.3 + vnoise3(pc * 30.0 + 7.0) * 0.15 + vnoise3(pc * 64.0 + 2.0) * 0.08 + band;
        float cs = vnoise3((pc + vec3(0.03, -0.02, 0.0)) * 4.0) * 0.55 + vnoise3((pc + vec3(0.03, -0.02, 0.0)) * 9.0 + 4.0) * 0.3;
        float clear = smoothstep(0.12, 0.3, ang);                // keep the touchdown point clear of cloud
        float cloud = smoothstep(0.58, 0.8, cn) * clear * whole;
        float shadow = smoothstep(0.6, 0.74, cs) * clear * whole;
        c *= 1.0 - shadow * 0.3;
        c *= 1.0 + 0.6 * whole * (1.0 - cloud);                  // seen whole, the surface reads brighter
        c = mix(c, vec3(0.3, 0.3, 0.3) * (0.7 + 0.45 * smoothstep(0.63, 0.9, cn)), cloud * 0.75);
        c = mix(c, vec3(0.5, 0.62, 0.8) * 0.06, pow(1.0 - nv.z, 3.0) * 0.6 * atmo * whole);
      }
      c *= sphereLit;
      // limb darkening & AA edge
      float edge = sat((1.0 - rr) * radius * PX_SCALE * 0.5);
      c = mix(inkW, c, edge);
      fragColor = vec4(c, 1.0);
    }`, {
    center: { value: new THREE.Vector2() }, radius: { value: 236 }, rot: { value: new THREE.Matrix3() }, sea: { value: 0.5 },
    zoom: { value: 1 }, land: { value: new THREE.Vector3() }, life: { value: 0 }, ripple: { value: 0 }, rippleAmp: { value: 0 },
    redCoast: { value: 0 }, reveal: { value: 1 }, warm: { value: 0 }, handMix: { value: 0 }, handPos: { value: new THREE.Vector2() },
    handRot: { value: 0 }, handScale: { value: 1 }, stone: { value: 0 }, drainCenter: { value: new THREE.Vector2() }, drainR: { value: 1e5 },
    atmo: { value: 1 }, handFlip: { value: 1 }, time: { value: 0 },
    fgA: { value: Array.from({ length: 3 * NB }, () => new THREE.Vector4()) },
    fgR: { value: Array.from({ length: 3 * NB }, () => new THREE.Vector4()) },
    furK: { value: 1 },
    fBox: { value: Array.from({ length: 3 }, () => new THREE.Vector4(-1e5, -1e5, -1e5, -1e5)) },
    figMix: { value: 0 }, handMorph: { value: 1 }, figGrow: { value: 0 }, figSmooth: { value: 6 }, echoR: { value: 95 },
    recede: { value: 0.3 }, ghostA: { value: new THREE.Vector2() },
  });

  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, s: TopoState) {
    const u = this.pass.u;
    (u.center!.value as THREE.Vector2).set(s.center[0], s.center[1]);
    u.radius!.value = s.radius;
    (u.rot!.value as THREE.Matrix3).copy(s.rot);
    u.sea!.value = s.sea; u.zoom!.value = s.zoom;
    (u.land!.value as THREE.Vector3).copy(s.land);
    u.life!.value = s.life; u.ripple!.value = s.ripple; u.rippleAmp!.value = s.rippleAmp; u.redCoast!.value = s.redCoast;
    u.reveal!.value = s.reveal; u.warm!.value = s.warm; u.handMix!.value = s.handMix;
    (u.handPos!.value as THREE.Vector2).set(s.handPos[0], s.handPos[1]);
    u.handRot!.value = s.handRot; u.handScale!.value = s.handScale; u.stone!.value = s.stone;
    (u.drainCenter!.value as THREE.Vector2).set(s.drainCenter[0], s.drainCenter[1]);
    u.drainR!.value = s.drainR; u.atmo!.value = s.atmo; u.handFlip!.value = s.handFlip; u.time!.value = s.time;
    u.figMix!.value = s.figMix; u.handMorph!.value = s.handMorph; u.figGrow!.value = s.figGrow; u.figSmooth!.value = s.figSmooth;
    u.echoR!.value = s.echoR; u.recede!.value = s.recede; u.furK!.value = s.furK; (u.ghostA!.value as THREE.Vector2).set(s.ghostA[0], s.ghostA[1]);
    if (s.figMix > 0 || s.ghostA[0] > 0 || s.ghostA[1] > 0) {
      const fb = u.fgA!.value as THREE.Vector4[], fr = u.fgR!.value as THREE.Vector4[], bx = u.fBox!.value as THREE.Vector4[];
      for (let i = 0; i < 3 * NB; i++) { fb[i]!.fromArray(s.bones, i * 4); fr[i]!.fromArray(s.radii, i * 4); }
      for (let i = 0; i < 3; i++) bx[i]!.fromArray(s.boxes, i * 4);
    }
    this.pass.render(r, out);
  }
}
