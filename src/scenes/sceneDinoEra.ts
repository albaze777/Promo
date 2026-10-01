// placeholder panel scene (dino)
import type * as THREE from 'three';
import { PanelScene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { LineMotif } from '../motifs/line';

export default class SceneDinoEra extends PanelScene {
  motif = new LineMotif();
  bg = new FSPass(`uniform float t; void main(){ vec2 p = FRAG_PX; float g = 0.5 + 0.5 * sin(p.x / 80.0 + t) * sin(p.y / 80.0); fragColor = vec4(mix(C_INK, C_OCHRE * 0.3, g), 1.0); }`, { t: { value: 0 } });
  headAt(t: number): [number, number] { return [960 + Math.cos(t * 2) * 300, 540 + Math.sin(t * 2) * 200]; }
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    this.bg.u.t!.value = f.t; this.bg.render(this.ctx.renderer, out);
    this.motif.clear();
    if (this.drawHead) { const h = this.headAt(f.t); this.motif.head(h[0], h[1], 1.1, 1); }
    this.motif.render(this.ctx.renderer, out);
    return { bloom: 0.5 };
  }
}
