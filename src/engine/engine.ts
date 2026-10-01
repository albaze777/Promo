// The engine: owns the renderer, instantiates scenes for the timeline, renders any film time t
// deterministically, composites overlapping scenes, accumulates motion-blur sub-frames, runs post.
import * as THREE from 'three';
import { Compositor, FSPass, W, H, PW, PH, makeRT, clearRT } from './gl';
import { DEFAULT_POST, Post, type PostParams } from './post';
import type { Frame, Scene, SceneClass, SceneCtx, PostOverrides } from './scene';

export interface TimelineEntry {
  id: string;
  /** Lazy module loader; the default export is the Scene class. */
  load: () => Promise<{ default: SceneClass }>;
  start: number;
  end: number;
  params?: Record<string, unknown>;
  /** Default post overrides (the scene's own overrides win). */
  post?: PostOverrides;
}

interface Loaded { entry: TimelineEntry; scene: Scene | null; error?: string }

export class Engine {
  renderer: THREE.WebGLRenderer;
  comp = new Compositor();
  post = new Post();
  loaded = new Map<string, Loaded>();
  errors: string[] = [];
  timeline: TimelineEntry[] = [];
  lastPost: PostParams = { ...DEFAULT_POST };
  private rts = [makeRT(), makeRT(), makeRT()];
  private mixRT = makeRT();
  private acc = [makeRT(W, H, { type: THREE.FloatType }), makeRT(W, H, { type: THREE.FloatType })];
  private finalRT = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.UnsignedByteType, depthBuffer: false });
  private blit = new FSPass(`uniform sampler2D src; void main(){ fragColor = texture(src, vUv); }`, { src: { value: null } });
  private xfade = new FSPass(`uniform sampler2D a; uniform sampler2D b; uniform float k;
    void main(){ fragColor = mix(texture(a, vUv), texture(b, vUv), k); }`, { a: { value: null }, b: { value: null }, k: { value: 0 } });
  private accum = new FSPass(`uniform sampler2D sum; uniform sampler2D src; uniform float w; uniform float first;
    void main(){
      vec4 c = texture(src, vUv);
      bool ok = abs(c.r) < 6e4 && abs(c.g) < 6e4 && abs(c.b) < 6e4; // drop stray NaN/inf
      vec4 s = first > 0.5 ? vec4(0.0) : texture(sum, vUv);
      fragColor = s + (ok ? c : vec4(0.0)) * w;
    }`, { sum: { value: null }, src: { value: null }, w: { value: 1 }, first: { value: 1 } });

  constructor(public canvas: HTMLCanvasElement, timeline: TimelineEntry[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PW, PH, false);
    this.renderer.autoClear = false;
    this.timeline = timeline;
  }

  get duration() { return Math.max(...this.timeline.map((e) => e.end)); }

  async init(only?: (e: TimelineEntry) => boolean) {
    const entries = only ? this.timeline.filter(only) : this.timeline;
    for (const e of entries) await this.loadEntry(e); // sequential: deterministic init order
  }

  private async loadEntry(e: TimelineEntry) {
    const rec: Loaded = { entry: e, scene: null };
    this.loaded.set(e.id, rec);
    try {
      const mod = await e.load();
      const ctx: SceneCtx = { renderer: this.renderer, comp: this.comp, W, H, id: e.id, params: e.params ?? {}, start: e.start, end: e.end };
      const s = new mod.default(ctx);
      await s.init();
      rec.scene = s;
    } catch (err) {
      rec.error = String((err as Error)?.stack ?? err);
      this.errors.push(`[${e.id}] ${rec.error}`);
      console.error(`scene ${e.id} failed`, err);
    }
  }

  async reload(id: string) {
    const e = this.timeline.find((x) => x.id === id);
    if (!e) return;
    this.loaded.get(id)?.scene?.dispose();
    await this.loadEntry(e);
  }

  /**
   * Render film time t. `samples` > 1 averages that many sub-frames spread evenly over
   * `shutter` × (1/fps) centred on t: true motion blur and temporal anti-aliasing (offline export).
   * Post parameters are taken from the centre sub-frame. Returns the post params used.
   */
  render(t: number, samples = 1, shutter = 0.5, fps = 60, toScreen = true): PostParams {
    const r = this.renderer;
    let outTex: THREE.Texture;
    let post: PostParams;
    if (samples <= 1) {
      ({ tex: outTex, post } = this.composite(t));
    } else {
      post = { ...DEFAULT_POST };
      const mid = Math.floor(samples / 2);
      let ping = 0;
      for (let k = 0; k < samples; k++) {
        const u = (k + 0.5) / samples - 0.5;
        const res = this.composite(Math.max(0, t + (u * shutter) / fps));
        if (k === mid) post = res.post;
        const a = this.acc[ping]!, b = this.acc[1 - ping]!;
        this.accum.u.sum!.value = b.texture;
        this.accum.u.src!.value = res.tex;
        this.accum.u.w!.value = 1 / samples;
        this.accum.u.first!.value = k === 0 ? 1 : 0;
        this.accum.render(r, a);
        ping = 1 - ping;
      }
      outTex = this.acc[1 - ping]!.texture;
    }
    this.post.render(r, outTex, this.finalRT, post, t);
    this.lastPost = post;
    if (toScreen) {
      this.blit.u.src!.value = this.finalRT.texture;
      this.blit.render(r, null);
    }
    return post;
  }

  /** All scenes active at t, composited into one HDR texture (pre-post). */
  private composite(t: number): { tex: THREE.Texture; post: PostParams } {
    const r = this.renderer;
    const active = this.timeline.filter((e) => t >= e.start && t < e.end).sort((a, b) => a.start - b.start);
    let post: PostParams = { ...DEFAULT_POST };
    let under: THREE.Texture | null = null;
    let outTex: THREE.Texture | null = null;
    active.forEach((e, idx) => {
      const rec = this.loaded.get(e.id);
      const rt = this.rts[idx % this.rts.length]!;
      const prev = active[idx - 1], next = active[idx + 1];
      const tin = prev ? Math.min(1, (t - e.start) / Math.max(1e-3, prev.end - e.start)) : 1;
      const tout = next ? Math.max(0, (t - next.start) / Math.max(1e-3, e.end - next.start)) : 0;
      if (!rec?.scene) { clearRT(r, rt, [0.3, 0, 0]); under = outTex = rt.texture; return; }
      const s = rec.scene;
      const f: Frame = { t, lt: t - e.start, p: (t - e.start) / (e.end - e.start), under: idx > 0 ? under : null, tin, tout };
      let ov: PostOverrides | void = undefined;
      try { ov = s.render(f, rt); } catch (err) { console.error(`scene ${e.id} render error`, err); clearRT(r, rt, [0.3, 0, 0]); }
      // blend post params across overlaps so grades don't pop
      const merged = { ...post, ...(e.post ?? {}), ...(ov ?? {}) } as PostParams;
      if (idx > 0) for (const k of Object.keys(merged) as (keyof PostParams)[]) merged[k] = post[k] + (merged[k] - post[k]) * tin;
      post = merged;
      if (idx > 0 && !s.handlesTransition && under) {
        this.xfade.u.a!.value = under; this.xfade.u.b!.value = rt.texture; this.xfade.u.k!.value = tin;
        this.xfade.render(r, this.mixRT);
        outTex = this.mixRT.texture;
      } else outTex = rt.texture;
      under = outTex;
    });
    if (!outTex) { clearRT(r, this.rts[0]!, [0, 0, 0]); outTex = this.rts[0]!.texture; }
    return { tex: outTex, post };
  }

  readPixels(buf?: Uint8Array) {
    const out = buf ?? new Uint8Array(PW * PH * 4);
    this.renderer.readRenderTargetPixels(this.finalRT, 0, 0, PW, PH, out);
    return out;
  }
}
