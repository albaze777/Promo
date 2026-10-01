// 03 HUMAN — matter → human → expression.
// The terrain field re-forms, in the same contour language, into the relief of a hand reaching in. The red
// coastline drains into the fingertip (the line is picked up), and the finger draws the first mark: a
// circle of ochre pigment. The hand withdraws into the ground, which settles into a stone wall.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, canvasTexture, W, H } from '../engine/gl';
import { TopoPass, defaultTopo, HAND_TIP } from '../shaders/topo';
import { LineMotif, arc } from '../motifs/line';
import { WORLD, rotAt, dive, MARK, MARK_START } from '../motifs/world';
import { makeCanvas, paintFirstMark } from '../art/paint';
import { CUE } from '../timeline/cues';
import { clamp, ease, keys, lerp, smoothstep, TAU } from '../utils/math';

const HAND_ROT = 2.62;
const HAND_SCALE = 1.55;
const STROKE0 = CUE.mark, STROKE1 = CUE.markEnd;

/** Angular reveal of a texture around a centre, clockwise from a start angle (screen y down). */
export class AngleReveal {
  pass = new FSPass(/* glsl */ `
    uniform sampler2D tex; uniform vec2 c; uniform float a0, prog, opacity, soft;
    void main() {
      vec2 px = FRAG_PX;
      vec4 s = texture(tex, vUv);
      float a = atan(px.y - c.y, px.x - c.x);
      float d = mod(a - a0 + 0.02, TAU) / TAU;     // 0..1 clockwise from start
      float m = smoothstep(prog + soft, prog, d);
      if (prog >= 1.0) m = 1.0;
      float al = s.a * m * opacity;
      fragColor = vec4(s.rgb * al, al);
    }`, { tex: { value: null }, c: { value: new THREE.Vector2() }, a0: { value: 0 }, prog: { value: 0 }, opacity: { value: 1 }, soft: { value: 0.01 } },
    { blending: THREE.CustomBlending, transparent: true, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, tex: THREE.Texture, c: [number, number], a0: number, prog: number, opacity = 1) {
    const u = this.pass.u;
    u.tex!.value = tex; (u.c!.value as THREE.Vector2).set(c[0], c[1]); u.a0!.value = a0; u.prog!.value = prog; u.opacity!.value = opacity;
    this.pass.render(r, out);
  }
}

export default class SceneHuman extends Scene {
  override handlesTransition = true;
  topo = new TopoPass();
  motif = new LineMotif();
  reveal = new AngleReveal();
  s = defaultTopo();
  markTex!: THREE.Texture;

  override init() {
    const { c, ctx } = makeCanvas(W, H);
    paintFirstMark(ctx, MARK.cx, MARK.cy, MARK.r, MARK.startAngle);
    this.markTex = canvasTexture(c);
  }

  /** Stroke progress 0..1 (the finger drawing the circle). */
  strokeK(t: number) { return ease.inOutSine(clamp((t - STROKE0) / (STROKE1 - STROKE0))); }

  /** Fingertip on screen. */
  tip(t: number): [number, number] {
    const k = this.strokeK(t);
    const a = MARK.startAngle + TAU * 0.985 * k;
    const onRing: [number, number] = [MARK.cx + Math.cos(a) * MARK.r, MARK.cy + Math.sin(a) * MARK.r];
    // before touching, the finger hovers just above (up-right) and settles onto the point
    const settle = ease.outCubic(clamp((t - CUE.human) / (CUE.touch - CUE.human)));
    const hover: [number, number] = [MARK_START[0] + 70 * (1 - settle), MARK_START[1] - 46 * (1 - settle)];
    if (t < STROKE0) return hover;
    // after the stroke the hand lifts away up-right
    const lift = ease.inOutCubic(clamp((t - STROKE1 - 0.05) / 0.5));
    return [onRing[0] + 240 * lift, onRing[1] - 170 * lift];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, s = this.s;
    const d = dive(t);
    s.center = d.center; s.radius = d.radius; s.zoom = d.zoom;
    s.rot = rotAt(t); s.land.copy(WORLD.land); s.sea = WORLD.sea;
    s.life = 3; s.redCoast = 1; s.reveal = 1; s.atmo = 0;
    s.warm = keys(t, [[CUE.human, 0.35], [CUE.touch, 0.85], [CUE.art0, 1.0]]);
    // the hand rises out of the ground, draws, then sinks back
    const rise = ease.outCubic(clamp((t - CUE.human) / 0.6));
    const sink = ease.inOutCubic(clamp((t - (STROKE1 + 0.05)) / 0.55));
    s.handMix = rise * (1 - sink);
    const tp = this.tip(t);
    const k = this.strokeK(t);
    const rot = HAND_ROT + 0.16 * Math.sin(k * Math.PI) - 0.08 * (1 - rise);
    s.handRot = rot; s.handScale = HAND_SCALE;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const tx = HAND_TIP[0] * HAND_SCALE, ty = HAND_TIP[1] * HAND_SCALE;
    s.handPos = [tp[0] - (c * tx - sn * ty), tp[1] - (sn * tx + c * ty)];
    // the red coast drains into the fingertip
    s.drainCenter = MARK_START;
    s.drainR = lerp(2600, 0, ease.inCubic(clamp((t - (CUE.human + 0.2)) / (CUE.touch - CUE.human - 0.2))));
    s.stone = ease.inOutCubic(clamp((t - (STROKE1 - 0.1)) / 0.6));
    this.topo.render(r, out, s);

    // the first mark: revealed by the finger
    if (t >= STROKE0) this.reveal.render(r, out, this.markTex, [MARK.cx, MARK.cy], MARK.startAngle, k, 0.92);

    // the line: drained into the fingertip, then the pen
    const m = this.motif;
    m.clear();
    const charge = smoothstep(CUE.human + 0.2, CUE.touch, t);
    if (t < STROKE0) {
      const touch = t >= CUE.touch ? Math.exp(-(t - CUE.touch) / 0.12) : 0;
      m.head(MARK_START[0], MARK_START[1], 0.9 + 0.5 * charge + 1.2 * touch, 1 + 0.4 * touch);
    } else {
      const a = MARK.startAngle + TAU * 0.985 * k;
      const back = Math.min(1.1, TAU * 0.985 * k);
      if (back > 0.01) m.trail(arc(MARK.cx, MARK.cy, MARK.r, a - back, a, 90), 2.2, 1.3);
      const fade = 1 - smoothstep(STROKE1 + 0.25, CUE.art0 + 0.25, t) * 0.25;
      m.head(MARK.cx + Math.cos(a) * MARK.r, MARK.cy + Math.sin(a) * MARK.r, 1.2 * fade, 1);
    }
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    return { bloom: 0.6, bloomThreshold: 0.85, vignette: 0.5, grain: 0.055, warmth: 0.35 + 0.65 * s.warm };
  }
}
