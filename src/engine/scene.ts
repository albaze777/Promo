// Scene API. A scene owns a time window of the film and renders linear HDR colour into the target it is
// given. Output must be a pure function of time (seeded randomness only): the export renders sub-frames
// out of order for motion blur, and the preview seeks freely.
import type * as THREE from 'three';
import type { Compositor } from './gl';
import type { PostParams } from './post';

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  comp: Compositor;
  W: number;
  H: number;
  id: string;
  params: Record<string, unknown>;
  start: number;
  end: number;
}

export interface Frame {
  /** Film time (s). */
  t: number;
  /** Local time since the scene's window start, and 0..1 progress through it. */
  lt: number;
  p: number;
  /** The previous scene's frame while windows overlap (for scenes with handlesTransition), else null. */
  under: THREE.Texture | null;
  /** 0→1 through the overlap with the previous scene (1 when none). */
  tin: number;
  /** 0→1 through the overlap with the next scene (0 when none). */
  tout: number;
}

export type PostOverrides = Partial<PostParams>;

export abstract class Scene {
  /** If true the scene composites `f.under` itself during its incoming overlap; otherwise the engine crossfades. */
  handlesTransition = false;
  constructor(protected ctx: SceneCtx) {}
  init(): Promise<void> | void {}
  /** Render into `out` (HalfFloat linear HDR, premultiplied). Must fully overwrite it. */
  abstract render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides | void;
  dispose(): void {}
}

export type SceneClass = new (ctx: SceneCtx) => Scene;

/**
 * A scene that lives inside a gallery panel (05a–05c). The gallery host renders it into its own target
 * (full 1920×1080 frame; the panel shows its central 4:3 crop until the camera arrives and the frame opens
 * to 16:9), zooms into and out of it, and hands the line over: while the host carries the head (`drawHead`
 * false), the panel scene must not draw it, and `headAt(t)` tells the host where it is in frame px.
 */
export abstract class PanelScene extends Scene {
  drawHead = true;
  abstract headAt(t: number): [number, number];
}
