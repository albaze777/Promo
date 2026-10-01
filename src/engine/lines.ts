// LineBatch: instanced anti-aliased capsule segments (and dots), in 2D logical px (y down) or 3D (camera).
// Widths are in screen px; colours are linear and may exceed 1 (they bloom).
import * as THREE from 'three';
import { GLOBAL_UNIFORMS, SCALE } from './gl';

export type RGBA = readonly [number, number, number, number];

const VERT = /* glsl */ `
precision highp float;
in vec2 corner;            // quad corner in [-1,1]^2
in vec3 a; in vec3 b;      // endpoints (2D px, or 3D world)
in vec2 wid;               // full width at a, at b (px)
in vec4 ca; in vec4 cb;    // colours at a, b (linear, straight alpha)
uniform float mode3d;      // 0: 2D px; 1: 3D
uniform mat4 projView;
uniform vec2 RES; uniform float PX_SCALE;
uniform float depthWidth;  // 3D: scale widths by refDist / depth
uniform float refDist;
out vec2 vP; out vec2 vA; out vec2 vB; out vec2 vW; out vec4 vCa; out vec4 vCb; out float vClip;

vec3 toScreen(vec3 p, out float w) {
  if (mode3d < 0.5) { w = 1.0; return vec3(p.xy, 0.0); }
  vec4 c = projView * vec4(p, 1.0);
  w = c.w;
  vec2 ndc = c.xy / max(c.w, 1e-4);
  return vec3((ndc.x * 0.5 + 0.5) * RES.x, (0.5 - ndc.y * 0.5) * RES.y, c.z / c.w);
}
void main() {
  float wa, wb;
  vec3 sa = toScreen(a, wa), sb = toScreen(b, wb);
  vec2 w2 = wid;
  if (mode3d > 0.5 && depthWidth > 0.5) { w2 = vec2(wid.x * refDist / max(wa, 1e-3), wid.y * refDist / max(wb, 1e-3)); }
  vClip = (mode3d > 0.5 && (wa < 0.05 || wb < 0.05)) ? 1.0 : 0.0;
  float hw = max(w2.x, w2.y) * 0.5 + 1.5 / PX_SCALE;
  vec2 d = sb.xy - sa.xy;
  float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 p = mix(sa.xy, sb.xy, corner.x * 0.5 + 0.5) + dir * corner.x * hw + nrm * corner.y * hw;
  vP = p; vA = sa.xy; vB = sb.xy; vW = w2; vCa = ca; vCb = cb;
  gl_Position = vec4(p.x / RES.x * 2.0 - 1.0, 1.0 - p.y / RES.y * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vP; in vec2 vA; in vec2 vB; in vec2 vW; in vec4 vCa; in vec4 vCb; in float vClip;
uniform float soft; uniform float PX_SCALE;
out vec4 fragColor;
void main() {
  if (vClip > 0.5) discard;
  vec2 pa = vP - vA, ba = vB - vA;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  float w = mix(vW.x, vW.y, h);
  float hw = max(w * 0.5, 0.5 / PX_SCALE);
  float aa = 0.75 / PX_SCALE;
  float k;
  if (soft > 0.5) { float x = d / max(hw, 1e-3); k = exp(-x * x * 3.2) * clamp(1.0 - x * x, 0.0, 1.0); }
  else k = clamp((hw + aa - d) / (2.0 * aa), 0.0, 1.0);
  k *= min(1.0, w * PX_SCALE); // hairline floor: thinner lines fade instead of aliasing
  vec4 c = mix(vCa, vCb, h);
  float al = c.a * k;
  fragColor = vec4(c.rgb * al, al); // premultiplied
}`;

export interface LineBatchOpts {
  /** 'add' (default) or 'normal' (premultiplied over). */
  blend?: 'add' | 'normal';
  /** Gaussian falloff instead of a hard capsule (glows, stars). */
  soft?: boolean;
  /** 3D: widths shrink with distance (refDist = distance at which width is exact). */
  depthWidth?: number;
}

export class LineBatch {
  n = 0;
  private geo = new THREE.InstancedBufferGeometry();
  private mat: THREE.RawShaderMaterial;
  private mesh: THREE.Mesh;
  private scene = new THREE.Scene();
  private A: Float32Array; private B: Float32Array; private Wd: Float32Array; private CA: Float32Array; private CB: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[] = [];
  private cam2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(public capacity: number, o: LineBatchOpts = {}) {
    this.geo.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.A = new Float32Array(capacity * 3); this.B = new Float32Array(capacity * 3);
    this.Wd = new Float32Array(capacity * 2); this.CA = new Float32Array(capacity * 4); this.CB = new Float32Array(capacity * 4);
    const add = (name: string, arr: Float32Array, size: number) => {
      const at = new THREE.InstancedBufferAttribute(arr, size);
      at.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, at);
      this.attrs.push(at);
    };
    add('a', this.A, 3); add('b', this.B, 3); add('wid', this.Wd, 2); add('ca', this.CA, 4); add('cb', this.CB, 4);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        ...GLOBAL_UNIFORMS,
        mode3d: { value: 0 }, projView: { value: new THREE.Matrix4() },
        soft: { value: o.soft ? 1 : 0 }, depthWidth: { value: o.depthWidth ? 1 : 0 }, refDist: { value: o.depthWidth ?? 1 },
      },
      depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: o.blend === 'normal' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  clear() { this.n = 0; }

  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, wa: number, wb: number, ca: RGBA, cb: RGBA = ca) {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this.A[i * 3] = ax; this.A[i * 3 + 1] = ay; this.A[i * 3 + 2] = az;
    this.B[i * 3] = bx; this.B[i * 3 + 1] = by; this.B[i * 3 + 2] = bz;
    this.Wd[i * 2] = wa; this.Wd[i * 2 + 1] = wb;
    this.CA.set(ca, i * 4); this.CB.set(cb, i * 4);
  }
  seg2(ax: number, ay: number, bx: number, by: number, w: number, c: RGBA, wb = w, cb: RGBA = c) {
    this.seg(ax, ay, 0, bx, by, 0, w, wb, c, cb);
  }
  dot(x: number, y: number, d: number, c: RGBA, z = 0) { this.seg(x, y, z, x, y, z, d, d, c, c); }

  /** Polyline with per-vertex width and colour callbacks (k = 0..1 along the line by index). */
  polyline(pts: readonly (readonly number[])[], width: (k: number, i: number) => number, color: (k: number, i: number) => RGBA) {
    const n = pts.length;
    for (let i = 0; i + 1 < n; i++) {
      const p = pts[i]!, q = pts[i + 1]!;
      const k0 = i / Math.max(1, n - 1), k1 = (i + 1) / Math.max(1, n - 1);
      this.seg(p[0]!, p[1]!, p[2] ?? 0, q[0]!, q[1]!, q[2] ?? 0, width(k0, i), width(k1, i + 1), color(k0, i), color(k1, i + 1));
    }
  }

  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, camera?: THREE.Camera) {
    if (this.n === 0) return;
    const u = this.mat.uniforms;
    if (camera) {
      camera.updateMatrixWorld();
      (u.projView!.value as THREE.Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      u.mode3d!.value = 1;
    } else u.mode3d!.value = 0;
    for (const at of this.attrs) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, this.n * at.itemSize);
      at.needsUpdate = true;
    }
    this.geo.instanceCount = this.n;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam2d);
  }
}

export const LINE_SCALE = SCALE;
