// 05a THE CANCELLED ARTWORK — the dino era (a panel scene, hosted by the gallery).
// A prehistoric landscape in the film's language: contour-hatched ridges and a smoking volcano, a ground of
// perspective contours, ferns drawn as hairlines. A long-necked herbivore grazes; a predator stalks in from
// the left and lunges. The red point has been hanging in the sky like a star the whole time: it is the line,
// and it falls — a meteor drawn by the line — onto the horizon. Impact: a hairline shockwave (the rhyme of
// the ignition), light, dust. The host freezes the boom frame and pulls back out to the gallery.
import * as THREE from 'three';
import { PanelScene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, BONE, rgba } from '../motifs/line';
import { bonesGLSL, RELIEF_SHADE_GLSL, BoneArray, chain, boxOf, type Capsule } from '../shaders/relief';
import { CUE } from '../timeline/cues';
import { Rng, clamp, ease, lerp, smoothstep, TAU, bez, type V2 } from '../utils/math';

const T0 = CUE.dinoIn, T_FULL = CUE.dino, STALK = CUE.stalk, LUNGE = CUE.lunge, METEOR = CUE.meteor, IMPACT = CUE.impact, BOOM = CUE.boom;
const H0 = 640;                       // horizon
const I: V2 = [372, 626];             // impact point (on the horizon, behind the ridge)
const STAR: V2 = [1430, 176];         // where the red point hangs while the herbivore grazes
const NBONES = 48;                    // 24 per creature

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

/** The meteor's path: from the star, accelerating, onto the horizon. */
function meteorPos(u: number): V2 { return bez(STAR, [1180, 150], [700, 330], I, u); }

export default class SceneDinoEra extends PanelScene {
  bones = new BoneArray(NBONES);
  ferns = new LineBatch(9000);
  front = new LineBatch(6000);
  motif = new LineMotif();
  fernSet: { x: number; y: number; h: number; lean: number; n: number; ph: number; depth: number; front: boolean }[] = [];
  pass = new FSPass(/* glsl */ `
    uniform float t, camS, camX, impT, metK, glow; uniform vec2 meteor; uniform vec4 box0, box1; uniform sampler2D ridges;
    ${bonesGLSL('cr', NBONES)}
    ${RELIEF_SHADE_GLSL}
    const vec2 I = vec2(${I[0].toFixed(1)}, ${I[1].toFixed(1)});
    const float H0 = ${H0.toFixed(1)};
    vec2 cam(vec2 p, float depth) { return vec2(960.0, 640.0) + (p - vec2(960.0, 640.0)) / camS - vec2(camX * depth / camS, 0.0); }
    // the ridge profiles are static functions of x: precomputed once (RIDGE_GLSL) and looked up
    float ridgeTex(float x, float ch) { vec4 r = texture(ridges, vec2((x + 1024.0) / 4096.0, 0.5)); return ch < 0.5 ? r.r : r.g; }
    vec3 hatch(vec3 c, float y, float top, float bottom, vec3 lineC, float step) {
      float v = (y - top) / max(bottom - top, 1.0);
      float x = v * 9.0;
      float fw = max(fwidth(x), 1e-4);
      float l = sat(0.4 - abs(fract(x - 0.5) - 0.5) / fw) * sat(1.4 - fw * 4.0);
      return c + lineC * l * (1.0 - v * 0.7);
    }
    void main() {
      vec2 px = FRAG_PX;
      float ti = t - ${IMPACT.toFixed(3)};
      float imp = ti > 0.0 ? 1.0 : 0.0;
      float light = imp * (exp(-ti / 0.35) * 1.4 + 0.5);          // the impact's light
      vec3 warmL = mix(C_EMBER, C_BONE, 0.3);
      // ---- sky: dusk over the horizon, a few stars ----
      vec2 ps = cam(px, 0.05);
      vec3 c = mix(C_INK * 0.55, mix(C_TERRACOTTA, C_OCHRE, 0.35) * 0.12, smoothstep(140.0, H0 + 20.0, ps.y));
      vec2 sg = floor(ps / 3.0);
      float st = step(0.9975, hash12(sg)) * (0.5 + 0.5 * sin(t * 3.0 + hash12(sg + 3.0) * 30.0));
      c += C_BONE * st * 0.35 * smoothstep(H0, 200.0, ps.y);
      // the falling star lights the sky around it
      c += C_LINE * 0.06 * metK * exp(-length(px - meteor) / 260.0);
      // impact: a dome of light over the horizon
      float dI = length((px - I) * vec2(1.0, 1.6));
      c += warmL * light * (exp(-dI / 220.0) * 0.7 + exp(-dI / 800.0) * 0.1);
      // ---- far ridge + volcano (contour hatched), its plume drifting ----
      vec2 pf = cam(px, 0.15);
      float yF = ridgeTex(pf.x, 0.0);
      // plume
      vec2 pl = pf - vec2(560.0, H0 - 290.0);
      float plume = 0.0;
      if (abs(pl.x) < 420.0 && pl.y < 40.0) plume = smoothstep(0.0, -300.0, pl.y) * exp(-pow(pl.x - pl.y * -0.35 - 20.0 * sin(pl.y / 60.0 + t), 2.0) / (2.0 * pow(28.0 - pl.y * 0.25, 2.0)));
      if (plume > 0.002) plume *= 0.6 + 0.4 * fbm(vec2(pl.x / 50.0 - t * 0.2, pl.y / 50.0 + t * 0.6), 4);
      c = mix(c, C_GRAPHITE * 0.25, plume * 0.8);
      if (pf.y > yF) {
        vec3 m = C_INK2 * 0.7;
        m = hatch(m, pf.y, yF, H0 + 20.0, C_BONE * 0.1, 0.0);
        m += C_BONE * pxLine(pf.y - yF, 1.2) * 0.35;
        // back-lit by the impact
        m += warmL * light * 0.25 * exp(-max(0.0, pf.y - yF) / 6.0) * exp(-abs(px.x - I.x) / 500.0);
        c = m;
      }
      // ---- mid hills ----
      vec2 pm = cam(px, 0.45);
      float yM = ridgeTex(pm.x, 1.0);
      if (pm.y > yM) {
        vec3 m = mix(C_INK2, C_WARMINK, 0.5) * 0.9;
        m = hatch(m, pm.y, yM, H0 + 60.0, C_BONE * 0.08, 0.0);
        m += C_BONE * pxLine(pm.y - yM, 1.2) * 0.45;
        m += warmL * light * 0.12 * exp(-max(0.0, pm.y - yM) / 10.0) * exp(-abs(px.x - I.x) / 700.0);
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
        g += warmL * light * 0.04 * exp(-dI / 600.0);
        c = mix(c, g, smoothstep(H0 + 12.0, H0 + 16.0, pg.y));
      }
      // ---- the creatures ----
      vec3 Ld = mix(normalize(vec3(-0.6, -0.55, 0.55)), normalize(vec3(I - px, 260.0)), imp);
      vec3 fill = mix(C_WARMBONE, C_TERRACOTTA, 0.35) * 0.055;
      vec3 lineC = mix(C_BONE, C_WARMBONE, 0.5) * (0.95 + 0.6 * light);
      float d1 = crSD(px, 0, 24, 14.0, box0);
      float d2 = crSD(px, 24, 24, 10.0, box1);
      c = reliefShade(c, d1, fill, lineC, 7.5, Ld, 1.0);
      c = reliefShade(c, d2, fill * 1.1, lineC, 7.5, Ld, 1.0);
      // ---- impact: the shockwave hairline (the ignition's ring, again), dust ----
      if (ti > 0.0) {
        float R = 1700.0 * (1.0 - pow(2.0, -10.0 * ti / 2.6));
        float rr = length(px - I);
        float ring = pxLine(rr - R, 1.6) * exp(-ti * 0.8);
        float ring2 = pxLine(rr - R * 0.82, 1.0) * exp(-ti * 1.2) * 0.5;
        c += (C_BONE * 0.9 + C_LINE * 0.6) * (ring + ring2);
        c += warmL * 0.03 * smoothstep(R, R * 0.6, rr) * exp(-ti * 2.0);
        // dust: a column rising over the impact
        vec2 q = (px - I) / vec2(1.0 + ti * 0.8, 1.0);
        float col = smoothstep(0.0, -60.0 - 400.0 * ti, q.y) * exp(-pow(q.x / (50.0 + 160.0 * ti + 0.4 * max(0.0, -q.y)), 2.0));
        col *= 0.55 + 0.45 * fbm(vec2(q.x / 40.0, q.y / 40.0 + ti * 2.0), 4);
        c = mix(c, mix(C_GRAPHITE * 0.3, warmL * 0.5, exp(-max(0.0, -q.y) / 160.0)), col * 0.85 * smoothstep(0.0, 0.1, ti));
        // the frame flashes
        c += warmL * 0.25 * exp(-ti / 0.06);
      }
      fragColor = vec4(c, 1.0);
    }`, {
    t: { value: 0 }, camS: { value: 1 }, camX: { value: 0 }, impT: { value: 0 }, metK: { value: 0 }, glow: { value: 0 },
    meteor: { value: new THREE.Vector2() }, box0: { value: new THREE.Vector4() }, box1: { value: new THREE.Vector4() }, ridges: { value: null },
    ...this.bones.uniforms('cr'),
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
    const r = new Rng(4242);
    // ferns: a band along the near ground, a few larger ones in front
    for (let i = 0; i < 19; i++) {
      const front = i >= 15;
      const y = front ? r.range(1010, 1110) : r.range(860, 990);
      this.fernSet.push({ x: r.range(-80, 2000), y, h: (front ? r.range(170, 260) : r.range(60, 130)) * (y / 950), lean: r.range(-0.5, 0.5), n: front ? 7 : r.int(4, 6), ph: r.next() * TAU, depth: 1, front });
    }
    // the herbivore grazes on these
    this.fernSet.push({ x: 800, y: 925, h: 120, lean: 0.25, n: 5, ph: 1, depth: 1, front: false });
    this.fernSet.push({ x: 740, y: 940, h: 100, lean: -0.3, n: 5, ph: 2, depth: 1, front: false });
  }

  override headAt(t: number): V2 {
    if (t <= T_FULL) {
      const k = ease.inOutCubic(clamp((t - T0) / (T_FULL - T0)));
      return [lerp(1150, STAR[0], k), lerp(330, STAR[1], k)];
    }
    if (t < METEOR) return [STAR[0] + 6 * Math.sin((t - T_FULL) * 1.3), STAR[1] + 4 * Math.cos((t - T_FULL) * 0.9)];
    const u = ease.inQuart(clamp((t - METEOR) / (IMPACT - METEOR)));
    if (t < IMPACT) { const s = meteorPos(u); const w: V2 = [STAR[0] + 6 * Math.sin((METEOR - T_FULL) * 1.3), STAR[1] + 4 * Math.cos((METEOR - T_FULL) * 0.9)]; const k = 1 - clamp(u * 8); return [lerp(s[0], w[0], k), lerp(s[1], w[1], k)]; }
    return I;
  }

  // ---- the herbivore: long neck, columnar legs, a tail that sways ----
  sauropod(t: number): Capsule[] {
    const alarm = ease.inOutCubic(clamp((t - (LUNGE - 0.25)) / 0.5));
    const up = ease.inOutCubic(clamp((t - (METEOR + 0.5)) / 0.9));
    const R: V2 = [1300 + 34 * alarm, 655 - 4 * Math.sin(t * 1.6)];
    const out: Capsule[] = [];
    const G = 935;
    // legs (far pair first, slightly darker by being behind: same relief)
    for (const [ox, far] of [[-118, 1], [128, 1], [-140, 0], [110, 0]] as const) {
      const hip: V2 = [R[0] + ox + far * 26, R[1] + 30];
      const shift = Math.sin(t * 0.9 + ox) * 6 * (1 - alarm);
      const knee: V2 = [hip[0] + 6 + shift, (hip[1] + G) / 2 + 8];
      const foot: V2 = [hip[0] + shift * 2, G - 6 - far * 4];
      const s = far ? 0.85 : 1;
      out.push({ a: hip, b: knee, ra: 44 * s, rb: 33 * s }, { a: knee, b: foot, ra: 33 * s, rb: 36 * s });
    }
    out.push({ a: [R[0] + 150, R[1] + 4], b: [R[0] - 130, R[1] - 14], ra: 104, rb: 116 });
    out.push({ a: [R[0] + 70, R[1] + 34], b: [R[0] - 70, R[1] + 34], ra: 92, rb: 92 });
    // neck → head: grazing low, flinching up, then looking at the sky
    const N0: V2 = [R[0] - 200, R[1] - 52];
    const graze: V2 = [790 + 26 * Math.sin(t * 1.25), 872 + 16 * Math.sin(t * 2.5)];
    const raised: V2 = [930, 330];
    const sky: V2 = [1010, 210];
    const Hd: V2 = [lerp(lerp(graze[0], raised[0], alarm), sky[0], up), lerp(lerp(graze[1], raised[1], alarm), sky[1], up)];
    const ctrl: V2 = [lerp(N0[0] - 230, N0[0] - 60, alarm), lerp(N0[1] - 120, N0[1] - 260, alarm)];
    const pts: V2[] = [];
    for (let i = 0; i <= 7; i++) { const u = i / 7, v = 1 - u; pts.push([v * v * N0[0] + 2 * u * v * ctrl[0] + u * u * Hd[0], v * v * N0[1] + 2 * u * v * ctrl[1] + u * u * Hd[1]]); }
    out.push(...chain(pts, 58, 21));
    const ha = Math.atan2(Hd[1] - pts[6]![1], Hd[0] - pts[6]![0]) - 0.75;
    const hd: V2 = [Hd[0] + Math.cos(ha) * 58, Hd[1] + Math.sin(ha) * 58];
    out.push({ a: Hd, b: hd, ra: 29, rb: 14 });
    // tail
    const tail: V2[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const sw = Math.sin(t * 1.1 - u * 2.2) * 40 * u * u;
      tail.push([R[0] + 200 + 470 * u, R[1] - 10 + 210 * u * u - 60 * u + sw]);
    }
    out.push(...chain(tail, 72, 6));
    return out;
  }

  // ---- the predator: an original two-legged hunter with a heavy skull and a balancing tail ----
  rex(t: number): Capsule[] {
    if (t < STALK - 0.1) return [];
    const stalkU = clamp((t - STALK) / (LUNGE - STALK));
    const lungeU = ease.outCubic(clamp((t - LUNGE) / 0.6));
    const look = ease.inOutCubic(clamp((t - (METEOR + 0.75)) / 0.8));
    const x = lerp(-420, 330, stalkU) + 360 * lungeU;
    const dist = (x + 420) + 300 * lungeU;
    const phi = (TAU * dist) / 300;
    const amp = 1 - look;
    const lean = lerp(lerp(0.16, 0.02, lungeU), -0.32, look);  // body pitch (+ = head down)
    const P: V2 = [x, 700];
    const fwd: V2 = [Math.cos(lean), Math.sin(lean)];
    const chest: V2 = [P[0] + fwd[0] * 125, P[1] + fwd[1] * 125];
    const out: Capsule[] = [];
    // legs: thigh forward-down, shin back-down, long foot forward
    const legs: Capsule[][] = [];
    let low = -Infinity;
    for (let i = 0; i < 2; i++) {
      const ph = phi + Math.PI * i;
      const a = 0.45 * amp * Math.sin(ph) + 0.25 + 0.2 * lungeU * (i ? -1 : 1);
      const lift = Math.max(0, Math.cos(ph)) * amp;
      const knee: V2 = [P[0] + Math.sin(a) * 118, P[1] + 14 + Math.cos(a) * 118];
      const b2 = a - 1.25 - 0.4 * lift;
      const ankle: V2 = [knee[0] + Math.sin(b2) * 118, knee[1] + Math.cos(b2) * 118];
      const b3 = b2 + 0.85 + 0.3 * lift;
      const foot: V2 = [ankle[0] + Math.sin(b3) * 62, ankle[1] + Math.cos(b3) * 62];
      const toe: V2 = [foot[0] + 44, foot[1] + 4];
      low = Math.max(low, foot[1] + 10, toe[1] + 8);
      legs.push([{ a: [P[0], P[1] + 10], b: knee, ra: 48, rb: 30 }, { a: knee, b: ankle, ra: 28, rb: 17 }, { a: ankle, b: foot, ra: 16, rb: 12 }, { a: foot, b: toe, ra: 12, rb: 7 }]);
    }
    const dy = 965 - low;
    const D = (p: V2): V2 => [p[0], p[1] + dy];
    const Dc = (b: Capsule): Capsule => ({ ...b, a: D(b.a), b: D(b.b) });
    out.push(...legs[1]!.map(Dc));
    out.push(Dc({ a: P, b: chest, ra: 60, rb: 64 }));
    // neck and skull; the jaw opens in the lunge and at the sky
    const nAng = lean - 0.75 - 0.5 * look;
    const neckTop: V2 = [chest[0] + Math.cos(nAng) * 72, chest[1] + Math.sin(nAng) * 72];
    out.push(Dc({ a: chest, b: neckTop, ra: 46, rb: 37 }));
    const hAng = lerp(lerp(0.3, 0.06, lungeU), -0.85, look);
    const skullEnd: V2 = [neckTop[0] + Math.cos(hAng) * 132, neckTop[1] + Math.sin(hAng) * 132];
    out.push(Dc({ a: neckTop, b: skullEnd, ra: 40, rb: 22 }));
    const jaw = 0.08 + 0.5 * Math.sin(Math.PI * clamp((t - LUNGE - 0.1) / 0.6)) + 0.35 * look * (0.6 + 0.4 * Math.sin(t * 9));
    const jA = hAng + jaw;
    const j0: V2 = [neckTop[0] + Math.cos(hAng + 1.2) * 18, neckTop[1] + Math.sin(hAng + 1.2) * 18];
    out.push(Dc({ a: j0, b: [j0[0] + Math.cos(jA) * 112, j0[1] + Math.sin(jA) * 112], ra: 22, rb: 11 }));
    // brow ridge
    out.push(Dc({ a: [neckTop[0] + Math.cos(hAng - 0.6) * 30, neckTop[1] + Math.sin(hAng - 0.6) * 30], b: [neckTop[0] + Math.cos(hAng - 0.25) * 62, neckTop[1] + Math.sin(hAng - 0.25) * 62], ra: 16, rb: 12 }));
    // arms: small
    const sh: V2 = [chest[0] + 18, chest[1] + 34];
    out.push(Dc({ a: sh, b: [sh[0] + 30, sh[1] + 26], ra: 11, rb: 8 }), Dc({ a: [sh[0] + 30, sh[1] + 26], b: [sh[0] + 46, sh[1] + 16], ra: 8, rb: 5 }));
    // tail: counterbalances the pitch, sways with the stride
    const tail: V2[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const sw = Math.sin(phi * 0.5 + u * 2) * 22 * u * amp;
      const ta = Math.PI + lean * 0.9 - 0.1;
      tail.push(D([P[0] + Math.cos(ta) * 470 * u + 20, P[1] - 6 + Math.sin(ta) * 470 * u + sw + 30 * u * u]));
    }
    out.push(...chain(tail, 54, 5));
    out.push(...legs[0]!.map(Dc));
    return out;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, u = this.pass.u;
    const cam = camAt(t);
    u.t!.value = t; u.camS!.value = cam.s; u.camX!.value = cam.x;
    const metK = smoothstep(METEOR, IMPACT, t) * (t < IMPACT + 0.3 ? 1 : 0);
    u.metK!.value = metK;
    const hp = this.headAt(t);
    (u.meteor!.value as THREE.Vector2).set(hp[0], hp[1]);
    // creatures, in screen space (camera applied to every joint)
    const cs = (b: Capsule): Capsule => ({ a: toScr(t, b.a), b: toScr(t, b.b), ra: b.ra * cam.s, rb: b.rb * cam.s });
    const sa = this.sauropod(t).map(cs), rx = this.rex(t).map(cs);
    this.bones.set(0, 24, sa);
    this.bones.set(24, 24, rx);
    (u.box0!.value as THREE.Vector4).copy(boxOf(sa, 16));
    (u.box1!.value as THREE.Vector4).copy(boxOf(rx, 12));
    this.pass.render(r, out);

    // ferns: hairline fronds that sway; lit by the impact
    const fb = this.ferns, fr = this.front;
    fb.clear(); fr.clear();
    const imp = t > IMPACT ? Math.exp(-(t - IMPACT) / 0.35) * 1.4 + 0.5 : 0;
    for (const fe of this.fernSet) {
      const B = fe.front ? fr : fb;
      const col = rgba(BONE, fe.front ? 0.45 : 0.36, (fe.front ? 0.2 : 0.32) * (1 + imp * 0.6));
      for (let k = 0; k < fe.n; k++) {
        const a0 = -Math.PI / 2 + fe.lean + (k - (fe.n - 1) / 2) * 0.42 + 0.06 * Math.sin(t * 1.4 + fe.ph + k);
        const len = fe.h * (1 - Math.abs(k - (fe.n - 1) / 2) * 0.12);
        const pts: V2[] = [];
        for (let s = 0; s <= 10; s++) {
          const q = s / 10;
          const a = a0 + q * q * 1.2 * Math.sign(a0 + Math.PI / 2 || 1) + 0.05 * Math.sin(t * 2 + fe.ph + q * 3);
          const prev = pts[s - 1] ?? [fe.x, fe.y];
          pts.push(s === 0 ? [fe.x, fe.y] : [prev[0] + Math.cos(a) * len / 10, prev[1] + Math.sin(a) * len / 10]);
        }
        const sp = pts.map((p) => toScr(t, p));
        B.polyline(sp, () => (fe.front ? 2.2 : 1.2), () => col);
        // leaflets
        for (let s = 2; s < 10; s++) {
          const [x0, y0] = sp[s]!, [x1, y1] = sp[s + 1]!;
          const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
          const ll = (fe.front ? 22 : 10) * (1 - s / 11) * (fe.h / 120);
          for (const side of [-1, 1]) {
            const nx = (-dy / L) * side, ny = (dx / L) * side;
            B.seg2(x0, y0, x0 + (nx + dx / L * 0.6) * ll, y0 + (ny + dy / L * 0.6) * ll, fe.front ? 1.6 : 1, col);
          }
        }
      }
    }
    fb.render(r, out);
    fr.render(r, out);

    // the line: a star, then the meteor
    const m = this.motif;
    m.clear();
    if (this.drawHead) {
      if (t > METEOR && t < IMPACT + 0.2) {
        const pts: V2[] = [];
        for (let j = 30; j >= 0; j--) pts.push(this.headAt(Math.max(METEOR, Math.min(t, IMPACT) - (0.5 * j) / 30)));
        m.trail(pts, 2 + 5 * metK, 1.3 + 1.5 * metK, 1, 0.6);
      }
      const flare = t >= IMPACT ? Math.exp(-(t - IMPACT) / 0.15) : 0;
      const tw = t < METEOR ? 0.85 + 0.15 * Math.sin(t * 7) : 1;
      m.head(hp[0], hp[1], (1.05 + 1.4 * metK) * tw + 2 * flare, 1 + 1.6 * metK + flare);
    }
    m.render(r, out);
    const boom = t >= IMPACT ? Math.exp(-(t - IMPACT) / 0.4) : 0;
    return { bloom: 0.6 + 0.5 * boom, bloomThreshold: 0.85, vignette: 0.45, grain: 0.05, warmth: 0.25 + 0.4 * boom };
  }
}

export const _ = { lerp };
