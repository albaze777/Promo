// Post: bloom (dual-filter pyramid at logical res), exposure, soft shoulder, vignette, chromatic fringe,
// film grain (seeded per frame), fade/flash, sRGB + dither. Runs once per output frame, after motion blur.
import * as THREE from 'three';
import { FSPass, makeRT, W, H } from './gl';
import { frameIdx } from '../utils/math';

export interface PostParams {
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  vignette: number;
  grain: number;
  ca: number;
  /** 0 = normal, 1 = black. */
  fade: number;
  /** Additive white-hot flash (impact frames). */
  flash: number;
  /** Warm (+) / cool (−) white balance shift, subtle. */
  warmth: number;
}

export const DEFAULT_POST: PostParams = {
  exposure: 1, bloom: 0.55, bloomThreshold: 0.9, vignette: 0.35, grain: 0.045, ca: 0.0, fade: 0, flash: 0, warmth: 0,
};

export const SHOULDER_GLSL = /* glsl */ `
vec3 shoulder(vec3 x) {
  // linear below 0.8, smooth roll-off to 1.0 above (keeps bone/ink exact, tames bloom cores)
  vec3 k = vec3(0.8);
  vec3 over = max(x - k, 0.0);
  return min(x, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}`;

export class Post {
  private levels: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];
  private prefilter: FSPass;
  private down: FSPass;
  private up: FSPass;
  private final: FSPass;

  constructor() {
    const N = 5;
    for (let i = 0; i < N; i++) {
      const d = 2 ** (i + 1);
      this.levels.push(makeRT(W / d, H / d, { pxScale: 1 }));
      this.ups.push(makeRT(W / d, H / d, { pxScale: 1 }));
    }
    this.prefilter = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel; uniform float threshold;
      void main() {
        vec3 c = vec3(0.0);
        c += texture(src, vUv + texel * vec2(-1, -1)).rgb; c += texture(src, vUv + texel * vec2(1, -1)).rgb;
        c += texture(src, vUv + texel * vec2(-1, 1)).rgb;  c += texture(src, vUv + texel * vec2(1, 1)).rgb;
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        float k = max(l - threshold, 0.0) / max(l, 1e-4);
        fragColor = vec4(min(c * k, vec3(40.0)), 1.0);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.9 } });
    this.down = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel;
      void main() {
        vec3 c = texture(src, vUv).rgb * 4.0;
        c += texture(src, vUv + texel * vec2(-1, -1)).rgb; c += texture(src, vUv + texel * vec2(1, -1)).rgb;
        c += texture(src, vUv + texel * vec2(-1, 1)).rgb;  c += texture(src, vUv + texel * vec2(1, 1)).rgb;
        fragColor = vec4(c / 8.0, 1.0);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform sampler2D base; uniform vec2 texel; uniform float hasBase;
      void main() {
        vec3 c = vec3(0.0);
        c += texture(src, vUv + texel * vec2(-2, 0)).rgb; c += texture(src, vUv + texel * vec2(2, 0)).rgb;
        c += texture(src, vUv + texel * vec2(0, -2)).rgb; c += texture(src, vUv + texel * vec2(0, 2)).rgb;
        c += (texture(src, vUv + texel * vec2(-1, -1)).rgb + texture(src, vUv + texel * vec2(1, -1)).rgb
            + texture(src, vUv + texel * vec2(-1, 1)).rgb + texture(src, vUv + texel * vec2(1, 1)).rgb) * 2.0;
        c /= 12.0;
        if (hasBase > 0.5) c += texture(base, vUv).rgb;
        fragColor = vec4(c, 1.0);
      }`, { src: { value: null }, base: { value: null }, texel: { value: new THREE.Vector2() }, hasBase: { value: 0 } });
    this.final = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform sampler2D bloomTex;
      uniform float exposure, bloom, vignette, grain, ca, fade, flash, warmth, seed;
      ${SHOULDER_GLSL}
      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main() {
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        vec3 c;
        if (ca > 0.0) {
          vec2 off = cc * ca * 0.004;
          c = vec3(texture(src, uv - off).r, texture(src, uv).g, texture(src, uv + off).b);
        } else c = texture(src, uv).rgb;
        c = max(c, 0.0) * exposure;
        c += texture(bloomTex, uv).rgb * bloom;
        c += vec3(1.0, 0.92, 0.85) * flash;
        c *= vec3(1.0 + 0.04 * warmth, 1.0, 1.0 - 0.05 * warmth);
        // vignette: gentle, elliptical
        float v = dot(cc * vec2(1.0, 0.78), cc * vec2(1.0, 0.78));
        c *= mix(1.0, smoothstep(0.62, 0.05, v), vignette);
        c = shoulder(c);
        c *= 1.0 - fade;
        vec3 s = toSRGB(sat(c));
        // grain: luminance-weighted, strongest in mid-tones, re-seeded every output frame
        vec2 px = gl_FragCoord.xy / PX_SCALE;
        float g = hash13(vec3(floor(px), seed)) + hash13(vec3(floor(px) + 17.0, seed + 3.1)) - 1.0;
        float l = luma(s);
        s += g * grain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
        // dither to 8 bit
        s += (ign(gl_FragCoord.xy + seed * 5.0) - 0.5) / 255.0;
        fragColor = vec4(sat(s), 1.0);
      }`, {
      src: { value: null }, bloomTex: { value: null }, exposure: { value: 1 }, bloom: { value: 0.5 }, vignette: { value: 0.3 },
      grain: { value: 0.04 }, ca: { value: 0 }, fade: { value: 0 }, flash: { value: 0 }, warmth: { value: 0 }, seed: { value: 0 },
    });
  }

  render(r: THREE.WebGLRenderer, src: THREE.Texture, out: THREE.WebGLRenderTarget, p: PostParams, t: number) {
    const L = this.levels, U = this.ups;
    // bloom pyramid
    this.prefilter.u.src!.value = src;
    (this.prefilter.u.texel!.value as THREE.Vector2).set(1 / L[0]!.width, 1 / L[0]!.height);
    this.prefilter.u.threshold!.value = p.bloomThreshold;
    this.prefilter.render(r, L[0]!);
    for (let i = 1; i < L.length; i++) {
      this.down.u.src!.value = L[i - 1]!.texture;
      (this.down.u.texel!.value as THREE.Vector2).set(1 / L[i - 1]!.width, 1 / L[i - 1]!.height);
      this.down.render(r, L[i]!);
    }
    let prev = L[L.length - 1]!.texture;
    for (let i = L.length - 2; i >= 0; i--) {
      this.up.u.src!.value = prev;
      this.up.u.base!.value = L[i]!.texture;
      this.up.u.hasBase!.value = 1;
      (this.up.u.texel!.value as THREE.Vector2).set(0.5 / U[i]!.width, 0.5 / U[i]!.height);
      this.up.render(r, U[i]!);
      prev = U[i]!.texture;
    }
    const f = this.final.u;
    f.src!.value = src; f.bloomTex!.value = prev;
    f.exposure!.value = p.exposure; f.bloom!.value = p.bloom / (L.length - 1); f.vignette!.value = p.vignette;
    f.grain!.value = p.grain; f.ca!.value = p.ca; f.fade!.value = p.fade; f.flash!.value = p.flash; f.warmth!.value = p.warmth;
    f.seed!.value = (frameIdx(t) % 997) + 1;
    this.final.render(r, out);
  }
}
