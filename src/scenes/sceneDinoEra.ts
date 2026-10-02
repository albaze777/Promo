// 05a THE CANCELLED ARTWORK — the dino era (a panel scene, hosted by the gallery).
// A prehistoric dusk: contour-hatched ridges and a smoking volcano, a ground of perspective contours, ferns
// drawn as hairlines. A long-necked herbivore grazes; a predator stalks in from the left and lunges. Both are
// detailed capsule bodies (skull, jaw, teeth, eyes, nostrils, toes and claws, scaled skin with a paler belly).
// The red point has hung in the sky like a star the whole time. It heats from red to white and falls as a
// real meteor: a white-hot head, a yellow-orange fire tail, a smoke trail that lingers, shedding sparks. It
// strikes beyond the ridge: a flash, a fireball rising behind the mountains, debris thrown in burning arcs,
// a mushroom column with a fire-lit underside, a dust surge rolling along the horizon, the creatures lit by
// the fire, and the film's hairline shockwave. The host freezes the boom frame and pulls back out.
import * as THREE from 'three';
import { PanelScene, type Frame } from '../engine/scene';
import { FSPass, makeRT, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, BONE, rgba } from '../motifs/line';
import { BODY_COMMON_GLSL, bodyGLSL, PartArray, boxOf, MAT, type Part } from '../shaders/relief';
import { CUE } from '../timeline/cues';
import { Rng, clamp, ease, lerp, smoothstep, TAU, bez, mulberry32, type V2 } from '../utils/math';

const T0 = CUE.dinoIn, T_FULL = CUE.dino, STALK = CUE.stalk, LUNGE = CUE.lunge, METEOR = CUE.meteor, IMPACT = CUE.impact, BOOM = CUE.boom;
const H0 = 640;                       // horizon
const I: V2 = [372, 626];             // impact point (on the horizon, behind the ridge)
const STAR: V2 = [1430, 176];         // where the red point hangs while the herbivore grazes
const NS = 64, NR = 88;               // parts per creature
const NFIRE = 16, NSMOKE = 24;

/** Camera inside the panel: a slow push and a drift to the left (parallax by depth). */
function camAt(t: number) {
  const k = ease.inOutSine(clamp((t - T0) / (BOOM - T0)));
  return { s: 1 + 0.05 * k, x: -70 * k };
}
const PIV: V2 = [960, 640];
const toScr = (t: number, p: V2, depth = 1): V2 => {
  const c = camAt(t);
  return [PIV[0] + (p[0] - PIV[0]) * c.s + c.x * depth, PIV[1] + (p[1] - PIV[1]) * c.s];
};

/** The meteor: path parameter at t (it accelerates as it nears), position, and how hot it glows. */
const meteorU = (t: number) => clamp((t - METEOR) / (IMPACT - METEOR)) ** 2.4;
const meteorPos = (u: number): V2 => bez(STAR, [1170, 186], [720, 356], I, u);
const heatAt = (t: number) => smoothstep(METEOR, METEOR + 0.55, t) * (t < IMPACT ? 1 : 0);

const P = (a: V2, b: V2, ra: number, rb: number, mat: number = MAT.SCALE, k = 10): Part => ({ a, b, ra, rb, mat, k });
const add = (p: V2, d: V2, s: number): V2 => [p[0] + d[0] * s, p[1] + d[1] * s];
const dirOf = (a: number): V2 => [Math.cos(a), Math.sin(a)];

export default class SceneDinoEra extends PanelScene {
  parts = new PartArray(NS + NR);
  ferns = new LineBatch(9000);
  front = new LineBatch(6000);
  fx = new LineBatch(4000);
  fxRT = makeRT();
  motif = new LineMotif();
  fernSet: { x: number; y: number; h: number; lean: number; n: number; ph: number; front: boolean }[] = [];
  ejecta: { a: number; v: number; size: number; big: boolean }[] = [];
  sparks: { tb: number; dx: number; dy: number }[] = [];
  pass = new FSPass(/* glsl */ `
    uniform float t, camS, camX, heat, mBright;
    uniform vec4 mBox, sBox; uniform vec4 gBox[8]; uniform vec2 gRange[8];
    uniform vec2 mtr[${NFIRE}]; uniform vec3 smk[${NSMOKE}];
    uniform sampler2D ridges, fx;
    ${BODY_COMMON_GLSL}
    ${bodyGLSL('cr', NS + NR)}
    const vec2 I = vec2(${I[0].toFixed(1)}, ${I[1].toFixed(1)});
    const float H0 = ${H0.toFixed(1)};
    /** A creature as up to four groups of parts (legs, torso, head, tail), each with its own bounding box:
     *  a pixel only evaluates the groups near it. The groups are smooth-unioned and their normals blended. */
    Body creature(vec2 px, int g0) {
      Body R; R.d = 1e5; R.mat = 0.0; R.uv = vec2(0.0); R.r = 1.0; R.t = vec2(1.0, 0.0); R.round = 0.0; R.n = vec3(0.0, 0.0, 1.0);
      vec3 nacc = vec3(0.0, 0.0, 1e-4);
      for (int g = 0; g < 4; g++) {
        vec2 rg = gRange[g0 + g];
        if (rg.y < 0.5) continue;
        Body b = crBody(px, int(rg.x), int(rg.y), gBox[g0 + g]);
        nacc += b.n * exp(-clamp(b.d, -40.0, 40.0) / 6.0);
        float dd = smin(R.d, b.d, 12.0);
        if (b.d < R.d) R = b;
        R.d = dd;
      }
      R.n = normalize(nacc);
      return R;
    }
    vec2 cam(vec2 p, float depth) { return vec2(960.0, 640.0) + (p - vec2(960.0, 640.0)) / camS - vec2(camX * depth / camS, 0.0); }
    float ridgeTex(float x, float ch) { vec4 r = texture(ridges, vec2((x + 1024.0) / 4096.0, 0.5)); return ch < 0.5 ? r.r : r.g; }
    vec3 hatch(vec3 c, float y, float top, float bottom, vec3 lineC) {
      float v = (y - top) / max(bottom - top, 1.0);
      float x = v * 9.0;
      float fw = max(fwidth(x), 1e-4);
      float l = sat(0.4 - abs(fract(x - 0.5) - 0.5) / fw) * sat(1.4 - fw * 4.0);
      return c + lineC * l * (1.0 - v * 0.7);
    }
    /** fire colour from a temperature 0..1: smoke-dark → deep red → orange → yellow → white */
    vec3 fireRamp(float T) {
      vec3 c = mix(vec3(0.03, 0.02, 0.015), vec3(1.0, 0.16, 0.03), smoothstep(0.08, 0.35, T));
      c = mix(c, vec3(2.6, 0.95, 0.18), smoothstep(0.35, 0.6, T));
      c = mix(c, vec3(3.6, 2.6, 0.9), smoothstep(0.6, 0.8, T));
      return mix(c, vec3(5.0, 4.6, 3.8), smoothstep(0.82, 1.0, T));
    }
    void main() {
      vec2 px = FRAG_PX;
      float ti = t - ${IMPACT.toFixed(3)};
      float imp = ti > 0.0 ? 1.0 : 0.0;
      float flash = imp * exp(-ti / 0.07);
      float fireL = imp * (2.2 * exp(-ti / 0.25) + 0.9 * smoothstep(0.0, 0.3, ti));   // light of the fireball
      vec3 warmL = vec3(1.0, 0.62, 0.32);
      vec3 duskC = vec3(1.0, 0.74, 0.55) * 0.55;
      float dI = length((px - I) * vec2(1.0, 1.6));
      // ---- sky: dusk over the horizon, a few stars ----
      vec2 ps = cam(px, 0.05);
      vec3 c = mix(C_INK * 0.55, mix(C_TERRACOTTA, C_OCHRE, 0.35) * 0.12, smoothstep(140.0, H0 + 20.0, ps.y));
      vec2 sg = floor(ps / 3.0);
      float st = step(0.9975, hash12(sg)) * (0.5 + 0.5 * sin(t * 3.0 + hash12(sg + 3.0) * 30.0));
      c += C_BONE * st * 0.35 * smoothstep(H0, 200.0, ps.y) * (1.0 - sat(fireL));
      // the falling meteor lights the whole sky
      float dm = length(px - mtr[0]);
      c += vec3(1.0, 0.7, 0.4) * mBright * (exp(-dm / 420.0) * 0.08 + 0.015);
      c += warmL * fireL * (exp(-dI / 240.0) * 0.6 + exp(-dI / 900.0) * 0.12);
      // ---- the meteor's smoke trail: lingers, widens and thins with age ----
      if (sBox.z > sBox.x && length(max(max(sBox.xy - px, px - sBox.zw), 0.0)) < 90.0) {
        float best = 1e5, age = 9.0;
        for (int i = 0; i < ${NSMOKE - 1}; i++) {
          vec3 a = smk[i], b = smk[i + 1];
          if (a.z < 0.0 || b.z < 0.0) continue;
          vec2 pa = px - a.xy, ba = b.xy - a.xy;
          float h = sat(dot(pa, ba) / max(dot(ba, ba), 1e-3));
          float dd = length(pa - ba * h);
          float ag = mix(a.z, b.z, h);
          float rad = 3.0 + 34.0 * ag;
          if (dd / rad < best) { best = dd / rad; age = ag; }
        }
        float dens = exp(-best * best * 1.6) * sat(1.0 - age / 3.2) * (0.55 + 0.45 * fbm(px / 22.0 + vec2(age * 0.6, -age), 4));
        vec3 smC = vec3(0.045, 0.04, 0.038) + vec3(0.9, 0.45, 0.15) * exp(-age * 5.0) * 0.5 + warmL * fireL * 0.06;
        c = mix(c, smC, dens * 0.7);
      }
      // ---- the meteor: a white-hot head and a fire tail (yellow → orange → red), flickering ----
      float mbd = length(max(max(mBox.xy - px, px - mBox.zw), 0.0));
      if (heat > 0.0 && mbd < 320.0) {
        float mfade = smoothstep(320.0, 160.0, mbd);          // no hard edge where the early-out region ends
        float dmin = 1e5, s = 1.0;
        for (int i = 0; i < ${NFIRE - 1}; i++) {
          vec2 pa = px - mtr[i], ba = mtr[i + 1] - mtr[i];
          float h = sat(dot(pa, ba) / max(dot(ba, ba), 1e-3));
          float dd = length(pa - ba * h);
          if (dd < dmin) { dmin = dd; s = (float(i) + h) / ${(NFIRE - 1).toFixed(1)}; }
        }
        float w = mix(7.0, 1.2, s) * (0.5 + 0.5 * heat);
        float flick = 0.7 + 0.6 * vnoise(vec2(s * 26.0 - t * 55.0, dmin * 0.3));
        float core = exp(-pow(dmin / w, 2.0)) * flick;
        float glow = exp(-dmin / (10.0 + 26.0 * (1.0 - s))) * (1.0 - s);
        vec3 hot = mix(vec3(4.5, 4.1, 3.4), vec3(3.4, 1.9, 0.6), smoothstep(0.0, 0.22, s));
        hot = mix(hot, vec3(1.6, 0.42, 0.08), smoothstep(0.22, 0.65, s));
        hot = mix(hot, vec3(0.25, 0.06, 0.02), smoothstep(0.65, 1.0, s));
        c += (hot * core + vec3(1.2, 0.5, 0.14) * glow * 0.35) * heat * mfade;
        c += (vec3(5.0, 4.7, 4.2) * exp(-dm * dm / 18.0) + vec3(1.4, 0.8, 0.35) * exp(-dm / 26.0) * 0.6) * mBright * mfade;
      }
      // ---- the explosion beyond the ridge ----
      if (ti > 0.0) {
        // the column: a rising stem and a rolling cap, dark smoke lit orange from below
        if (ti > 0.22) {
          float k = ti - 0.22;
          vec2 Cc = I + vec2(24.0 * k, -(150.0 + 300.0 * k));
          vec2 rc = vec2(90.0 + 190.0 * k, 50.0 + 95.0 * k);
          float cn = fbm(px / 46.0 + vec2(0.0, k * 1.6), 5);
          float cap = smoothstep(1.0, 0.72, length((px - Cc) / rc) + (cn - 0.5) * 0.7);
          float yk = sat((I.y - px.y) / max(I.y - Cc.y, 1.0));
          float sw = 20.0 + 42.0 * k + 22.0 * (cn - 0.5);
          float stem = smoothstep(sw, sw * 0.55, abs(px.x - mix(I.x, Cc.x, yk))) * step(Cc.y, px.y) * step(px.y, I.y);
          float sm = max(cap, stem) * smoothstep(0.0, 0.25, k);
          float under = sat((px.y - Cc.y) / rc.y * 0.8 + 0.25) * exp(-k * 0.5);
          vec3 smC = mix(vec3(0.035, 0.03, 0.027) * (0.7 + 0.6 * cn), fireRamp(0.45 + 0.25 * cn) * 0.45, under * 0.85);
          c = mix(c, smC, sm * 0.93);
        }
        // the fireball: rises and grows, turbulent; its temperature falls from the core outwards and in time
        vec2 F = I + vec2(0.0, -(20.0 + 130.0 * ti));
        float Rf = 40.0 + 290.0 * (1.0 - exp(-ti * 2.4));
        vec2 q = px - F;
        float ang = atan(q.y, q.x);
        float rr = length(q * vec2(1.0, 1.12));
        float nb = fbm(vec2(ang * 2.2, ti * 1.4) + q / 85.0 - vec2(0.0, ti * 1.3), 5);
        float edge = Rf * (0.72 + 0.5 * nb);
        float dens = smoothstep(edge, edge * 0.72, rr);
        float T = sat((1.0 - rr / edge) * 1.35 + 0.4 * (fbm(q / 30.0 + vec2(0.0, ti * 3.0), 4) - 0.5) + 0.35 - ti * 0.32);
        c = mix(c, fireRamp(T), dens);
        // burning debris and the meteor's sparks (rendered beforehand, hidden by the ridge below)
        c += texture(fx, vUv).rgb;
      } else c += texture(fx, vUv).rgb;
      // ---- far ridge + volcano (contour hatched), its plume drifting ----
      vec2 pf = cam(px, 0.15);
      float yF = ridgeTex(pf.x, 0.0);
      vec2 pl = pf - vec2(560.0, H0 - 290.0);
      float plume = 0.0;
      if (abs(pl.x) < 420.0 && pl.y < 40.0) plume = smoothstep(0.0, -300.0, pl.y) * exp(-pow(pl.x - pl.y * -0.35 - 20.0 * sin(pl.y / 60.0 + t), 2.0) / (2.0 * pow(28.0 - pl.y * 0.25, 2.0)));
      if (plume > 0.002) plume *= 0.6 + 0.4 * fbm(vec2(pl.x / 50.0 - t * 0.2, pl.y / 50.0 + t * 0.6), 4);
      c = mix(c, C_GRAPHITE * 0.25 + warmL * fireL * 0.05, plume * 0.8);
      if (pf.y > yF) {
        vec3 m = C_INK2 * 0.7;
        m = hatch(m, pf.y, yF, H0 + 20.0, C_BONE * 0.1);
        m += C_BONE * pxLine(pf.y - yF, 1.2) * 0.35;
        // back-lit by the fire: the ridge line glows, the face facing us stays dark
        m += warmL * fireL * 0.5 * exp(-max(0.0, pf.y - yF) / 5.0) * exp(-abs(px.x - I.x) / 520.0);
        c = m;
      }
      // ---- the dust surge rolling out along the horizon ----
      if (ti > 0.12) {
        float k = ti - 0.12;
        float W = 1150.0 * (1.0 - exp(-k * 1.1));
        float dx = abs(px.x - I.x);
        float tex = fbm(vec2(px.x / 70.0 - k * 0.9 * sign(px.x - I.x), px.y / 45.0 + k * 0.4), 5);
        float hgt = (40.0 + 150.0 * k) * sqrt(sat(1.0 - dx / max(W, 1.0))) * (0.75 + 0.5 * tex);
        float top = H0 + 14.0 - hgt;
        float dens = smoothstep(top - 8.0, top + 22.0, px.y) * step(px.y, H0 + 80.0) * (0.55 + 0.45 * tex);
        vec3 dc = mix(vec3(0.05, 0.04, 0.032), fireRamp(0.5) * 0.35, exp(-dx / 260.0) * exp(-k * 0.6));
        c = mix(c, dc, dens * 0.88);
      }
      // ---- mid hills ----
      vec2 pm = cam(px, 0.45);
      float yM = ridgeTex(pm.x, 1.0);
      if (pm.y > yM) {
        vec3 m = mix(C_INK2, C_WARMINK, 0.5) * 0.9;
        m = hatch(m, pm.y, yM, H0 + 60.0, C_BONE * 0.08);
        m += C_BONE * pxLine(pm.y - yM, 1.2) * 0.45;
        m += warmL * fireL * 0.22 * exp(-max(0.0, pm.y - yM) / 9.0) * exp(-abs(px.x - I.x) / 700.0);
        c = m;
      }
      // ---- ground: perspective contours over gentle bumps ----
      vec2 pg = cam(px, 1.0);
      if (pg.y > H0 + 12.0) {
        float dy = pg.y - H0;
        float z = 600.0 / dy;
        vec2 wp = vec2((pg.x - 960.0) * z / 600.0, z);
        float hgt = fbm(wp * vec2(1.4, 0.9) + 2.0, 4);
        vec3 g = mix(C_WARMINK * 0.9, C_WARMINK * 1.5, smoothstep(H0 + 40.0, 1080.0, pg.y));
        float lv = log(dy) * 5.0 + hgt * 2.2;
        g += mix(C_BONE, C_WARMBONE, 0.5) * isoLine(lv, 1.0, 0.8) * 0.13 * smoothstep(H0 + 12.0, H0 + 80.0, pg.y);
        g += warmL * fireL * 0.07 * exp(-dI / 650.0) + vec3(1.0, 0.7, 0.4) * mBright * 0.03;
        c = mix(c, g, smoothstep(H0 + 12.0, H0 + 16.0, pg.y));
      }
      // ---- the creatures: dusk light, the meteor's light, then the fire ----
      vec3 Lm = normalize(vec3(mtr[0] - px, 320.0));
      vec3 L = normalize(mix(normalize(vec3(-0.6, -0.55, 0.55)), Lm, sat(mBright * 0.8)));
      vec3 Lc = duskC + vec3(1.0, 0.75, 0.5) * mBright * 0.6;
      if (ti > 0.0) { L = normalize(vec3(I - px, 240.0)); Lc = duskC * 0.4 + warmL * (0.45 + fireL * 0.8) + vec3(1.0) * flash * 1.2; }
      vec3 lineC = mix(C_BONE, C_WARMBONE, 0.5) * 0.55;
      Body b1 = creature(px, 0);
      Body b2 = creature(px, 4);
      c = bodyShade(c, b1, L, Lc, vec3(0.105, 0.088, 0.06), vec3(0.24, 0.2, 0.14), 0.15, 1.0, lineC, 7.5, 1.0);
      c = bodyShade(c, b2, L, Lc, vec3(0.072, 0.05, 0.034), vec3(0.22, 0.16, 0.1), 1.0, 1.0, lineC, 7.5, 1.0);
      // ---- the shockwave: the film's hairline ring, now a pressure front ----
      if (ti > 0.0) {
        float R = 1700.0 * (1.0 - pow(2.0, -10.0 * ti / 2.6));
        float rr = length(px - I);
        c += vec3(1.0, 0.85, 0.7) * (pxLine(rr - R, 1.6) * 0.5 + pxLine(rr - R * 0.84, 1.0) * 0.25) * exp(-ti * 0.9);
        c += vec3(1.0, 0.9, 0.8) * 0.14 * flash;
      }
      fragColor = vec4(c, 1.0);
    }`, {
    t: { value: 0 }, camS: { value: 1 }, camX: { value: 0 }, heat: { value: 0 }, mBright: { value: 0 },
    gBox: { value: Array.from({ length: 8 }, () => new THREE.Vector4(-1e5, -1e5, -1e5, -1e5)) }, gRange: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) },
    mBox: { value: new THREE.Vector4() }, sBox: { value: new THREE.Vector4() },
    mtr: { value: Array.from({ length: NFIRE }, () => new THREE.Vector2(-1e4, -1e4)) },
    smk: { value: Array.from({ length: NSMOKE }, () => new THREE.Vector3(0, 0, -1)) },
    ridges: { value: null }, fx: { value: null },
    ...this.parts.uniforms('cr'),
  });
  ridgeRT = new THREE.WebGLRenderTarget(4096, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  ridgePass = new FSPass(/* glsl */ `
    float ridgeFar(float x) {
      float v = 560.0;
      float h = 70.0 + 130.0 * fbm(vec2(x / 420.0, 1.3), 4) + 40.0 * fbm(vec2(x / 90.0, 7.1), 3);
      float vol = 250.0 * exp(-pow((x - v) / 190.0, 2.0));
      vol = min(vol, 225.0 - 6.0 * smoothstep(40.0, 0.0, abs(x - v)));
      return ${H0.toFixed(1)} - max(h, vol + 60.0);
    }
    float ridgeMid(float x) { return ${H0.toFixed(1)} + 12.0 - (30.0 + 80.0 * fbm(vec2(x / 260.0 + 5.0, 3.7), 4)); }
    void main() { float x = gl_FragCoord.x - 1024.0; fragColor = vec4(ridgeFar(x), ridgeMid(x), 0.0, 1.0); }`);

  override init() {
    this.ridgePass.render(this.ctx.renderer, this.ridgeRT);
    this.pass.u.ridges!.value = this.ridgeRT.texture;
    this.pass.u.fx!.value = this.fxRT.texture;
    const r = new Rng(4242);
    for (let i = 0; i < 19; i++) {
      const front = i >= 15;
      const y = front ? r.range(1010, 1110) : r.range(860, 990);
      this.fernSet.push({ x: r.range(-80, 2000), y, h: (front ? r.range(170, 260) : r.range(60, 130)) * (y / 950), lean: r.range(-0.5, 0.5), n: front ? 7 : r.int(4, 6), ph: r.next() * TAU, front });
    }
    this.fernSet.push({ x: 800, y: 925, h: 120, lean: 0.25, n: 5, ph: 1, front: false });
    this.fernSet.push({ x: 740, y: 940, h: 100, lean: -0.3, n: 5, ph: 2, front: false });
    // debris thrown by the impact: mostly upward, some low and fast
    const rnd = mulberry32(77);
    for (let i = 0; i < 90; i++) {
      const big = i < 14;
      this.ejecta.push({ a: -Math.PI / 2 + (rnd() - 0.5) * (big ? 1.6 : 2.5), v: (big ? 320 : 380) + rnd() * (big ? 420 : 720), size: big ? 3.5 + rnd() * 2.5 : 1.2 + rnd() * 1.8, big });
    }
    // sparks shed by the meteor on its way down
    for (let i = 0; i < 30; i++) this.sparks.push({ tb: METEOR + 0.5 + rnd() * (IMPACT - METEOR - 0.55), dx: (rnd() - 0.5) * 90, dy: (rnd() - 0.5) * 90 });
  }

  override headAt(t: number): V2 {
    if (t <= T_FULL) {
      const k = ease.inOutCubic(clamp((t - T0) / (T_FULL - T0)));
      return [lerp(1150, STAR[0], k), lerp(330, STAR[1], k)];
    }
    const hang: V2 = [STAR[0] + 6 * Math.sin((Math.min(t, METEOR) - T_FULL) * 1.3), STAR[1] + 4 * Math.cos((Math.min(t, METEOR) - T_FULL) * 0.9)];
    if (t < METEOR) return hang;
    if (t < IMPACT) { const u = meteorU(t), s = meteorPos(u), k = 1 - clamp(u * 10); return [lerp(s[0], hang[0], k), lerp(s[1], hang[1], k)]; }
    return I;
  }

  // ---- the herbivore: a heavy body on columnar legs, a long neck, a small head, a long tail ----
  sauropod(t: number): Part[] {
    const alarm = ease.inOutCubic(clamp((t - (LUNGE - 0.25)) / 0.5));
    const up = ease.inOutCubic(clamp((t - (METEOR + 0.6)) / 0.9));
    const R: V2 = [1300 + 34 * alarm, 655 - 4 * Math.sin(t * 1.6)];
    const out: Part[] = [];
    let grp = 0;
    const push = (...ps: Part[]) => { for (const q of ps) out.push({ ...q, g: grp }); };
    const G = 935;
    for (const [ox, far] of [[-112, 1], [136, 1], [-138, 0], [112, 0]] as const) {
      const s = far ? 0.88 : 1;
      const hip: V2 = [R[0] + ox + far * 24, R[1] + 28 - far * 6];
      const shift = Math.sin(t * 0.9 + ox) * 6 * (1 - alarm);
      const knee: V2 = [hip[0] + 8 + shift, hip[1] + (G - hip[1]) * 0.5];
      const ankle: V2 = [hip[0] + shift * 1.5 - 4, G - 36];
      const sole: V2 = [ankle[0] - 8, G - 8 - far * 4];
      push(P(hip, knee, 48 * s, 36 * s, MAT.SCALE, 12), P(knee, ankle, 34 * s, 29 * s, MAT.SCALE, 8), P(ankle, sole, 30 * s, 35 * s, MAT.SCALE, 6));
      for (let c = 0; c < 3; c++) { const b: V2 = [sole[0] - 30 + c * 13, G - 9 - far * 4]; push(P(b, [b[0] - 9, G - 3 - far * 4], 5 * s, 2 * s, MAT.HORN, 0)); }
    }
    grp = 1;
    push(P([R[0] + 150, R[1] + 4], [R[0] - 130, R[1] - 14], 104, 116, MAT.SCALE, 20));
    push(P([R[0] + 70, R[1] + 42], [R[0] - 70, R[1] + 42], 86, 86, MAT.SCALE, 30));
    push(P([R[0] - 120, R[1] - 28], [R[0] - 119, R[1] - 28], 96, 96, MAT.SCALE, 30));
    push(P([R[0] + 122, R[1] - 22], [R[0] + 123, R[1] - 22], 92, 92, MAT.SCALE, 30));
    // neck: grazing low, flinching up, then turned to the sky
    const N0: V2 = [R[0] - 200, R[1] - 52];
    const graze: V2 = [790 + 26 * Math.sin(t * 1.25), 872 + 16 * Math.sin(t * 2.5)];
    const Hd: V2 = [lerp(lerp(graze[0], 930, alarm), 1010, up), lerp(lerp(graze[1], 330, alarm), 210, up)];
    const ctrl: V2 = [lerp(N0[0] - 230, N0[0] - 60, alarm), lerp(N0[1] - 120, N0[1] - 260, alarm)];
    const pts: V2[] = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10, v = 1 - u; pts.push([v * v * N0[0] + 2 * u * v * ctrl[0] + u * u * Hd[0], v * v * N0[1] + 2 * u * v * ctrl[1] + u * u * Hd[1]]); }
    grp = 2;
    for (let i = 0; i < 10; i++) push(P(pts[i]!, pts[i + 1]!, lerp(60, 23, i / 10), lerp(60, 23, (i + 1) / 10), MAT.SCALE, 10));
    // head: skull, tapering snout, a jaw that chews, eye and nostril
    const ha = Math.atan2(Hd[1] - pts[9]![1], Hd[0] - pts[9]![0]) - 0.6;
    const d = dirOf(ha), n: V2 = [d[1], -d[0]];            // n: the underside of a left-facing head
    const chew = (1 - alarm) * 0.12 * Math.max(0, Math.sin(t * 7));
    push(P(Hd, add(Hd, d, 40), 26, 23, MAT.SCALE, 10));
    push(P(add(Hd, d, 38), add(Hd, d, 80), 22, 14, MAT.SCALE, 8));
    const j0 = add(add(Hd, d, 12), n, 13), jd = dirOf(ha + (chew * (d[0] < 0 ? -1 : 1)));
    push(P(j0, add(j0, jd, 64), 13, 8, MAT.SCALE, 6));
    push(P(add(add(Hd, d, 20), n, -9), add(add(Hd, d, 20), n, -9), 5.5, 5.5, MAT.EYE, -1));
    push(P(add(add(Hd, d, 74), n, -7), add(add(Hd, d, 74), n, -7), 3, 3, MAT.DARK, -1));
    // tail
    const tail: V2[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const sw = Math.sin(t * 1.1 - u * 2.2) * 40 * u * u;
      tail.push([R[0] + 200 + 470 * u, R[1] - 10 + 210 * u * u - 60 * u + sw]);
    }
    grp = 3;
    for (let i = 0; i < 12; i++) push(P(tail[i]!, tail[i + 1]!, lerp(76, 4, i / 12), lerp(76, 4, (i + 1) / 12), MAT.SCALE, 12));
    return out;
  }

  // ---- the predator: two legs, a heavy skull with teeth, small two-fingered arms, a balancing tail ----
  rex(t: number): Part[] {
    if (t < STALK - 0.1) return [];
    const stalkU = clamp((t - STALK) / (LUNGE - STALK));
    const lungeU = ease.outCubic(clamp((t - LUNGE) / 0.6));
    const look = ease.inOutCubic(clamp((t - (METEOR + 0.9)) / 0.8));
    const x = lerp(-420, 330, stalkU) + 360 * lungeU;
    const dist = (x + 420) + 300 * lungeU;
    const phi = (TAU * dist) / 300;
    const amp = 1 - look;
    const lean = lerp(lerp(0.16, 0.02, lungeU), -0.32, look);
    const Pv: V2 = [x, 700];
    const fwd = dirOf(lean), up: V2 = [fwd[1], -fwd[0]];
    const chest = add(Pv, fwd, 125);
    const legs: Part[][] = [];
    let low = -Infinity;
    for (let i = 0; i < 2; i++) {
      const ph = phi + Math.PI * i, s = i ? 0.92 : 1;
      const a = 0.45 * amp * Math.sin(ph) + 0.25 + 0.2 * lungeU * (i ? -1 : 1);
      const lift = Math.max(0, Math.cos(ph)) * amp;
      const knee: V2 = [Pv[0] + Math.sin(a) * 118, Pv[1] + 14 + Math.cos(a) * 118];
      const b2 = a - 1.25 - 0.4 * lift;
      const ankle: V2 = [knee[0] + Math.sin(b2) * 118, knee[1] + Math.cos(b2) * 118];
      const b3 = b2 + 0.85 + 0.3 * lift;
      const foot: V2 = [ankle[0] + Math.sin(b3) * 62, ankle[1] + Math.cos(b3) * 62];
      const L: Part[] = [P([Pv[0], Pv[1] + 10], knee, 56 * s, 34 * s, MAT.SCALE, 14), P(knee, ankle, 30 * s, 18 * s, MAT.SCALE, 8), P(ankle, foot, 18 * s, 13 * s, MAT.SCALE, 6)];
      for (let tI = 0; tI < 3; tI++) {
        const ta = -0.25 + tI * 0.2 + 0.3 * lift;
        const m: V2 = [foot[0] + Math.cos(ta) * 22, foot[1] + Math.sin(ta) * 8 + 4];
        const tip: V2 = [m[0] + Math.cos(ta) * 18, m[1] + 3];
        L.push(P(foot, m, 10 * s, 8 * s, MAT.SCALE, 4), P(m, tip, 8 * s, 6 * s, MAT.SCALE, 3), P(tip, [tip[0] + 11, tip[1] + 6], 5 * s, 1.2, MAT.HORN, 0));
        low = Math.max(low, tip[1] + 6);
      }
      low = Math.max(low, foot[1] + 12);
      legs.push(L);
    }
    const dy = 965 - low;
    const D = (p: V2): V2 => [p[0], p[1] + dy];
    const Dp = (b: Part): Part => ({ ...b, a: D(b.a), b: D(b.b) });
    const out: Part[] = [];
    let grp = 0;
    const push = (...ps: Part[]) => { for (const q of ps) out.push({ ...q, g: grp }); };
    push(...legs[1]!.map(Dp));
    grp = 1;
    push(Dp(P(Pv, [Pv[0] + 0.5, Pv[1]], 58, 58, MAT.SCALE, 20)));
    push(Dp(P(Pv, chest, 60, 66, MAT.SCALE, 20)));
    push(Dp(P(add(add(Pv, fwd, 60), up, -34), add(add(Pv, fwd, 61), up, -34), 52, 52, MAT.SCALE, 25)));
    // neck and skull
    const nAng = lean - 0.75 - 0.5 * look;
    const neckTop = add(chest, dirOf(nAng), 72);
    push(Dp(P(chest, add(chest, dirOf(nAng), 36), 52, 45, MAT.SCALE, 12)), Dp(P(add(chest, dirOf(nAng), 36), neckTop, 45, 38, MAT.SCALE, 12)));
    const hAng = lerp(lerp(0.3, 0.06, lungeU), -0.85, look);
    const dH = dirOf(hAng), down: V2 = [-dH[1], dH[0]], upH: V2 = [dH[1], -dH[0]];
    const snoutR = (s: number) => s < 58 ? lerp(42, 36, s / 58) : lerp(34, 21, (s - 58) / 80);
    grp = 2;
    push(Dp(P(neckTop, add(neckTop, dH, 58), 42, 36, MAT.SCALE, 10)), Dp(P(add(neckTop, dH, 56), add(neckTop, dH, 138), 34, 21, MAT.SCALE, 8)));
    push(Dp(P(add(add(neckTop, dH, 22), upH, 28), add(add(neckTop, dH, 50), upH, 24), 13, 10, MAT.SCALE, 6)));       // brow ridge
    push(Dp(P(add(add(neckTop, dH, 42), upH, 13), add(add(neckTop, dH, 42), upH, 13), 7, 7, MAT.EYE, -1)));
    push(Dp(P(add(add(neckTop, dH, 126), upH, 10), add(add(neckTop, dH, 126), upH, 10), 3.5, 3.5, MAT.DARK, -1)));
    // the jaw opens in the lunge and at the sky; the mouth's inside, then the teeth
    const jaw = 0.08 + 0.5 * Math.sin(Math.PI * clamp((t - LUNGE - 0.1) / 0.6)) + 0.35 * look * (0.6 + 0.4 * Math.sin(t * 9));
    const jA = hAng + jaw, dJ = dirOf(jA), upJ: V2 = [dJ[1], -dJ[0]];
    const j0 = add(neckTop, dirOf(hAng + 1.2), 18);
    push(Dp(P(j0, add(j0, dJ, 120), 24, 12, MAT.SCALE, 6)));
    const dM = dirOf(hAng + jaw * 0.5);
    push(Dp(P(add(j0, dM, 14), add(j0, dM, 104), 4, Math.max(3, 100 * Math.sin(jaw * 0.5) * 0.85), MAT.DARK, 0)));
    if (jaw > 0.14) {
      for (let k = 0; k < 6; k++) { const s = 66 + k * 13, b = add(add(neckTop, dH, s), down, snoutR(s) - 3); push(Dp(P(b, add(b, down, 12 - k), 3.6, 0.8, MAT.HORN, 0))); }
      for (let k = 0; k < 5; k++) { const s = 46 + k * 14, b = add(add(j0, dJ, s), upJ, lerp(24, 12, s / 120) - 3); push(Dp(P(b, add(b, upJ, 10 - k), 3.2, 0.8, MAT.HORN, 0))); }
    }
    grp = 1;
    // arms: small, two fingers with claws
    const sh = add(add(chest, fwd, 18), up, -34);
    const el: V2 = [sh[0] + 30, sh[1] + 26], wr: V2 = [sh[0] + 48, sh[1] + 16 + 4 * Math.sin(t * 3)];
    for (const side of [0, 1]) {
      const o: V2 = [side * -8, side * -4];
      const S = (p: V2): V2 => [p[0] + o[0], p[1] + o[1]];
      push(Dp(P(S(sh), S(el), 13, 10, MAT.SCALE, 6)), Dp(P(S(el), S(wr), 10, 7, MAT.SCALE, 4)));
      for (let fI = 0; fI < 2; fI++) { const ft: V2 = [wr[0] + 14 + o[0], wr[1] + 4 + fI * 7 + o[1]]; push(Dp(P(S(wr), ft, 5, 3, MAT.SCALE, 2)), Dp(P(ft, [ft[0] + 5, ft[1] + 6], 2.6, 0.8, MAT.HORN, 0))); }
    }
    // dorsal scutes along the back
    for (let k = 0; k < 6; k++) { const b = add(add(Pv, fwd, 120 - k * 30), up, 58 - Math.abs(k - 2) * 3); push(Dp(P(b, add(b, up, 6), 8, 4, MAT.SCALE, 0))); }
    // tail
    const tail: V2[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const sw = Math.sin(phi * 0.5 + u * 2) * 22 * u * amp;
      const ta = Math.PI + lean * 0.9 - 0.1;
      tail.push(D([Pv[0] + Math.cos(ta) * 470 * u + 20, Pv[1] - 6 + Math.sin(ta) * 470 * u + sw + 30 * u * u]));
    }
    grp = 3;
    for (let i = 0; i < 12; i++) push(P(tail[i]!, tail[i + 1]!, lerp(56, 4, i / 12), lerp(56, 4, (i + 1) / 12), MAT.SCALE, 12));
    grp = 0;
    push(...legs[0]!.map(Dp));
    return out;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, u = this.pass.u;
    const cam = camAt(t);
    u.t!.value = t; u.camS!.value = cam.s; u.camX!.value = cam.x;
    const heat = heatAt(t);
    u.heat!.value = heat;
    const mu = meteorU(t);
    u.mBright!.value = heat * (0.35 + 1.4 * mu);
    // the meteor's fire tail: where its head was over the last moments (longer the faster it moves)
    const mtr = u.mtr!.value as THREE.Vector2[];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let j = 0; j < NFIRE; j++) {
      const p = this.headAt(Math.max(METEOR, Math.min(t, IMPACT - 1e-3) - j * 0.03));
      mtr[j]!.set(p[0], p[1]);
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    (u.mBox!.value as THREE.Vector4).set(x0, y0, x1, y1);
    // the smoke trail: the whole path so far, each point with its age (it drifts with the wind)
    const smk = u.smk!.value as THREE.Vector3[];
    let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
    const tEnd = Math.min(t, IMPACT);
    for (let j = 0; j < NSMOKE; j++) {
      if (t < METEOR + 0.3) { smk[j]!.set(0, 0, -1); continue; }
      const ts = lerp(METEOR + 0.3, tEnd, j / (NSMOKE - 1));
      const p = meteorPos(meteorU(ts)), age = t - ts;
      const q: V2 = [p[0] + 14 * age, p[1] - 6 * age];
      smk[j]!.set(q[0], q[1], age);
      sx0 = Math.min(sx0, q[0]); sx1 = Math.max(sx1, q[0]); sy0 = Math.min(sy0, q[1]); sy1 = Math.max(sy1, q[1]);
    }
    (u.sBox!.value as THREE.Vector4).set(sx0, sy0, sx1, sy1);
    // creatures (camera applied to every joint)
    const cs = (b: Part): Part => ({ ...b, a: toScr(t, b.a), b: toScr(t, b.b), ra: b.ra * cam.s, rb: b.rb * cam.s });
    const gBox = u.gBox!.value as THREE.Vector4[], gRange = u.gRange!.value as THREE.Vector2[];
    const place = (parts: Part[], first: number, max: number, g0: number) => {
      const sorted = parts.map(cs).sort((p, q) => (p.g ?? 0) - (q.g ?? 0));
      this.parts.set(first, max, sorted);
      for (let g = 0; g < 4; g++) {
        const idx = sorted.map((p, i) => ((p.g ?? 0) === g ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) { gRange[g0 + g]!.set(0, 0); gBox[g0 + g]!.set(-1e5, -1e5, -1e5, -1e5); continue; }
        gRange[g0 + g]!.set(first + idx[0]!, idx.length);
        gBox[g0 + g]!.copy(boxOf(idx.map((i) => sorted[i]!), 10));
      }
    };
    place(this.sauropod(t), 0, NS, 0);
    place(this.rex(t), NS, NR, 4);

    // burning debris and the meteor's sparks, into their own layer (the ridge hides what falls behind it)
    const fx = this.fx;
    fx.clear();
    const ti = t - IMPACT;
    if (ti > 0) {
      for (const e of this.ejecta) {
        const pos = (tt: number): V2 => [I[0] + Math.cos(e.a) * e.v * tt, I[1] + Math.sin(e.a) * e.v * tt + 520 * tt * tt];
        const life = e.big ? 2.4 : 1.4;
        if (ti > life) continue;
        const pts: V2[] = [];
        for (let k = 6; k >= 0; k--) { const tt = Math.max(0, ti - k * (e.big ? 0.05 : 0.025)); pts.push(pos(tt)); }
        const T = clamp(1 - ti / life);
        const col = (g: number) => [lerp(1.2, 4.2, T * T) * g, lerp(0.25, 3.0, T * T * T) * g, lerp(0.05, 1.8, T ** 4) * g, 1] as const;
        fx.polyline(pts, (k) => e.size * (0.3 + 0.7 * k), (k) => { const c = col(T * (0.15 + 0.85 * k)); return [c[0], c[1], c[2], c[3]]; });
        if (e.big) { const p = pos(ti); fx.dot(p[0], p[1], e.size * 5, [1.2 * T, 0.45 * T, 0.12 * T, 1]); }
      }
    }
    if (heat > 0) {
      for (const s of this.sparks) {
        const age = t - s.tb;
        if (age < 0 || age > 0.4 || s.tb > IMPACT) continue;
        const p0 = meteorPos(meteorU(s.tb)), p1 = meteorPos(meteorU(Math.min(IMPACT, s.tb + 0.03)));
        const v: V2 = [(p1[0] - p0[0]) / 0.03 * 0.8 + s.dx, (p1[1] - p0[1]) / 0.03 * 0.8 + s.dy];
        const T = 1 - age / 0.4;
        const a: V2 = [p0[0] + v[0] * age, p0[1] + v[1] * age], b: V2 = [p0[0] + v[0] * Math.max(0, age - 0.03), p0[1] + v[1] * Math.max(0, age - 0.03)];
        fx.seg2(b[0], b[1], a[0], a[1], 1.6, [3.5 * T, 2.0 * T * T, 0.6 * T * T, 1], 0.6, [0.6 * T, 0.15 * T, 0.02, 1]);
      }
    }
    clearRT(r, this.fxRT, [0, 0, 0], 0);
    fx.render(r, this.fxRT);
    this.pass.render(r, out);

    // ferns: hairline fronds that sway; lit by the fire
    const fb = this.ferns, fr = this.front;
    fb.clear(); fr.clear();
    const lit = ti > 0 ? 2.2 * Math.exp(-ti / 0.25) + 0.9 : heat * 0.6 * mu;
    for (const fe of this.fernSet) {
      const B = fe.front ? fr : fb;
      const col = [BONE[0] * (1 + lit * 0.5), BONE[1] * (1 + lit * 0.25), BONE[2], fe.front ? 0.45 : 0.36] as const;
      const gain = fe.front ? 0.2 : 0.32;
      const cc = rgba(col, col[3], gain);
      for (let k = 0; k < fe.n; k++) {
        const a0 = -Math.PI / 2 + fe.lean + (k - (fe.n - 1) / 2) * 0.42 + 0.06 * Math.sin(t * 1.4 + fe.ph + k) + (ti > 0 ? 0.08 * Math.exp(-ti) * Math.sin(ti * 14) : 0);
        const len = fe.h * (1 - Math.abs(k - (fe.n - 1) / 2) * 0.12);
        const pts: V2[] = [];
        for (let s = 0; s <= 10; s++) {
          const q = s / 10;
          const a = a0 + q * q * 1.2 * Math.sign(a0 + Math.PI / 2 || 1) + 0.05 * Math.sin(t * 2 + fe.ph + q * 3);
          const prev = pts[s - 1] ?? [fe.x, fe.y];
          pts.push(s === 0 ? [fe.x, fe.y] : [prev[0] + Math.cos(a) * len / 10, prev[1] + Math.sin(a) * len / 10]);
        }
        const sp = pts.map((p) => toScr(t, p));
        B.polyline(sp, () => (fe.front ? 2.2 : 1.2), () => cc);
        for (let s = 2; s < 10; s++) {
          const [xa, ya] = sp[s]!, [xb, yb] = sp[s + 1]!;
          const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy) || 1;
          const ll = (fe.front ? 22 : 10) * (1 - s / 11) * (fe.h / 120);
          for (const side of [-1, 1]) {
            const nx = (-dy / L) * side, ny = (dx / L) * side;
            B.seg2(xa, ya, xa + (nx + dx / L * 0.6) * ll, ya + (ny + dy / L * 0.6) * ll, fe.front ? 1.6 : 1, cc);
          }
        }
      }
    }
    fb.render(r, out);
    fr.render(r, out);

    // the line: the red star; as it heats it becomes the meteor (drawn in the shader above)
    const m = this.motif;
    m.clear();
    if (this.drawHead && t < METEOR + 0.6) {
      const hp = this.headAt(t);
      const red = 1 - heat;
      const tw = 0.85 + 0.15 * Math.sin(t * 7);
      m.head(hp[0], hp[1], 1.05 * tw * red, 1);
    }
    m.render(r, out);
    const boom = ti > 0 ? Math.exp(-ti / 0.5) : 0;
    return { bloom: 0.6 + 0.6 * boom + 0.2 * heat * mu, bloomThreshold: 0.85, vignette: 0.45, grain: 0.05, warmth: 0.25 + 0.35 * boom };
  }
}
