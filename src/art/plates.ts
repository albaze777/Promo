// Shared, lazily painted art plates (one copy per page, used by several scenes) and the art camera that
// 04 Art Evolution hands over to 05 Digital Art.
import type * as THREE from 'three';
import { canvasTexture } from '../engine/gl';
import { paintEras, RC } from './eras';
import { CUE } from '../timeline/cues';
import { clamp, ease } from '../utils/math';

let eraTex: THREE.Texture[] | null = null;
export function getEraTextures() {
  if (!eraTex) eraTex = paintEras().map((c) => canvasTexture(c));
  return eraTex;
}

export const ERA_CUES = [CUE.art0, CUE.art1, CUE.art2, CUE.art3, CUE.art4, CUE.art5];

/** Art camera: a slow push into the circle with a small kick on every era change. */
export function artCam(t: number) {
  const u = clamp((t - CUE.art0) / (CUE.pixels - CUE.art0));
  let s = 1 + 0.07 * ease.inOutSine(u);
  for (let k = 1; k < ERA_CUES.length; k++) s += 0.012 * ease.outExpo(clamp((t - ERA_CUES[k]!) / 0.35));
  return { scale: s, cx: RC[0], cy: RC[1] };
}

/** Art-space point → screen. */
export function artToScreen(t: number, x: number, y: number): [number, number] {
  const c = artCam(t);
  return [c.cx + (x - c.cx) * c.scale, c.cy + (y - c.cy) * c.scale];
}
