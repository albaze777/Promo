// 03a EVOLUTION — the ground learns to walk.
// The dive lands on the topography; the contour field rises into a figure in the same relief language as the
// hand: a knuckle-walking ape, then a hunched hominid, then an upright human — one continuous SDF morph of a
// single capsule rig while it walks left to right and the terrain scrolls under it. The line rides in its
// leading hand. Its earlier forms trail behind as fading contour echoes. The human stops, reaches forward and
// down, sets the point on the coast, and the camera pushes into the reaching hand, which re-forms into the
// hand of 03b.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { TopoPass, defaultTopo } from '../shaders/topo';
import { LineMotif } from '../motifs/line';
import { WORLD, rotAt, dive, evoPan, evoPush, MARK_START, PUSH_END } from '../motifs/world';
import { pose, NB, AVG_STRIDE, type P2, type Pose } from '../motifs/figure';
import { handPose, HOVER } from '../motifs/hand';
import { CUE } from '../timeline/cues';
import { clamp, ease, keys, lerp, smoothstep, TAU } from '../utils/math';

const H_PX = 420;          // human height on screen (px, before the push)
const X0 = 230;            // where the ape starts walking (screen x of the root)
const LAGS = [0.9, 1.8];   // ghost echoes (story s behind)

/** Morph m(t): ape 0 → hominid 1 → human 2. */
export const morphAt = (t: number) => keys(t, [[CUE.ape + 1.0, 0], [CUE.hominid + 0.45, 1, ease.inOutSine], [CUE.sapiens - 0.55, 1], [CUE.sapiens + 0.45, 2, ease.inOutSine]]);
const ampAt = (t: number) => Math.min(ease.inOutSine(clamp((t - CUE.ape) / 0.4)), 1 - ease.inOutSine(clamp((t - (CUE.reach - 0.4)) / 0.55)));
const reachAt = (t: number) => clamp((t - (CUE.reach - 0.1)) / 0.7);

// the final reach pose decides where the figure stops: its fingertip lands on the point (before the push)
const TARGET: P2 = [MARK_START[0] + HOVER[0] / PUSH_END, MARK_START[1] + HOVER[1] / PUSH_END];
const FINAL = pose(2, 0, 0, 1);
const XF = TARGET[0] - FINAL.tip[0] * H_PX;
const GROUND = TARGET[1] + FINAL.tip[1] * H_PX;

export default class SceneEvolution extends Scene {
  override handlesTransition = true;
  topo = new TopoPass();
  motif = new LineMotif();
  s = defaultTopo();

  /** Screen x of the figure's root (before the push). Before it walks it rides on the scrolling terrain. */
  rootX(t: number) {
    if (t < CUE.ape) return X0 + evoPan(t) - evoPan(CUE.ape);
    return lerp(X0, XF, ease.inOutSine(clamp((t - CUE.ape) / (CUE.reach + 0.15 - CUE.ape))));
  }
  /** Gait phase from the distance walked over the ground (so the feet roughly plant). */
  phase(t: number) {
    const tt = Math.max(t, CUE.ape);
    const d = (this.rootX(tt) - X0) + (evoPan(CUE.ape) - evoPan(tt));
    return (TAU * d) / (AVG_STRIDE * H_PX);
  }
  poseAt(t: number): Pose { return pose(morphAt(t), this.phase(t), ampAt(t), reachAt(t)); }

  /** Figure units → screen px at time t (root at rootX/GROUND, then the push about MARK_START). */
  toScreen(t: number, p: P2, rootX = this.rootX(t)): P2 {
    const k = evoPush(t);
    const x = rootX + p[0] * H_PX, y = GROUND - p[1] * H_PX;
    return [MARK_START[0] + (x - MARK_START[0]) * k, MARK_START[1] + (y - MARK_START[1]) * k];
  }

  /** The line's head: from the coast to the forming figure's hand, then carried, then set down on the point. */
  headAt(t: number): P2 {
    const L = dive(t).touch;
    if (t < CUE.evoForm + 0.15) return [L[0], L[1]];
    const ps = this.poseAt(t);
    const hand = this.toScreen(t, ps.tip);
    const go = ease.inOutCubic(clamp((t - (CUE.evoForm + 0.15)) / (CUE.ape + 0.35 - CUE.evoForm - 0.15)));
    let p: P2 = [lerp(L[0], hand[0], go), lerp(L[1], hand[1], go) - Math.sin(go * Math.PI) * 120];
    const place = ease.inOutCubic(clamp((t - (CUE.reach + 0.45)) / 0.35));
    p = [lerp(p[0], MARK_START[0], place), lerp(p[1], MARK_START[1], place)];
    return p;
  }

  private writeFigure(f: number, ps: Pose, t: number, rootX: number) {
    const s = this.s, k = evoPush(t);
    for (let i = 0; i < NB; i++) {
      const b = ps.bones[i];
      const o4 = (f * NB + i) * 4, o2 = (f * NB + i) * 2;
      if (!b) { s.radii[o2] = 0; s.radii[o2 + 1] = 0; continue; }
      const a = this.toScreen(t, b.a, rootX), c = this.toScreen(t, b.b, rootX);
      s.bones[o4] = a[0]; s.bones[o4 + 1] = a[1]; s.bones[o4 + 2] = c[0]; s.bones[o4 + 3] = c[1];
      s.radii[o2] = b.ra * H_PX * k; s.radii[o2 + 1] = b.rb * H_PX * k;
    }
    const p0 = this.toScreen(t, [ps.box[0], ps.box[3]], rootX), p1 = this.toScreen(t, [ps.box[2], ps.box[1]], rootX);
    s.boxes.set([p0[0], p0[1], p1[0], p1[1]], f * 4);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, s = this.s;
    const d = dive(t);
    s.center = d.center; s.radius = d.radius; s.zoom = d.zoom;
    s.rot = rotAt(t); s.land.copy(WORLD.land); s.sea = WORLD.sea;
    s.life = 3; s.redCoast = 1; s.reveal = 1; s.atmo = 0; s.ripple = 0; s.rippleAmp = 0;
    s.warm = 0.35; s.stone = 0; s.drainR = 1e5; s.handMix = 0;

    // the figure (and its echoes)
    const push = evoPush(t);
    const form = ease.outCubic(clamp((t - CUE.evoForm) / 0.7));
    s.figMix = form;
    s.figGrow = (1 - form) * 0.07 * H_PX;
    s.figSmooth = 0.022 * H_PX * push;
    s.echoR = lerp(42, 95, smoothstep(1, PUSH_END, push));
    s.recede = lerp(0.62, 0.3, smoothstep(CUE.push, CUE.human, t));
    this.writeFigure(0, this.poseAt(t), t, this.rootX(t));
    const gk = smoothstep(CUE.ape + 1.0, CUE.ape + 1.9, t) * (1 - smoothstep(CUE.sapiens + 0.5, CUE.reach + 0.1, t));
    s.ghostA = [0.5 * gk, 0.26 * gk];
    if (gk > 0) LAGS.forEach((lag, g) => {
      const tg = t - lag;
      this.writeFigure(g + 1, this.poseAt(tg), t, this.rootX(tg) + evoPan(t) - evoPan(tg));
    });
    // the push ends in the hand of 03b: the figure's reaching hand re-forms into it
    const hp = handPose(CUE.human);
    s.handPos = hp.pos; s.handRot = hp.rot; s.handScale = hp.scale; s.handFlip = hp.flip;
    s.handMorph = ease.inOutSine(clamp((t - (CUE.push + 0.55)) / (CUE.human - CUE.push - 0.55)));
    this.topo.render(r, out, s);

    // the line
    const m = this.motif;
    m.clear();
    const pts: P2[] = [];
    for (let j = 22; j >= 0; j--) pts.push(this.headAt(Math.max(CUE.evo, t - (0.34 * j) / 22)));
    m.trail(pts, 2.1, 1.35);
    const h = this.headAt(t);
    const set = t > CUE.reach + 0.8 ? Math.exp(-(t - CUE.reach - 0.8) / 0.12) : 0;
    m.head(h[0], h[1], 1.1 + 0.6 * set, 1 + 0.25 * set);
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    return { bloom: 0.62, bloomThreshold: 0.85, vignette: 0.48, grain: 0.052, warmth: 0.35 + 0.2275 * smoothstep(CUE.push, CUE.human, t) };
  }
}
