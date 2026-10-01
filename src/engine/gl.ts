// WebGL plumbing: render targets, fullscreen passes, Canvas2D layers, a compositor.
// Scenes lay out in logical 1920×1080 px; ?scale=2 renders a true 3840×2160 frame.
import * as THREE from 'three';
import { COMMON_GLSL } from '../shaders/common';

export const W = 1920;
export const H = 1080;
export const SCALE = (() => {
  if (typeof location === 'undefined') return 1;
  const s = parseFloat(new URLSearchParams(location.search).get('scale') ?? '1');
  return Number.isFinite(s) && s > 0 ? Math.min(4, s) : 1;
})();
export const PW = Math.round(W * SCALE);
export const PH = Math.round(H * SCALE);

export const GLOBAL_UNIFORMS = {
  PX_SCALE: { value: SCALE },
  RES: { value: new THREE.Vector2(W, H) },
};

export interface RTOpts {
  type?: THREE.TextureDataType;
  depthBuffer?: boolean;
  filter?: THREE.MagnificationTextureFilter;
  /** 1 = size is in physical px already (data targets). */
  pxScale?: number;
}

/** HDR linear render target. Size in logical px (scaled to physical). */
export function makeRT(w = W, h = H, o: RTOpts = {}) {
  const s = o.pxScale ?? SCALE;
  const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), {
    type: o.type ?? THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: o.depthBuffer ?? false,
    magFilter: o.filter ?? THREE.LinearFilter,
    minFilter: o.filter ?? THREE.LinearFilter,
    generateMipmaps: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

export function clearRT(r: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget | null, c: readonly number[] = [0, 0, 0], a = 1) {
  r.setRenderTarget(rt);
  r.setClearColor(new THREE.Color(c[0], c[1], c[2]), a);
  r.clear(true, true, false);
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv; out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const triGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
})();
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export type Uniforms = Record<string, THREE.IUniform>;

/** Fullscreen GLSL3 pass. The fragment source gets `vUv`, `fragColor` and COMMON_GLSL. */
export class FSPass {
  mat: THREE.RawShaderMaterial;
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Uniforms = {}, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: `precision highp float;\nprecision highp int;\nin vec2 vUv;\nout vec4 fragColor;\n${COMMON_GLSL}\n${frag}`,
      uniforms: { ...GLOBAL_UNIFORMS, ...uniforms },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      ...opts,
    });
    const m = new THREE.Mesh(triGeo, this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }
  get u() { return this.mat.uniforms; }
  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    r.setRenderTarget(target);
    r.render(this.scene, orthoCam);
  }
  dispose() { this.mat.dispose(); }
}

/**
 * A Canvas2D drawing surface in logical px (backing store is SCALE× larger), uploaded as an sRGB texture.
 * Draw with straight (non-premultiplied) alpha as usual.
 */
export class Layer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  constructor(public w = W, public h = H, public s = SCALE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * s);
    this.canvas.height = Math.round(h * s);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.premultiplyAlpha = false;
    this.clear();
  }
  clear() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  upload() { this.tex.needsUpdate = true; return this.tex; }
  dispose() { this.tex.dispose(); }
}

/** A static texture made once from a Canvas2D drawing (art plates, atlases). */
export function canvasTexture(canvas: HTMLCanvasElement | OffscreenCanvas, srgb = true, mips = false) {
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export type BlendMode = 'normal' | 'add' | 'replace' | 'multiply' | 'screen';

export interface DrawOpts {
  mode?: BlendMode;
  opacity?: number;
  tint?: readonly number[];
  /** Transform of the source, in logical px: scale about `origin`, rotate (rad), then translate by `offset`. */
  scale?: number;
  rotate?: number;
  offset?: readonly [number, number];
  origin?: readonly [number, number];
  /** Source is premultiplied (HDR targets) or straight (canvas textures, default). */
  premult?: boolean;
}

/** Draws textures onto targets with blend modes and a 2D transform. */
export class Compositor {
  private pass = new FSPass(/* glsl */ `
    uniform sampler2D src; uniform float opacity; uniform vec3 tint; uniform float premult;
    uniform mat3 inv; // dst logical px → src logical px
    void main() {
      vec2 p = (inv * vec3(FRAG_PX, 1.0)).xy;
      vec2 uv = vec2(p.x / RES.x, 1.0 - p.y / RES.y);
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { fragColor = vec4(0.0); return; }
      vec4 c = texture(src, uv);
      vec3 rgb = premult > 0.5 ? c.rgb : c.rgb * c.a;
      fragColor = vec4(rgb * tint, c.a) * opacity; // premultiplied out
    }`, { src: { value: null }, opacity: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, premult: { value: 0 }, inv: { value: new THREE.Matrix3() } },
    { blending: THREE.CustomBlending, transparent: true });

  draw(r: THREE.WebGLRenderer, tex: THREE.Texture, target: THREE.WebGLRenderTarget | null, o: DrawOpts = {}) {
    const u = this.pass.u, m = this.pass.mat;
    u.src!.value = tex;
    u.opacity!.value = o.opacity ?? 1;
    const t = o.tint ?? [1, 1, 1];
    (u.tint!.value as THREE.Vector3).set(t[0]!, t[1]!, t[2]!);
    u.premult!.value = o.premult ? 1 : 0;
    const s = o.scale ?? 1, a = o.rotate ?? 0, off = o.offset ?? [0, 0], org = o.origin ?? [W / 2, H / 2];
    // forward: p' = R*S*(p - org) + org + off  → inverse
    const c = Math.cos(a), sn = Math.sin(a);
    const fwd = new THREE.Matrix3().set(
      c * s, -sn * s, org[0] + off[0] - (c * s * org[0] - sn * s * org[1]),
      sn * s, c * s, org[1] + off[1] - (sn * s * org[0] + c * s * org[1]),
      0, 0, 1,
    );
    (u.inv!.value as THREE.Matrix3).copy(fwd).invert();
    m.blendEquation = THREE.AddEquation;
    switch (o.mode ?? 'normal') {
      case 'replace': m.blending = THREE.NoBlending; break;
      case 'add': m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; break;
      case 'screen': m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcColorFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; break;
      case 'multiply': m.blending = THREE.CustomBlending; m.blendSrc = THREE.DstColorFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; break;
      default: m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    }
    m.needsUpdate = false;
    this.pass.render(r, target);
  }
}
