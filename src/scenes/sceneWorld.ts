// 02 WORLD — planet → surface → atmosphere → land → life.
// The converged sphere resolves into a contour-drawn planet. Sea level falls; continents rise as nested
// contours. The line spirals down from its orbit and touches the coast; warmth (life) spreads from that
// point along the coastline, which turns red: the line has become part of the world. Then the dive.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { TopoPass, defaultTopo } from '../shaders/topo';
import { LineMotif } from '../motifs/line';
import { orbitPoint, occluded, projectEnd } from '../motifs/orbit';
import { WORLD, rotAt, dive, TOUCH } from '../motifs/world';
import { CUE } from '../timeline/cues';
import { clamp, ease, keys, smoothstep } from '../utils/math';

export default class SceneWorld extends Scene {
  override handlesTransition = true;
  topo = new TopoPass();
  motif = new LineMotif();
  s = defaultTopo();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, s = this.s;
    const d = dive(t);
    s.center = d.center; s.radius = d.radius; s.zoom = d.zoom;
    s.rot = rotAt(t);
    s.land.copy(WORLD.land);
    s.sea = keys(t, [[CUE.world, 0.73], [CUE.land, 0.62, ease.inOutCubic], [CUE.life, WORLD.sea, ease.outCubic]]);
    const lu = clamp((t - CUE.life) / 0.9);
    s.life = 2.4 * ease.outCubic(lu) + 0.02 * smoothstep(CUE.life - 0.02, CUE.life, t);
    s.redCoast = smoothstep(CUE.life, CUE.life + 0.08, t);
    const ru = clamp((t - CUE.life) / 0.9);
    s.ripple = 0.55 * ease.outExpo(ru);
    s.rippleAmp = t >= CUE.life ? (1 - ru) ** 2 * 0.9 : 0;
    s.reveal = smoothstep(CUE.world - 0.15, CUE.world + 0.3, t);
    s.atmo = 1 - smoothstep(CUE.dive + 0.1, CUE.dive + 0.5, t);
    s.warm = 0.35 * smoothstep(CUE.life + 0.3, CUE.human, t);
    this.topo.render(r, out, s);

    // the line: orbit → spiral descent → touchdown → anchored as the planet dives
    const m = this.motif;
    m.clear();
    const mapDive = (x: number, y: number): [number, number] => [d.touch[0] + (x - TOUCH[0]) * d.zoom, d.touch[1] + (y - TOUCH[1]) * d.zoom];
    const pts: number[][] = [];
    const flush = () => { if (pts.length > 1) m.trail(pts, 2.0, 1.4); pts.length = 0; };
    for (let j = 48; j >= 0; j--) {
      const tj = t - (0.45 * j) / 48;
      if (tj > CUE.life) continue;
      const p3 = orbitPoint(tj);
      if (occluded(p3) && tj < CUE.life - 0.03) { flush(); continue; }
      const sp = projectEnd(p3);
      pts.push(t > CUE.life ? mapDive(sp[0], sp[1]) : [sp[0], sp[1]]);
    }
    if (t > CUE.life) pts.push([d.touch[0], d.touch[1]]);
    flush();
    let hx: number, hy: number, vis = true;
    if (t < CUE.life) {
      const p3 = orbitPoint(t);
      vis = !occluded(p3);
      [hx, hy] = projectEnd(p3);
    } else [hx, hy] = d.touch;
    const impact = t >= CUE.life ? Math.exp(-(t - CUE.life) / 0.15) : 0;
    if (vis) m.head(hx, hy, 1.1 + 1.2 * impact, 1 + 0.5 * impact);
    m.render(r, out);

    // incoming: dissolve from the converged matter of Origin
    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });

    return { bloom: 0.65, bloomThreshold: 0.85, vignette: 0.45, grain: 0.05, warmth: s.warm };
  }
}
