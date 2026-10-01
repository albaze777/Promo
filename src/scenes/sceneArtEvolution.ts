// 04 ART EVOLUTION — primitive → geometric → sketch → ink → colour → digital.
// The same composition re-made by each age. Each era grows out of the previous one along a front that
// radiates from the pen (the line's head), on the beat; the front itself is drawn by the line. The circle
// survives every transformation, and the pen redraws it once per beat.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { STONE_GLSL } from '../shaders/topo';
import { LineMotif, arc } from '../motifs/line';
import { MARK } from '../motifs/world';
import { getEraTextures, artCam, artToScreen, ERA_CUES } from '../art/plates';
import { CUE, BEAT } from '../timeline/cues';
import { clamp, ease, keys, TAU } from '../utils/math';

export default class SceneArtEvolution extends Scene {
  override handlesTransition = true;
  motif = new LineMotif();
  pass = new FSPass(/* glsl */ `
    uniform sampler2D e0, e1, e2, e3, e4, e5;
    uniform float g[5];
    uniform vec2 pen; uniform float camS; uniform vec2 camC;
    ${STONE_GLSL}
    vec3 clay(vec2 p) {
      float n = fbm(p / 240.0, 4), m = vnoise(p / 3.0);
      vec3 c = mix(vec3(0.30, 0.075, 0.035), vec3(0.42, 0.115, 0.05), n);
      return c * (0.9 + 0.12 * m);
    }
    vec3 paper(vec2 p) {
      float fib = vnoise(vec2(p.x / 1.6, p.y / 9.0)) * 0.5 + vnoise(p / 2.0) * 0.5;
      float blot = fbm(p / 320.0, 3);
      vec3 c = vec3(0.80, 0.75, 0.65) * (0.96 + 0.05 * fib) * (0.97 + 0.05 * blot);
      return c;
    }
    vec4 plate(int k, vec2 uv) {
      if (k == 0) return texture(e0, uv); if (k == 1) return texture(e1, uv); if (k == 2) return texture(e2, uv);
      if (k == 3) return texture(e3, uv); if (k == 4) return texture(e4, uv); return texture(e5, uv);
    }
    vec3 era(int k, vec2 p, vec2 uv) {
      vec3 bg = k == 0 ? stoneColor(p) : k == 1 ? clay(p) : paper(p);
      vec4 s = plate(k, uv);
      return mix(bg, s.rgb, s.a);
    }
    void main() {
      vec2 px = FRAG_PX;
      vec2 p = camC + (px - camC) / camS;           // art space
      vec2 uv = vec2(p.x / RES.x, 1.0 - p.y / RES.y);
      float f = length(p - pen) / 1500.0 + (fbm(p / 70.0, 3) - 0.5) * 0.10;
      float m[6];
      m[0] = 1.0;
      for (int k = 1; k < 6; k++) m[k] = smoothstep(g[k - 1] + 0.004, g[k - 1] - 0.03, f);
      // weight of each era = its own mask × (1 − every later mask)
      vec3 c = vec3(0.0);
      float rest = 1.0;
      for (int k = 5; k >= 0; k--) {
        float w = m[k] * rest;
        if (w > 0.001) c += era(k, p, uv) * w;
        rest *= 1.0 - m[k];
        if (rest < 0.001) break;
      }
      // the seam: the growth front is drawn by the line
      for (int k = 0; k < 5; k++) {
        float gk = g[k];
        if (gk <= 0.0 || gk >= 1.25) continue;
        float sd = (f - gk) * 1500.0;
        c += (C_LINE * 1.1) * exp(-sd * sd / 10.0) * (1.0 - smoothstep(0.7, 1.25, gk));
      }
      fragColor = vec4(c, 1.0);
    }`, {
    e0: { value: null }, e1: { value: null }, e2: { value: null }, e3: { value: null }, e4: { value: null }, e5: { value: null },
    g: { value: [0, 0, 0, 0, 0] }, pen: { value: new THREE.Vector2() }, camS: { value: 1 }, camC: { value: new THREE.Vector2() },
  });

  override init() {
    const tex = getEraTextures();
    tex.forEach((t, i) => { this.pass.u[`e${i}`]!.value = t; });
  }

  /** Pen angle: one revolution of the circle per beat, easing in and out of every beat. */
  penAngle(t: number) {
    const b = Math.max(0, (t - CUE.art0) / BEAT);
    const n = Math.floor(b), fr = b - n;
    return MARK.startAngle + MARK.dir * TAU * (n + ease.inOutCubic(fr));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t;
    const cam = artCam(t);
    const u = this.pass.u;
    u.g!.value = ERA_CUES.slice(1).map((c) => -0.05 + 1.4 * ease.outCubic(clamp((t - (c - 0.06)) / 0.42)));
    const start: [number, number] = [MARK.cx + Math.cos(MARK.startAngle) * MARK.r, MARK.cy + Math.sin(MARK.startAngle) * MARK.r];
    (u.pen!.value as THREE.Vector2).set(start[0], start[1]);
    u.camS!.value = cam.scale;
    (u.camC!.value as THREE.Vector2).set(cam.cx, cam.cy);
    this.pass.render(r, out);

    // the pen: redraws the circle once per beat; the trail length follows its speed
    const m = this.motif;
    m.clear();
    const a = this.penAngle(t);
    const da = Math.abs(a - this.penAngle(t - 0.07));
    const back = Math.min(2.2, Math.max(0.05, da * 4.5));
    const pts = arc(MARK.cx, MARK.cy, MARK.r, a - MARK.dir * back, a, 80).map(([x, y]) => artToScreen(t, x, y));
    m.trail(pts, 2.4, 1.4);
    const [hx, hy] = artToScreen(t, MARK.cx + Math.cos(a) * MARK.r, MARK.cy + Math.sin(a) * MARK.r);
    m.head(hx, hy, 1.15, 1);
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    // grade: warm on stone, neutral on paper
    const warmth = keys(t, [[CUE.art0, 1.0], [CUE.art2 - 0.05, 0.9], [CUE.art2 + 0.3, 0.3], [CUE.art4, 0.3], [CUE.art4 + 0.3, 0.15]]);
    return { bloom: 0.45, bloomThreshold: 0.95, vignette: 0.32, grain: 0.04, warmth };
  }
}
