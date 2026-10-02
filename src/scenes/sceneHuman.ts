// 03 HUMAN — matter → human → expression.
// The terrain field re-forms, in the same contour language, into the relief of a hand reaching in. The red
// coastline drains into the fingertip (the line is picked up), and the finger draws the first mark: a
// circle of ochre pigment. The hand withdraws into the ground, which settles into a stone wall.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, canvasTexture, W, H } from '../engine/gl';
import { TopoPass, defaultTopo } from '../shaders/topo';
import { LineMotif, arc } from '../motifs/line';
import { WORLD, rotAt, dive, MARK, MARK_START } from '../motifs/world';
import { handPose, strokeK, markAngle } from '../motifs/hand';
import { makeCanvas, paintFirstMark } from '../art/paint';
import { CUE } from '../timeline/cues';
import { clamp, ease, keys, lerp, smoothstep, TAU } from '../utils/math';

const STROKE0 = CUE.mark, STROKE1 = CUE.markEnd;

/** Angular reveal of a texture around a centre from a start angle (screen y down; dir 1 = clockwise, −1 = counter-clockwise). */
export class AngleReveal {
  pass = new FSPass(/* glsl */ `
    uniform sampler2D tex; uniform vec2 c; uniform float a0, prog, opacity, soft, dir;
    void main() {
      vec2 px = FRAG_PX;
      vec4 s = texture(tex, vUv);
      float a = atan(px.y - c.y, px.x - c.x);
      float d = mod(dir * (a - a0) + 0.02, TAU) / TAU;     // 0..1 along the drawing direction from start
      float m = smoothstep(prog + soft, prog, d);
      if (prog >= 1.0) m = 1.0;
      float al = s.a * m * opacity;
      fragColor = vec4(s.rgb * al, al);
    }`, { tex: { value: null }, c: { value: new THREE.Vector2() }, a0: { value: 0 }, prog: { value: 0 }, opacity: { value: 1 }, soft: { value: 0.01 }, dir: { value: 1 } },
    { blending: THREE.CustomBlending, transparent: true, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, tex: THREE.Texture, c: [number, number], a0: number, prog: number, opacity = 1, dir = 1) {
    const u = this.pass.u;
    u.dir!.value = dir;
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
    paintFirstMark(ctx, MARK.cx, MARK.cy, MARK.r, MARK.startAngle, MARK.dir);
    this.markTex = canvasTexture(c);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, s = this.s;
    const d = dive(t);
    s.center = d.center; s.radius = d.radius; s.zoom = d.zoom;
    s.rot = rotAt(t); s.land.copy(WORLD.land); s.sea = WORLD.sea;
    s.life = 3; s.redCoast = 1; s.reveal = 1; s.atmo = 0; s.time = t;
    s.warm = keys(t, [[CUE.human, 0.35], [CUE.touch, 0.85], [CUE.art0, 1.0]]);
    // the hand arrives with the push-in of 03a (already risen), draws, then sinks back
    const sink = ease.inOutCubic(clamp((t - (STROKE1 + 0.05)) / 0.55));
    s.handMix = 1 - sink;
    const hp = handPose(t);
    const k = strokeK(t);
    s.handRot = hp.rot; s.handScale = hp.scale; s.handFlip = hp.flip; s.handPos = hp.pos;
    s.figMix = 0; s.handMorph = 1; s.echoR = 95; s.recede = 0.3; s.ghostA = [0, 0];
    // the red coast drains into the fingertip
    s.drainCenter = MARK_START;
    s.drainR = lerp(2600, 0, ease.inCubic(clamp((t - (CUE.human + 0.2)) / (CUE.touch - CUE.human - 0.2))));
    s.stone = ease.inOutCubic(clamp((t - (STROKE1 - 0.1)) / 0.6));
    this.topo.render(r, out, s);

    // the first mark: revealed by the finger
    if (t >= STROKE0) this.reveal.render(r, out, this.markTex, [MARK.cx, MARK.cy], MARK.startAngle, k, 0.92, MARK.dir);

    // the line: drained into the fingertip, then the pen
    const m = this.motif;
    m.clear();
    const charge = smoothstep(CUE.human + 0.2, CUE.touch, t);
    if (t < STROKE0) {
      const touch = t >= CUE.touch ? Math.exp(-(t - CUE.touch) / 0.12) : 0;
      m.head(MARK_START[0], MARK_START[1], 0.9 + 0.5 * charge + 1.2 * touch, 1 + 0.4 * touch);
    } else {
      const a = markAngle(k);
      const back = Math.min(1.1, TAU * 0.985 * k);
      if (back > 0.01) m.trail(arc(MARK.cx, MARK.cy, MARK.r, a - MARK.dir * back, a, 90), 2.2, 1.3);
      const fade = 1 - smoothstep(STROKE1 + 0.25, CUE.art0 + 0.25, t) * 0.25;
      m.head(MARK.cx + Math.cos(a) * MARK.r, MARK.cy + Math.sin(a) * MARK.r, 1.2 * fade, 1);
    }
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    return { bloom: 0.6, bloomThreshold: 0.85, vignette: 0.5, grain: 0.055, warmth: 0.35 + 0.65 * s.warm };
  }
}
