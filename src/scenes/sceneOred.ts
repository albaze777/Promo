// 06 ORED — built from scratch.
// The film changes language: ink, bone hairlines, mono type, red construction lines. Raw characters →
// tokens (with IDs) → column vectors → points in space → layers built one by one along a red path,
// joined to the layer below (with a few attention arcs) → the camera rises over the stack's axis, the
// nodes fall onto one ring, and a single rule (connect n to k·n) draws an emergent pattern. Over it the
// name is constructed on its typographic guides.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, RED, BONE, ASH, rgba } from '../motifs/line';
import { INPUT, CHAR_CELL, CHAR_Y, charPos } from '../motifs/ored';
import { setText, measure } from '../typography/fonts';
import { BRAND, PAL } from '../brand';
import { CUE } from '../timeline/cues';
import { Rng, clamp, ease, keys, lerp, smoothstep, TAU, type V2 } from '../utils/math';

const T_IN = CUE.ored, T_CHARS = CUE.ored + 0.38, T_TOK = CUE.tokens, T_VEC = CUE.embed, T_LAY = CUE.layers;
const T_PAT = CUE.pattern, T_NAME = CUE.oredName, T_OUT = CUE.collapse;
const TOKENS = [{ s: 'art', a: 0 }, { s: ' has', a: 3 }, { s: ' no', a: 7 }, { s: ' lim', a: 10 }, { s: 'its', a: 14 }];
const TOKEN_IDS = [1428, 702, 645, 2951, 1147];
const DIM = 8;
const LAYERS = 5;
const LAYER_N = [40, 32, 24, 16, 10];
const LAYER_R = [430, 350, 270, 190, 110];
const LAYER_Y = [-150, -75, 0, 75, 150];
const RING_N = 144, RING_R = 330;

interface Node { L: number; k: number; x: number; y: number; z: number }

export default class SceneOred extends Scene {
  override handlesTransition = true;
  bg = new FSPass(/* glsl */ `
    uniform float gridK;
    void main() {
      vec2 p = FRAG_PX;
      vec3 c = C_INK * 0.62;
      // a faint engineering grid: the drawing board Ored is built on
      vec2 g = abs(fract(p / 66.0 + 0.5) - 0.5) * 66.0;
      c += C_BONE * 0.018 * gridK * sat(1.0 - min(g.x, g.y));
      fragColor = vec4(c, 1.0);
    }`, { gridK: { value: 0 } });
  lines = new LineBatch(30000);
  dots = new LineBatch(4000, { soft: true });
  motif = new LineMotif();
  ui = new Layer2D();
  nodes: Node[] = [];
  vecVals: number[][] = [];
  links: { a: number; b: number; t0: number; attn: boolean }[] = [];

  override init() {
    const rng = new Rng(77);
    this.vecVals = TOKENS.map(() => Array.from({ length: DIM }, () => rng.next()));
    for (let L = 0; L < LAYERS; L++) for (let k = 0; k < LAYER_N[L]!; k++) {
      const a = (k / LAYER_N[L]!) * TAU + L * 0.21;
      this.nodes.push({ L, k, x: Math.cos(a) * LAYER_R[L]!, y: LAYER_Y[L]!, z: Math.sin(a) * LAYER_R[L]! });
    }
    const base = (L: number) => LAYER_N.slice(0, L).reduce((s, n) => s + n, 0);
    for (let L = 0; L < LAYERS - 1; L++) {
      const n0 = LAYER_N[L]!, n1 = LAYER_N[L + 1]!;
      for (let k = 0; k < n0; k++) {
        const f = (k / n0) * n1;
        for (const kk of [Math.floor(f), Math.ceil(f) % n1]) this.links.push({ a: base(L) + k, b: base(L + 1) + kk, t0: this.layerT(L + 1) + (k / n0) * 0.1, attn: false });
      }
      for (let q = 0; q < 3; q++) {
        const a = rng.int(0, n1 - 1), b = (a + rng.int(3, n1 - 3)) % n1;
        this.links.push({ a: base(L + 1) + a, b: base(L + 1) + b, t0: this.layerT(L + 1) + 0.08 + q * 0.03, attn: true });
      }
    }
  }

  layerT(L: number) { return T_LAY - 0.12 + L * 0.1; }

  /** Pseudo-3D camera: pitch rises from front view to top view over the stack. */
  view(t: number) {
    const pitch = keys(t, [[T_LAY - 0.15, 0], [T_LAY + 0.3, 0.5, ease.inOutCubic], [T_PAT - 0.05, 0.62, ease.linear], [T_PAT + 0.3, Math.PI / 2, ease.inOutCubic]]);
    const yaw = 0.35 * ease.inOutSine(clamp((t - T_LAY) / (T_NAME - T_LAY)));
    return { pitch, yaw, F: 1500, D: 1500 };
  }
  project(t: number, x: number, y: number, z: number): [number, number, number] {
    const v = this.view(t);
    const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    const y2 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp;
    const s = v.F / (v.D + z2);
    // front view: layer 0 sits just under the token row; top view: centred
    return [960 + x1 * s, 540 - y2 * s + 90 * (1 - sp), s];
  }

  /** Node position with the fall onto the single ring during the pattern phase. */
  nodePos(t: number, i: number): [number, number, number] {
    const n = this.nodes[i]!;
    let p = this.project(t, n.x, n.y, n.z);
    const k = ease.inOutCubic(clamp((t - (T_PAT + 0.18)) / 0.32));
    if (k > 0) {
      const a = (i / this.nodes.length) * TAU - Math.PI / 2;
      p = [lerp(p[0], 960 + Math.cos(a) * RING_R, k), lerp(p[1], 540 + Math.sin(a) * RING_R, k), p[2]];
    }
    return p;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t;
    this.bg.u.gridK!.value = smoothstep(T_IN, T_CHARS, t) * (1 - smoothstep(T_PAT, T_NAME, t) * 0.6);
    this.bg.render(r, out);
    const L = this.lines, D = this.dots, m = this.motif, c = this.ui.ctx;
    L.clear(); D.clear(); m.clear(); this.ui.clear();
    const fadeName = smoothstep(T_NAME, T_NAME + 0.3, t);

    // ---- characters → tokens ------------------------------------------------------
    const charA = smoothstep(T_IN + 0.15, T_CHARS, t) * (1 - smoothstep(T_VEC + 0.25, T_LAY, t));
    const tokK = ease.inOutCubic(clamp((t - T_TOK) / 0.3));
    if (charA > 0) {
      setText(c, { fam: 'mono', px: 44, weight: 400, align: 'center', baseline: 'middle' });
      for (let i = 0; i < INPUT.length; i++) {
        const ch = INPUT[i]!;
        const [x, y] = charPos(i);
        // tokenisation packs characters toward their token's centre
        const tok = TOKENS.findIndex((tk) => i >= tk.a && i < tk.a + tk.s.length);
        const tk = TOKENS[tok]!;
        const tc = charPos(tk.a)[0] + ((tk.s.length - 1) * CHAR_CELL) / 2;
        const xx = lerp(x, tc + (x - tc) * 0.62 + (tok - 2) * 34, tokK);
        if (ch !== ' ') {
          c.fillStyle = `rgba(239,233,223,${0.92 * charA})`;
          c.fillText(ch, xx, y + 2);
        }
        // the raw cell box (before tokens)
        const cellA = charA * (1 - tokK) * 0.35;
        if (cellA > 0.01) { c.strokeStyle = `rgba(143,138,131,${cellA})`; c.lineWidth = 1; c.strokeRect(x - 26 + 0.5, y - 30 + 0.5, 52, 60); }
      }
      // token brackets + ids
      if (tokK > 0) {
        TOKENS.forEach((tk, n) => {
          const k = ease.outCubic(clamp((t - (T_TOK + n * 0.05)) / 0.28));
          if (k <= 0) return;
          const tc = charPos(tk.a)[0] + ((tk.s.length - 1) * CHAR_CELL) / 2 + (n - 2) * 34;
          const w = (tk.s.length * CHAR_CELL * 0.62 + 24) * k, h = 74;
          c.strokeStyle = `rgba(239,233,223,${0.7 * charA})`; c.lineWidth = 1.2;
          c.beginPath(); c.roundRect(tc - w / 2, CHAR_Y - h / 2, w, h, 8); c.stroke();
          setText(c, { fam: 'mono', px: 15, weight: 400, align: 'center', baseline: 'middle', track: 0.08 });
          c.fillStyle = `rgba(143,138,131,${k * charA})`;
          c.fillText(String(TOKEN_IDS[n]), tc, CHAR_Y + 56);
        });
      }
    }

    // ---- vectors: each token unfolds into a column of values, then the values lift off as points ----
    const vecK = ease.outCubic(clamp((t - T_VEC) / 0.25));
    const liftK = ease.inOutCubic(clamp((t - (T_LAY - 0.2)) / 0.4));
    const layer0 = this.nodes.filter((n) => n.L === 0).length;
    if (vecK > 0 && liftK < 1) {
      TOKENS.forEach((tk, n) => {
        const tc = charPos(tk.a)[0] + ((tk.s.length - 1) * CHAR_CELL) / 2 + (n - 2) * 34;
        for (let d = 0; d < DIM; d++) {
          const k = ease.outCubic(clamp((t - (T_VEC + d * 0.025 + n * 0.02)) / 0.2));
          if (k <= 0) continue;
          const v = this.vecVals[n]![d]!;
          const x0 = tc, y0 = CHAR_Y + 92 + d * 22;
          const target = this.nodePos(t, (n * DIM + d) % layer0);
          const x = lerp(x0, target[0], liftK), y = lerp(y0, target[1], liftK);
          const sz = lerp(16, 6, liftK);
          // a value cell: a square whose fill is the value
          if (liftK < 0.6) {
            const a = (1 - liftK / 0.6) * k;
            c.strokeStyle = `rgba(239,233,223,${0.5 * a})`; c.lineWidth = 1;
            c.strokeRect(x - sz / 2 + 0.5, y - sz / 2 + 0.5, sz, sz);
            c.fillStyle = `rgba(239,233,223,${(0.15 + 0.8 * v) * a})`;
            const inner = sz * (0.25 + 0.6 * v);
            c.fillRect(x - inner / 2, y - inner / 2, inner, inner);
          }
          if (liftK > 0.2) D.dot(x, y, 7, rgba(BONE, 1, 0.8 * smoothstep(0.2, 0.6, liftK)));
        }
      });
    }

    // ---- layers: built bottom → top along the red path ---------------------------
    const nodeA = (i: number) => {
      const n = this.nodes[i]!;
      return n.L === 0 ? smoothstep(T_LAY + 0.1, T_LAY + 0.2, t) : ease.outCubic(clamp((t - this.layerT(n.L)) / 0.12));
    };
    const patK = ease.inOutCubic(clamp((t - (T_PAT + 0.18)) / 0.32));
    if (t > T_LAY - 0.05) {
      const dimForName = 1 - fadeName * 0.55;
      // layer outlines (ellipses in perspective)
      for (let l = 0; l < LAYERS; l++) {
        const k = ease.outCubic(clamp((t - this.layerT(l)) / 0.25)) * (1 - patK);
        if (k <= 0) continue;
        const pts: number[][] = [];
        for (let s = 0; s <= 96 * k; s++) {
          const a = (s / 96) * TAU + l * 0.21;
          const p = this.project(t, Math.cos(a) * (LAYER_R[l]! + 26), LAYER_Y[l]!, Math.sin(a) * (LAYER_R[l]! + 26));
          pts.push([p[0], p[1]]);
        }
        L.polyline(pts, () => 1, () => rgba(ASH, 0.35 * dimForName));
      }
      // links between layers + attention arcs within a layer
      for (const e of this.links) {
        const g = ease.inOutCubic(clamp((t - e.t0) / 0.16));
        if (g <= 0) continue;
        const A = this.nodePos(t, e.a), B = this.nodePos(t, e.b);
        if (e.attn) {
          const mx = (A[0] + B[0]) / 2, my = Math.min(A[1], B[1]) - 60 * (1 - patK) - 30;
          const pts: number[][] = [];
          for (let s = 0; s <= 20 * g; s++) { const q = s / 20, u = 1 - q; pts.push([u * u * A[0] + 2 * u * q * mx + q * q * B[0], u * u * A[1] + 2 * u * q * my + q * q * B[1]]); }
          L.polyline(pts, () => 1.2, () => rgba(RED, 0.7 * (1 - patK) * dimForName, 1.1));
        } else {
          L.seg2(A[0], A[1], lerp(A[0], B[0], g), lerp(A[1], B[1], g), 1, rgba(BONE, 0.22 * (1 - patK * 0.9) * dimForName));
        }
      }
      for (let i = 0; i < this.nodes.length; i++) {
        const a = nodeA(i);
        if (a <= 0) continue;
        const p = this.nodePos(t, i);
        D.dot(p[0], p[1], 6.5, rgba(BONE, 1, 0.85 * a * dimForName));
      }
    }

    // ---- the emergent pattern: chords n → k·n on the ring ----------------------------
    if (patK > 0) {
      const mult = keys(t, [[T_PAT + 0.3, 2], [T_OUT, 2.9, ease.inOutSine]]);
      const drawn = ease.inOutCubic(clamp((t - (T_PAT + 0.3)) / 0.4));
      const ringPt = (q: number): V2 => { const a = (q / RING_N) * TAU - Math.PI / 2; return [960 + Math.cos(a) * RING_R, 540 + Math.sin(a) * RING_R]; };
      const dim = 1 - fadeName * 0.5;
      for (let q = 0; q < RING_N * drawn; q++) {
        const [ax, ay] = ringPt(q), [bx, by] = ringPt((q * mult) % RING_N);
        L.seg2(ax, ay, bx, by, 1, rgba(BONE, 0.2 * patK * dim));
      }
      const ring: number[][] = [];
      for (let s = 0; s <= 240; s++) { const a = (s / 240) * TAU; ring.push([960 + Math.cos(a) * RING_R, 540 + Math.sin(a) * RING_R]); }
      L.polyline(ring, () => 1.1, () => rgba(BONE, 0.5 * patK * dim));
    }

    // ---- ORED, constructed on its guides ------------------------------------------------
    if (t > T_NAME - 0.05) {
      const S = { fam: 'mono' as const, px: 150, weight: 500, track: 0.32 };
      const word = BRAND.ai;
      const w = measure(c, word, S);
      const x0 = 960 - w / 2, base = 540 + 52, cap = base - 150 * 0.7;
      const gK = ease.outCubic(clamp((t - T_NAME) / 0.22));
      const gOut = ease.inOutCubic(clamp((t - (T_NAME + 0.42)) / 0.22));
      const ga = (1 - gOut);
      const red = (a: number) => `rgba(255,59,46,${a})`;
      c.strokeStyle = red(0.75 * ga); c.lineWidth = 1;
      // horizontal guides: cap height, baseline (they draw outward from the centre)
      for (const y of [cap, base]) { c.beginPath(); c.moveTo(960 - (w / 2 + 80) * gK, y + 0.5); c.lineTo(960 + (w / 2 + 80) * gK, y + 0.5); c.stroke(); }
      // letter boxes
      setText(c, S);
      let x = x0;
      for (let i = 0; i < word.length; i++) {
        const adv = measure(c, word[i]!, { ...S, track: 0 });
        const k = ease.outCubic(clamp((t - (T_NAME + 0.05 + i * 0.04)) / 0.16));
        if (k > 0) { c.strokeStyle = red(0.6 * ga * k); c.strokeRect(x + 0.5, cap + 0.5, adv, (base - cap) * k); }
        // fill: wipe each letter upward within its box
        const fk = ease.inOutCubic(clamp((t - (T_NAME + 0.14 + i * 0.05)) / 0.18));
        if (fk > 0) {
          c.save(); c.beginPath(); c.rect(x - 4, base + 30 - (base - cap + 60) * fk, adv + 8, (base - cap + 60) * fk); c.clip();
          c.fillStyle = '#EFE9DF'; c.fillText(word[i]!, x, base);
          c.restore();
        }
        x += adv + S.track * S.px;
      }
      // subline
      const sk = ease.outCubic(clamp((t - (T_NAME + 0.38)) / 0.25));
      if (sk > 0) {
        setText(c, { fam: 'mono', px: 19, weight: 400, track: 0.42, align: 'center', baseline: 'middle' });
        c.fillStyle = `rgba(143,138,131,${sk})`;
        c.fillText(BRAND.aiLine, 960 + 0.21 * 19, base + 62 + 6 * (1 - sk));
      }
    }

    L.render(r, out);
    D.render(r, out);
    this.ctx.comp.draw(r, this.ui.upload(), out);

    // ---- the line: the construction path ---------------------------------------------
    const head = this.headAt(t);
    const pts: number[][] = [];
    for (let j = 24; j >= 0; j--) { const tj = Math.max(T_IN, t - (0.25 * j) / 24); pts.push(this.headAt(tj)); }
    m.trail(pts, 2.2, 1.4);
    m.head(head[0], head[1], 1.15, 1);
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    return { bloom: 0.55, bloomThreshold: 0.9, vignette: 0.4, grain: 0.04, warmth: -0.1 };
  }

  /** The head: first character → around the token boxes → down a vector → up the layers → around the ring → under the name. */
  headAt(t: number): number[] {
    const tokX = (n: number) => charPos(TOKENS[n]!.a)[0] + ((TOKENS[n]!.s.length - 1) * CHAR_CELL) / 2 + (n - 2) * 34;
    const ws: [number, number, number][] = [[T_IN, ...charPos(0)], [T_CHARS, ...charPos(0)]];
    ws.push([T_CHARS + 0.08, charPos(0)[0] - 30, CHAR_Y - 37]);
    let tt = T_TOK;
    TOKENS.forEach((_, n) => { tt += 0.085; ws.push([tt, tokX(n) + (n % 2 ? 30 : -30), n % 2 ? CHAR_Y + 37 : CHAR_Y - 37]); });
    ws.push([T_VEC + 0.05, tokX(4), CHAR_Y + 92]);
    ws.push([T_VEC + 0.3, tokX(4), CHAR_Y + 92 + 7 * 22]);
    // up the layers: one node per layer, as each layer is built
    for (let l = 0; l < LAYERS; l++) {
      const idx = LAYER_N.slice(0, l).reduce((s, n) => s + n, 0) + Math.floor(LAYER_N[l]! * 0.3);
      const n = this.nodes[idx]!;
      const p = this.project(this.layerT(l) + 0.06, n.x, n.y, n.z);
      ws.push([this.layerT(l) + 0.06, p[0], p[1]]);
    }
    // around the ring
    const a0 = -Math.PI / 2;
    for (let s = 1; s <= 12; s++) {
      const a = a0 + (s / 12) * TAU;
      ws.push([T_PAT + 0.3 + s * 0.04, 960 + Math.cos(a) * RING_R, 540 + Math.sin(a) * RING_R]);
    }
    // rest at the top of the ring (the origin point) while the name is built
    if (t <= ws[0]![0]) return [ws[0]![1], ws[0]![2]];
    for (let k = 1; k < ws.length; k++) {
      const [t1, x1, y1] = ws[k]!, [t0, x0, y0] = ws[k - 1]!;
      if (t <= t1) { const e = ease.inOutSine((t - t0) / Math.max(1e-4, t1 - t0)); return [lerp(x0, x1, e), lerp(y0, y1, e)]; }
    }
    const l = ws[ws.length - 1]!;
    return [l[1], l[2]];
  }
}

export const _ = { PAL };
