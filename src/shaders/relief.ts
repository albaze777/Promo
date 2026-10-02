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
    for (int j = 0; j < ${n}; j++) {
      if (j >= count) break;
      int i = first + j;
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
export const MAT = {
  SCALE: 0, SKIN: 1, HORN: 2, EYE: 3, FUR: 4, METAL: 5, JOINT: 6, CLOTH: 7, HAIR: 8, DARK: 9, GLASS: 10, RUBBER: 11,
  /** inside of a mouth: gums and tongue */ MOUTH: 12,
  /** enamel paint in the body's second colour (skinB) / accent colour (skinC), with panel seams */ PAINT: 13, PAINT2: 14,
  BRASS: 15, /** an emissive lens */ LAMP: 16,
  /** a spotted animal pelt (worn) */ PELT: 17, /** red-ochre body paint (decal) */ OCHRE: 18,
  /** a human eye: white, a dark iris, a highlight */ EYE_H: 19,
  /** a finger- or toenail (decal): a pink bed, a pale free edge, a sheen */ NAIL: 20,
  /** a dark keratin claw with a paler, worn tip */ CLAW: 21,
} as const;

export interface Part extends Capsule { k?: number; mat?: number; /** group (for split evaluation) */ g?: number }

/**
 * The body GLSL with only the materials a scene uses compiled in (a CPU rasteriser runs every branch of the
 * material chain for every pixel, so unused materials cost time): 'scales' (scaled skin, the reptile eye),
 * 'organic' (skin, fur, cloth, hair, pelt, ochre, eyes), 'mech' (steel, joints, glass, rubber, paint, brass,
 * lamps). Horn, dark and mouth are always there.
 */
export function bodyCommon(...sets: ('scales' | 'organic' | 'mech')[]) {
  return '\n' + sets.map((k) => `#define BODY_${k.toUpperCase()}\n`).join('') + BODY_COMMON_GLSL;
}

export const BODY_COMMON_GLSL = /* glsl */ `
// p: the pixel relative to the body's first part (continuous across parts, it moves with the body), for patterns
// ao: how far the smooth union pulled the surface in (px): the crease where two parts meet
struct Body { float d; float mat; vec2 uv; float r; vec2 t; float round; vec3 n; vec2 p; float ao; };
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
/** vor3 that also returns the offset from p to the nearest cell centre (cell units): a dome normal per cell */
vec3 vor3o(vec2 p, out vec2 off) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0; off = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
    vec2 g = vec2(float(k), float(j));
    vec2 r = g + hash22(i + g) * 0.85 - f;
    float dd = dot(r, r);
    if (dd < d1) { d2 = d1; d1 = dd; id = hash12(i + g); off = r; } else if (dd < d2) d2 = dd;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
/** a bone-local vector (along, across) as a shading-space vector (screen x, y up) */
vec3 boneToN(vec2 v, vec2 t, float rnd) {
  vec2 s = rnd > 0.5 ? v : v.x * t + v.y * vec2(-t.y, t.x);
  return vec3(s.x, -s.y, 0.0);
}
/** panel seams every len px along a bone and one seam along its length; 1 inside a panel, 0 on a seam */
float seams(vec2 uv, float r, float len, float aa) {
  float a = smoothstep(0.0, 1.3, abs(fract(uv.x / len + 0.5) - 0.5) * len);
  float b = smoothstep(0.0, 1.3, abs(abs(uv.y) - r * 0.55));
  return 1.0 - (1.0 - a * b) * aa;
}
/**
 * Shade a detailed body over c.
 *   skinA: the main colour (the back of scaled skin, fur, hair, steel)
 *   skinB: the second colour (the belly, bare skin, enamel paint)
 *   skinC: the accent (the flanks of scaled skin, worn cloth, the second paint)
 *   stripes: 0..1 strength of the dark bands and blotches on scaled skin; fur: 0..1 (fur → bare skin)
 *   L: light direction (screen, y down; z toward the viewer), Lc: light colour
 *   line: hairline colour of the contour rings and outline (the film's relief language, kept faint)
 */
vec3 bodyShade(vec3 c, Body B, vec3 L, vec3 Lc, vec3 skinA, vec3 skinB, vec3 skinC, float stripes, float fur, vec3 line, float ringStep, float alpha) {
  float d = B.d;
  float hh = sqrt(max(0.0, -d) * 34.0);
  vec2 hg = vec2(dFdx(hh), dFdy(hh));         // derivatives first: the block below is divergent
  float rx = hh / ringStep; float rfw = max(fwidth(rx), 1e-5);
  float uvw = max(fwidth(B.uv.x) + fwidth(B.uv.y), 1e-3);
  // one block that the rasteriser can skip whole when no pixel of the quad is on a body
  if (alpha > 0.0 && d <= 4.0) {
    vec2 uv = B.uv;
    int m = int(B.mat + 0.5);
    float aa = sat(1.6 - uvw * 0.35);                         // fine texture fades out when tiny on screen
    // fur breaks the silhouette into wisps
    if (m == 4) d += fur * aa * 2.6 * (vnoise(vec2(uv.x / 1.1, uv.y / 6.0) + 31.0) - 0.4);
    float inside = smoothstep(1.1, -1.1, d);
    // smooth volume: each limb is shaded as the cylinder (or sphere) it is, from bone-local coordinates;
    // screen-space derivatives (coarse 2×2 on a CPU rasteriser) would band
    vec3 n = normalize(B.n + vec3(0.0, 0.0, 0.15));
    vec3 Lw = normalize(vec3(L.x, -L.y, L.z));
    // the crease where two parts meet (armpit, groin, neck, the joins of a machine): occluded and folded
    // (only near the outline: deep inside, where two overlapping parts are equally near, the smooth union bulges)
    float crease = sat(B.ao / 3.5) * smoothstep(-16.0, -3.0, B.d);
    float rim = pow(1.0 - n.z, 2.0);
    float belly = sat(-n.y * 1.4);                            // normals facing down: the underside
    float dorsal = sat(n.y * 1.5 - 0.1);                      // normals facing up: the back
    float edge = smoothstep(-7.0, -1.0, d);                   // the band just inside the outline
    vec3 col = skinA; float sp = 0.15; float emit = 0.0; vec3 sss = vec3(0.0); float spP = 22.0;
    float occ = 1.0 - 0.5 * crease;                           // ambient occlusion
    // organic folds: fine wrinkles across the limb, deep in the creases and faint elsewhere
    float wrk = vnoise(vec2(uv.x / 2.2, uv.y / 14.0) + 17.0);
    float wrinkle = smoothstep(0.62, 0.8, wrk) * aa;
#ifdef BODY_SCALES
    if (m == 0) {                                             // scales: back → flank → belly, banded and blotched
      vec2 so, Vo;
      vec3 v = vor3o(uv / 5.0, so);
      vec3 V = dorsal > 0.02 ? vor3o(uv / 11.0 + 7.0, Vo) : v;  // larger scutes along the back
      if (dorsal <= 0.02) Vo = so;
      float crack = mix(smoothstep(0.0, 0.14, v.y - v.x), smoothstep(0.0, 0.1, V.y - V.x), dorsal * 0.7);
      float bump = 1.0 - smoothstep(0.0, 0.7, mix(v.x, V.x, dorsal * 0.7));
      // each scale is a little dome: tilt the normal away from its centre so every scale has a lit and a dark side
      vec2 off = mix(so, Vo, dorsal * 0.7);
      n = normalize(n - boneToN(off, B.t, B.round) * 0.75 * aa * (1.0 - belly * 0.6));
      col = mix(skinC, skinA, smoothstep(0.0, 0.8, dorsal + 0.25 * (vnoise(B.p / 40.0) - 0.5)));
      // bands and blotches follow the whole body (B.p), so they run across the joins between parts
      vec2 bp = B.p;
      float band = smoothstep(0.42, 0.78, sin(bp.x / 15.0 + 3.2 * vnoise(bp / 70.0) + 1.4 * vnoise(bp / 24.0)) * 0.5 + 0.5);
      float blotch = smoothstep(0.47, 0.6, fbm(mat2(0.8, 0.6, -0.6, 0.8) * bp / 34.0 + 3.0, 3));   // (3 octaves: 0..0.875)
      col *= 1.0 - stripes * (0.62 * band + 0.35 * blotch) * (1.0 - belly) * smoothstep(-0.2, 0.6, 1.0 - belly);
      // fine speckle: a few scales darker, a few paler
      float spk = hash12(floor(uv / 5.0) + 3.0);
      col *= mix(1.0, 0.7 + 0.6 * smoothstep(0.1, 0.9, spk), 0.5 * aa);
      col *= (0.84 + 0.28 * mix(v.z, V.z, dorsal)) * mix(1.0, (0.62 + 0.38 * crack) * (0.86 + 0.24 * bump), aa);
      // the belly: broad transverse plates (ventral scutes) instead of pebbled scales
      float plate = smoothstep(0.0, 1.2, abs(fract(uv.x / 7.5) - 0.5) * 7.5) * mix(1.0, 0.8 + 0.2 * vnoise(uv / 3.0), aa);
      vec3 bellyC = skinB * (0.9 + 0.2 * v.z) * mix(1.0, 0.72 + 0.28 * plate, aa);
      col = mix(col, bellyC, smoothstep(0.05, 0.8, belly));
      // skin folds: across the limb, strongest where parts join
      col *= 1.0 - wrinkle * (0.12 + 0.45 * crease);
      sp = 0.32 + 0.25 * bump; spP = 30.0;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 1) {                                      // bare skin, with warm light under it
      float pore = vnoise(uv / 0.9);
      col = skinB * (0.9 + 0.14 * vnoise(uv / 3.0) + 0.06 * pore);
      // mottling: warmer, redder patches (knees, knuckles, cheeks) and paler ones
      float mot = vnoise(B.p / 26.0 + 5.0);
      col *= mix(vec3(1.0), vec3(1.12, 0.94, 0.88), smoothstep(0.55, 0.85, mot) * 0.6);
      col *= 1.0 - 0.08 * smoothstep(0.5, 0.2, mot);
      // fine skin lines across the limb, deeper at the joints; a little bump from the pores
      col *= 1.0 - wrinkle * (0.06 + 0.4 * crease);
      n = normalize(n + boneToN(vec2(vnoise(uv / 1.2) - 0.5, vnoise(uv / 1.2 + 9.0) - 0.5), B.t, B.round) * 0.25 * aa);
      sss = skinB * vec3(1.0, 0.45, 0.3) * 0.5;
      sp = 0.22 + 0.1 * pore; spP = 16.0;
    }
#endif
    if (m == 2) {                                      // horn: teeth, claws, beads (ivory, darker at the root)
      col = B.round > 0.5 ? vec3(0.72, 0.66, 0.52) : mix(vec3(0.36, 0.28, 0.18), vec3(0.78, 0.72, 0.58), sat(uv.x / max(B.r * 3.0, 8.0) + 0.35));
      // growth ridges across it, a streak of wear along it, a translucent tip
      col *= 1.0 - 0.12 * aa * smoothstep(0.4, 0.9, sin(uv.x * 1.6 + vnoise(uv) * 2.0) * 0.5 + 0.5) * (1.0 - B.round);
      col *= 0.9 + 0.2 * vnoise(vec2(uv.x / 6.0, uv.y / 0.7));
      sss = vec3(0.5, 0.42, 0.3) * 0.25;
      sp = 0.9; spP = 40.0;
    }
#ifdef BODY_SCALES
    if (m == 21) {                                     // claw: dark keratin, striated along it, a paler worn tip
      float tipK = sat(uv.x / max(B.r * 4.0, 8.0));
      col = mix(vec3(0.035, 0.028, 0.022), vec3(0.3, 0.26, 0.2), tipK * tipK);
      col *= 0.85 + 0.3 * vnoise(vec2(uv.x / 4.0, uv.y / 0.6));
      sp = 1.2; spP = 44.0;
    }
#endif
#if defined(BODY_SCALES) || defined(BODY_ORGANIC)
    if (m == 3) {                                      // eye: amber iris, black pupil, a wet highlight
      float rr = length(uv);
      float ang = atan(uv.y, uv.x);
      float fib = vnoise(vec2(ang * 7.0, rr / max(B.r, 1.0) * 3.0));        // radial fibres of the iris
      vec3 iris = mix(vec3(0.26, 0.1, 0.01), vec3(0.62, 0.34, 0.05), smoothstep(B.r * 0.9, B.r * 0.4, rr)) * (0.7 + 0.6 * fib);
      // a slit pupil for the scaled creatures (stripes > 0), a round one for the ape
      float pup = stripes > 0.0 ? smoothstep(1.0, 0.7, length(vec2(uv.x / (B.r * 0.16), uv.y / (B.r * 0.5))))
                                : smoothstep(B.r * 0.42, B.r * 0.32, rr);
      col = mix(iris, vec3(0.003), pup);
      col = mix(vec3(0.01, 0.008, 0.006), col, smoothstep(B.r * 1.0, B.r * 0.85, rr));
      col = mix(col, col * 0.4, smoothstep(B.r * 0.6, B.r * 0.92, rr) * 0.6);             // the dark limbal ring
      col += vec3(1.0, 0.95, 0.85) * 0.9 * smoothstep(B.r * 0.22, B.r * 0.08, length(uv + vec2(B.r * 0.3, B.r * 0.3)));
      col += vec3(1.0, 0.95, 0.85) * 0.3 * smoothstep(B.r * 0.12, B.r * 0.03, length(uv - vec2(B.r * 0.35, B.r * 0.3)));
      sp = 0.3; spP = 60.0;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 4) {                                      // fur: strands in clumps, tips catching the light, thinning to skin
      float s1 = vnoise(vec2(uv.x / 1.4, uv.y / 5.0) + 3.0), s2 = vnoise(vec2(uv.x / 0.7, uv.y / 2.5) + 9.0);
      vec2 co; vec3 cl = vor3o(vec2(uv.x / 4.0, uv.y / 9.0) + 13.0, co);      // locks of fur
      float lock = smoothstep(0.05, 0.35, cl.y - cl.x);                      // dark partings between locks
      float tuft = vnoise(uv / 9.0 + 2.0);
      vec3 tip = skinA * vec3(2.1, 1.55, 1.1);
      vec3 furC = skinA * mix(1.0, 0.5 + 0.8 * (s1 * 0.6 + s2 * 0.4), aa);
      furC = mix(furC, tip, sat(s2 * 1.3 - 0.45) * aa * 0.8 + rim * 0.5);
      furC *= (0.85 + 0.3 * tuft) * mix(1.0, (0.55 + 0.45 * lock) * (0.85 + 0.3 * cl.z), aa * fur);
      furC = mix(furC, skinA * 1.5, belly * 0.3);
      n = normalize(n - boneToN(co * vec2(0.25, 0.6), B.t, B.round) * 0.6 * aa * fur);
      col = mix(skinB * (0.92 + 0.12 * vnoise(uv / 3.0)), furC, fur);
      col *= 1.0 - wrinkle * 0.35 * crease * (1.0 - fur);
      sss = skinB * vec3(1.0, 0.45, 0.3) * 0.4 * (1.0 - fur);
      sp = mix(0.2, 0.1, fur); spP = mix(16.0, 8.0, fur);
    }
#endif
#ifdef BODY_MECH
    if (m == 5) {                                      // steel: panels, hex bolts, brushed grain, grime and scratches
      float panel = seams(uv, B.r, 38.0, aa);
      vec2 bq = vec2((fract(uv.x / 38.0 + 0.5) - 0.5) * 38.0 - 6.0, abs(uv.y) - B.r * 0.62);
      vec2 ba = abs(bq);
      float hex = max(ba.x * 0.866 + ba.y * 0.5, ba.y) - 2.2;                 // a hex bolt head
      float bolt = smoothstep(0.6, -0.4, hex) * aa;
      float boltLit = sat(0.5 - dot(normalize(bq + 1e-3), vec2(L.x, L.y)) * 0.5);
      float grain = vnoise(vec2(uv.x / 30.0, uv.y / 0.8)) * 0.14 * aa;
      float scratch = smoothstep(0.985, 1.0, vnoise(vec2(uv.x / 9.0 + uv.y / 3.0, uv.y / 0.35) + 21.0)) * aa;
      float grime = (1.0 - panel) * 0.5 + smoothstep(0.55, 0.85, vnoise(uv / 7.0 + 3.0)) * 0.25 + belly * 0.2;
      col = skinA * (0.9 + grain) * mix(0.4, 1.0, panel);
      col = mix(col, vec3(0.05, 0.035, 0.02), grime * 0.45 * aa);
      col = mix(col, skinA * (0.6 + 0.9 * boltLit), bolt);
      col += vec3(0.35) * scratch;
      // a bevel: the edge of each panel facing the light catches it
      col += skinA * 0.5 * (1.0 - smoothstep(0.0, 2.0, abs(abs(fract(uv.x / 38.0 + 0.5) - 0.5) * 38.0 - 1.6))) * aa * sat(L.x);
      sp = 1.6 * (1.0 - 0.5 * grime); spP = 34.0;
    }
#endif
#ifdef BODY_MECH
    if (m == 6) {                                      // joint: the line's red, with machined grooves
      float rr = length(uv);
      col = mix(C_LINE * 0.9, vec3(0.015), smoothstep(B.r * 0.55, B.r * 0.4, rr) * 0.8) * (0.7 + 0.3 * sat(dot(n, Lw)));
      col *= 1.0 - 0.25 * aa * smoothstep(0.3, 0.9, sin(rr * 2.2) * 0.5 + 0.5) * step(B.r * 0.55, rr);
      col += C_LINE * 0.6 * smoothstep(B.r * 0.2, 0.0, rr);
      emit = 0.6; sp = 0.8;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 7) {                                      // cloth / leather in the accent colour, with a stitched hem
      float weave = (sin(uv.x * 2.4) * sin(uv.y * 2.4)) * 0.5 + 0.5;
      float w = vnoise(vec2(uv.x / 1.2, uv.y / 1.2)) * 0.5 + vnoise(vec2(uv.x / 6.0, uv.y / 2.0)) * 0.5;
      col = skinC * (0.7 + 0.5 * mix(0.6, w, aa)) * mix(1.0, 0.85 + 0.3 * weave, aa * 0.6);
      float hem = abs(abs(uv.y) - B.r * 0.78);
      float stitch = step(0.5, fract(uv.x / 5.0)) * smoothstep(1.0, 0.3, hem) * aa;
      col = mix(col, skinC * 1.9 + 0.03, stitch * 0.7);
      col *= 1.0 - 0.35 * smoothstep(B.r * 0.75, B.r, abs(uv.y)) * aa;   // the edge rolls over
      col *= 1.0 - 0.3 * wrinkle;                                          // creases in the hide
      col = mix(col, col * vec3(0.7, 0.6, 0.5), smoothstep(0.6, 0.9, vnoise(uv / 8.0 + 6.0)) * 0.5);   // dirt
      sp = 0.06;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 8) {                                      // hair: the main colour, combed strands in locks with a sheen
      float s = vnoise(vec2(uv.x / 0.8, uv.y / 6.0) + 5.0);
      float lk = vnoise(vec2(uv.x / 3.0, uv.y / 12.0) + 2.0);
      col = skinA * 0.85 * (0.55 + 0.9 * mix(0.5, s, aa)) * (0.75 + 0.5 * lk);
      col += skinA * 1.2 * pow(sat(dot(n, Lw)), 6.0) * s * 0.5;
      col += skinA * 1.4 * smoothstep(0.75, 0.95, s) * aa * 0.4 * rim;     // stray strands lit at the edge
      sp = 0.5;
    }
#endif
    if (m == 9) {                                      // dark: slots, vents, nostrils
      col = vec3(0.006, 0.004, 0.004) + vec3(0.02, 0.012, 0.01) * smoothstep(-B.r, 0.0, uv.y); sp = 0.1;
    }
#ifdef BODY_MECH
    if (m == 10) {                                     // glass: visor, with a reflected window and scan lines
      col = vec3(0.006, 0.006, 0.008) + C_LINE * 0.25 * smoothstep(B.r * 0.25, 0.0, abs(uv.y + B.r * 0.1)) * aa;
      col += vec3(0.06, 0.07, 0.08) * smoothstep(B.r * 0.15, 0.0, abs(uv.y - B.r * 0.45 + uv.x * 0.25)) * aa;
      col *= 1.0 - 0.3 * step(0.5, fract(uv.y / 1.6)) * aa;
      sp = 3.0; emit = 0.25; spP = 80.0;
    }
#endif
#ifdef BODY_MECH
    if (m == 11) {                                     // rubber: a tyre with tread blocks, a sidewall and a rim
      float rr = length(uv) / max(B.r, 1.0);
      float a = atan(uv.y, uv.x);
      float tread = step(0.5, fract(a * 7.0)) * smoothstep(0.78, 0.9, rr) * aa;
      float groove = smoothstep(0.06, 0.0, abs(fract(a * 3.5 + rr * 2.0) - 0.5) - 0.42) * smoothstep(0.8, 0.92, rr) * aa;
      float side = smoothstep(0.02, 0.0, abs(rr - 0.7)) * aa;                 // the sidewall ridge
      col = vec3(0.012, 0.011, 0.011) * (1.0 + 1.4 * tread + 1.5 * side) * (1.0 - 0.6 * groove);
      col += vec3(0.02, 0.018, 0.015) * smoothstep(0.6, 0.9, vnoise(uv / 2.0)) * aa;   // dust on the rubber
      sp = 0.25;
    }
#endif
    if (m == 12) {                                     // mouth: dark gums, a ridged palate, a wet tongue
      float tongue = smoothstep(B.r * 0.6, B.r * 0.2, abs(uv.y + B.r * 0.25));
      col = mix(vec3(0.05, 0.008, 0.008), vec3(0.2, 0.045, 0.04), tongue * sat(uv.x / 40.0));
      col *= 1.0 - 0.3 * (1.0 - tongue) * aa * step(0.5, fract(uv.x / 5.0));
      sp = 1.4; spP = 50.0;
    }
#ifdef BODY_MECH
    if (m == 13 || m == 14) {                          // enamel paint: seams with grime, screws, chips, a stencil, dust
      vec3 pc = m == 13 ? skinB : skinC;
      float panel = seams(uv, B.r, 46.0, aa);
      float px46 = (fract(uv.x / 46.0 + 0.5) - 0.5) * 46.0;
      float screw = smoothstep(1.9, 1.0, length(vec2(px46 - 7.0, abs(uv.y) - B.r * 0.5))) * aa;
      float slot = screw * smoothstep(0.5, 0.0, abs(px46 - 7.0 + (abs(uv.y) - B.r * 0.5) * 0.5));
      float wear = smoothstep(0.86, 0.95, vnoise(uv / 4.0 + 4.0)) * aa;   // a few chips
      float edgeWear = smoothstep(0.75, 0.95, vnoise(uv / 2.0 + 8.0)) * (1.0 - panel) * aa;
      // a little stencilled code on some panels: three dashes and a dot
      float cell = floor(uv.x / 46.0);
      float stx = px46 + 12.0, sty = uv.y + B.r * 0.15;
      float sten = step(0.55, hash12(vec2(cell, 7.0))) * step(abs(sty), 0.9) * step(0.0, stx) * step(stx, 14.0) * step(0.35, fract(stx / 3.5)) * aa;
      col = pc * mix(0.35, 1.0, panel) * (0.95 + 0.06 * vnoise(uv / 20.0));
      col = mix(col, vec3(0.03, 0.022, 0.015), (1.0 - panel) * 0.35);          // grime in the seams
      col = mix(col, pc * 0.3, sten * 0.7);
      col = mix(col, skinA * 1.2, wear * 0.35 + edgeWear * 0.4 + screw * 0.8);
      col *= 1.0 - slot * 0.7;
      col = mix(col, col * vec3(0.75, 0.68, 0.6), belly * 0.35 + smoothstep(0.6, 0.9, vnoise(uv / 12.0 + 1.0)) * 0.2);  // dust below
      sp = 1.1 * (1.0 - 0.4 * belly); spP = 28.0;
    }
#endif
#ifdef BODY_MECH
    if (m == 15) {                                     // brass, with polished highs and a little verdigris
      float grain = vnoise(vec2(uv.x / 20.0, uv.y / 0.9)) * 0.18 * aa;
      col = vec3(0.42, 0.26, 0.07) * (0.85 + grain);
      col = mix(col, vec3(0.12, 0.2, 0.13), smoothstep(0.7, 0.9, vnoise(uv / 3.0 + 2.0)) * 0.5 * (0.3 + crease) * aa);
      sp = 2.2; spP = 36.0;
    }
#endif
#ifdef BODY_MECH
    if (m == 16) {                                     // lamp: an amber lens with a reflector and a bright core
      float rr = length(uv) / max(B.r, 1.0);
      col = mix(vec3(1.6, 0.75, 0.2), vec3(0.25, 0.08, 0.01), smoothstep(0.15, 0.9, rr));
      col *= 1.0 - 0.25 * aa * step(0.5, fract(rr * 5.0)) * step(0.3, rr);
      emit = 1.0; sp = 2.0;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 17) {                                     // pelt: tawny fur with dark rosettes
      vec3 v = vor3(uv / 9.0 + 2.0);
      float ros = smoothstep(0.32, 0.22, abs(v.x - 0.32)) * step(0.3, v.z);
      float s1 = vnoise(vec2(uv.x / 1.0, uv.y / 4.0) + 3.0);
      float s2 = vnoise(vec2(uv.x / 0.5, uv.y / 2.0) + 7.0);
      col = vec3(0.46, 0.22, 0.05) * (0.75 + 0.45 * mix(0.5, s1 * 0.7 + s2 * 0.3, aa));
      col = mix(col, vec3(0.03, 0.02, 0.012), ros * aa * 0.85);
      col = mix(col, vec3(0.5, 0.4, 0.27), belly * 0.4);
      col *= 1.0 - 0.3 * smoothstep(B.r * 0.7, B.r, abs(uv.y)) * step(0.6, vnoise(vec2(uv.x / 1.5, 3.0))) * aa;  // a ragged edge
      sp = 0.08;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 18) {                                     // red-ochre body paint
      float g = vnoise(uv / 1.5) * 0.3;
      col = vec3(0.42, 0.06, 0.025) * (0.8 + g) * (0.85 + 0.3 * vnoise(vec2(uv.x / 0.6, uv.y / 4.0)));
      sp = 0.15;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 20) {                                     // nail: a pink bed over the skin, a pale free edge, a cuticle, a sheen
      col = mix(skinB * vec3(1.2, 1.02, 0.97) + vec3(0.025, 0.01, 0.008), skinB * 1.5 + vec3(0.05, 0.045, 0.04), smoothstep(B.r * 0.9, B.r * 1.6, uv.x));
      col *= 1.0 - 0.35 * smoothstep(-B.r * 0.4, -B.r * 1.1, uv.x);                       // the cuticle
      sp = 1.3; spP = 46.0;
    }
#endif
#ifdef BODY_ORGANIC
    if (m == 19) {                                                  // a human eye: white, a brown iris with fibres, a highlight
      float rr = length(uv);
      vec2 ic = uv - vec2(B.r * 0.25, 0.0);
      float ir = length(ic);
      vec3 iris = mix(vec3(0.03, 0.015, 0.008), vec3(0.16, 0.08, 0.03), smoothstep(B.r * 0.15, B.r * 0.5, ir) * (0.6 + 0.6 * vnoise(vec2(atan(ic.y, ic.x) * 6.0, 1.0))));
      col = mix(vec3(0.5, 0.46, 0.4), iris, smoothstep(B.r * 0.7, B.r * 0.5, ir));
      col = mix(col, vec3(0.01), smoothstep(B.r * 0.2, B.r * 0.12, ir));
      col *= 1.0 - 0.35 * smoothstep(B.r * 0.4, B.r, uv.y + B.r * 0.2);    // the lid's shadow
      col += vec3(1.0, 0.95, 0.85) * 0.6 * smoothstep(B.r * 0.25, B.r * 0.1, length(uv + vec2(-B.r * 0.1, B.r * 0.3)));
      sp = 0.3;
    }
#endif
    float dif = sat(dot(n, Lw));
    if (m == 3 || m == 16) dif = 1.0; else if (m == 19) dif = 0.8;
    float spec = pow(sat(dot(reflect(-Lw, n), vec3(0.0, 0.0, 1.0))), spP);
    float sh = smoothstep(0.0, 1.0, dif);
    // a cool bounce from below and a soft sky fill keep the shadow side from going flat
    vec3 fill = col * mix(vec3(0.05, 0.055, 0.065), vec3(0.08, 0.06, 0.045), belly) * (0.6 + 0.4 * n.z);
    vec3 lit = (col * (0.12 + 1.15 * sh) * Lc + Lc * spec * sp * 0.35 + col * Lc * rim * 0.25 + sss * Lc * rim) * occ + fill + col * emit;
    lit *= 1.0 - 0.12 * edge * (1.0 - rim);                   // a slight darkening toward the outline: the form turns away
    c = mix(c, lit, inside * alpha);
    float rings = sat(0.45 - abs(fract(rx - 0.5) - 0.5) / rfw) * sat(1.6 - rfw * 3.0) * inside * smoothstep(0.0, 5.0, -d);
    c += line * alpha * (rings * 0.05 + pxLine(d, 1.4) * 0.55);
  }
  return c;
}`;

/** GLSL: uniforms `${name}A` (bones), `${name}R` (ra, rb, smoothing, material), and `Body ${name}Body(p, first, count, box)`. */
export function bodyGLSL(name: string, n: number) {
  return /* glsl */ `
  uniform vec4 ${name}A[${n}]; uniform vec4 ${name}R[${n}];
  Body ${name}Body(vec2 p, int first, int count, vec4 box) {
    Body B; B.d = 1e5; B.mat = 0.0; B.uv = vec2(0.0); B.r = 1.0; B.t = vec2(1.0, 0.0); B.round = 0.0; B.n = vec3(0.0, 0.0, 1.0);
    B.p = p - ${name}A[first].xy; B.ao = 0.0;
    float dh = 1e5;                       // the hard union: B.d (smooth) lies below it in the creases
    vec3 nsum = vec3(0.0);
    float far = length(max(max(box.xy - p, p - box.zw), 0.0));
    if (far > 30.0) { B.d = far; return B; }
    float best = 1e5; bool decal = false;
    for (int j = 0; j < ${n}; j++) {
      if (j >= count) break;
      int i = first + j;                  // walk only this body's range
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
      // far parts only bound the distance (smooth union with a far part is a plain min)
      if (dist > 36.0) { if (!isDecal) { B.d = min(B.d, dist); dh = min(dh, dist); } continue; }
      if (!isDecal) {
        B.d = r.z > 0.0 ? smin(B.d, dist, r.z) : min(B.d, dist);
        dh = min(dh, dist);
        // the surface normal of this part (a cylinder across the bone, a sphere for round parts), blended
        // with its neighbours by proximity so the joins stay smooth
        vec2 qn = q / max(rad, 1e-3);
        float l2 = min(dot(qn, qn), 0.998);
        float w = exp(-clamp(dist, -60.0, 60.0) / 6.0);
        nsum += w * vec3(qn.x, -qn.y, sqrt(1.0 - l2));
      }
      // hair claims its pixels with a ragged edge (a hairline, not a ruler line)
      float dsel = abs(r.w - 8.0) < 0.5 ? dist - 2.6 * vnoise(p / 2.2) : dist;
      if ((isDecal && dist < 0.0) || (!isDecal && !decal && dsel < best)) {
        if (!isDecal) best = dsel;
        decal = decal || isDecal;
        float L = sqrt(L2); vec2 tt = L > 1e-3 ? ba / L : vec2(1.0, 0.0);
        B.mat = r.w; B.r = rad;
        // round parts (a capsule much shorter than its radius) use the offset from the centre: their length
        // must not collapse the texture into streaks
        bool rnd = L < max(2.0, 0.3 * rad);
        // (unclamped along the bone, so the end caps do not smear the texture into streaks)
        B.uv = rnd ? pa : vec2(dot(pa, tt), dot(pa, vec2(-tt.y, tt.x)));
        B.t = tt; B.round = rnd ? 1.0 : 0.0;
      }
    }
    if (dot(nsum, nsum) > 0.0) B.n = normalize(nsum);
    B.ao = max(0.0, dh - B.d);
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
