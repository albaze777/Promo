// The topography shader shared by World (02) and Human (03): a planet drawn only with iso-height
// contour hairlines, hillshade and a thin atmosphere; an infinite-zoom dive (octaves and contour levels
// are added as the zoom deepens); the relief of a hand that rises out of the same field; a stone wall.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { NB } from '../motifs/figure';
import { BODY_COMMON_GLSL, bodyGLSL } from './relief';

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
}

export function defaultTopo(): TopoState {
  return {
    center: [960, 540], radius: 236, rot: new THREE.Matrix3(), sea: 0.5, zoom: 1, land: new THREE.Vector3(0, 0, 1),
    life: 0, ripple: 0, rippleAmp: 0, redCoast: 0, reveal: 1, warm: 0, handMix: 0, handPos: [0, 0], handRot: 0, handScale: 1,
    stone: 0, drainCenter: [0, 0], drainR: 1e5, atmo: 1, handFlip: 1,
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
    ${TERRAIN_GLSL}
    ${BODY_COMMON_GLSL}
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
        float g = exp(-(rr - 1.0) * 26.0) * 0.08 + exp(-(rr - 1.0) * 6.0) * 0.015;
        vec2 ld = normalize(vec2(-0.6, -0.55));
        float lit = 0.35 + 0.65 * sat(dot(normalize(q), ld) * 0.8 + 0.5);
        col += vec3(1.0, 0.93, 0.86) * g * lit * atmo * reveal;
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
      Body fig; fig.d = 1e5; fig.mat = 1.0; fig.uv = vec2(0.0); fig.r = 1.0; fig.t = vec2(1.0, 0.0); fig.round = 0.0; fig.n = vec3(0.0, 0.0, 1.0);
      if (bodyK > 0.0) {
        float dH = 1e5, dF = 1e5;
        if (handMorph > 0.0) { vec2 hp = rot2(-handRot) * (px - handPos) / handScale; hp.y *= handFlip; dH = sdHand(hp) * handScale; }
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
      // base: ocean (cold, deep) / land (warm graphite)
      vec3 ocean = mix(vec3(0.004, 0.006, 0.010), vec3(0.008, 0.011, 0.016), sat((h - sea + 0.12) * 6.0));
      vec3 ground = mix(vec3(0.013, 0.012, 0.011), vec3(0.024, 0.021, 0.018), sat((h - sea) * 8.0));
      ground = mix(ground, mix(ground, C_WARMBONE * 0.045, 0.5), warm);
      vec3 base = mix(ocean, ground * (0.55 + 0.9 * shade), land01);
      // life: warmth spreading from the touchdown point
      float ang = acos(clamp(dot(normalize(p), normalize(land)), -1.0, 1.0));
      float alive = smoothstep(life, life - 0.15, ang) * land01;
      base = mix(base, base + C_OCHRE * 0.035 * (0.5 + 0.5 * shade), alive);
      // contours: major + minor levels, cross-faded so the zoom reveals ever finer lines
      float cMaj = iso(h - sea, stepU, 1.05);
      float cMin = iso(h - sea, stepF, 0.8) * fineK;
      float lineK = mix(0.10, 0.34, land01);
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
        vec3 skin = mix(C_WARMINK * 1.4, C_WARMBONE * 0.13, hs);
        c = mix(c, skin, inside * bodyK * 0.92);
        float rings = iso(hh, 6.5, 0.9) * inside * smoothstep(0.0, 6.0, -hd);
        float outline = pxLine(hd, 1.7);
        float echo = iso(hd, 15.0 * echoR / 95.0, 0.8) * smoothstep(echoR, 4.0, hd) * step(0.0, hd);
        vec3 lc = mix(C_BONE, C_WARMBONE, 0.6);
        c += lc * bodyK * (rings * (0.16 + 0.32 * hs) + outline * 0.75 + echo * 0.16);
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
    atmo: { value: 1 }, handFlip: { value: 1 },
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
    u.drainR!.value = s.drainR; u.atmo!.value = s.atmo; u.handFlip!.value = s.handFlip;
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
