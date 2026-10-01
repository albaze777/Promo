// The six eras of the same artwork, painted procedurally (Canvas2D, once, at init). Every era depicts the
// same composition: THE CIRCLE (the first mark → sun) and a small human figure on a hill at right, so the
// evolution reads as one image re-made by each age, not six unrelated pictures.
//   E0 primitive · E1 geometric · E2 sketch · E3 ink · E4 colour · E5 digital
import { MARK } from '../motifs/world';
import { W, H } from '../engine/gl';
import { makeCanvas, paintFirstMark, dabStroke, dryBrush, splatter, wobblyCircle, hexRGB, css, mixRGB, resample, type RGB } from './paint';
import { Rng, catmull, clamp, lerp, noise2, fbm2, TAU, type V2 } from '../utils/math';

export const RC: V2 = [MARK.cx, MARK.cy];
export const RR = MARK.r;
export const HORIZON = 744;
export const FIG = { x: 1452, y: 700, h: 150 };

const P = {
  ochre: hexRGB('#C98A2E'), earth: hexRGB('#8E3B22'), redEarth: hexRGB('#B4532E'), charcoal: hexRGB('#1C1A18'),
  black: hexRGB('#151311'), cream: hexRGB('#EADBC0'), terracotta: hexRGB('#B5563A'),
  graphite: hexRGB('#3A3836'), ink: hexRGB('#121110'), seal: hexRGB('#D2321F'),
  ultra: hexRGB('#26389B'), ultraDeep: hexRGB('#151F5C'), rose: hexRGB('#E8A9A0'), vermilion: hexRGB('#E2412B'),
  sunCore: hexRGB('#F2703A'), gold: hexRGB('#E3A448'), viridian: hexRGB('#2E6B58'), viridianDeep: hexRGB('#173A31'),
  bone: hexRGB('#EFE9DF'), paper: hexRGB('#EDE6D8'), line: hexRGB('#FF3B2E'),
};

// ---- shared geometry of the composition ------------------------------------------------------
export const LEFT_HILL: V2[] = catmull([[-40, 600], [140, 586], [330, 622], [520, 690], [700, HORIZON + 4]], 20);
export const RIGHT_HILL: V2[] = catmull([[1150, HORIZON + 4], [1300, 716], FIG ? [FIG.x - 40, FIG.y + 2] : [1400, 700], [FIG.x + 90, FIG.y - 2], [1700, 686], [1960, 650]], 20);
/** Hill + its shore sloping toward the viewer (water widens in perspective). */
export const LEFT_LAND: V2[] = [...LEFT_HILL, [560, 860], [420, H + 40], [-40, H + 40]];
export const RIGHT_LAND: V2[] = [[1150, HORIZON + 4], ...RIGHT_HILL, [1960, H + 40], [1450, H + 40], [1290, 860]];

function fillPath(ctx: CanvasRenderingContext2D, pts: readonly V2[], style: string) {
  ctx.fillStyle = style;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function strokePath(ctx: CanvasRenderingContext2D, pts: readonly V2[], style: string, w: number) {
  ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
const jitter = (pts: readonly V2[], amp: number, seed: number): V2[] => pts.map(([x, y], i) => [x + noise2(i * 0.13, 0.5, seed) * amp, y + noise2(i * 0.13, 7.5, seed) * amp]);

/** A figure as joint positions (standing, facing the sun at left, weight on one leg). */
function figureJoints(x: number, y: number, h: number) {
  const u = h / 150;
  return {
    head: [x - 2 * u, y - 136 * u] as V2, headR: 11 * u,
    neck: [x, y - 122 * u] as V2, chest: [x + 1 * u, y - 100 * u] as V2, hip: [x + 3 * u, y - 66 * u] as V2,
    kneeL: [x - 7 * u, y - 34 * u] as V2, footL: [x - 10 * u, y] as V2,
    kneeR: [x + 9 * u, y - 33 * u] as V2, footR: [x + 14 * u, y] as V2,
    elbowL: [x - 10 * u, y - 82 * u] as V2, handL: [x - 9 * u, y - 60 * u] as V2,
    elbowR: [x + 13 * u, y - 84 * u] as V2, handR: [x + 15 * u, y - 62 * u] as V2,
    u,
  };
}

// =================================================================================== E0 PRIMITIVE
function openHandSdf(px: number, py: number) {
  const cap = (ax: number, ay: number, bx: number, by: number, r: number) => {
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };
  let d = Math.hypot(px, py) - 52;
  d = Math.min(d, cap(0, 30, 0, 140, 40)); // wrist
  const fingers: [number, number, number][] = [[-118, 98, 15], [-100, 112, 16], [-82, 106, 15.5], [-62, 86, 14]];
  for (const [deg, len, r] of fingers) {
    const a = (deg * Math.PI) / 180;
    d = Math.min(d, cap(Math.cos(a) * 34, Math.sin(a) * 34, Math.cos(a) * (34 + len), Math.sin(a) * (34 + len), r));
  }
  d = Math.min(d, cap(-30, -8, -100, -46, 17)); // thumb
  return d;
}

function paintE0(ctx: CanvasRenderingContext2D) {
  const r = new Rng(100);
  // negative hand stencil (blown pigment), upper left
  const hx = 380, hy = 330, rot = -0.28, sc = 1.25;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < 90000; i++) {
    const x = r.range(hx - 290, hx + 290), y = r.range(hy - 300, hy + 290);
    const lx = ((x - hx) * c + (y - hy) * s) / sc, ly = (-(x - hx) * s + (y - hy) * c) / sc;
    const d = openHandSdf(lx, ly) * sc;
    if (d < 0) continue;
    const pr = Math.exp(-d / 30) * (0.55 + 0.45 * fbm2(x / 60, y / 60, 3, 5));
    if (r.next() > pr) continue;
    ctx.fillStyle = css(mixRGB(P.redEarth, P.earth, r.next()), 0.42 * r.range(0.5, 1));
    ctx.beginPath(); ctx.arc(x, y, r.range(0.8, 2.6), 0, TAU); ctx.fill();
  }
  // finger flutings: groups of parallel strokes, right of the circle
  for (let g = 0; g < 3; g++) {
    const gx = 1180 + g * 120, gy = 300 + g * 70;
    for (let k = 0; k < 4; k++) {
      const pts: V2[] = [];
      for (let j = 0; j <= 20; j++) pts.push([gx + k * 15 + j * 1.2 + Math.sin(j * 0.3 + g) * 4, gy + j * 6]);
      dabStroke(ctx, pts, { width: () => 8, color: (_k, rr) => mixRGB(P.charcoal, P.earth, rr.next() * 0.4), alpha: 0.3, rough: 0.6, seed: 300 + g * 10 + k });
    }
  }
  // dotted arc
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * 0.95 + i * 0.1;
    const x = RC[0] + Math.cos(a) * (RR + 70), y = RC[1] + Math.sin(a) * (RR + 70);
    splatter(ctx, x, y, 5, 14, P.redEarth, 0.6, 400 + i);
  }
  // a primitive standing figure (ochre), on the right
  const j = figureJoints(FIG.x, FIG.y, FIG.h);
  const st = (a: V2, b: V2, w: number, sd: number) => dabStroke(ctx, [a, b], { width: () => w, color: (_k, rr) => mixRGB(P.redEarth, P.earth, rr.next() * 0.5), alpha: 0.4, rough: 0.8, seed: sd });
  st(j.neck, j.hip, 9, 501); st(j.hip, j.footL, 7, 502); st(j.hip, j.footR, 7, 503);
  st(j.chest, j.handL, 6, 504); st([j.chest[0], j.chest[1]], [j.handR[0] + 18, j.handR[1] - 40], 6, 505);
  splatter(ctx, j.head[0], j.head[1], 10, 60, P.redEarth, 0.55, 506);
  // a charcoal ground line under the figure
  dabStroke(ctx, jitter(resample([[1200, 712], [1720, 700]], 20), 3, 9), { width: () => 5, color: () => P.charcoal, alpha: 0.12, rough: 0.6, seed: 507 });
  // THE MARK (identical to the one drawn by the finger)
  paintFirstMark(ctx, MARK.cx, MARK.cy, MARK.r, MARK.startAngle, MARK.dir);
}

// =================================================================================== E1 GEOMETRIC
function paintE1(ctx: CanvasRenderingContext2D) {
  const K = css(P.black, 0.92), CR = css(P.cream, 0.9), RD = css(P.redEarth, 0.95);
  // friezes: top and bottom bands
  const band = (y: number, h: number, kind: 'meander' | 'zigzag' | 'dots') => {
    ctx.fillStyle = K; ctx.fillRect(0, y, W, 3); ctx.fillRect(0, y + h - 3, W, 3);
    if (kind === 'meander') {
      const u = h - 14, s = u / 4;
      ctx.strokeStyle = K; ctx.lineWidth = s * 0.62; ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      for (let x = -u; x < W + u; x += u * 1.25) {
        const y0 = y + 7 + s * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y0 + 3 * s); ctx.lineTo(x, y0); ctx.lineTo(x + 3 * s, y0); ctx.lineTo(x + 3 * s, y0 + 2 * s);
        ctx.lineTo(x + s, y0 + 2 * s); ctx.lineTo(x + s, y0 + s); ctx.lineTo(x + 2 * s, y0 + s);
        ctx.moveTo(x, y0 + 3 * s); ctx.lineTo(x + u * 1.25, y0 + 3 * s);
        ctx.stroke();
      }
    } else if (kind === 'zigzag') {
      const n = 48, wv = W / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? K : RD;
        ctx.beginPath(); ctx.moveTo(i * wv, y + h - 6); ctx.lineTo(i * wv + wv / 2, y + 6); ctx.lineTo(i * wv + wv, y + h - 6); ctx.fill();
      }
    } else {
      for (let x = 12; x < W; x += 26) { ctx.fillStyle = K; ctx.beginPath(); ctx.arc(x, y + h / 2, 5, 0, TAU); ctx.fill(); }
    }
  };
  band(58, 64, 'meander'); band(130, 26, 'dots');
  band(H - 150, 50, 'zigzag'); band(H - 92, 26, 'dots');
  // horizon as a painted black line with a cream line under
  ctx.fillStyle = K; ctx.fillRect(0, HORIZON - 2, W, 4);
  ctx.fillStyle = CR; ctx.fillRect(0, HORIZON + 6, W, 2);
  // the circle → concentric rings, petals, red dots
  ctx.lineWidth = 9; ctx.strokeStyle = K; ctx.beginPath(); ctx.arc(RC[0], RC[1], RR, 0, TAU); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(RC[0], RC[1], RR - 26, 0, TAU); ctx.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    ctx.fillStyle = RD; ctx.beginPath(); ctx.arc(RC[0] + Math.cos(a) * (RR - 13), RC[1] + Math.sin(a) * (RR - 13), 4.2, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.fillStyle = i % 2 ? K : RD;
    ctx.beginPath();
    ctx.moveTo(RC[0] + Math.cos(a - 0.2) * 48, RC[1] + Math.sin(a - 0.2) * 48);
    ctx.lineTo(RC[0] + Math.cos(a) * (RR - 40), RC[1] + Math.sin(a) * (RR - 40));
    ctx.lineTo(RC[0] + Math.cos(a + 0.2) * 48, RC[1] + Math.sin(a + 0.2) * 48);
    ctx.fill();
  }
  ctx.fillStyle = K; ctx.beginPath(); ctx.arc(RC[0], RC[1], 30, 0, TAU); ctx.fill();
  ctx.fillStyle = RD; ctx.beginPath(); ctx.arc(RC[0], RC[1], 12, 0, TAU); ctx.fill();
  // spirals at left and right
  const spiral = (cx: number, cy: number, turns: number, r0: number, dir: number) => {
    ctx.strokeStyle = K; ctx.lineWidth = 5; ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const k = i / 300, a = dir * k * turns * TAU, rr = r0 * k;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  spiral(330, 470, 3.2, 92, 1); spiral(520, 520, 2.4, 56, -1);
  // geometric figure on the right: triangle torso, stick limbs (pottery figure)
  const j = figureJoints(FIG.x, FIG.y, FIG.h);
  ctx.fillStyle = K;
  ctx.beginPath(); ctx.moveTo(j.neck[0] - 22 * j.u, j.neck[1]); ctx.lineTo(j.neck[0] + 22 * j.u, j.neck[1]); ctx.lineTo(j.hip[0], j.hip[1] + 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(j.hip[0], j.hip[1]); ctx.lineTo(j.hip[0] - 22 * j.u, j.footL[1] - 30); ctx.lineTo(j.hip[0] + 22 * j.u, j.footL[1] - 30); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = K; ctx.lineCap = 'round';
  for (const [a, b] of [[j.hip, j.footL], [j.hip, j.footR], [j.neck, j.handL], [j.neck, [j.handR[0] + 20, j.handR[1] - 38] as V2]] as [V2, V2][]) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(j.head[0], j.head[1], j.headR, 0, TAU); ctx.fill();
  // rows of small triangles = stylised hills
  for (let i = 0; i < 9; i++) {
    const x = 1180 + i * 70;
    ctx.fillStyle = i % 2 ? RD : K;
    ctx.beginPath(); ctx.moveTo(x, HORIZON - 2); ctx.lineTo(x + 35, HORIZON - 46 - (i % 3) * 8); ctx.lineTo(x + 70, HORIZON - 2); ctx.fill();
  }
}

// =================================================================================== E2 SKETCH
function paintE2(ctx: CanvasRenderingContext2D) {
  const r = new Rng(200);
  const G = (a: number) => css(P.graphite, Math.min(1, a * 1.9));
  const line = (pts: V2[], a: number, w = 1.1, rough = 1.2, seed = 1) => {
    // a graphite line: two slightly offset passes, uneven pressure
    for (let pass = 0; pass < 2; pass++) {
      const jp = jitter(pts, rough, seed + pass * 31);
      ctx.strokeStyle = G(a * (pass ? 0.55 : 1)); ctx.lineWidth = w * 1.35 * (pass ? 0.7 : 1); ctx.lineCap = 'round';
      ctx.beginPath(); jp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
  };
  const seg = (a: V2, b: V2, al: number, w = 1, seed = 1, over = 18) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    line(resample([[a[0] - ux * over, a[1] - uy * over], [b[0] + ux * over, b[1] + uy * over]], 8), al, w, 0.8, seed);
  };
  // horizon and perspective lines converging on the circle's centre (the vanishing point)
  seg([0, HORIZON], [W, HORIZON], 0.55, 1.2, 3, 0);
  for (let i = -6; i <= 6; i++) {
    if (i === 0) continue;
    const x = RC[0] + i * 260;
    seg([x, H + 20], [lerp(x, RC[0], 0.62), lerp(H + 20, RC[1], 0.62)], 0.16, 0.9, 10 + i, 0);
  }
  // construction of the circle: axes, square, diagonals, compass arcs
  seg([RC[0] - RR - 70, RC[1]], [RC[0] + RR + 70, RC[1]], 0.35, 1, 21);
  seg([RC[0], RC[1] - RR - 70], [RC[0], RC[1] + RR + 70], 0.35, 1, 22);
  const sq = RR;
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
    seg([RC[0] + a[0] * sq, RC[1] + a[1] * sq], [RC[0] + b[0] * sq, RC[1] + b[1] * sq], 0.22, 0.9, 30 + a[0] * 3 + a[1]);
  }
  seg([RC[0] - sq, RC[1] - sq], [RC[0] + sq, RC[1] + sq], 0.15, 0.8, 41, 0);
  seg([RC[0] + sq, RC[1] - sq], [RC[0] - sq, RC[1] + sq], 0.15, 0.8, 42, 0);
  for (let k = 0; k < 3; k++) line(wobblyCircle(RC[0], RC[1], RR + (k - 1) * 2.5, r.next() * TAU, TAU * 1.03, 0.006, 50 + k, 200), 0.62 - k * 0.15, 1.3, 0.6, 60 + k);
  line(wobblyCircle(RC[0], RC[1], RR * 0.618, 0.4, TAU, 0.01, 70, 160), 0.18, 0.9, 0.6, 71);
  // compass ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    seg([RC[0] + Math.cos(a) * (RR + 14), RC[1] + Math.sin(a) * (RR + 14)], [RC[0] + Math.cos(a) * (RR + 30), RC[1] + Math.sin(a) * (RR + 30)], 0.35, 1, 80 + i, 0);
  }
  // golden-section rectangle and spiral at upper left
  const gx = 170, gy = 170, gw = 420, gh = gw / 1.618;
  ctx.strokeStyle = G(0.25); ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
  let x = gx, y = gy, w = gw, h = gh;
  const spiralPts: V2[] = [];
  for (let i = 0; i < 7; i++) {
    const s = Math.min(w, h);
    const dir = i % 4;
    let cx = 0, cy = 0, a0 = 0;
    if (dir === 0) { cx = x + s; cy = y + s; a0 = Math.PI; ctx.strokeRect(x, y, s, s); x += s; w -= s; }
    else if (dir === 1) { cx = x; cy = y + s; a0 = -Math.PI / 2; ctx.strokeRect(x, y, s, s); y += s; h -= s; }
    else if (dir === 2) { cx = x + w - s; cy = y + h - s; a0 = 0; ctx.strokeRect(x + w - s, y + h - s, s, s); w -= s; }
    else { cx = x + s; cy = y + h - s; a0 = Math.PI / 2; ctx.strokeRect(x, y + h - s, s, s); h -= s; }
    for (let k = 0; k <= 16; k++) { const a = a0 + (k / 16) * (Math.PI / 2); spiralPts.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s]); }
  }
  line(spiralPts, 0.5, 1.2, 0.5, 91);
  // hills, loosely
  line(jitter(LEFT_HILL, 2, 5), 0.55, 1.3, 0.8, 101);
  line(jitter(RIGHT_HILL, 2, 6), 0.55, 1.3, 0.8, 102);
  // hatching on the hills' shadow sides
  for (let i = 0; i < 70; i++) {
    const k = i / 70, p = LEFT_HILL[Math.floor(k * (LEFT_HILL.length - 1))]!;
    if (p[0] < 40) continue;
    seg([p[0], p[1] + 8], [p[0] - 26, p[1] + 50], 0.2, 0.8, 200 + i, 0);
  }
  for (let i = 0; i < 80; i++) {
    const k = i / 80, p = RIGHT_HILL[Math.floor(k * (RIGHT_HILL.length - 1))]!;
    seg([p[0], p[1] + 8], [p[0] + 22, p[1] + 46], 0.2, 0.8, 300 + i, 0);
  }
  // the figure as a mannequin study: ovals at joints, construction lines
  const j = figureJoints(FIG.x, FIG.y, FIG.h * 1.15);
  const oval = (c: V2, rx: number, ry: number, a: number, al: number, sd: number) => {
    const pts: V2[] = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * TAU * 1.06; pts.push([c[0] + Math.cos(t) * rx * Math.cos(a) - Math.sin(t) * ry * Math.sin(a), c[1] + Math.cos(t) * rx * Math.sin(a) + Math.sin(t) * ry * Math.cos(a)]); }
    line(pts, al, 1.1, 0.5, sd);
  };
  oval(j.head, j.headR, j.headR * 1.25, 0.1, 0.7, 400);
  oval([lerp(j.neck[0], j.hip[0], 0.35), lerp(j.neck[1], j.hip[1], 0.35)], 16 * j.u, 26 * j.u, 0.05, 0.55, 401);
  oval(j.hip, 14 * j.u, 10 * j.u, 0, 0.5, 402);
  for (const [a, b] of [[j.hip, j.kneeL], [j.kneeL, j.footL], [j.hip, j.kneeR], [j.kneeR, j.footR], [j.neck, j.elbowL], [j.elbowL, j.handL], [j.neck, j.elbowR], [j.elbowR, j.handR]] as [V2, V2][]) {
    seg(a, b, 0.6, 1.2, 410 + a[0], 0);
    oval(b, 3.5 * j.u, 3.5 * j.u, 0, 0.45, 420 + b[1]);
  }
  seg([j.head[0], j.head[1] - 24], [j.footL[0], j.footL[1] + 8], 0.14, 0.8, 430, 0); // plumb line
  // erased-and-redrawn smudges
  for (let i = 0; i < 6; i++) {
    const cx = r.range(200, 1700), cy = r.range(200, 950);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.range(40, 110));
    g.addColorStop(0, G(0.05)); g.addColorStop(1, G(0));
    ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 120, 240, 240);
  }
}

// =================================================================================== E3 INK
function paintE3(ctx: CanvasRenderingContext2D) {
  // distant mountains: layered ink washes (wet-edged, graded)
  const r = new Rng(300);
  const mountain = (baseY: number, peaks: V2[], alpha: number, seed: number) => {
    const pts = catmull(peaks, 18);
    for (let k = 0; k < 14; k++) {
      const off = k * 9;
      const pp = pts.map(([x, y]) => [x + noise2(x / 90, k, seed) * 5, y + off] as V2);
      fillPath(ctx, [...pp, [pp[pp.length - 1]![0], baseY], [pp[0]![0], baseY]], css(P.ink, alpha * Math.pow(0.82, k)));
    }
  };
  mountain(HORIZON + 4, [[-40, 600], [180, 520], [300, 560], [420, 470], [560, 600], [720, HORIZON]], 0.11, 1);
  mountain(HORIZON + 4, [[1080, HORIZON], [1260, 610], [1380, 650], [1540, 560], [1720, 610], [1960, 540]], 0.08, 2);
  // near hills in bold strokes
  dryBrush(ctx, LEFT_HILL, { width: () => 26, color: P.ink, alpha: 0.85, bristles: 34, dry: 0.45, seed: 31 });
  dryBrush(ctx, RIGHT_HILL, { width: () => 24, color: P.ink, alpha: 0.85, bristles: 34, dry: 0.5, seed: 32 });
  // horizon: a single breath of a line
  dryBrush(ctx, [[640, HORIZON + 6], [1200, HORIZON + 4]], { width: () => 6, color: P.ink, alpha: 0.5, bristles: 10, dry: 0.6, seed: 33 });
  // water: a few horizontal breaths of ink, and the ensō's broken reflection
  for (let i = 0; i < 9; i++) {
    const y = HORIZON + 40 + i * 34 + r.range(-6, 6), x0 = RC[0] - 150 + r.range(-40, 40) - i * 20, x1 = RC[0] + 150 + r.range(-40, 40) + i * 20;
    dryBrush(ctx, [[x0, y], [x1, y + r.range(-3, 3)]], { width: () => r.range(3, 7), color: P.ink, alpha: 0.35 + 0.3 * (i % 2), bristles: 8, dry: 0.75, seed: 80 + i });
  }
  // the ensō (the circle in one stroke), thick to thin, open
  const enso = wobblyCircle(RC[0], RC[1], RR, MARK.startAngle + 0.15, TAU * 0.9, 0.012, 41, 300);
  dryBrush(ctx, enso, { width: (k) => lerp(58, 14, Math.pow(k, 0.8)) * (1 + 0.3 * Math.exp(-k * 25)), color: P.ink, alpha: 0.92, bristles: 64, dry: 0.42, seed: 42 });
  splatter(ctx, enso[0]![0], enso[0]![1], 50, 36, P.ink, 0.7, 43);
  // the figure: a few strokes
  const j = figureJoints(FIG.x, FIG.y, FIG.h);
  dryBrush(ctx, [j.neck, j.hip], { width: () => 13, color: P.ink, alpha: 0.9, bristles: 12, dry: 0.2, seed: 51 });
  dryBrush(ctx, [j.hip, j.kneeL, j.footL], { width: () => 6, color: P.ink, alpha: 0.9, bristles: 7, dry: 0.2, seed: 52 });
  dryBrush(ctx, [j.hip, j.kneeR, j.footR], { width: () => 6, color: P.ink, alpha: 0.9, bristles: 7, dry: 0.2, seed: 53 });
  dryBrush(ctx, [j.neck, j.elbowL, j.handL], { width: () => 5, color: P.ink, alpha: 0.9, bristles: 6, dry: 0.2, seed: 54 });
  dryBrush(ctx, [j.neck, j.elbowR, j.handR], { width: () => 5, color: P.ink, alpha: 0.9, bristles: 6, dry: 0.2, seed: 55 });
  ctx.fillStyle = css(P.ink, 0.92); ctx.beginPath(); ctx.arc(j.head[0], j.head[1], j.headR, 0, TAU); ctx.fill();
  // the red seal (the line's colour enters the image), carved geometric pattern
  const sx = RC[0] + RR + 90, sy = RC[1] + RR - 40, ss = 54;
  ctx.fillStyle = css(P.seal, 0.95); ctx.fillRect(sx, sy, ss, ss);
  ctx.fillStyle = css(P.paper, 1);
  ctx.fillRect(sx + 8, sy + 8, ss - 16, 4); ctx.fillRect(sx + 8, sy + ss - 12, ss - 16, 4);
  ctx.fillRect(sx + 8, sy + 8, 4, ss - 16); ctx.fillRect(sx + ss - 12, sy + 8, 4, 18); ctx.fillRect(sx + 20, sy + 20, 14, 4); ctx.fillRect(sx + 20, sy + 20, 4, 14);
  for (let i = 0; i < 260; i++) { // worn ink
    ctx.fillStyle = css(P.paper, r.range(0.3, 0.9));
    ctx.fillRect(sx + r.next() * ss, sy + r.next() * ss, r.range(0.5, 2), r.range(0.5, 2));
  }
  // a column of small strokes at upper right (like a painter's inscription, but abstract marks)
  for (let i = 0; i < 7; i++) {
    const y = 170 + i * 46;
    dryBrush(ctx, [[1640, y], [1652 + (i % 3) * 4, y + 24]], { width: () => 6, color: P.ink, alpha: 0.8, bristles: 6, dry: 0.3, seed: 60 + i });
    dryBrush(ctx, [[1666, y + 6], [1690, y + 2]], { width: () => 5, color: P.ink, alpha: 0.75, bristles: 5, dry: 0.3, seed: 70 + i });
  }
}

// =================================================================================== E4 COLOUR
/** Bristle stroke: several thin parallel lines of slightly varied colour → oil-paint texture. */
function oilStroke(ctx: CanvasRenderingContext2D, pts: readonly V2[], w: number, col: RGB, a: number, r: Rng) {
  const nb = Math.max(3, Math.round(w / 1.6));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let b = 0; b < nb; b++) {
    const off = ((b / (nb - 1)) * 2 - 1) * w * 0.5;
    const shade = r.range(-18, 18);
    ctx.strokeStyle = css([col[0] + shade, col[1] + shade * 0.9, col[2] + shade * 0.8], a * r.range(0.55, 1));
    ctx.lineWidth = r.range(1.4, 2.6);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[Math.min(pts.length - 1, i + 1)]!, o = pts[Math.max(0, i - 1)]!;
      const tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1;
      const x = p[0] - (ty / tl) * off, y = p[1] + (tx / tl) * off;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

function skyColor(y: number, x: number): RGB {
  const k = clamp(y / HORIZON);
  const d = Math.hypot(x - RC[0], y - RC[1]);
  let c: RGB;
  if (k < 0.45) c = mixRGB(P.ultraDeep, P.ultra, k / 0.45);
  else if (k < 0.8) c = mixRGB(P.ultra, P.rose, (k - 0.45) / 0.35);
  else c = mixRGB(P.rose, P.gold, (k - 0.8) / 0.2);
  const glow = Math.exp(-Math.max(0, d - RR) / 240);
  return mixRGB(c, P.gold, glow * 0.55);
}

function paintE4(ctx: CanvasRenderingContext2D) {
  const r = new Rng(400);
  // underpainting
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, css(P.ultraDeep)); g.addColorStop(0.45, css(P.ultra)); g.addColorStop(0.8, css(P.rose)); g.addColorStop(1, css(P.gold));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON + 10);
  ctx.fillStyle = css(P.ultraDeep); ctx.fillRect(0, HORIZON, W, H - HORIZON);
  // sky brushwork: flow field = horizontal drift that wraps into halos around the sun
  for (let i = 0; i < 2600; i++) {
    let x = r.range(-40, W + 40), y = r.range(-20, HORIZON + 6);
    const pts: V2[] = [[x, y]];
    const len = r.range(6, 14);
    for (let s = 0; s < len; s++) {
      const dx = x - RC[0], dy = y - RC[1], d = Math.hypot(dx, dy);
      const halo = Math.exp(-Math.max(0, d - RR) / 210);
      const tang = Math.atan2(dy, dx) + Math.PI / 2;
      const flow = noise2(x / 380, y / 260, 4) * 0.5;
      const a = lerp(flow, tang, halo * 0.92);
      x += Math.cos(a) * 5; y += Math.sin(a) * 5 * 0.8;
      pts.push([x, y]);
    }
    const c = skyColor(y, x);
    oilStroke(ctx, pts, r.range(5, 11), c, 0.75, r);
  }
  // the sun: vermilion disc built of short radial-tangential strokes, hot core
  for (let i = 0; i < 1500; i++) {
    const a = r.next() * TAU, d = RR * Math.sqrt(r.next()) * 0.98;
    const x = RC[0] + Math.cos(a) * d, y = RC[1] + Math.sin(a) * d;
    const ta = a + Math.PI / 2 + r.gauss() * 0.3;
    const L = r.range(10, 26);
    const pts: V2[] = [[x - Math.cos(ta) * L / 2, y - Math.sin(ta) * L / 2], [x + Math.cos(ta) * L / 2, y + Math.sin(ta) * L / 2]];
    const c = mixRGB(P.sunCore, P.vermilion, clamp(d / RR + r.gauss() * 0.15));
    oilStroke(ctx, pts, r.range(5, 10), c, 0.85, r);
  }
  // rim of the sun: crisp edge strokes (the circle itself, again)
  for (let i = 0; i < 260; i++) {
    const a0 = (i / 260) * TAU, a1 = a0 + 0.06;
    oilStroke(ctx, [[RC[0] + Math.cos(a0) * RR, RC[1] + Math.sin(a0) * RR], [RC[0] + Math.cos(a1) * RR, RC[1] + Math.sin(a1) * RR]], 7, P.vermilion, 0.9, r);
  }
  // far mountains (cool, low contrast)
  const far = catmull([[-40, HORIZON - 30], [200, HORIZON - 78], [420, HORIZON - 40], [640, HORIZON - 64], [900, HORIZON - 28], [1160, HORIZON - 70], [1420, HORIZON - 38], [1700, HORIZON - 82], [1960, HORIZON - 40]], 16);
  fillPath(ctx, [...far, [W + 40, HORIZON + 4], [-40, HORIZON + 4]], css(mixRGB(P.ultra, P.rose, 0.35), 0.95));
  for (let i = 0; i < 500; i++) {
    const x = r.range(0, W), top = HORIZON - 30 - 40 * (0.5 + 0.5 * noise2(x / 200, 3, 9));
    const y = r.range(top, HORIZON);
    oilStroke(ctx, [[x, y], [x + r.range(12, 26), y + r.range(-2, 2)]], r.range(4, 7), mixRGB(P.ultra, P.rose, r.range(0.2, 0.5)), 0.6, r);
  }
  // water: deep, with the sun's broken reflection
  for (let i = 0; i < 1200; i++) {
    const y = r.range(HORIZON + 4, H + 10), x = r.range(-20, W);
    const len = r.range(16, 60);
    oilStroke(ctx, [[x, y], [x + len, y + r.range(-1.5, 1.5)]], r.range(3, 7), mixRGB(P.ultraDeep, P.ultra, r.range(0, 0.45)), 0.75, r);
  }
  for (let i = 0; i < 420; i++) {
    const y = r.range(HORIZON + 8, H), spread = 40 + (y - HORIZON) * 0.35;
    const x = RC[0] + r.gauss() * spread * 0.55;
    const len = r.range(14, 50) * (1 - (y - HORIZON) / (H - HORIZON) * 0.4);
    const c = mixRGB(P.vermilion, P.gold, r.next() * 0.6);
    oilStroke(ctx, [[x - len / 2, y], [x + len / 2, y]], r.range(3, 6), c, 0.8 * (1 - (y - HORIZON) / (H - HORIZON) * 0.6), r);
  }
  // near hills: viridian masses, directional strokes
  const hill = (pts: V2[], land: V2[], seed: number) => {
    const rr = new Rng(seed);
    fillPath(ctx, land, css(P.viridianDeep));
    const landPath = new Path2D();
    land.forEach(([lx, ly], li) => (li ? landPath.lineTo(lx, ly) : landPath.moveTo(lx, ly)));
    landPath.closePath();
    const sc = ctx.getTransform().a;
    const minY = Math.min(...pts.map((p) => p[1]));
    for (let i = 0; i < 1300; i++) {
      const idx = rr.int(0, pts.length - 1), p = pts[idx]!;
      const y = rr.range(p[1] + 2, Math.min(H + 10, p[1] + 420));
      const x = p[0] + rr.gauss() * 30;
      if (!ctx.isPointInPath(landPath, x * sc, y * sc)) continue;
      const depth = (y - minY) / 400;
      const c = mixRGB(mixRGB(P.viridian, P.gold, clamp(0.35 - depth) * 0.8), P.viridianDeep, clamp(depth));
      const a = -0.2 + rr.gauss() * 0.2;
      const L = rr.range(10, 28);
      oilStroke(ctx, [[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], rr.range(4, 8), c, 0.85, rr);
    }
    // sunlit rim along the ridge
    oilStroke(ctx, pts.filter((_, i) => i % 2 === 0), 4, mixRGB(P.gold, P.rose, 0.3), 0.7, rr);
  };
  hill(LEFT_HILL, LEFT_LAND, 41);
  hill(RIGHT_HILL, RIGHT_LAND, 42);
  // the figure, a dark silhouette against the light
  const j = figureJoints(FIG.x, FIG.y, FIG.h);
  const fc = css(P.charcoal, 0.96);
  ctx.strokeStyle = fc; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 15 * j.u; ctx.beginPath(); ctx.moveTo(j.neck[0], j.neck[1] + 4); ctx.lineTo(j.hip[0], j.hip[1]); ctx.stroke();
  ctx.lineWidth = 8 * j.u;
  for (const ch of [[j.hip, j.kneeL, j.footL], [j.hip, j.kneeR, j.footR], [j.neck, j.elbowL, j.handL], [j.neck, j.elbowR, j.handR]] as V2[][]) {
    ctx.beginPath(); ch.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
  ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(j.head[0], j.head[1], j.headR, 0, TAU); ctx.fill();
  // varnish-like glaze highlights near the sun
  const gl = ctx.createRadialGradient(RC[0], RC[1], RR * 0.8, RC[0], RC[1], RR * 3.2);
  gl.addColorStop(0, css(P.gold, 0.18)); gl.addColorStop(1, css(P.gold, 0));
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W, HORIZON);
}

// =================================================================================== E5 DIGITAL
export function paintE5(ctx: CanvasRenderingContext2D, ui = true) {
  // flat bands of colour (stepped gradient), perfect geometry
  const dusk = mixRGB(mixRGB(P.ultra, P.rose, 0.5), P.gold, 0.18);
  const bands: RGB[] = [P.ultraDeep, mixRGB(P.ultraDeep, P.ultra, 0.5), P.ultra, mixRGB(P.ultra, dusk, 0.55), mixRGB(dusk, P.rose, 0.45), P.rose, mixRGB(P.rose, P.gold, 0.6)];
  const bh = HORIZON / bands.length;
  bands.forEach((c, i) => { ctx.fillStyle = css(c); ctx.fillRect(0, i * bh, W, bh + 1); });
  ctx.fillStyle = css(P.ultraDeep); ctx.fillRect(0, HORIZON, W, H - HORIZON);
  // reflection bars
  for (let i = 0; i < 9; i++) {
    const y = HORIZON + 20 + i * 34, w = 220 - i * 18;
    ctx.fillStyle = css(i % 2 ? P.gold : P.vermilion, 0.9);
    ctx.fillRect(RC[0] - w / 2, y, w, 8);
  }
  // far mountains (polygon), hills (polygons)
  const far: V2[] = [[0, HORIZON - 30], [200, HORIZON - 78], [420, HORIZON - 40], [640, HORIZON - 64], [900, HORIZON - 28], [1160, HORIZON - 70], [1420, HORIZON - 38], [1700, HORIZON - 82], [1920, HORIZON - 40], [1920, HORIZON], [0, HORIZON]];
  fillPath(ctx, far, css(mixRGB(P.ultra, P.rose, 0.35)));
  const lh = LEFT_HILL.filter((_, i) => i % 10 === 0).concat([LEFT_HILL[LEFT_HILL.length - 1]!]);
  const rh = RIGHT_HILL.filter((_, i) => i % 10 === 0).concat([RIGHT_HILL[RIGHT_HILL.length - 1]!]);
  const lland: V2[] = [...lh, [560, 860], [420, H + 40], [-40, H + 40]];
  const rland: V2[] = [[1150, HORIZON + 4], ...rh, [1960, H + 40], [1450, H + 40], [1290, 860]];
  fillPath(ctx, lland, css(P.viridian));
  fillPath(ctx, rland, css(P.viridian));
  fillPath(ctx, [...lh.map(([x, y]) => [x, y + 70] as V2), [560, 930], [470, H + 40], [-40, H + 40]], css(P.viridianDeep));
  fillPath(ctx, [[1200, HORIZON + 70], ...rh.map(([x, y]) => [x, y + 70] as V2), [1960, H + 40], [1400, H + 40], [1260, 930]], css(P.viridianDeep));
  // the sun: a perfect circle
  ctx.fillStyle = css(P.vermilion); ctx.beginPath(); ctx.arc(RC[0], RC[1], RR, 0, TAU); ctx.fill();
  // the figure: flat geometric silhouette
  const j = figureJoints(FIG.x, FIG.y, FIG.h);
  ctx.fillStyle = css(P.charcoal);
  ctx.beginPath(); ctx.arc(j.head[0], j.head[1], j.headR, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.roundRect(j.neck[0] - 9 * j.u, j.neck[1], 18 * j.u, j.hip[1] - j.neck[1] + 4, 6 * j.u); ctx.fill();
  ctx.strokeStyle = css(P.charcoal); ctx.lineCap = 'round'; ctx.lineWidth = 8 * j.u;
  for (const [a, b] of [[j.hip, j.footL], [j.hip, j.footR], [j.neck, j.handL], [j.neck, j.handR]] as [V2, V2][]) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  if (!ui) return;
  // vector UI: selection box, anchors, bezier handles on the circle; anchors on the hills
  const B = css(P.bone, 0.95);
  ctx.strokeStyle = B; ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]); ctx.strokeRect(RC[0] - RR - 0.5, RC[1] - RR - 0.5, RR * 2 + 1, RR * 2 + 1); ctx.setLineDash([]);
  const kappa = 0.5523 * RR;
  const anchors: V2[] = [[RC[0] + RR, RC[1]], [RC[0], RC[1] + RR], [RC[0] - RR, RC[1]], [RC[0], RC[1] - RR]];
  anchors.forEach(([x, y], i) => {
    const horiz = i % 2 === 1;
    const hx = horiz ? kappa : 0, hy = horiz ? 0 : kappa;
    ctx.strokeStyle = B; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - hx, y - hy); ctx.lineTo(x + hx, y + hy); ctx.stroke();
    for (const s of [-1, 1]) { ctx.fillStyle = B; ctx.beginPath(); ctx.arc(x + hx * s, y + hy * s, 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = css(P.ultraDeep); ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.strokeRect(x - 5.5, y - 5.5, 11, 11);
  });
  for (const pts of [lh, rh]) for (const [x, y] of pts) {
    if (x < 0 || x > W) continue;
    ctx.fillStyle = css(P.bone, 0.9); ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  ctx.strokeStyle = css(P.bone, 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); lh.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.beginPath(); rh.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}

export const ERA_PAINTERS = [paintE0, paintE1, paintE2, paintE3, paintE4, paintE5];

/** Paint all six eras into transparent canvases (E4/E5 are opaque paintings). */
export function paintEras() {
  return ERA_PAINTERS.map((paint) => {
    const { c, ctx } = makeCanvas(W, H);
    paint(ctx);
    return c;
  });
}

export const _unused = { strokePath, P, dabStroke };
