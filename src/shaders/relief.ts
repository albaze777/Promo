// Contour-relief creatures for the panel scenes (05a dino era, 05b wheel): a set of capsule bones evaluated
// as one smooth SDF, drawn the way the hand and the walking figure are drawn in 03 (a dark dome lit by a
// hillshade, its height sculpted by concentric hairlines, a bone outline). Several bodies share one array;
// each body is a contiguous range [first, first + count).
import * as THREE from 'three';

export interface Capsule { a: [number, number]; b: [number, number]; ra: number; rb: number }

/** GLSL: uniforms `${name}A` (bones), `${name}R` (radii), and `float ${name}SD(vec2 p, int first, int count, float k)`. */
export function bonesGLSL(name: string, n: number) {
  return /* glsl */ `
  uniform vec4 ${name}A[${n}]; uniform vec2 ${name}R[${n}];
  float ${name}SD(vec2 p, int first, int count, float k, vec4 box) {
    // outside the body's bounding box (plus a margin) the distance to the box is a good enough bound
    float far = length(max(max(box.xy - p, p - box.zw), 0.0));
    if (far > 24.0) return far;
    float d = 1e5;
    for (int i = 0; i < ${n}; i++) {
      if (i < first) continue;
      if (i >= first + count) break;
      vec2 r = ${name}R[i];
      if (r.x <= 0.0) continue;
      vec4 b = ${name}A[i];
      vec2 pa = p - b.xy, ba = b.zw - b.xy;
      float h = sat(dot(pa, ba) / max(dot(ba, ba), 1e-4));
      d = smin(d, length(pa - ba * h) - mix(r.x, r.y, h), k);
    }
    return d;
  }`;
}

/**
 * GLSL: shade a relief body over colour c. d = SDF (px), fill = body colour, line = hairline colour,
 * ringStep = height step of the contour rings, L = light direction (screen, y down; z toward the viewer).
 */
export const RELIEF_SHADE_GLSL = /* glsl */ `
vec3 reliefShade(vec3 c, float d, vec3 fill, vec3 line, float ringStep, vec3 L, float alpha) {
  float hh = sqrt(max(0.0, -d) * 34.0);
  vec2 hg = vec2(dFdx(hh), dFdy(hh));        // derivatives before any divergent return
  float x = hh / ringStep; float fw = max(fwidth(x), 1e-5);
  if (alpha <= 0.0 || d > 4.0) return c;
  float inside = smoothstep(1.2, -1.2, d);
  vec3 hn = normalize(vec3(-hg.x * 1.4, -hg.y * 1.4, 1.0)); // (dFdy is window-up)
  float hs = sat(dot(hn, normalize(vec3(L.x, -L.y, L.z))));
  vec3 body = fill * (0.45 + 0.9 * hs);
  c = mix(c, body, inside * alpha);
  float rings = 0.0;
  rings = sat(0.45 - abs(fract(x - 0.5) - 0.5) / fw) * sat(1.6 - fw * 3.0);
  rings *= inside * smoothstep(0.0, 5.0, -d);
  c += line * alpha * (rings * (0.10 + 0.22 * hs) + pxLine(d, 1.5) * 0.7);
  return c;
}`;

/** CPU side: a packed bone array for `bonesGLSL`. */
export class BoneArray {
  A: THREE.Vector4[]; R: THREE.Vector2[];
  constructor(public n: number) {
    this.A = Array.from({ length: n }, () => new THREE.Vector4());
    this.R = Array.from({ length: n }, () => new THREE.Vector2());
  }
  uniforms(name: string) { return { [`${name}A`]: { value: this.A }, [`${name}R`]: { value: this.R } }; }
  /** Write bones at [first, first + max); unused slots get radius 0. Returns the bbox. */
  set(first: number, max: number, bones: Capsule[]) {
    for (let i = 0; i < max; i++) {
      const b = bones[i];
      if (!b) { this.R[first + i]!.set(0, 0); continue; }
      this.A[first + i]!.set(b.a[0], b.a[1], b.b[0], b.b[1]);
      this.R[first + i]!.set(b.ra, b.rb);
    }
  }
}

/** Bounding box (x0, y0, x1, y1) of capsules, radii included; a far-away box when empty. */
export function boxOf(caps: Capsule[], pad = 0): THREE.Vector4 {
  if (!caps.length) return new THREE.Vector4(-1e5, -1e5, -1e5, -1e5);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of caps) {
    const r = Math.max(c.ra, c.rb) + pad;
    x0 = Math.min(x0, c.a[0] - r, c.b[0] - r); x1 = Math.max(x1, c.a[0] + r, c.b[0] + r);
    y0 = Math.min(y0, c.a[1] - r, c.b[1] - r); y1 = Math.max(y1, c.a[1] + r, c.b[1] + r);
  }
  return new THREE.Vector4(x0, y0, x1, y1);
}

/** A chain of capsules through points with radii tapering from r0 to r1. */
export function chain(pts: [number, number][], r0: number, r1: number): Capsule[] {
  const out: Capsule[] = [];
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const ka = i / n, kb = (i + 1) / n;
    out.push({ a: pts[i]!, b: pts[i + 1]!, ra: r0 + (r1 - r0) * ka, rb: r0 + (r1 - r0) * kb });
  }
  return out;
}
