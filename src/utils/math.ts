// Small, dependency-free math kit. Everything here is pure: same input, same output.

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const k = invLerp(a, b, x);
  return k * k * (3 - 2 * k);
};
export const fract = (x: number) => x - Math.floor(x);
export const mix3 = (a: readonly number[], b: readonly number[], k: number): [number, number, number] =>
  [lerp(a[0]!, b[0]!, k), lerp(a[1]!, b[1]!, k), lerp(a[2]!, b[2]!, k)];

export type EaseFn = (x: number) => number;

/** Easing curves. All map [0,1] → [0,1] and clamp their input. */
export const ease = {
  linear: (x: number) => clamp(x),
  inQuad: (x: number) => clamp(x) ** 2,
  outQuad: (x: number) => 1 - (1 - clamp(x)) ** 2,
  inOutQuad: (x: number) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2; },
  inCubic: (x: number) => clamp(x) ** 3,
  outCubic: (x: number) => 1 - (1 - clamp(x)) ** 3,
  inOutCubic: (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; },
  inQuart: (x: number) => clamp(x) ** 4,
  outQuart: (x: number) => 1 - (1 - clamp(x)) ** 4,
  inOutQuart: (x: number) => { x = clamp(x); return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2; },
  inExpo: (x: number) => { x = clamp(x); return x === 0 ? 0 : 2 ** (10 * x - 10); },
  outExpo: (x: number) => { x = clamp(x); return x === 1 ? 1 : 1 - 2 ** (-10 * x); },
  inOutExpo: (x: number) => {
    x = clamp(x);
    if (x === 0 || x === 1) return x;
    return x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;
  },
  outBack: (x: number) => { x = clamp(x); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; },
  inOutSine: (x: number) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2,
  inSine: (x: number) => 1 - Math.cos((Math.PI * clamp(x)) / 2),
  outSine: (x: number) => Math.sin((Math.PI * clamp(x)) / 2),
} satisfies Record<string, EaseFn>;

/** Progress of t through [a,b], eased. */
export const prog = (t: number, a: number, b: number, e: EaseFn = ease.linear) => e(invLerp(a, b, t));

/** 0→1 over [a, a+fin], hold, 1→0 over [b-fout, b]. */
export const window01 = (t: number, a: number, b: number, fin: number, fout = fin, e: EaseFn = ease.inOutCubic) =>
  Math.min(e(invLerp(a, a + fin, t)), 1 - e(invLerp(b - fout, b, t)));

/**
 * Keyframes: [[time, value, easeIntoThisKey?], ...] sorted by time. Holds outside the range.
 */
export function keys(t: number, k: readonly (readonly [number, number, EaseFn?])[]): number {
  if (t <= k[0]![0]) return k[0]![1];
  for (let i = 1; i < k.length; i++) {
    const [t1, v1, e] = k[i]!;
    if (t <= t1) {
      const [t0, v0] = k[i - 1]!;
      return lerp(v0, v1, (e ?? ease.inOutCubic)((t - t0) / Math.max(1e-6, t1 - t0)));
    }
  }
  return k[k.length - 1]![1];
}

/** Seeded PRNG (mulberry32). Never use Math.random() for anything visual. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private f: () => number;
  constructor(seed: number) { this.f = mulberry32(seed); }
  next() { return this.f(); }
  range(a: number, b: number) { return a + (b - a) * this.f(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.f() * arr.length)]!; }
  chance(p: number) { return this.f() < p; }
  /** Approximately normal (Irwin–Hall, 4 terms), mean 0, sd ~1. */
  gauss() { return (this.f() + this.f() + this.f() + this.f() - 2) * 1.7320508; }
}

/** Integer hash → [0,1). Stateless randomness keyed by indices. */
export function hash(...n: number[]): number {
  let h = 2166136261 >>> 0;
  for (const x of n) {
    h ^= Math.floor(x * 1000003) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

// value noise (smooth, cheap) for CPU-side procedural work
function vn1(x: number, seed: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}
export const noise1 = (x: number, seed = 0) => vn1(x, seed);
export function noise2(x: number, y: number, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
export function fbm2(x: number, y: number, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/** Frame index for a time at the export fps — constant across a frame's motion-blur shutter. */
export const FPS = 60;
export const frameIdx = (t: number) => Math.round(t * FPS);

/** sRGB hex → linear RGB triple. */
export function hexLin(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return c as [number, number, number];
}

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Cumulative lengths of a polyline. */
export function polyLengths(pts: readonly V2[]) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return L;
}

/** Cubic bezier point. */
export function bez(p0: V2, p1: V2, p2: V2, p3: V2, t: number): V2 {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Catmull-Rom through points (closed or open) → sampled polyline. */
export function catmull(pts: readonly V2[], samplesPerSeg = 16, closed = false): V2[] {
  const out: V2[] = [];
  const n = pts.length;
  const P = (i: number) => (closed ? pts[((i % n) + n) % n]! : pts[clamp(i, 0, n - 1)]!);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]!);
  else out.push(out[0]!);
  return out;
}
