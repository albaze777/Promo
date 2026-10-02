// Deep space behind the film's opening: a Milky Way band with dark dust lanes, faint coloured nebulae,
// stars of several temperatures (the brightest with a diffraction glint) and a few distant galaxies.
// Shared by Origin (01) and by the sky behind the planet in World (02), so the hand-off matches.
// Values are linear and small on purpose: after sRGB a linear 0.01 is already a visible grey.

/** The background's offset (in screen heights) for a camera position; Origin drifts it as the camera flies. */
export function spaceDrift(camX: number, camZ: number): [number, number] {
  return [camX * 0.002, (camZ * 0.0015) % 100];
}

export const SPACE_GLSL = /* glsl */ `
vec3 starTint(float h) {
  return h < 0.12 ? vec3(0.62, 0.74, 1.0) : h < 0.5 ? vec3(1.0, 0.97, 0.92) : h < 0.78 ? vec3(1.0, 0.86, 0.62)
       : h < 0.94 ? vec3(1.0, 0.66, 0.42) : vec3(1.0, 0.48, 0.36);
}
/** One layer of stars: at most one per cell (cs: cell size in screen heights), dens: share of cells with a star. */
vec3 starLayer(vec2 p, float cs, float dens, float seed, float tw) {
  vec2 g = p / cs, i = floor(g), f = fract(g);
  if (hash12(i + seed) > dens) return vec3(0.0);
  vec2 sp = 0.2 + 0.6 * hash22(i + seed * 1.7);
  float b = pow(hash12(i + seed + 3.1), 7.0);
  vec2 d = (f - sp) * cs * RES.y;                       // px from the star
  float r = 0.55 + 1.3 * b;
  float core = exp(-dot(d, d) / (r * r));
  float twinkle = 0.8 + 0.2 * sin(tw * (2.0 + 5.0 * hash12(i + seed + 9.0)) + 40.0 * hash12(i + seed + 5.0));
  float spike = 0.0;
  if (b > 0.6) spike = (exp(-abs(d.x) / 0.6) * exp(-abs(d.y) / (6.0 + 10.0 * b)) + exp(-abs(d.y) / 0.6) * exp(-abs(d.x) / (6.0 + 10.0 * b))) * (b - 0.6) * 2.0;
  return starTint(hash12(i + seed + 7.7)) * (core * (0.012 + 0.5 * b) + spike * 0.12 + exp(-length(d) / (3.0 + 6.0 * b)) * b * 0.02) * twinkle;
}
/** A distant galaxy in some cells: a tilted disc with a bright core and two faint arms. */
vec3 galaxies(vec2 p) {
  vec2 g = p / 0.32, i = floor(g), f = fract(g);
  if (hash12(i + 41.0) > 0.16) return vec3(0.0);
  vec2 c = 0.25 + 0.5 * hash22(i + 13.0);
  float a = hash12(i + 2.0) * 6.2832, tilt = 0.25 + 0.6 * hash12(i + 4.0);
  vec2 d = (f - c) * 0.32 * RES.y;
  d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d;
  d.y /= tilt;
  float size = 5.0 + 9.0 * hash12(i + 6.0);
  float rr = length(d) / size;
  float arms = 0.6 + 0.4 * sin(atan(d.y, d.x) * 2.0 - rr * 5.0);
  float disc = exp(-rr * rr * 1.6) * arms + exp(-rr * rr * 30.0) * 2.0;
  vec3 tint = mix(vec3(1.0, 0.86, 0.7), vec3(0.75, 0.82, 1.0), hash12(i + 8.0));
  return tint * disc * 0.006;
}
/** Space at p (screen heights, already offset by the drift); k: how much of it is shown (0 = true black). */
vec3 spaceBg(vec2 p, float k, float tw) {
  if (k <= 0.0) return vec3(0.0);
  // the Milky Way: a diagonal band, clumped, crossed by dark dust lanes
  vec2 bd = normalize(vec2(1.0, -0.42));
  float across = dot(p - vec2(0.9, 0.55), vec2(-bd.y, bd.x));
  float along = dot(p, bd);
  float band = exp(-pow(across / 0.22, 2.0));
  float clump = fbm(vec2(along * 3.0, across * 6.0) + 7.0, 5);
  float dust = smoothstep(0.42, 0.62, fbm(vec2(along * 5.0, across * 14.0) + 21.0, 5)) * exp(-pow(across / 0.08, 2.0));
  vec3 c = vec3(0.0075, 0.0068, 0.006) * band * (0.4 + 1.4 * clump) * (1.0 - 0.85 * dust);
  // nebulae: warm terracotta and cold viridian / ultramarine clouds, softly warped
  vec2 w = p + 0.25 * vec2(fbm(p * 1.3 + 3.0, 4), fbm(p * 1.3 + 9.0, 4));
  float n1 = smoothstep(0.45, 0.8, fbm(w * 1.6 + 1.0, 5));
  float n2 = smoothstep(0.48, 0.82, fbm(w * 1.9 + 17.0, 5));
  float fil = pow(1.0 - abs(fbm(w * 4.0 + 5.0, 4) * 2.0 - 1.0), 6.0);       // thin bright filaments
  c += C_TERRACOTTA * 0.034 * n1 * (0.5 + fil);
  c += mix(C_VIRIDIAN, C_ULTRAMARINE, 0.5) * 0.038 * n2 * (0.45 + fil * 0.8);
  c *= 1.0 - 0.6 * dust;
  // stars: many faint ones, fewer bright ones; denser inside the band
  float dense = 0.35 + 0.65 * band;
  c += starLayer(p, 0.006, 0.3 * dense, 1.0, tw);
  c += starLayer(p + 0.37, 0.011, 0.28 * dense, 2.0, tw);
  c += starLayer(p + 0.71, 0.03, 0.22, 3.0, tw);
  c += starLayer(p + 0.13, 0.08, 0.3, 4.0, tw) * 1.4;
  c += galaxies(p) * (1.0 - band * 0.7);
  return c * k;
}`;
