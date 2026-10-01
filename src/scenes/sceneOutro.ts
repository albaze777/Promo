// 07 OREDLAB — everything returns to the point; the point draws one last circle; the circle becomes the O.
// The collapse lands on exactly the position and size of the film's first frame (the rhyme). The ring is
// drawn by the line (red, cooling to bone), then shrinks into the O of the wordmark while "redLab" emerges
// from behind it. Tagline, URL, hold.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, RED, BONE, rgba, arc } from '../motifs/line';
import { setText, measure, type TextStyle } from '../typography/fonts';
import { BRAND } from '../brand';
import { CUE } from '../timeline/cues';
import { clamp, ease, lerp, smoothstep, TAU } from '../utils/math';

const T0 = CUE.collapse, T_POINT = CUE.collapse + 0.34, T_RING = CUE.ring, T_RING_END = CUE.ring + 0.42;
const T_WORD = CUE.wordmark, T_TAG = CUE.tagline, T_URL = CUE.url;
const DOT_ANGLE = -Math.PI / 3; // one o'clock
const R_BIG = 150;

export default class SceneOutro extends Scene {
  override handlesTransition = true;
  bg = new FSPass(`void main(){ fragColor = vec4(C_INK * 0.62, 1.0); }`);
  ring = new LineBatch(2048, { blend: 'normal' });
  motif = new LineMotif();
  ui = new Layer2D();
  // wordmark geometry (measured from the font at init)
  WM: TextStyle = { fam: 'display', px: 172, weight: 600, track: -0.012 };
  wm = { x0: 0, base: 0, oCx: 0, oCy: 0, oR: 0, stem: 0, restX: 0, total: 0 };

  override init() {
    const c = this.ui.ctx;
    // measure the O: its box and its stem thickness, so the drawn ring matches the typeface
    const big = document.createElement('canvas');
    big.width = 800; big.height = 800;
    const bc = big.getContext('2d', { willReadFrequently: true })!;
    setText(bc, { ...this.WM, px: 400, baseline: 'alphabetic' });
    bc.fillStyle = '#fff';
    bc.fillText(BRAND.wordmark.ring, 100, 600);
    const mO = bc.measureText(BRAND.wordmark.ring);
    const img = bc.getImageData(0, 0, 800, 800).data;
    const midY = Math.round(600 - (mO.actualBoundingBoxAscent - mO.actualBoundingBoxDescent) / 2);
    let x = 0; while (x < 800 && img[(midY * 800 + x) * 4 + 3]! < 128) x++;
    let x2 = x; while (x2 < 800 && img[(midY * 800 + x2) * 4 + 3]! >= 128) x2++;
    const k = this.WM.px / 400;
    const stem = (x2 - x) * k;
    const oH = (mO.actualBoundingBoxAscent + mO.actualBoundingBoxDescent) * k;
    const oW = (mO.actualBoundingBoxRight + mO.actualBoundingBoxLeft) * k;
    const oR = (oH + oW) / 4 - stem / 2; // centre-line radius
    const advO = measure(c, BRAND.wordmark.ring + BRAND.wordmark.rest, this.WM) - measure(c, BRAND.wordmark.rest, this.WM);
    const total = advO + measure(c, BRAND.wordmark.rest, this.WM);
    const x0 = 960 - total / 2;
    const base = 532;
    const bearingL = (mO.actualBoundingBoxLeft < 0 ? -mO.actualBoundingBoxLeft : 0) * k;
    this.wm = {
      x0, base, stem, oR, total,
      oCx: x0 + bearingL + oW / 2,
      oCy: base - (mO.actualBoundingBoxAscent - mO.actualBoundingBoxDescent) * k / 2,
      restX: x0 + advO,
    };
  }

  /** Ring centre / radius / width over time: drawn big at the centre, then settles into the O. */
  ringState(t: number) {
    const k = ease.inOutCubic(clamp((t - T_WORD + 0.08) / 0.5));
    const w = this.wm;
    return {
      cx: lerp(960, w.oCx, k), cy: lerp(540, w.oCy, k), r: lerp(R_BIG, w.oR, k), width: lerp(3.2, w.stem, ease.inCubic(k)), k,
    };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t;
    this.bg.render(r, out);

    // ---- collapse: the whole previous image returns into the point ----
    if (f.under && t < T_POINT) {
      const k = ease.inExpo(clamp((t - T0) / (T_POINT - T0)));
      this.ctx.comp.draw(r, f.under, out, { mode: 'normal', scale: Math.max(0.0005, 1 - k), origin: [960, 540], opacity: 1 - smoothstep(0.85, 1, k), premult: true });
    }

    const rs = this.ringState(t);
    const rb = this.ring, m = this.motif;
    rb.clear(); m.clear();
    // the drawn ring: red at the pen, cooling to bone behind it
    const drawK = ease.inOutCubic(clamp((t - T_RING) / (T_RING_END - T_RING)));
    let headA = DOT_ANGLE, hx = 960, hy = 540;
    if (t < T_RING) {
      // the point travels from the centre out to the ring's start
      const g = ease.inOutCubic(clamp((t - (T_RING - 0.1)) / 0.1));
      hx = 960 + Math.cos(DOT_ANGLE) * R_BIG * g; hy = 540 + Math.sin(DOT_ANGLE) * R_BIG * g;
      if (g > 0) m.trail([[960, 540], [hx, hy]], 2.2, 1.2);
    } else {
      headA = DOT_ANGLE + TAU * drawK;
      const n = 220, pts = arc(rs.cx, rs.cy, rs.r, DOT_ANGLE, DOT_ANGLE + TAU * drawK, n);
      const cool = smoothstep(T_RING_END - 0.05, T_WORD + 0.15, t);
      rb.polyline(pts, () => rs.width, (q) => {
        const hot = (1 - cool) * Math.pow(q, 6);
        return [lerp(BONE[0], RED[0] * 1.6, hot), lerp(BONE[1], RED[1] * 1.6, hot), lerp(BONE[2], RED[2] * 1.6, hot), 1];
      });
      hx = rs.cx + Math.cos(headA) * rs.r; hy = rs.cy + Math.sin(headA) * rs.r;
    }
    // the brand dot: a solid red disc sitting on the O (opaque over the ring)
    if (rs.k > 0) rb.dot(hx, hy, this.wm.stem * 1.2 * rs.k, rgba(RED, 1, 1.0));
    rb.render(r, out);

    // ---- wordmark, tagline, url ----
    const c = this.ui.ctx;
    this.ui.clear();
    const w = this.wm;
    const wk = ease.outCubic(clamp((t - (T_WORD + 0.2)) / 0.45));
    if (wk > 0) {
      // "redLab" emerges from behind the O: each letter slides out from the ring, masked at the ring's edge
      setText(c, this.WM);
      c.save();
      c.beginPath(); c.rect(rs.cx, 0, 1920, 1080); c.clip();
      const slide = (1 - wk) * -150;
      c.fillStyle = `rgba(239,233,223,${Math.min(1, wk * 1.4)})`;
      c.fillText(BRAND.wordmark.rest, w.restX + slide, w.base);
      c.restore();
    }
    const tk = ease.outCubic(clamp((t - T_TAG) / 0.5));
    if (tk > 0) {
      setText(c, { fam: 'display', px: 27, weight: 500, track: 0.34 + 0.06 * (1 - tk), align: 'center', baseline: 'alphabetic' });
      c.fillStyle = `rgba(239,233,223,${0.92 * tk})`;
      c.fillText(BRAND.tagline, 960 + 0.17 * 27, w.base + 104 + 8 * (1 - tk));
    }
    const uk = ease.outCubic(clamp((t - T_URL) / 0.5));
    if (uk > 0) {
      setText(c, { fam: 'mono', px: 22, weight: 400, track: 0.1, align: 'center', baseline: 'alphabetic' });
      c.fillStyle = `rgba(143,138,131,${uk})`;
      c.fillText(BRAND.url, 960 + 0.05 * 22, w.base + 166 + 6 * (1 - uk));
    }
    this.ctx.comp.draw(r, this.ui.upload(), out);

    // ---- the point: the film's first frame, then the pen, then the brand's dot on the O ----
    const settle = ease.inOutCubic(clamp((t - T_RING_END) / 0.35));
    if (t >= T_RING) {
      const back = Math.min(1.4, TAU * drawK);
      if (drawK < 1 && back > 0.02) m.trail(arc(rs.cx, rs.cy, rs.r, headA - back, headA, 60), 2.4, 1.3);
    }
    const flare = t > T_POINT - 0.08 ? Math.exp(-Math.max(0, t - T_POINT) / 0.1) * smoothstep(T_POINT - 0.1, T_POINT, t) : 0;
    const coll = smoothstep(T_POINT - 0.12, T_POINT, t);
    const dotSize = lerp(1, (w.stem * 0.9) / 9, rs.k);
    m.head(hx, hy, lerp(1.1, 0.24, settle) * coll + 1.6 * flare, dotSize * (1 + 0.6 * flare));
    m.render(r, out);

    return { bloom: 0.55, bloomThreshold: 0.9, vignette: 0.42, grain: 0.035, warmth: 0 };
  }
}
