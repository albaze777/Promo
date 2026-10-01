// The gallery: original procedural artworks, each with its own personality, painted once into an atlas.
// Slot 12 is the sunset from 04 (its digital form) — the film's own artwork, now one among many.
import { makeCanvas, dryBrush, splatter, hexRGB, css, mixRGB, wobblyCircle, type RGB } from './paint';
import { paintE5 } from './eras';
import { Rng, catmull, clamp, lerp, noise2, fbm2, TAU, type V2 } from '../utils/math';

export const TILE_W = 600, TILE_H = 450, ATLAS_COLS = 4, ATLAS_ROWS = 4;
export const PIECES = 13;

const C = {
  paper: hexRGB('#EDE6D8'), cream: hexRGB('#E9DDC6'), ink: hexRGB('#121110'), bone: hexRGB('#EFE9DF'),
  ochre: hexRGB('#C98A2E'), ultra: hexRGB('#26389B'), ultraDeep: hexRGB('#151F5C'), vermilion: hexRGB('#E2412B'),
  rose: hexRGB('#E8A9A0'), viridian: hexRGB('#2E6B58'), terracotta: hexRGB('#B5563A'), gold: hexRGB('#E3A448'),
  maroon: hexRGB('#4A1612'), deepRed: hexRGB('#9E2016'), night: hexRGB('#0D0E14'), sand: hexRGB('#D9C3A0'),
  line: hexRGB('#FF3B2E'), teal: hexRGB('#1E4A4A'),
};

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) => void;
const bg = (ctx: CanvasRenderingContext2D, w: number, h: number, c: RGB) => { ctx.fillStyle = css(c); ctx.fillRect(0, 0, w, h); };

const pieces: Painter[] = [
  // 0 · "Current" — flow-field brushwork
  (ctx, w, h, r) => {
    bg(ctx, w, h, C.paper);
    const pal = [C.ultra, C.ochre, C.ultraDeep, C.terracotta, C.bone];
    for (let i = 0; i < 1400; i++) {
      let x = r.range(-20, w + 20), y = r.range(-20, h + 20);
      const col = pal[Math.floor(clamp(fbm2(x / 260, y / 260, 3, 2) * 1.2 + 0.2) * (pal.length - 0.01))]!;
      ctx.strokeStyle = css(col, 0.8); ctx.lineWidth = r.range(2, 6); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 18; s++) { const a = noise2(x / 160, y / 160, 9) * TAU; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  // 1 · "Interference" — moiré of two ring systems, one red ring
  (ctx, w, h) => {
    bg(ctx, w, h, C.bone);
    ctx.strokeStyle = css(C.ink, 0.9); ctx.lineWidth = 2.2;
    for (const [cx, cy] of [[w * 0.4, h * 0.5], [w * 0.6, h * 0.46]] as V2[]) for (let rr = 6; rr < 520; rr += 9) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = css(C.vermilion); ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.48, 96, 0, TAU); ctx.stroke();
  },
  // 2 · "Floating order" — suprematist composition
  (ctx, w, h, r) => {
    bg(ctx, w, h, C.cream);
    const shapes: [number, number, number, number, number, RGB][] = [
      [0.42, 0.45, 0.42, 0.22, -0.32, C.ink], [0.62, 0.32, 0.10, 0.10, 0.2, C.vermilion], [0.3, 0.7, 0.32, 0.04, -0.32, C.ink],
      [0.7, 0.66, 0.2, 0.08, 0.6, C.ultra], [0.55, 0.55, 0.05, 0.36, -0.32, C.ochre], [0.24, 0.3, 0.06, 0.06, 0, C.ink],
    ];
    for (const [x, y, sw, sh, a, c] of shapes) {
      ctx.save(); ctx.translate(x * w, y * h); ctx.rotate(a); ctx.fillStyle = css(c); ctx.fillRect(-sw * w / 2, -sh * h / 2, sw * w, sh * h); ctx.restore();
    }
    ctx.strokeStyle = css(C.ink, 0.8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w * 0.74, h * 0.28, 50, 0, TAU); ctx.stroke();
    for (let i = 0; i < 1500; i++) { ctx.fillStyle = css(C.ink, 0.04); ctx.fillRect(r.range(0, w), r.range(0, h), 1.5, 1.5); }
  },
  // 3 · "Breath" — ink ensō with seal
  (ctx, w, h) => {
    bg(ctx, w, h, C.paper);
    const pts = wobblyCircle(w * 0.48, h * 0.5, 140, 2.2, TAU * 0.88, 0.015, 21, 260);
    dryBrush(ctx, pts, { width: (k) => lerp(44, 10, k), color: C.ink, alpha: 0.92, bristles: 50, dry: 0.45, seed: 22 });
    ctx.fillStyle = css(C.vermilion); ctx.fillRect(w * 0.72, h * 0.66, 36, 36);
  },
  // 4 · "Strata" — layered dusk bands
  (ctx, w, h) => {
    const pal = [C.night, C.ultraDeep, C.teal, C.terracotta, C.rose, C.gold, C.sand];
    for (let k = 0; k < 14; k++) {
      const c = mixRGB(pal[Math.floor(k / 2)]!, pal[Math.min(pal.length - 1, Math.floor(k / 2) + 1)]!, (k % 2) * 0.5);
      ctx.fillStyle = css(c);
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) ctx.lineTo(x, h * (k / 14) + 28 * noise2(x / 120, k * 0.7, 4) + 14 * noise2(x / 30, k, 5));
      ctx.lineTo(w, h); ctx.fill();
    }
  },
  // 5 · "One line" — a single continuous contour of a face in profile
  (ctx, w, h) => {
    bg(ctx, w, h, C.night);
    const pts: V2[] = catmull([[180, 420], [200, 330], [240, 260], [250, 200], [232, 168], [262, 150], [250, 120], [272, 96], [262, 70], [300, 40], [380, 30],
      [440, 70], [450, 150], [420, 230], [380, 280], [340, 330], [360, 420], [300, 380], [320, 300], [380, 200], [330, 120], [290, 150], [330, 190]], 14);
    ctx.strokeStyle = css(C.bone, 0.95); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + 30, y) : ctx.moveTo(x + 30, y))); ctx.stroke();
    ctx.fillStyle = css(C.line); ctx.beginPath(); ctx.arc(320, 128, 7, 0, TAU); ctx.fill();
  },
  // 6 · "Tiles" — truchet arcs
  (ctx, w, h, r) => {
    bg(ctx, w, h, C.viridian);
    const s = 50;
    ctx.strokeStyle = css(C.bone, 0.95); ctx.lineWidth = 9; ctx.lineCap = 'butt';
    for (let y = 0; y < h + s; y += s) for (let x = 0; x < w + s; x += s) {
      ctx.beginPath();
      if (r.next() < 0.5) { ctx.arc(x, y, s / 2, 0, Math.PI / 2); ctx.moveTo(x + s, y + s / 2); ctx.arc(x + s, y + s, s / 2, -Math.PI / 2, -Math.PI, true); }
      else { ctx.arc(x + s, y, s / 2, Math.PI / 2, Math.PI); ctx.moveTo(x + s / 2, y + s); ctx.arc(x, y + s, s / 2, -Math.PI / 2, 0); }
      ctx.stroke();
    }
  },
  // 7 · "Bloom" — radial petals of fine strokes
  (ctx, w, h, r) => {
    bg(ctx, w, h, C.maroon);
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 900; i++) {
      const a = r.next() * TAU, petal = Math.abs(Math.sin(a * 4)), len = 60 + 150 * petal * r.range(0.7, 1);
      ctx.strokeStyle = css(mixRGB(C.gold, C.rose, r.next()), 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * len * 0.6, cy + Math.sin(a + 0.3) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.fillStyle = css(C.gold); ctx.beginPath(); ctx.arc(cx, cy, 14, 0, TAU); ctx.fill();
  },
  // 8 · "Pale world" — halftone sphere (a callback to the planet)
  (ctx, w, h) => {
    bg(ctx, w, h, C.night);
    const cx = w * 0.5, cy = h * 0.52, R = 170, s = 11;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const dx = (x - cx) / R, dy = (y - cy) / R, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2), lit = clamp(-dx * 0.6 - dy * 0.5 + nz * 0.6);
      ctx.fillStyle = css(C.vermilion); ctx.beginPath(); ctx.arc(x, y, s * 0.5 * lit, 0, TAU); ctx.fill();
    }
  },
  // 9 · "Field" — colour field
  (ctx, w, h) => {
    bg(ctx, w, h, C.maroon);
    const soft = (x: number, y: number, rw: number, rh: number, c: RGB) => {
      for (let k = 0; k < 18; k++) { ctx.fillStyle = css(c, 0.08); ctx.fillRect(x - k * 0.8, y - k * 0.8, rw + k * 1.6, rh + k * 1.6); }
      ctx.fillStyle = css(c, 0.85); ctx.fillRect(x + 4, y + 4, rw - 8, rh - 8);
    };
    soft(60, 46, w - 120, h * 0.48, C.deepRed);
    soft(60, h * 0.58, w - 120, h * 0.32, C.ochre);
  },
  // 10 · "Sorted" — pixel-sorted gradient (digital-native)
  (ctx, w, h, r) => {
    const pal = [C.ultraDeep, C.ultra, C.rose, C.gold, C.vermilion, C.bone];
    for (let x = 0; x < w; x += 4) {
      const cut = h * (0.3 + 0.5 * (0.5 + 0.5 * noise2(x / 60, 1, 3)));
      for (let y = 0; y < h; y += 4) {
        const k = y < cut ? (y / cut) * 0.5 : 0.5 + ((y - cut) / (h - cut)) * 0.5;
        const kk = clamp(k + (r.next() - 0.5) * 0.02) * (pal.length - 1);
        ctx.fillStyle = css(mixRGB(pal[Math.floor(kk)]!, pal[Math.min(pal.length - 1, Math.floor(kk) + 1)]!, kk % 1));
        ctx.fillRect(x, y, 4, 4);
      }
    }
  },
  // 11 · "Ridge" — wireframe mountain in perspective
  (ctx, w, h) => {
    bg(ctx, w, h, C.night);
    ctx.strokeStyle = css(C.bone, 0.85); ctx.lineWidth = 1.3;
    for (let zi = 0; zi < 26; zi++) {
      const z = 1 + zi * 0.35, y0 = h * 0.42 + 300 / z;
      ctx.beginPath();
      for (let xi = 0; xi <= 60; xi++) {
        const wx = (xi / 60 - 0.5) * 16;
        const hgt = Math.max(0, 2.6 - Math.abs(wx) * 0.4 + fbm2(wx * 0.35, z * 0.6, 4, 3) * 2.2);
        const x = w / 2 + (wx / z) * 140, y = y0 - (hgt / z) * 120;
        xi ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  },
  // 12 · the sunset (from 04), its digital form
  (ctx, w, h) => {
    ctx.save();
    // crop to 4:3 around the composition (x 160…1600 of the 1920×1080 painting)
    ctx.scale(w / 1440, h / 1080); ctx.translate(-160, 0);
    paintE5(ctx, false);
    ctx.restore();
  },
];

export function paintAtlas(scale = 1) {
  const { c, ctx } = makeCanvas(TILE_W * ATLAS_COLS, TILE_H * ATLAS_ROWS, scale);
  ctx.fillStyle = '#121215'; ctx.fillRect(0, 0, TILE_W * ATLAS_COLS, TILE_H * ATLAS_ROWS);
  pieces.forEach((p, i) => {
    const x = (i % ATLAS_COLS) * TILE_W, y = Math.floor(i / ATLAS_COLS) * TILE_H;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, TILE_W, TILE_H); ctx.clip();
    ctx.translate(x, y);
    p(ctx, TILE_W, TILE_H, new Rng(1000 + i * 77));
    ctx.restore();
  });
  splatter; // (toolkit kept available for future pieces)
  return c;
}
