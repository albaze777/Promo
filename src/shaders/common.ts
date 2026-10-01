// GLSL shared by every fullscreen pass: palette (linear), hashing, noise, SDFs, AA lines, colour transforms.
import { PAL } from '../brand';
import { hexLin } from '../utils/math';

const v3 = (hex: string) => {
  const [r, g, b] = hexLin(hex);
  return `vec3(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
};

export const PALETTE_GLSL = Object.entries(PAL)
  .map(([k, v]) => `const vec3 C_${k.toUpperCase()} = ${v3(v)};`)
  .join('\n');

export const COMMON_GLSL = /* glsl */ `
${PALETTE_GLSL}
#define PI 3.14159265359
#define TAU 6.28318530718
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float lin01(float a, float b, float x) { return sat((x - a) / (b - a)); }

// --- hashing (no sin-hash: stable across GPUs) ---
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

// --- value noise ---
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), f1 = hash13(i + vec3(1, 0, 1)), g = hash13(i + vec3(0, 1, 1)), h = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.1; a *= 0.5; }
  return s;
}

// --- SDF helpers ---
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
float sdCapsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h);
}
float smin(float a, float b, float k) { float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1.0 - h); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

// PX_SCALE = physical px per logical px (2 at 4K). FRAG_PX = fragment position in logical px, y down.
uniform float PX_SCALE;
uniform vec2 RES; // logical resolution (1920, 1080)
#define FRAG_PX vec2(gl_FragCoord.x, RES.y * PX_SCALE - gl_FragCoord.y) / PX_SCALE

/** Anti-aliased line of logical width w (px) from a distance field d measured in logical px. */
float pxLine(float d, float w) {
  float aa = 0.75 / PX_SCALE;
  float hw = max(w * 0.5, 0.5 / PX_SCALE);
  return sat((hw + aa - abs(d)) / (2.0 * aa)) * min(1.0, w * PX_SCALE);
}
/** Iso-line of a scalar field u (any units) every 'step', width w physical-ish px, using derivatives. */
float isoLine(float u, float stepU, float w) {
  float x = u / stepU;
  float d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-5);
  return sat(w * PX_SCALE * 0.5 + 0.5 - d) ;
}
float fill(float sd) { float aa = 0.7 / PX_SCALE; return sat(0.5 - sd / (2.0 * aa)); }

vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
`;
