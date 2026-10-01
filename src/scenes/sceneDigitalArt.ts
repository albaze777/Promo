// 05 DIGITAL ART & CREATORS — brush strokes → pixels → vectors → grid → a gallery → a community.
// The digital painting quantises in discrete resolution steps; the pixels round into vector dots on a grid;
// panels develop out of the dots, each a different original artwork; handles, avatars and likes appear
// (people); the line becomes the threads between them. At the end the panels shrink into characters.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, canvasTexture } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, RED, BONE, rgba } from '../motifs/line';
import { getEraTextures, artCam } from '../art/plates';
import { paintAtlas, TILE_W, TILE_H, ATLAS_COLS, ATLAS_ROWS } from '../art/gallery';
import { MARK_START } from '../motifs/world';
import { charPos, GLYPHS } from '../motifs/ored';
import { setText } from '../typography/fonts';
import { CUE } from '../timeline/cues';
import { PAL } from '../brand';
import { Rng, clamp, ease, keys, lerp, smoothstep, type V2 } from '../utils/math';

// gallery grid (world px): panel (i,j) has its top-left at G0 + (i·PX, j·PY)
const CS = 37.5, PW_ = 300, PH_ = 225, PX = 337.5, PY = 300;
const G0: V2 = [810, 427.5];
const I_RANGE = 4, J_RANGE = 3;
const T_DOTS = 10.98, T_DEV = 11.32, T_SHRINK = CUE.ored, T_END = CUE.ored + 0.4;
const pieceOf = (i: number, j: number) => (i === 0 && j === 0 ? 12 : (((i * 7 + j * 3 + 13) % 12) + 12) % 12);
const devStart = (i: number, j: number) => T_DEV + 0.075 * Math.hypot(i, j * 1.2) + 0.08 * ((((i * 3 + j * 5 + 70) % 7) + 7) % 7) / 7;
const panelRect = (i: number, j: number) => ({ x: G0[0] + i * PX, y: G0[1] + j * PY, w: PW_, h: PH_ });
const HANDLES = ['albaze', 'mira.k', 'ondo', 'koe', 'lumen.studio', 'kaito', 'sable', 'arun.draws', 'deepak', 'nyx', 'ilse', 'juno.art', 'tavi', 'oro', 'selin', 'mae', 'rook', 'ada.ink'];

interface Edge { a: number; b: number; t0: number; bend: number }

export default class SceneDigitalArt extends Scene {
  override handlesTransition = true;
  motif = new LineMotif();
  net = new LineBatch(20000);
  ui = new Layer2D();
  panels: { i: number; j: number; piece: number; t0: number; handle: string; likes: number; hue: string }[] = [];
  edges: Edge[] = [];
  assigned: number[] = []; // panel index per glyph (for the hand-off)
  pass!: FSPass;

  override init() {
    this.pass = this.makePass();
    this.pass.u.e5!.value = getEraTextures()[5];
    const atlas = paintAtlas(1);
    this.pass.u.atlas!.value = canvasTexture(atlas);
    // panels, people
    const rng = new Rng(55);
    let hIdx = 0;
    for (let j = -J_RANGE; j <= J_RANGE; j++) for (let i = -I_RANGE; i <= I_RANGE; i++) {
      this.panels.push({
        i, j, piece: pieceOf(i, j), t0: devStart(i, j),
        handle: HANDLES[(hIdx++ * 7) % HANDLES.length]!, likes: Math.round(40 + rng.next() ** 2 * 2400),
        hue: [PAL.ochre, PAL.ultramarine, PAL.vermilion, PAL.rose, PAL.viridian, PAL.terracotta][rng.int(0, 5)]!,
      });
    }
    // community graph between avatars (each panel's creator)
    const idx = (i: number, j: number) => (j + J_RANGE) * (2 * I_RANGE + 1) + (i + I_RANGE);
    const seen = new Set<string>();
    const order = this.panels.map((p, k) => ({ k, d: Math.hypot(p.i, p.j) })).sort((a, b) => a.d - b.d);
    order.forEach(({ k }, n) => {
      const p = this.panels[k]!;
      const cand: number[] = [];
      for (let tries = 0; tries < 3; tries++) {
        const di = rng.int(-2, 2), dj = rng.int(-2, 2);
        const qi = p.i + di, qj = p.j + dj;
        if ((di === 0 && dj === 0) || Math.abs(qi) > I_RANGE || Math.abs(qj) > J_RANGE) continue;
        cand.push(idx(qi, qj));
      }
      for (const q of cand) {
        const key = k < q ? `${k}-${q}` : `${q}-${k}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push({ a: k, b: q, t0: CUE.community + n * 0.014 + rng.next() * 0.1, bend: rng.range(-0.35, 0.35) });
      }
    });
    // hand-off: give each glyph the nearest unassigned panel to its character position (screen at end camera)
    const used = new Set<number>();
    for (const g of GLYPHS) {
      const [cx, cy] = charPos(g.i);
      const w = this.screenToWorld(T_SHRINK, cx, cy);
      let best = -1, bd = Infinity;
      this.panels.forEach((p, k) => {
        if (used.has(k)) return;
        const r = panelRect(p.i, p.j), d = Math.hypot(r.x + r.w / 2 - w[0], r.y + r.h / 2 - w[1]);
        if (d < bd) { bd = d; best = k; }
      });
      used.add(best);
      this.assigned.push(best);
    }
    const aIJ = this.pass.u.aIJ!.value as THREE.Vector2[];
    const aPiece = this.pass.u.aPiece!.value as number[];
    this.assigned.forEach((k, n) => { aIJ[n]!.set(this.panels[k]!.i, this.panels[k]!.j); aPiece[n] = this.panels[k]!.piece; });
  }

  cam(t: number) {
    const a = artCam(CUE.pixels);
    const s = keys(t, [[CUE.pixels, a.scale], [T_DEV, 1.0, ease.inOutCubic], [CUE.community, 0.84, ease.inOutCubic], [T_SHRINK, 0.6, ease.inOutCubic]]);
    const k = ease.inOutCubic(clamp((t - CUE.pixels) / (T_DEV - CUE.pixels)));
    return { s, cx: lerp(a.cx, 960, k), cy: lerp(a.cy, 540, k) };
  }
  worldToScreen(t: number, x: number, y: number): V2 { const c = this.cam(t); return [c.cx + (x - c.cx) * c.s, c.cy + (y - c.cy) * c.s]; }
  screenToWorld(t: number, x: number, y: number): V2 { const c = this.cam(t); return [c.cx + (x - c.cx) / c.s, c.cy + (y - c.cy) / c.s]; }
  avatar(k: number): V2 { const p = this.panels[k]!, r = panelRect(p.i, p.j); return [r.x + 9, r.y + r.h + 22]; }

  makePass() {
    return new FSPass(/* glsl */ `
    uniform sampler2D e5; uniform sampler2D atlas;
    uniform vec2 camC; uniform float camS; uniform float t;
    uniform float pixN, gapK, dotK, gridK, outK, shrinkK;
    uniform vec4 aRect[15]; uniform vec2 aIJ[15]; uniform float aPiece[15];
    const vec2 G0 = vec2(${G0[0].toFixed(2)}, ${G0[1].toFixed(2)});
    const float CS = ${CS.toFixed(2)}, PX = ${PX.toFixed(2)}, PY = ${PY.toFixed(2)}, PW = ${PW_.toFixed(2)}, PH = ${PH_.toFixed(2)};
    float pieceOf(vec2 ij) { if (ij.x == 0.0 && ij.y == 0.0) return 12.0; return mod(ij.x * 7.0 + ij.y * 3.0 + 13.0 + 1200.0, 12.0); }
    vec3 art(float piece, vec2 puv) {
      vec2 tile = vec2(mod(piece, ${ATLAS_COLS}.0), floor(piece / ${ATLAS_COLS}.0));
      vec2 uv = (tile + clamp(puv, 0.002, 0.998)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
      return texture(atlas, vec2(uv.x, 1.0 - uv.y)).rgb;
    }
    float devOf(vec2 ij) {
      float t0 = ${T_DEV.toFixed(3)} + 0.075 * length(vec2(ij.x, ij.y * 1.2)) + 0.08 * mod(ij.x * 3.0 + ij.y * 5.0 + 70.0, 7.0) / 7.0;
      return sat((t - t0) / 0.5);
    }
    float rbox(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
    void main() {
      vec2 px = FRAG_PX;
      vec2 w = camC + (px - camC) / camS;
      vec3 bg = C_INK * 0.75;
      float pxw = 1.0 / camS;
      // ---- pixel grid: discrete resolution steps, then gaps, then vector dots ----
      float cs = CS / exp2(pixN);
      vec2 cc = G0 + (floor((w - G0) / cs) + 0.5) * cs;
      vec2 lc = (w - cc) / cs;
      vec3 srcC = texture(e5, vec2(cc.x / RES.x, 1.0 - cc.y / RES.y)).rgb;
      float size = mix(mix(1.0, 0.8, gapK), 0.42, dotK);
      float sd = rbox(lc, vec2(size * 0.5), 0.5 * size * dotK) * cs;
      float a = (gapK <= 0.0 && dotK <= 0.0) ? 1.0 : sat(0.5 - sd / pxw);
      vec3 dotC = mix(srcC, vec3(luma(srcC)) * 0.5 + C_BONE * 0.22, dotK * 0.3);
      // ---- panels ----
      vec2 ij = floor((w - G0) / vec2(PX, PY));
      vec2 lp = w - (G0 + ij * vec2(PX, PY));
      bool inGrid = abs(ij.x) <= ${I_RANGE}.0 && abs(ij.y) <= ${J_RANGE}.0;
      bool inPanel = inGrid && lp.x < PW && lp.y < PH;
      bool assignedHere = false;
      for (int k = 0; k < 15; k++) if (aIJ[k] == ij) assignedHere = true;
      vec3 layer = dotC;
      float la = a * (inPanel ? 1.0 : 1.0 - outK);
      if (inPanel) {
        float dev = devOf(ij);
        float piece = pieceOf(ij);
        if (dev > 0.0) {
          if (dev < 0.5) {
            // the dots swell into tiles and take the artwork's colours (a mosaic of the piece)
            float d1 = dev / 0.5;
            vec2 ccl = G0 + ij * vec2(PX, PY) + (floor(lp / CS) + 0.5) * CS;
            vec2 l2 = (w - ccl) / CS;
            float s2 = mix(0.42, 1.0, d1 * d1);
            float sd2 = rbox(l2, vec2(s2 * 0.5), 0.5 * s2 * (1.0 - d1)) * CS;
            vec3 artC = art(piece, (floor(lp / CS) + 0.5) * CS / vec2(PW, PH));
            layer = mix(dotC, artC, d1);
            la = sat(0.5 - sd2 / pxw);
          } else {
            // resolution doubles in steps until the piece is crisp
            float d2 = (dev - 0.5) / 0.5;
            float n = floor(d2 * 6.0);
            float cl = CS / exp2(n);
            vec2 q = d2 >= 1.0 ? lp : (floor(lp / cl) + 0.5) * cl;
            layer = art(piece, q / vec2(PW, PH));
            la = 1.0;
          }
        }
        // the hand-off: unassigned panels shrink into their centres and fade
        if (shrinkK > 0.0 && !assignedHere) {
          vec2 cen = vec2(PW, PH) * 0.5;
          vec2 rel = (lp - cen) / max(1e-3, 1.0 - shrinkK);
          if (abs(rel.x) > PW * 0.5 || abs(rel.y) > PH * 0.5) la = 0.0;
          else layer = art(piece, (rel + cen) / vec2(PW, PH));
          la *= 1.0 - shrinkK;
        }
        if (shrinkK > 0.0 && assignedHere) la = 0.0;
      }
      vec3 c = mix(bg, layer, la);
      // grid hairlines
      vec2 g = abs(fract((w - G0) / CS + 0.5) - 0.5) * CS / pxw;
      c += C_BONE * 0.06 * gridK * sat(1.0 - min(g.x, g.y)) * (1.0 - outK);
      // assigned panels travelling to their characters (screen-space rects)
      if (shrinkK > 0.0) for (int k = 0; k < 15; k++) {
        vec4 R = aRect[k];
        vec2 rel = (px - R.xy) / R.zw;
        if (abs(rel.x) <= 0.5 && abs(rel.y) <= 0.5) {
          vec3 ac = art(aPiece[k], rel + 0.5);
          ac = mix(ac, C_BONE * 0.85, smoothstep(0.55, 1.0, shrinkK));
          c = ac;
        }
      }
      fragColor = vec4(c, 1.0);
    }`, {
      e5: { value: null }, atlas: { value: null }, camC: { value: new THREE.Vector2() }, camS: { value: 1 }, t: { value: 0 },
      pixN: { value: 5 }, gapK: { value: 0 }, dotK: { value: 0 }, gridK: { value: 0 }, outK: { value: 0 }, shrinkK: { value: 0 },
      aRect: { value: Array.from({ length: 15 }, () => new THREE.Vector4(-1e4, -1e4, 0, 0)) },
      aIJ: { value: Array.from({ length: 15 }, () => new THREE.Vector2(99, 99)) },
      aPiece: { value: new Array(15).fill(0) },
    });
  }

  /** Waypoints of the line's head (world space): grid steps → frame trace → node hops → first character. */
  headPath(t: number): V2 {
    const r0 = panelRect(0, 0);
    const av0 = this.avatar(this.panels.findIndex((p) => p.i === 0 && p.j === 0));
    const hop = this.edges.filter((e) => e.a === this.panels.findIndex((p) => p.i === 0 && p.j === 0)).map((e) => this.avatar(e.b));
    const ws: [number, number, number][] = [
      [CUE.pixels, MARK_START[0], MARK_START[1]],
      [T_DOTS, MARK_START[0], MARK_START[1]],
      [T_DOTS + 0.12, G0[0] + 4 * CS, MARK_START[1]],
      [T_DOTS + 0.24, G0[0] + 4 * CS, r0.y + r0.h],
      [T_DEV, r0.x, r0.y + r0.h],
      [T_DEV + 0.18, r0.x, r0.y],
      [T_DEV + 0.42, r0.x + r0.w, r0.y],
      [T_DEV + 0.58, r0.x + r0.w, r0.y + r0.h],
      [T_DEV + 0.8, r0.x, r0.y + r0.h],
      [CUE.community, av0[0], av0[1]],
    ];
    let tt = CUE.community;
    for (const h of hop.slice(0, 3)) { tt += 0.22; ws.push([tt, h[0], h[1]]); tt += 0.06; ws.push([tt, h[0], h[1]]); }
    const endW = this.screenToWorld(T_END, ...charPos(GLYPHS[0]!.i));
    ws.push([T_SHRINK, av0[0], av0[1]]);
    ws.push([T_END, endW[0], endW[1]]);
    if (t <= ws[0]![0]) return [ws[0]![1], ws[0]![2]];
    for (let k = 1; k < ws.length; k++) {
      const [t1, x1, y1] = ws[k]!, [t0, x0, y0] = ws[k - 1]!;
      if (t <= t1) { const e = ease.inOutCubic((t - t0) / Math.max(1e-4, t1 - t0)); return [lerp(x0, x1, e), lerp(y0, y1, e)]; }
    }
    const l = ws[ws.length - 1]!;
    return [l[1], l[2]];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, u = this.pass.u;
    const cam = this.cam(t);
    (u.camC!.value as THREE.Vector2).set(cam.cx, cam.cy);
    u.camS!.value = cam.s; u.t!.value = t;
    u.pixN!.value = Math.max(0, 5 - Math.floor((t - CUE.pixels) / 0.08));
    u.gapK!.value = ease.outCubic(clamp((t - (T_DOTS - 0.05)) / 0.15));
    u.dotK!.value = ease.inOutCubic(clamp((t - T_DOTS) / 0.3));
    u.gridK!.value = smoothstep(T_DOTS + 0.1, T_DOTS + 0.35, t);
    u.outK!.value = smoothstep(T_DEV + 0.2, T_DEV + 0.8, t);
    const shrink = ease.inOutCubic(clamp((t - T_SHRINK) / (T_END - T_SHRINK - 0.05)));
    u.shrinkK!.value = shrink;
    const aRect = u.aRect!.value as THREE.Vector4[];
    this.assigned.forEach((k, n) => {
      const p = this.panels[k]!, rc = panelRect(p.i, p.j);
      const [sx, sy] = this.worldToScreen(t, rc.x + rc.w / 2, rc.y + rc.h / 2);
      const [tx, ty] = charPos(GLYPHS[n]!.i);
      const e = ease.inOutCubic(clamp((t - T_SHRINK - n * 0.008) / (T_END - T_SHRINK - 0.08)));
      const w0 = rc.w * cam.s, h0 = rc.h * cam.s;
      aRect[n]!.set(lerp(sx, tx, e), lerp(sy, ty, e), lerp(w0, 30, e), lerp(h0, 40, e));
    });
    this.pass.render(r, out);

    // ---- creators: frames, avatars, handles, likes (screen-space type) ----
    const c = this.ui.ctx;
    this.ui.clear();
    const uiK = 1 - shrink;
    if (t > T_DEV + 0.3 && uiK > 0) {
      for (const p of this.panels) {
        const k = ease.outCubic(clamp((t - (p.t0 + 0.45)) / 0.3)) * uiK;
        if (k <= 0) continue;
        const rc = panelRect(p.i, p.j);
        const [x, y] = this.worldToScreen(t, rc.x, rc.y);
        const w = rc.w * cam.s, h = rc.h * cam.s;
        if (x > 1960 || y > 1120 || x + w < -40 || y + h < -60) continue;
        c.globalAlpha = k;
        c.strokeStyle = 'rgba(239,233,223,0.28)'; c.lineWidth = 1;
        c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
        const s = cam.s;
        const ay = y + h + 22 * s;
        c.fillStyle = p.hue; c.beginPath(); c.arc(x + 9 * s, ay, 8 * s, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(239,233,223,0.6)'; c.lineWidth = 1; c.stroke();
        setText(c, { fam: 'mono', px: 14 * s, weight: 400, baseline: 'middle' });
        c.fillStyle = 'rgba(239,233,223,0.82)';
        c.fillText('@' + p.handle, x + 24 * s, ay + 0.5);
        // likes: a tiny heart + count, right aligned
        const likes = p.likes >= 1000 ? (p.likes / 1000).toFixed(1) + 'k' : String(p.likes);
        setText(c, { fam: 'mono', px: 13 * s, weight: 400, baseline: 'middle', align: 'right' });
        c.fillStyle = 'rgba(143,138,131,0.95)';
        c.fillText(likes, x + w, ay + 0.5);
        const tw = c.measureText(likes).width, hx = x + w - tw - 14 * s, hy = ay;
        const lk = t > CUE.community ? 0.5 + 0.5 * Math.sin((t - p.t0) * 9) ** 8 : 0;
        c.fillStyle = lk > 0.6 ? PAL.line : 'rgba(143,138,131,0.95)';
        c.beginPath();
        const hs = 5 * s;
        c.moveTo(hx, hy + hs * 0.9); c.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.6, hy - hs * 1.3, hx, hy - hs * 0.4);
        c.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.3, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs * 0.9); c.fill();
      }
      // collections: a few groups held by a thin bracket
      const groups: [number, number, number][] = [[-2, -1, 3], [1, 1, 2], [-3, 1, 2], [2, -2, 3]];
      for (const [gi, gj, n] of groups) {
        const k = ease.outCubic(clamp((t - (CUE.community + 0.3 + (gi + 4) * 0.05)) / 0.35)) * uiK;
        if (k <= 0) continue;
        const rc = panelRect(gi, gj);
        const [x, y] = this.worldToScreen(t, rc.x - 14, rc.y - 14);
        const w = (PX * (n - 1) + PW_ + 28) * cam.s * k, h = (PH_ + 58) * cam.s;
        c.globalAlpha = 0.9;
        c.strokeStyle = 'rgba(239,233,223,0.35)'; c.setLineDash([3, 5]); c.lineWidth = 1;
        c.beginPath(); c.roundRect(x, y, w, h, 6 * cam.s); c.stroke(); c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
    this.ctx.comp.draw(r, this.ui.upload(), out);

    // ---- community: the line becomes the threads between people ----
    const nb = this.net;
    nb.clear();
    const fadeNet = 1 - smoothstep(T_SHRINK, T_END - 0.1, t);
    if (t > CUE.community && fadeNet > 0) {
      for (const e of this.edges) {
        const g = ease.inOutCubic(clamp((t - e.t0) / 0.32));
        if (g <= 0) continue;
        const A = this.avatar(e.a), B = this.avatar(e.b);
        const mx = (A[0] + B[0]) / 2 - (B[1] - A[1]) * e.bend, my = (A[1] + B[1]) / 2 + (B[0] - A[0]) * e.bend;
        const N = 22, pts: V2[] = [];
        for (let s = 0; s <= N * g; s++) {
          const q = s / N, u2 = 1 - q;
          const wx = u2 * u2 * A[0] + 2 * u2 * q * mx + q * q * B[0], wy = u2 * u2 * A[1] + 2 * u2 * q * my + q * q * B[1];
          pts.push(this.worldToScreen(t, wx, wy));
        }
        nb.polyline(pts, () => 1.25, () => rgba(RED, 0.78 * fadeNet, 1.05));
        // a pulse travelling along each finished thread
        if (g >= 1 && pts.length > 2) {
          const ph = ((t - e.t0 - 0.32) / 0.7) % 1;
          const pi = Math.floor(ph * (pts.length - 1));
          const [qx, qy] = pts[pi]!;
          nb.dot(qx, qy, 4.5, rgba(RED, fadeNet, 2.2));
        }
      }
      // avatars light up as they connect
      for (let k = 0; k < this.panels.length; k++) {
        const on = this.edges.some((e) => (e.a === k || e.b === k) && t > e.t0 + 0.3);
        if (!on) continue;
        const [x, y] = this.worldToScreen(t, ...this.avatar(k));
        nb.dot(x, y, 20 * cam.s, rgba(RED, 0.35 * fadeNet, 1));
      }
    }
    nb.render(r, out);

    // ---- the line's head ----
    const m = this.motif;
    m.clear();
    const pts: V2[] = [];
    for (let j = 24; j >= 0; j--) { const tj = Math.max(CUE.pixels, t - (0.28 * j) / 24); pts.push(this.worldToScreen(t, ...this.headPath(tj))); }
    m.trail(pts, 2.2, 1.4);
    const hp = this.worldToScreen(t, ...this.headPath(t));
    m.head(hp[0], hp[1], 1.15, 1);
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    return { bloom: 0.5, bloomThreshold: 0.9, vignette: 0.35, grain: 0.04, warmth: 0.05 };
  }
}

export const _ = { BONE, TILE_W, TILE_H };
