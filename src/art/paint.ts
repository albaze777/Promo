// A small deterministic painting toolkit on Canvas2D: dab brushes, dry brushes, splatter, hatching.
// Used once at init to paint the art plates (textures), never per frame.
import { SCALE } from '../engine/gl';
import { Rng, clamp, lerp, noise1, polyLengths, type V2, TAU } from '../utils/math';

export function makeCanvas(w: number, h: number, s = SCALE) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext('2d')!;
  ctx.scale(s, s);
  return { c, ctx };
}

export type RGB = [number, number, number];
export const hexRGB = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Resample a polyline at a fixed spacing. */
export function resample(pts: readonly V2[], step: number): V2[] {
  const L = polyLengths(pts), total = L[L.length - 1]!;
  const out: V2[] = [];
  let j = 0;
  for (let s = 0; s <= total; s += step) {
    while (j < L.length - 2 && L[j + 1]! < s) j++;
    const k = (s - L[j]!) / Math.max(1e-6, L[j + 1]! - L[j]!);
    out.push([lerp(pts[j]![0], pts[j + 1]![0], k), lerp(pts[j]![1], pts[j + 1]![1], k)]);
  }
  return out;
}

export interface DabOpts {
  width: (k: number) => number;
  color: (k: number, r: Rng) => RGB;
  alpha?: number;
  /** Edge roughness 0..1 */
  rough?: number;
  spacing?: number;
  seed?: number;
}

/** Pigment stroke: overlapping irregular dabs along a path (soft, organic, uneven loading). */
export function dabStroke(ctx: CanvasRenderingContext2D, pts: readonly V2[], o: DabOpts) {
  const r = new Rng(o.seed ?? 1);
  const sp = resample(pts, o.spacing ?? 2.2);
  const n = sp.length;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const [x, y] = sp[i]!;
    const w = o.width(k);
    const load = 0.55 + 0.45 * (0.5 + 0.5 * noise1(i * 0.05, o.seed ?? 1));
    const rough = o.rough ?? 0.4;
    for (let d = 0; d < 3; d++) {
      const ox = r.gauss() * w * 0.12 * rough, oy = r.gauss() * w * 0.12 * rough;
      ctx.fillStyle = css(o.color(k, r), (o.alpha ?? 0.18) * load * r.range(0.6, 1));
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, w * 0.5 * r.range(0.75, 1.05), w * 0.5 * r.range(0.6, 0.95), r.next() * TAU, 0, TAU);
      ctx.fill();
    }
  }
}

/** Dry brush: bristles across the brush width, each with its own ink and gaps. */
export function dryBrush(ctx: CanvasRenderingContext2D, pts: readonly V2[], o: {
  width: (k: number) => number; color: RGB; alpha?: number; bristles?: number; dry?: number; seed?: number;
}) {
  const r = new Rng(o.seed ?? 7);
  const sp = resample(pts, 1.6);
  const nb = o.bristles ?? 28;
  ctx.lineCap = 'round';
  for (let b = 0; b < nb; b++) {
    const off = (b / (nb - 1)) * 2 - 1 + r.gauss() * 0.03;
    const ink = r.range(0.5, 1);
    const lw = r.range(0.6, 1.8);
    const seedB = r.next() * 1000;
    ctx.strokeStyle = css(o.color, (o.alpha ?? 0.8) * ink);
    ctx.lineWidth = lw;
    let drawing = false;
    for (let i = 1; i < sp.length; i++) {
      const k = i / (sp.length - 1);
      // bristles run dry toward the end and at the edges
      const dryness = (o.dry ?? 0.5) * (k * 1.2 + Math.abs(off) * 0.6);
      const gap = noise1(i * 0.09 + seedB, 3) * 0.5 + 0.5 < dryness;
      const [x0, y0] = sp[i - 1]!, [x1, y1] = sp[i]!;
      const tx = x1 - x0, ty = y1 - y0, tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const w = o.width(k) * 0.5;
      if (gap) { if (drawing) { ctx.stroke(); drawing = false; } continue; }
      if (!drawing) { ctx.beginPath(); ctx.moveTo(x0 + nx * off * w, y0 + ny * off * w); drawing = true; }
      ctx.lineTo(x1 + nx * off * w, y1 + ny * off * w);
    }
    if (drawing) ctx.stroke();
  }
}

/** Ink splatter / speckle around a point. */
export function splatter(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, n: number, color: RGB, alpha: number, seed: number) {
  const r = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r.next() * TAU, d = radius * Math.sqrt(r.next());
    const s = r.range(0.6, 3.2) * (1 - d / radius * 0.6);
    ctx.fillStyle = css(color, alpha * r.range(0.5, 1));
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU);
    ctx.fill();
  }
}

/** Points on a circle with hand-drawn wobble. */
export function wobblyCircle(cx: number, cy: number, r: number, a0: number, sweep: number, wobble: number, seed: number, n = 220): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = a0 + sweep * k;
    const rr = r * (1 + wobble * noise1(k * 6 + seed, seed) + wobble * 0.4 * noise1(k * 23 + seed, seed + 1));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

/** The first mark: an ochre-red pigment circle as made by a finger on stone. Shared by Human and Art. */
export function paintFirstMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, startAngle: number, seed = 11) {
  const pts = wobblyCircle(cx, cy, r, startAngle, TAU * 0.985, 0.018, seed, 360);
  const ochre = hexRGB('#B4532E'), earth = hexRGB('#8E3B22'), light = hexRGB('#C9743A');
  dabStroke(ctx, pts, {
    width: (k) => lerp(30, 15, k) * (1 + 0.25 * Math.exp(-k * 30)),
    color: (k, rr) => mixRGB(mixRGB(ochre, earth, rr.next() * 0.6), light, rr.next() * 0.25),
    alpha: 0.2, rough: 0.7, spacing: 1.8, seed,
  });
  dryBrush(ctx, pts, { width: (k) => lerp(26, 12, k), color: earth, alpha: 0.35, bristles: 22, dry: 0.55, seed: seed + 3 });
  splatter(ctx, pts[0]![0], pts[0]![1], 26, 40, earth, 0.5, seed + 9);
}

export const clamp01 = (x: number) => clamp(x);
