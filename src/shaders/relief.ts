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

// ---------------------------------------------------------------------------------------------------------
// Detailed bodies: every capsule carries a smoothing radius and a material. The nearest capsule decides the
// material and gives bone-local texture coordinates (u along the bone, v across it, in px), so skin scales,
// fur strands and metal panels stick to the moving limb instead of swimming. A negative smoothing marks a
// decal (eye, nostril, visor): it overrides the material where it lies inside the body without changing
// the silhouette. Smoothing 0 is a hard union (teeth, claws, bolts).

/** Materials of detailed bodies. */
export const MAT = { SCALE: 0, SKIN: 1, HORN: 2, EYE: 3, FUR: 4, METAL: 5, JOINT: 6, CLOTH: 7, HAIR: 8, DARK: 9, GLASS: 10, RUBBER: 11 } as const;

export interface Part extends Capsule { k?: number; mat?: number }

export const BODY_COMMON_GLSL = /* glsl */ `
struct Body { float d; float mat; vec2 uv; float r; vec2 t; float round; vec3 n; };
vec3 vor3(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
    vec2 g = vec2(float(k), float(j));
    vec2 r = g + hash22(i + g) * 0.85 - f;
    float dd = dot(r, r);
    if (dd < d1) { d2 = d1; d1 = dd; id = hash12(i + g); } else if (dd < d2) d2 = dd;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
/**
 * Shade a detailed body over c. skinA: main colour (scales, fur), skinB: second colour (bare skin, belly),
 * L: light direction (screen, y down; z toward the viewer), Lc: light colour, stripes: 0..1 pattern,
 * line: hairline colour of the contour rings and outline (the film's relief language, kept faint).
 */
vec3 bodyShade(vec3 c, Body B, vec3 L, vec3 Lc, vec3 skinA, vec3 skinB, float stripes, vec3 line, float ringStep, float alpha) {
  float d = B.d;
  float hh = sqrt(max(0.0, -d) * 34.0);
  vec2 hg = vec2(dFdx(hh), dFdy(hh));         // derivatives first: the returns below are divergent
  float rx = hh / ringStep; float rfw = max(fwidth(rx), 1e-5);
  float uvw = max(fwidth(B.uv.x) + fwidth(B.uv.y), 1e-3);
  if (alpha <= 0.0 || d > 3.0) return c;
  float inside = smoothstep(1.1, -1.1, d);
  // smooth volume: each limb is shaded as the cylinder (or sphere) it is, from bone-local coordinates;
  // screen-space derivatives (coarse 2×2 on a CPU rasteriser) would band
  vec3 n = normalize(B.n + vec3(0.0, 0.0, 0.15));
  vec3 Lw = normalize(vec3(L.x, -L.y, L.z));
  float dif = sat(dot(n, Lw));
  float spec = pow(sat(dot(reflect(-Lw, n), vec3(0.0, 0.0, 1.0))), 22.0);
  float rim = pow(1.0 - n.z, 2.0);
  float belly = sat(-n.y * 1.4);                            // normals facing down: the underside
  vec2 uv = B.uv;
  float m = B.mat;
  vec3 col = skinA; float sp = 0.15; float emit = 0.0;
  float aa = sat(1.6 - uvw * 0.35);                         // fine texture fades out when tiny on screen
  if (m < 0.5) {                                            // scales
    vec3 v = vor3(uv / 6.5);
    float crack = smoothstep(0.0, 0.14, v.y - v.x);
    col = skinA * (0.82 + 0.3 * v.z) * mix(0.55, 1.0, mix(1.0, crack, aa));
    col *= 1.0 - stripes * 0.45 * smoothstep(0.3, 0.7, sin(uv.x / 23.0 + 1.7 * vnoise(uv / 30.0)) * 0.5 + 0.5) * (1.0 - belly);
    col = mix(col, skinB * (0.9 + 0.2 * v.z), belly * 0.8);
    sp = 0.25;
  } else if (m < 1.5) {                                     // bare skin
    col = skinB * (0.92 + 0.12 * vnoise(uv / 3.0));
    sp = 0.18;
  } else if (m < 2.5) {                                     // horn: teeth, claws
    col = vec3(0.55, 0.47, 0.34) * (0.8 + 0.3 * sat(uv.x / 30.0));
    sp = 0.6;
  } else if (m < 3.5) {                                     // eye: amber iris, black pupil, a wet highlight
    float rr = length(uv);
    col = mix(vec3(0.30, 0.13, 0.02), vec3(0.003), smoothstep(B.r * 0.42, B.r * 0.32, rr));
    col = mix(vec3(0.01, 0.008, 0.006), col, smoothstep(B.r * 1.0, B.r * 0.85, rr));
    col += vec3(1.0, 0.95, 0.85) * 0.9 * smoothstep(B.r * 0.22, B.r * 0.08, length(uv + vec2(B.r * 0.3, B.r * 0.3)));
    sp = 0.3; dif = 1.0;
  } else if (m < 4.5) {                                     // fur
    float s1 = vnoise(vec2(uv.x / 1.4, uv.y / 5.0) + 3.0), s2 = vnoise(vec2(uv.x / 0.7, uv.y / 2.5) + 9.0);
    col = skinA * mix(1.0, 0.55 + 0.75 * (s1 * 0.6 + s2 * 0.4), aa);
    col = mix(col, skinA * 1.35, belly * 0.35);
    sp = 0.05;
  } else if (m < 5.5) {                                     // metal: panels, rivets, brushed grain
    vec3 steel = skinA;
    float panel = 1.0 - (1.0 - smoothstep(0.0, 1.2, abs(fract(uv.x / 38.0 + 0.5) - 0.5) * 38.0)) * aa;
    float rivet = smoothstep(2.2, 1.2, length(vec2((fract(uv.x / 38.0 + 0.5) - 0.5) * 38.0 - 6.0, abs(uv.y) - B.r * 0.62))) * aa;
    float grain = vnoise(vec2(uv.x / 30.0, uv.y / 0.8)) * 0.12 * aa;
    col = steel * (0.9 + grain) * mix(0.45, 1.0, panel) + vec3(0.25) * rivet;
    sp = 1.6;
  } else if (m < 6.5) {                                     // joint: the line's red
    float rr = length(uv);
    col = mix(C_LINE * 0.9, vec3(0.015), smoothstep(B.r * 0.55, B.r * 0.4, rr) * 0.8) * (0.7 + 0.3 * dif);
    col += C_LINE * 0.6 * smoothstep(B.r * 0.2, 0.0, rr);
    emit = 0.6; sp = 0.8;
  } else if (m < 7.5) {                                     // cloth / leather
    float w = vnoise(vec2(uv.x / 1.2, uv.y / 1.2)) * 0.5 + vnoise(vec2(uv.x / 6.0, uv.y / 2.0)) * 0.5;
    col = mix(C_TERRACOTTA, C_OCHRE, 0.4) * 0.32 * (0.75 + 0.45 * mix(0.6, w, aa));
    sp = 0.05;
  } else if (m < 8.5) {                                     // hair
    float s = vnoise(vec2(uv.x / 0.8, uv.y / 6.0) + 5.0);
    col = vec3(0.012, 0.009, 0.007) * (0.6 + 0.9 * mix(0.5, s, aa));
    sp = 0.5;
  } else if (m < 9.5) {                                     // dark: mouth, rubber
    col = vec3(0.006, 0.004, 0.004); sp = 0.1;
  } else {                                                  // glass: visor
    col = vec3(0.006, 0.006, 0.008) + C_LINE * 0.25 * smoothstep(B.r * 0.25, 0.0, abs(uv.y + B.r * 0.1)) * aa;
    sp = 3.0; emit = 0.25;
  }
  float sh = smoothstep(0.0, 1.0, dif);
  vec3 lit = col * (0.12 + 1.15 * sh) * Lc + Lc * spec * sp * 0.35 + col * Lc * rim * 0.25 + col * emit;
  c = mix(c, lit, inside * alpha);
  float rings = sat(0.45 - abs(fract(rx - 0.5) - 0.5) / rfw) * sat(1.6 - rfw * 3.0) * inside * smoothstep(0.0, 5.0, -d);
  c += line * alpha * (rings * 0.05 + pxLine(d, 1.4) * 0.55);
  return c;
}`;

/** GLSL: uniforms `${name}A` (bones), `${name}R` (ra, rb, smoothing, material), and `Body ${name}Body(p, first, count, box)`. */
export function bodyGLSL(name: string, n: number) {
  return /* glsl */ `
  uniform vec4 ${name}A[${n}]; uniform vec4 ${name}R[${n}];
  Body ${name}Body(vec2 p, int first, int count, vec4 box) {
    Body B; B.d = 1e5; B.mat = 0.0; B.uv = vec2(0.0); B.r = 1.0; B.t = vec2(1.0, 0.0); B.round = 0.0; B.n = vec3(0.0, 0.0, 1.0);
    vec3 nsum = vec3(0.0);
    float far = length(max(max(box.xy - p, p - box.zw), 0.0));
    if (far > 30.0) { B.d = far; return B; }
    float best = 1e5; bool decal = false;
    for (int i = 0; i < ${n}; i++) {
      if (i < first) continue;
      if (i >= first + count) break;
      vec4 r = ${name}R[i];
      if (r.x <= 0.0) continue;
      vec4 b = ${name}A[i];
      vec2 pa = p - b.xy, ba = b.zw - b.xy;
      float L2 = max(dot(ba, ba), 1e-4);
      float h = sat(dot(pa, ba) / L2);
      vec2 q = pa - ba * h;
      float rad = mix(r.x, r.y, h);
      float dist = length(q) - rad;
      bool isDecal = r.z < 0.0;
      if (!isDecal) {
        B.d = r.z > 0.0 ? smin(B.d, dist, r.z) : min(B.d, dist);
        // the surface normal of this part (a cylinder across the bone, a sphere for round parts), blended
        // with its neighbours by proximity so the joins stay smooth
        vec2 qn = q / max(rad, 1e-3);
        float l2 = min(dot(qn, qn), 0.998);
        float w = exp(-clamp(dist, -60.0, 60.0) / 6.0);
        nsum += w * vec3(qn.x, -qn.y, sqrt(1.0 - l2));
      }
      if ((isDecal && dist < 0.0) || (!isDecal && !decal && dist < best)) {
        if (!isDecal) best = dist;
        decal = decal || isDecal;
        float L = sqrt(L2); vec2 tt = L > 1e-3 ? ba / L : vec2(1.0, 0.0);
        B.mat = r.w; B.r = rad;
        B.uv = L > 0.5 ? vec2(h * L, dot(q, vec2(-tt.y, tt.x))) : pa;   // round parts: the offset from the centre
        B.t = tt; B.round = L > 0.5 ? 0.0 : 1.0;
      }
    }
    if (dot(nsum, nsum) > 0.0) B.n = normalize(nsum);
    return B;
  }`;
}

/** CPU side: a packed array of detailed parts for `bodyGLSL`. */
export class PartArray {
  A: THREE.Vector4[]; R: THREE.Vector4[];
  constructor(public n: number) {
    this.A = Array.from({ length: n }, () => new THREE.Vector4());
    this.R = Array.from({ length: n }, () => new THREE.Vector4());
  }
  uniforms(name: string) { return { [`${name}A`]: { value: this.A }, [`${name}R`]: { value: this.R } }; }
  set(first: number, max: number, parts: Part[], defK = 8) {
    if (parts.length > max) console.warn(`PartArray: ${parts.length} parts > ${max} slots`);
    for (let i = 0; i < max; i++) {
      const b = parts[i];
      if (!b) { this.R[first + i]!.set(0, 0, 0, 0); continue; }
      this.A[first + i]!.set(b.a[0], b.a[1], b.b[0] + (b.a[0] === b.b[0] && b.a[1] === b.b[1] ? 1e-3 : 0), b.b[1]);
      this.R[first + i]!.set(b.ra, b.rb, b.k ?? defK, b.mat ?? 0);
    }
  }
}
