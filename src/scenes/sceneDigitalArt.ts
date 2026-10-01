// 05 DIGITAL ART & CREATORS — the gallery host (05 → 05d).
// Brush strokes → pixels → vectors → grid → a gallery → a community. Then the gallery becomes the film's
// stage: the line finds a cancelled artwork and the camera pushes into it (05a, the dino era), out again on
// the boom frame, into a second panel (05b, the wheel), a third (05c, toward AI), and finally everything
// zooms in: every panel holds a smaller gallery (05d), an ocean of artworks threaded by the community, which
// resolves into the panels that shrink into Ored's characters.
//
// Camera: level-0 world → screen is (w − W)·Z + centre. Panel scenes are rendered by this host into their
// own targets; a panel shows the central 4:3 crop of its 16:9 frame and opens to the full frame as the
// camera arrives, so the zoom ends with the panel's frame exactly filling the screen.
import * as THREE from 'three';
import { Scene, PanelScene, type Frame, type SceneCtx, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, canvasTexture, makeRT, SCALE } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, RED, BONE, rgba } from '../motifs/line';
import { getEraTextures, artCam } from '../art/plates';
import { paintAtlas, TILE_W, TILE_H, ATLAS_COLS, ATLAS_ROWS } from '../art/gallery';
import { MARK_START } from '../motifs/world';
import { charPos, GLYPHS } from '../motifs/ored';
import { setText } from '../typography/fonts';
import { CUE } from '../timeline/cues';
import { PAL } from '../brand';
import { Rng, clamp, ease, keys, lerp, smoothstep, type V2 } from '../utils/math';
import SceneDinoEra from './sceneDinoEra';
import SceneWheel from './sceneWheel';
import SceneTowardAI from './sceneTowardAI';

// gallery grid (world px): panel (i,j) has its top-left at G0 + (i·PX, j·PY)
const CS = 37.5, PW_ = 300, PH_ = 225, PX = 337.5, PY = 300;
const G0: V2 = [810, 427.5];
const C: V2 = [960, 540];
const I_RANGE = 4, J_RANGE = 3;
const T_DOTS = CUE.pixels + 0.48, T_DEV = CUE.pixels + 0.82, T_SHRINK = CUE.ored, T_END = CUE.ored + 0.4;
/** Self-similar nesting: a panel holds a whole gallery K× smaller (about its centre). */
const K = 8;
const LEVEL_END = 2;            // the infinite zoom ends two levels down
const Z_FILL = 1080 / PH_;      // a panel's height fills the screen
const ZOOM_OUT = 1.5;           // story s to pull back out of a panel
const pieceOf = (i: number, j: number) => (i === 0 && j === 0 ? 12 : (((i * 7 + j * 3 + 13) % 12) + 12) % 12);
const devStart = (i: number, j: number) => T_DEV + 0.075 * Math.hypot(i, j * 1.2) + 0.08 * ((((i * 3 + j * 5 + 70) % 7) + 7) % 7) / 7;
const panelRect = (i: number, j: number) => ({ x: G0[0] + i * PX, y: G0[1] + j * PY, w: PW_, h: PH_ });
const panelCenter = (i: number, j: number): V2 => [G0[0] + i * PX + PW_ / 2, G0[1] + j * PY + PH_ / 2];
const HANDLES = ['albaze', 'mira.k', 'ondo', 'koe', 'lumen.studio', 'kaito', 'sable', 'arun.draws', 'deepak', 'nyx', 'ilse', 'juno.art', 'tavi', 'oro', 'selin', 'mae', 'rook', 'ada.ink'];

interface Edge { a: number; b: number; t0: number; bend: number }
interface Cam { Z: number; W: V2 }

/** The three panels the camera enters. tIn → tFull: zoom in; tOut → tOut + ZOOM_OUT: zoom out on the frozen frame. */
const SPECIAL = [
  { key: 'dino', ij: [-2, -1] as V2, tGo: CUE.cancel, tIn: CUE.dinoIn, tFull: CUE.dino, tOut: CUE.dinoOut },
  { key: 'wheel', ij: [2, -1] as V2, tGo: CUE.wheelIn, tIn: CUE.wheelIn + 0.6, tFull: CUE.wheel, tOut: CUE.wheelOut },
  { key: 'ai', ij: [0, 1] as V2, tGo: CUE.aiIn, tIn: CUE.aiIn + 0.6, tFull: CUE.ai, tOut: CUE.aiOut },
] as const;
const isSpecial = (i: number, j: number) => SPECIAL.findIndex((s) => s.ij[0] === i && s.ij[1] === j);
/** Time at which a panel scene is shown: its first frame before the zoom, live while inside, frozen after. */
const subTime = (k: number, t: number) => clamp(t, SPECIAL[k]!.tIn, SPECIAL[k]!.tOut);

// camera keyframes (level-0 world). Between keys the zoom is logarithmic and aimed at the more zoomed end.
const midW = (a: V2, b: V2, k = 0.5): V2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const PC = SPECIAL.map((s) => panelCenter(s.ij[0], s.ij[1]));
const CAM_KEYS: [number, Cam][] = [
  [T_DEV, { Z: 1, W: C }],
  [CUE.community, { Z: 0.84, W: C }],
  [CUE.dinoIn, { Z: 0.84, W: midW(C, PC[0]!, 0.12) }],
  [CUE.dino, { Z: Z_FILL, W: PC[0]! }],
  [CUE.dinoOut, { Z: Z_FILL, W: PC[0]! }],
  [CUE.dinoOut + ZOOM_OUT, { Z: 1.0, W: midW(PC[0]!, PC[1]!) }],
  [SPECIAL[1].tIn, { Z: 0.98, W: midW(PC[0]!, PC[1]!, 0.56) }],
  [CUE.wheel, { Z: Z_FILL, W: PC[1]! }],
  [CUE.wheelOut, { Z: Z_FILL, W: PC[1]! }],
  [CUE.wheelOut + ZOOM_OUT, { Z: 1.0, W: midW(PC[1]!, PC[2]!) }],
  [SPECIAL[2].tIn, { Z: 0.98, W: midW(PC[1]!, PC[2]!, 0.56) }],
  [CUE.ai, { Z: Z_FILL, W: PC[2]! }],
  [CUE.aiOut, { Z: Z_FILL, W: PC[2]! }],
  [CUE.aiOut + ZOOM_OUT, { Z: 1.0, W: midW(PC[2]!, C, 0.8) }],
  [CUE.infinite, { Z: 1.0, W: C }],
  [CUE.ocean + 0.6, { Z: K ** LEVEL_END, W: C }],
  [T_SHRINK, { Z: 0.6 * K ** LEVEL_END, W: C }],
];

function camLerp(a: Cam, b: Cam, u: number): Cam {
  if (Math.abs(a.Z - b.Z) < 1e-6) return { Z: a.Z, W: midW(a.W, b.W, ease.inOutCubic(u)) };
  const e = ease.inOutCubic(u);
  const Z = Math.exp(lerp(Math.log(a.Z), Math.log(b.Z), e));
  const [lo, hi] = a.Z < b.Z ? [a, b] : [b, a];
  const F = hi.W;                                            // the focus: where the zoomed end looks
  const s0: V2 = [(F[0] - lo.W[0]) * lo.Z, (F[1] - lo.W[1]) * lo.Z]; // its offset from centre at the wide end
  const v = (Z - lo.Z) / (hi.Z - lo.Z);
  const off: V2 = [s0[0] * (1 - v), s0[1] * (1 - v)];
  return { Z, W: [F[0] - off[0] / Z, F[1] - off[1] / Z] };
}

export default class SceneDigitalArt extends Scene {
  override handlesTransition = true;
  motif = new LineMotif();
  net = new LineBatch(20000);
  ui = new Layer2D();
  panels: { i: number; j: number; piece: number; t0: number; handle: string; likes: number; hue: string }[] = [];
  edges: Edge[] = [];
  assigned: number[] = []; // panel index per glyph (for the hand-off)
  pass!: FSPass;
  subs: PanelScene[] = [];
  subRT: THREE.WebGLRenderTarget[] = [];
  subMip: THREE.WebGLRenderTarget[] = [];
  subKey: number[] = [NaN, NaN, NaN];
  down = new FSPass(`uniform sampler2D src; void main(){ fragColor = vec4(texture(src, vUv).rgb, 1.0); }`, { src: { value: null } });

  constructor(ctx: SceneCtx) {
    super(ctx);
    const mk = (S: new (c: SceneCtx) => PanelScene, id: string) => new S({ ...ctx, id });
    this.subs = [mk(SceneDinoEra, 'dino'), mk(SceneWheel, 'wheel'), mk(SceneTowardAI, 'ai')];
  }

  override async init() {
    for (const s of this.subs) await s.init();
    for (let k = 0; k < 3; k++) {
      this.subRT.push(makeRT());
      const m = new THREE.WebGLRenderTarget(Math.round(1024 * SCALE), Math.round(576 * SCALE), {
        type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      });
      m.texture.colorSpace = THREE.NoColorSpace;
      this.subMip.push(m);
    }
    this.pass = this.makePass();
    this.pass.u.e5!.value = getEraTextures()[5];
    const atlas = paintAtlas(1);
    this.pass.u.atlas!.value = canvasTexture(atlas, true, true);
    // panels, people
    const rng = new Rng(55);
    let hIdx = 0;
    for (let j = -J_RANGE; j <= J_RANGE; j++) for (let i = -I_RANGE; i <= I_RANGE; i++) {
      this.panels.push({
        i, j, piece: pieceOf(i, j), t0: devStart(i, j),
        handle: HANDLES[(hIdx++ * 7) % HANDLES.length]!, likes: Math.round(40 + rng.next() ** 2 * 2400),
        hue: [PAL.ochre, PAL.ultramarine, PAL.vermilion, PAL.rose, PAL.viridian, PAL.terracotta][rng.int(0, 5)]!,
      });
    }
    // community graph between avatars (each panel's creator)
    const idx = (i: number, j: number) => (j + J_RANGE) * (2 * I_RANGE + 1) + (i + I_RANGE);
    const seen = new Set<string>();
    const order = this.panels.map((p, k) => ({ k, d: Math.hypot(p.i, p.j) })).sort((a, b) => a.d - b.d);
    order.forEach(({ k }, n) => {
      const p = this.panels[k]!;
      const cand: number[] = [];
      for (let tries = 0; tries < 3; tries++) {
        const di = rng.int(-2, 2), dj = rng.int(-2, 2);
        const qi = p.i + di, qj = p.j + dj;
        if ((di === 0 && dj === 0) || Math.abs(qi) > I_RANGE || Math.abs(qj) > J_RANGE) continue;
        cand.push(idx(qi, qj));
      }
      for (const q of cand) {
        const key = k < q ? `${k}-${q}` : `${q}-${k}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push({ a: k, b: q, t0: n * 0.014 + rng.next() * 0.1, bend: rng.range(-0.35, 0.35) });
      }
    });
    // hand-off: give each glyph the nearest unassigned panel to its character position (at the end camera)
    const used = new Set<number>();
    for (const g of GLYPHS) {
      const [cx, cy] = charPos(g.i);
      const w = this.screenToWorld(T_SHRINK, cx, cy, LEVEL_END);
      let best = -1, bd = Infinity;
      this.panels.forEach((p, k) => {
        if (used.has(k)) return;
        const r = panelRect(p.i, p.j), d = Math.hypot(r.x + r.w / 2 - w[0], r.y + r.h / 2 - w[1]);
        if (d < bd) { bd = d; best = k; }
      });
      used.add(best);
      this.assigned.push(best);
    }
    const aIJ = this.pass.u.aIJ!.value as THREE.Vector2[];
    const aPiece = this.pass.u.aPiece!.value as number[];
    this.assigned.forEach((k, n) => { aIJ[n]!.set(this.panels[k]!.i, this.panels[k]!.j); aPiece[n] = this.panels[k]!.piece; });
    SPECIAL.forEach((s, k) => (this.pass.u.sIJ!.value as THREE.Vector2[])[k]!.set(s.ij[0], s.ij[1]));
  }

  // ---- camera ----------------------------------------------------------------------------------------
  cam(t: number): Cam {
    if (t < T_DEV) {
      // from the art camera (scale about the circle's centre) to the gallery's
      const a = artCam(CUE.pixels);
      const s = keys(t, [[CUE.pixels, a.scale], [T_DEV, 1.0, ease.inOutCubic]]);
      const k = ease.inOutCubic(clamp((t - CUE.pixels) / (T_DEV - CUE.pixels)));
      const cx = lerp(a.cx, 960, k), cy = lerp(a.cy, 540, k);
      return { Z: s, W: [cx + (960 - cx) / s, cy + (540 - cy) / s] };
    }
    for (let i = 1; i < CAM_KEYS.length; i++) {
      const [t1, c1] = CAM_KEYS[i]!, [t0, c0] = CAM_KEYS[i - 1]!;
      if (t <= t1) return camLerp(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0));
    }
    return CAM_KEYS[CAM_KEYS.length - 1]![1];
  }
  /** World of nesting level L (centred on C) → level 0. */
  static up(w: V2, L: number): V2 { const f = K ** -L; return [C[0] + (w[0] - C[0]) * f, C[1] + (w[1] - C[1]) * f]; }
  worldToScreen(t: number, x: number, y: number, L = 0): V2 {
    const c = this.cam(t), [ux, uy] = SceneDigitalArt.up([x, y], L);
    return [(ux - c.W[0]) * c.Z + 960, (uy - c.W[1]) * c.Z + 540];
  }
  screenToWorld(t: number, x: number, y: number, L = 0): V2 {
    const c = this.cam(t);
    const w0: V2 = [c.W[0] + (x - 960) / c.Z, c.W[1] + (y - 540) / c.Z];
    const f = K ** L;
    return [C[0] + (w0[0] - C[0]) * f, C[1] + (w0[1] - C[1]) * f];
  }
  /** Which nesting level the UI (handles, threads) lives on at t. */
  uiLevel(t: number) { return t >= CUE.ocean ? LEVEL_END : 0; }
  avatar(k: number): V2 { const p = this.panels[k]!, r = panelRect(p.i, p.j); return [r.x + 9, r.y + r.h + 22]; }
  /** A point of panel scene k's frame (px) → level-0 world. */
  subToWorld(k: number, p: V2): V2 { const c = PC[k]!; return [c[0] + (p[0] / 1920 - 0.5) * 400, c[1] + (p[1] / 1080 - 0.5) * 225]; }
  /** How much panel k is opened to its full 16:9 frame, from the camera zoom. */
  widen(k: number, t: number) {
    const s = SPECIAL[k]!;
    if (t < s.tIn - 0.01 || t > s.tOut + ZOOM_OUT) return 0;
    return smoothstep(Z_FILL * 0.5, Z_FILL * 0.96, this.cam(t).Z);
  }
  /** Is panel scene k on screen and full-frame (the gallery can be skipped)? */
  fullFrame(t: number) { return SPECIAL.findIndex((s) => t >= s.tFull && t <= s.tOut); }

  makePass() {
    const f = (x: number) => x.toFixed(3);
    return new FSPass(/* glsl */ `
    uniform sampler2D e5; uniform sampler2D atlas;
    uniform sampler2D sub0, sub1, sub2, mip0, mip1, mip2;
    uniform vec2 camW; uniform float camZ; uniform float t;
    uniform float pixN, gapK, dotK, gridK, outK, shrinkK, uiFade, infK, threadK, isolate, cancelK;
    uniform vec4 aRect[15]; uniform vec2 aIJ[15]; uniform float aPiece[15];
    uniform vec2 sIJ[3]; uniform float sWide[3];
    const vec2 G0 = vec2(${f(G0[0])}, ${f(G0[1])});
    const vec2 CC = vec2(${f(C[0])}, ${f(C[1])});
    const float CS = ${f(CS)}, PX = ${f(PX)}, PY = ${f(PY)}, PW = ${f(PW_)}, PH = ${f(PH_)}, KN = ${f(K)};
    float pieceOf(vec2 ij) { if (ij.x == 0.0 && ij.y == 0.0) return 12.0; return mod(ij.x * 7.0 + ij.y * 3.0 + 13.0 + 1200.0, 12.0); }
    vec3 atlasPx(float piece, vec2 puv) {
      vec2 tile = vec2(mod(piece, ${ATLAS_COLS}.0), floor(piece / ${ATLAS_COLS}.0));
      vec2 uv = (tile + clamp(puv, 0.004, 0.996)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
      return texture(atlas, vec2(uv.x, 1.0 - uv.y)).rgb;
    }
    vec3 lin(vec3 s) { return toLinear(s); }
    // every artwork is alive: each piece has its own slow motion (procedural where the piece is a rule)
    vec3 art(float piece, vec2 puv, float ppx) {
      vec2 tp = puv * vec2(${TILE_W}.0, ${TILE_H}.0);   // tile px
      float aa = 1.2 * ${TILE_W}.0 / max(ppx, 1.0);       // one screen px in tile px
      bool proc = ppx > 150.0;
      if (piece < 0.5) { // flow field: the strokes advance
        vec2 d = vec2(sin(puv.y * 17.0 + t * 1.7) + sin(puv.x * 9.0 - t * 1.1), cos(puv.x * 15.0 + t * 1.3)) * 0.0045;
        return atlasPx(piece, puv + d);
      }
      if (piece < 1.5 && ppx > 480.0) { // interference: the second ring system orbits, the moiré turns
        vec2 c1 = vec2(240.0, 225.0), c2 = vec2(360.0, 207.0) + 26.0 * vec2(cos(t * 0.9), sin(t * 0.9));
        float r1 = abs(fract(length(tp - c1) / 9.0 - 0.33) - 0.5) * 9.0, r2 = abs(fract(length(tp - c2) / 9.0 - 0.33) - 0.5) * 9.0;
        float k = max(smoothstep(1.1 + aa, 1.1 - aa, r1), smoothstep(1.1 + aa, 1.1 - aa, r2));
        vec3 c = mix(lin(vec3(0.937, 0.914, 0.875)), lin(vec3(0.07)), k * 0.9);
        float rr = abs(length(tp - vec2(300.0, 216.0)) - 96.0);
        return mix(c, lin(vec3(0.886, 0.255, 0.169)), smoothstep(3.5 + aa, 3.5 - aa, rr));
      }
      if (piece < 2.5) { // floating order: the composition drifts a degree
        vec2 q = rot2(0.012 * sin(t * 0.8)) * (puv - 0.5) + 0.5 + vec2(0.006 * sin(t * 0.6), 0.0);
        return atlasPx(piece, q);
      }
      if (piece < 3.5) { // breath: the ensō turns
        vec2 q = (puv - vec2(0.48, 0.5)) * vec2(4.0 / 3.0, 1.0);
        q = rot2(0.05 * sin(t * 0.9)) * q;
        return atlasPx(piece, q / vec2(4.0 / 3.0, 1.0) + vec2(0.48, 0.5));
      }
      if (piece < 4.5) { // strata: the bands undulate
        return atlasPx(piece, puv + vec2(0.0, 0.006 * sin(t * 1.1 + puv.x * 7.0 + puv.y * 3.0)));
      }
      if (piece < 5.5) { // one line: the red point pulses
        vec3 c = atlasPx(piece, puv);
        float d = length(tp - vec2(350.0, 128.0));
        return c + lin(vec3(1.0, 0.23, 0.18)) * exp(-d * d / 300.0) * (0.25 + 0.25 * sin(t * 3.0));
      }
      if (piece < 6.5 && proc) { // tiles: truchet tiles flip, one at a time
        float s = 50.0;
        vec2 cell = floor(tp / s), lp = tp - cell * s;
        float h = hash12(cell + 7.0);
        float ph = fract(t * 0.35 + h * 3.0);
        float flip = floor(t * 0.35 + h * 3.0);
        float o = mod(floor(h * 2.0) + flip, 2.0);
        vec2 q = lp - s * 0.5;
        if (o > 0.5) q.x = -q.x;
        q += s * 0.5;
        float d1 = abs(length(q) - s * 0.5), d2 = abs(length(q - vec2(s)) - s * 0.5);
        float k = smoothstep(4.5 + aa, 4.5 - aa, min(d1, d2));
        float pop = 1.0 - smoothstep(0.0, 0.18, ph);
        vec3 bg = lin(vec3(0.18, 0.42, 0.345));
        return mix(bg, lin(vec3(0.937, 0.914, 0.875)) * (1.0 + 0.4 * pop), k);
      }
      if (piece < 7.5) { // bloom: breathes
        vec2 q = (puv - 0.5) * (1.0 - 0.035 * sin(t * 1.4)) + 0.5;
        return atlasPx(piece, q) * (1.0 + 0.08 * sin(t * 1.4));
      }
      if (piece < 8.5 && proc) { // pale world: the halftone sphere turns under a moving light
        float s = 11.0;
        vec2 cell = (floor(tp / s) + 0.5) * s;
        vec2 dd = (cell - vec2(300.0, 234.0)) / 170.0;
        float d2 = dot(dd, dd);
        vec3 bg = lin(vec3(0.051, 0.055, 0.078));
        if (d2 > 1.0) return bg;
        float nz = sqrt(1.0 - d2);
        vec3 L = normalize(vec3(-0.6 * cos(t * 0.5) - 0.2, -0.5, 0.6 + 0.2 * sin(t * 0.5)));
        float lit = sat(dot(vec3(dd.x, -dd.y, nz), vec3(L.x, -L.y, L.z)) * 1.1);
        float r = s * 0.5 * lit;
        float k = smoothstep(r + aa * 0.6, r - aa * 0.6, length(tp - cell));
        return mix(bg, lin(vec3(0.886, 0.255, 0.169)), k);
      }
      if (piece < 9.5) return atlasPx(piece, puv) * (1.0 + 0.06 * sin(t * 1.2 + puv.y * 2.0)); // colour field: breathing light
      if (piece < 10.5) return atlasPx(piece, puv + vec2(0.0, 0.012 * sin(t * 1.3 + floor(puv.x * 150.0) * 0.37))); // sorted: columns slide
      if (piece < 11.5) return atlasPx(piece, puv + vec2(0.004 * sin(t * 0.7), 0.004 * sin(t * 1.2 + puv.x * 5.0))); // ridge
      vec3 c = atlasPx(piece, puv); // the sunset: the sun's glow pulses
      float sd = length((puv - vec2(0.5, 0.48)) * vec2(1.333, 1.0));
      return c * (1.0 + 0.1 * sin(t * 1.6) * exp(-sd * 6.0));
    }
    vec3 subPx(int k, vec2 uv, float ppx) {
      // full-resolution frame when large on screen, mip-mapped thumbnail when small
      vec2 u = vec2(uv.x, 1.0 - uv.y);
      float m = smoothstep(700.0, 1100.0, ppx);
      vec3 a, b;
      if (k == 0) { a = texture(mip0, u).rgb; b = m > 0.0 ? texture(sub0, u).rgb : a; }
      else if (k == 1) { a = texture(mip1, u).rgb; b = m > 0.0 ? texture(sub1, u).rgb : a; }
      else { a = texture(mip2, u).rgb; b = m > 0.0 ? texture(sub2, u).rgb : a; }
      vec3 c = mix(a, b, m);
      // the frozen frames are alive too: a slow breathing of their light
      return c * (1.0 + 0.05 * sin(t * 1.3 + float(k) * 2.0) * (1.0 - m));
    }
    float rbox(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
    vec2 avatarOf(vec2 ij) { return G0 + ij * vec2(PX, PY) + vec2(9.0, PH + 22.0); }
    /** the community threads of one nesting level: each creator follows two neighbours */
    float threads(vec2 w, float pxw) {
      vec2 ij = floor((w - G0) / vec2(PX, PY));
      float k = 0.0;
      for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) {
        vec2 c = ij + vec2(dx, dy);
        vec2 a = avatarOf(c);
        for (int n = 0; n < 2; n++) {
          vec2 h = hash22(c * 1.7 + float(n) * 11.3);
          vec2 o = floor(h * 3.0) - 1.0;
          if (o == vec2(0.0)) continue;
          vec2 b = avatarOf(c + o);
          float d = sdSeg(w, a, b) / pxw;
          float ph = fract(t * 0.6 + h.x * 5.0);
          vec2 pp = mix(a, b, ph);
          k = max(k, sat(1.0 - abs(d) + 0.25) * 0.75);
          k = max(k, exp(-pow(length(w - pp) / pxw / 2.4, 2.0)) * 1.6);
        }
        k = max(k, exp(-pow(length(w - a) / pxw / 7.0, 2.0)) * 0.6);
      }
      return k;
    }
    void main() {
      vec2 px = FRAG_PX;
      vec2 w = camW + (px - vec2(960.0, 540.0)) / camZ;
      vec3 bg = C_INK * 0.75;
      float pxw = 1.0 / camZ;
      vec3 c;
      if (infK <= 0.0) {
        // ---- pixel grid: discrete resolution steps, then gaps, then vector dots ----
        float cs = CS / exp2(pixN);
        vec2 cc = G0 + (floor((w - G0) / cs) + 0.5) * cs;
        vec2 lc = (w - cc) / cs;
        vec3 srcC = texture(e5, vec2(cc.x / RES.x, 1.0 - cc.y / RES.y)).rgb;
        float size = mix(mix(1.0, 0.8, gapK), 0.42, dotK);
        float sd = rbox(lc, vec2(size * 0.5), 0.5 * size * dotK) * cs;
        float a = (gapK <= 0.0 && dotK <= 0.0) ? 1.0 : sat(0.5 - sd / pxw);
        vec3 dotC = mix(srcC, vec3(luma(srcC)) * 0.5 + C_BONE * 0.22, dotK * 0.3);
        // ---- panels ----
        vec2 ij = floor((w - G0) / vec2(PX, PY));
        vec2 lp = w - (G0 + ij * vec2(PX, PY));
        bool inGrid = abs(ij.x) <= ${I_RANGE}.0 && abs(ij.y) <= ${J_RANGE}.0;
        bool inPanel = inGrid && lp.x < PW && lp.y < PH;
        vec3 layer = dotC;
        float la = a * (inPanel ? 1.0 : 1.0 - outK);
        if (inPanel) {
          float t0 = ${f(T_DEV)} + 0.075 * length(vec2(ij.x, ij.y * 1.2)) + 0.08 * mod(ij.x * 3.0 + ij.y * 5.0 + 70.0, 7.0) / 7.0;
          float dev = sat((t - t0) / 0.5);
          float piece = pieceOf(ij);
          int sk = -1;
          for (int k = 0; k < 3; k++) if (sIJ[k] == ij) sk = k;
          if (dev > 0.0) {
            if (dev < 0.5) {
              // the dots swell into tiles and take the artwork's colours (a mosaic of the piece)
              float d1 = dev / 0.5;
              vec2 ccl = G0 + ij * vec2(PX, PY) + (floor(lp / CS) + 0.5) * CS;
              vec2 l2 = (w - ccl) / CS;
              float s2 = mix(0.42, 1.0, d1 * d1);
              float sd2 = rbox(l2, vec2(s2 * 0.5), 0.5 * s2 * (1.0 - d1)) * CS;
              vec2 q = (floor(lp / CS) + 0.5) * CS / vec2(PW, PH);
              vec3 artC = sk >= 0 ? subPx(sk, (q - 0.5) * vec2(0.75, 1.0) + 0.5, 200.0) : atlasPx(piece, q);
              layer = mix(dotC, artC, d1);
              la = sat(0.5 - sd2 / pxw);
            } else {
              // resolution doubles in steps until the piece is crisp
              float d2 = (dev - 0.5) / 0.5;
              float n = floor(d2 * 6.0);
              float cl = CS / exp2(n);
              vec2 q = d2 >= 1.0 ? lp : (floor(lp / cl) + 0.5) * cl;
              q /= vec2(PW, PH);
              layer = sk >= 0 ? subPx(sk, (q - 0.5) * vec2(0.75, 1.0) + 0.5, PW * camZ) : (d2 >= 1.0 ? art(piece, q, PW * camZ) : atlasPx(piece, q));
              la = 1.0;
            }
          }
        }
        c = mix(bg, layer, la);
        // grid hairlines
        vec2 g = abs(fract((w - G0) / CS + 0.5) - 0.5) * CS / pxw;
        c += C_BONE * 0.06 * gridK * sat(1.0 - min(g.x, g.y)) * (1.0 - outK);
        // the entered panels open from their 4:3 crop to the full 16:9 frame
        for (int k = 0; k < 3; k++) {
          if (sWide[k] <= 0.0) continue;
          vec2 pc = G0 + sIJ[k] * vec2(PX, PY) + vec2(PW, PH) * 0.5;
          vec2 rel = w - pc;
          float hw = PW * 0.5 + 50.0 * sWide[k];
          if (abs(rel.x) <= hw && abs(rel.y) <= PH * 0.5) c = subPx(k, rel / vec2(400.0, 225.0) + 0.5, 400.0 * camZ);
        }
      } else {
        // ---- 05d: the infinite gallery. Descend through the nesting levels: a panel big enough on screen
        // shows the gallery it holds; small ones show their artwork. ----
        vec2 q = w;
        float Zs = camZ;          // screen px per world unit at this level
        float wt = 1.0;
        bool chain = true;        // still on the centre panel chain (the levels the camera dives through)
        c = vec3(0.0);
        for (int L = 0; L < 4; L++) {
          float pw = 1.0 / Zs;
          vec2 ij = floor((q - G0) / vec2(PX, PY));
          vec2 lp = q - (G0 + ij * vec2(PX, PY));
          bool inGrid = abs(ij.x) <= ${I_RANGE}.0 && abs(ij.y) <= ${J_RANGE}.0;
          bool inPanel = inGrid && lp.x < PW && lp.y < PH;
          float iso = (chain ? 1.0 : 1.0 - isolate);
          vec3 thr = C_LINE * 1.1 * threads(q, pw) * threadK * (inGrid ? 1.0 : 0.0);
          if (!inPanel) { c += wt * (bg + thr * iso); wt = 0.0; break; }
          float ppx = PW * Zs;
          float portal = L < 3 ? smoothstep(420.0, 900.0, ppx) : 0.0;
          if (L == ${LEVEL_END} && chain) portal = 0.0;
          vec3 a;
          int sk = -1;
          if (L == 0) for (int k = 0; k < 3; k++) if (sIJ[k] == ij) sk = k;
          vec2 puv = lp / vec2(PW, PH);
          if (sk >= 0) a = subPx(sk, (puv - 0.5) * vec2(0.75, 1.0) + 0.5, ppx);
          else a = ppx < 40.0 ? atlasPx(pieceOf(ij), puv) : art(pieceOf(ij), puv, ppx);
          float la = 1.0;
          if (L == ${LEVEL_END} && chain && shrinkK > 0.0) {
            // the hand-off: unassigned panels shrink into their centres and fade; assigned ones fly (below)
            bool assignedHere = false;
            for (int k = 0; k < 15; k++) if (aIJ[k] == ij) assignedHere = true;
            vec2 cen = vec2(PW, PH) * 0.5;
            vec2 rel = (lp - cen) / max(1e-3, 1.0 - shrinkK);
            if (abs(rel.x) > PW * 0.5 || abs(rel.y) > PH * 0.5) la = 0.0;
            else a = art(pieceOf(ij), (rel + cen) / vec2(PW, PH), ppx);
            la *= 1.0 - shrinkK;
            if (assignedHere) la = 0.0;
          }
          a = mix(bg, a, la) + thr * 0.35;
          c += wt * (1.0 - portal) * mix(bg, a, iso);
          wt *= portal;
          if (wt < 0.002) break;
          chain = chain && ij == vec2(0.0);
          if (!chain && isolate >= 1.0) { c += wt * bg; wt = 0.0; break; }
          q = CC + (lp - vec2(PW, PH) * 0.5) * KN;
          Zs /= KN;
        }
        c += wt * bg;
      }
      // assigned panels travelling to their characters (screen-space rects)
      if (shrinkK > 0.0) for (int k = 0; k < 15; k++) {
        vec4 R = aRect[k];
        vec2 rel = (px - R.xy) / R.zw;
        if (abs(rel.x) <= 0.5 && abs(rel.y) <= 0.5) {
          vec3 ac = art(aPiece[k], rel + 0.5, R.z);
          ac = mix(ac, C_BONE * 0.85, smoothstep(0.55, 1.0, shrinkK));
          c = ac;
        }
      }
      fragColor = vec4(c, 1.0);
    }`, {
      e5: { value: null }, atlas: { value: null }, camW: { value: new THREE.Vector2() }, camZ: { value: 1 }, t: { value: 0 },
      sub0: { value: null }, sub1: { value: null }, sub2: { value: null }, mip0: { value: null }, mip1: { value: null }, mip2: { value: null },
      pixN: { value: 5 }, gapK: { value: 0 }, dotK: { value: 0 }, gridK: { value: 0 }, outK: { value: 0 }, shrinkK: { value: 0 },
      uiFade: { value: 1 }, infK: { value: 0 }, threadK: { value: 0 }, isolate: { value: 0 }, cancelK: { value: 0 },
      aRect: { value: Array.from({ length: 15 }, () => new THREE.Vector4(-1e4, -1e4, 0, 0)) },
      aIJ: { value: Array.from({ length: 15 }, () => new THREE.Vector2(99, 99)) },
      aPiece: { value: new Array(15).fill(0) },
      sIJ: { value: Array.from({ length: 3 }, () => new THREE.Vector2(99, 99)) },
      sWide: { value: [0, 0, 0] },
    });
  }

  /** Render panel scene k at its shown time into its targets (cached: a frozen frame is rendered once). */
  private updateSub(k: number, t: number, drawHead: boolean) {
    const st = subTime(k, t);
    const key = st + (drawHead ? 1e4 : 0);
    if (this.subKey[k] === key) return null;
    this.subKey[k] = key;
    const s = this.subs[k]!;
    s.drawHead = drawHead;
    const ov = s.render({ t: st, lt: st - SPECIAL[k]!.tIn, p: 0, under: null, tin: 1, tout: 0 }, this.subRT[k]!);
    this.down.u.src!.value = this.subRT[k]!.texture;
    this.down.render(this.ctx.renderer, this.subMip[k]!);
    return ov ?? null;
  }
  private subPost: (PostOverrides | null)[] = [null, null, null];

  /** Waypoints of the line's head (level-0 world, or a panel scene's frame while inside it). */
  headPath(t: number): V2 {
    const k0 = this.panels.findIndex((p) => p.i === 0 && p.j === 0);
    const r0 = panelRect(0, 0);
    const av0 = this.avatar(k0);
    const hop = this.edges.filter((e) => e.a === k0).map((e) => this.avatar(e.b));
    const ws: [number, number, number][] = [
      [CUE.pixels, MARK_START[0], MARK_START[1]],
      [T_DOTS, MARK_START[0], MARK_START[1]],
      [T_DOTS + 0.12, G0[0] + 4 * CS, MARK_START[1]],
      [T_DOTS + 0.24, G0[0] + 4 * CS, r0.y + r0.h],
      [T_DEV, r0.x, r0.y + r0.h],
      [T_DEV + 0.18, r0.x, r0.y],
      [T_DEV + 0.42, r0.x + r0.w, r0.y],
      [T_DEV + 0.58, r0.x + r0.w, r0.y + r0.h],
      [T_DEV + 0.8, r0.x, r0.y + r0.h],
      [CUE.community, av0[0], av0[1]],
    ];
    let tt = CUE.community;
    for (const h of hop.slice(0, 2)) { tt += 0.22; ws.push([tt, h[0], h[1]]); tt += 0.06; ws.push([tt, h[0], h[1]]); }
    // the cancelled panel: the head strikes its stamp, then dives in with the camera
    const stamp = this.stampPos();
    ws.push([CUE.cancel, ws[ws.length - 1]![1], ws[ws.length - 1]![2]]);
    ws.push([CUE.cancel + 0.4, stamp[0], stamp[1]]);
    if (t <= ws[0]![0]) return [ws[0]![1], ws[0]![2]];
    if (t <= CUE.cancel + 0.4) {
      for (let k = 1; k < ws.length; k++) {
        const [t1, x1, y1] = ws[k]!, [t0, x0, y0] = ws[k - 1]!;
        if (t <= t1) { const e = ease.inOutCubic((t - t0) / Math.max(1e-4, t1 - t0)); return [lerp(x0, x1, e), lerp(y0, y1, e)]; }
      }
    }
    // between panels: out of one frozen frame, across the gallery, into the next panel's first frame
    const legs: [number, number, () => V2, number][] = [
      [CUE.cancel + 0.4, SPECIAL[0].tIn, () => stamp, 0],
      [SPECIAL[0].tOut, SPECIAL[1].tIn, () => this.subToWorld(0, this.subs[0]!.headAt(SPECIAL[0].tOut)), 1],
      [SPECIAL[1].tOut, SPECIAL[2].tIn, () => this.subToWorld(1, this.subs[1]!.headAt(SPECIAL[1].tOut)), 2],
    ];
    for (const [a, b, from, k] of legs) {
      if (t >= a && t <= b) {
        const A = from(), B = this.subToWorld(k, this.subs[k]!.headAt(SPECIAL[k]!.tIn));
        const u = ease.inOutCubic(clamp((t - Math.max(a, b - 0.9)) / Math.min(0.9, b - a)));
        const lift = Math.sin(u * Math.PI) * 60;
        return [lerp(A[0], B[0], u), lerp(A[1], B[1], u) - lift];
      }
    }
    for (let k = 0; k < 3; k++) {
      const s = SPECIAL[k]!;
      if (t >= s.tIn && t <= s.tOut) return this.subToWorld(k, this.subs[k]!.headAt(t));
    }
    // out of the last panel to the centre: the head holds the zoom's focus while the galleries dive past
    const aiEnd = this.subToWorld(2, this.subs[2]!.headAt(SPECIAL[2].tOut));
    if (t <= CUE.infinite + 0.6) {
      const u = ease.inOutCubic(clamp((t - (SPECIAL[2].tOut + ZOOM_OUT - 0.3)) / (CUE.infinite + 0.6 - (SPECIAL[2].tOut + ZOOM_OUT - 0.3))));
      return [lerp(aiEnd[0], C[0], u), lerp(aiEnd[1], C[1], u)];
    }
    return C;
  }
  /** The final hand-off (level LEVEL_END world): the centre panel's creator → the first character. */
  headEnd(t: number): V2 {
    const k0 = this.panels.findIndex((p) => p.i === 0 && p.j === 0);
    const av0 = this.avatar(k0);
    const endW = this.screenToWorld(T_END, ...charPos(GLYPHS[0]!.i), LEVEL_END);
    const ws: [number, number, number][] = [[CUE.ocean + 0.6, C[0], C[1]], [CUE.ocean + 1.3, av0[0], av0[1]], [T_SHRINK, av0[0], av0[1]], [T_END, endW[0], endW[1]]];
    if (t <= ws[0]![0]) return [ws[0]![1], ws[0]![2]];
    for (let k = 1; k < ws.length; k++) {
      const [t1, x1, y1] = ws[k]!, [t0, x0, y0] = ws[k - 1]!;
      if (t <= t1) { const e = ease.inOutCubic((t - t0) / Math.max(1e-4, t1 - t0)); return [lerp(x0, x1, e), lerp(y0, y1, e)]; }
    }
    return [endW[0], endW[1]];
  }
  headScreen(t: number): V2 {
    if (t >= CUE.ocean + 0.6) return this.worldToScreen(t, ...this.headEnd(t), LEVEL_END);
    return this.worldToScreen(t, ...this.headPath(t));
  }
  stampPos(): V2 { const r = panelRect(SPECIAL[0].ij[0], SPECIAL[0].ij[1]); return [r.x + r.w * 0.5, r.y + r.h * 0.5]; }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t, u = this.pass.u;

    // ---- panel scenes: live while entered, posters / frozen frames otherwise ----
    const full = this.fullFrame(t);
    for (let k = 0; k < 3; k++) {
      const ov = this.updateSub(k, t, full === k);
      if (ov) this.subPost[k] = ov;
    }
    if (full >= 0) {
      // inside a panel: its frame is the screen
      this.ctx.comp.draw(r, this.subRT[full]!.texture, out, { mode: 'replace', premult: true });
      return this.subPost[full] ?? {};
    }

    const cam = this.cam(t);
    (u.camW!.value as THREE.Vector2).set(cam.W[0], cam.W[1]);
    u.camZ!.value = cam.Z; u.t!.value = t;
    u.pixN!.value = Math.max(0, 5 - Math.floor((t - CUE.pixels) / 0.08));
    u.gapK!.value = ease.outCubic(clamp((t - (T_DOTS - 0.05)) / 0.15));
    u.dotK!.value = ease.inOutCubic(clamp((t - T_DOTS) / 0.3));
    u.gridK!.value = smoothstep(T_DOTS + 0.1, T_DOTS + 0.35, t);
    u.outK!.value = smoothstep(T_DEV + 0.2, T_DEV + 0.8, t);
    u.infK!.value = t >= CUE.infinite ? 1 : 0;
    u.threadK!.value = smoothstep(CUE.infinite + 0.8, CUE.ocean, t) * (1 - smoothstep(T_SHRINK - 0.4, T_SHRINK + 0.1, t));
    u.isolate!.value = smoothstep(CUE.ocean + 0.8, T_SHRINK, t);
    for (let k = 0; k < 3; k++) {
      u[`sub${k}`]!.value = this.subRT[k]!.texture;
      u[`mip${k}`]!.value = this.subMip[k]!.texture;
      (u.sWide!.value as number[])[k] = this.widen(k, t);
    }
    const shrink = ease.inOutCubic(clamp((t - T_SHRINK) / (T_END - T_SHRINK - 0.15)));
    u.shrinkK!.value = shrink;
    const aRect = u.aRect!.value as THREE.Vector4[];
    const s2 = cam.Z / K ** LEVEL_END;
    this.assigned.forEach((k, n) => {
      const p = this.panels[k]!, rc = panelRect(p.i, p.j);
      const [sx, sy] = this.worldToScreen(t, rc.x + rc.w / 2, rc.y + rc.h / 2, LEVEL_END);
      const [tx, ty] = charPos(GLYPHS[n]!.i);
      const e = ease.inOutCubic(clamp((t - T_SHRINK - n * 0.006) / (T_END - T_SHRINK - 0.12)));
      aRect[n]!.set(lerp(sx, tx, e), lerp(sy, ty, e), lerp(rc.w * s2, 30, e), lerp(rc.h * s2, 40, e));
    });
    this.pass.render(r, out);

    // ---- creators: frames, avatars, handles, likes (screen-space type) ----
    const L = this.uiLevel(t);
    const zs = L === 0 ? cam.Z : s2;
    // the UI belongs to the gallery at rest: it fades as the camera dives into a panel or the infinite zoom
    const zoomFade = L === 0 ? 1 - smoothstep(1.15, 1.9, cam.Z) : smoothstep(CUE.ocean + 0.5, CUE.ocean + 1.2, t);
    const uiK = (1 - shrink) * zoomFade;
    const tUi = L === 0 ? 0 : CUE.ocean + 0.5 - (T_DEV + 0.3);   // the second gallery re-uses the first one's reveal
    const c = this.ui.ctx;
    this.ui.clear();
    if (t > T_DEV + 0.3 && uiK > 0) {
      for (const p of this.panels) {
        const k = ease.outCubic(clamp((t - tUi - (p.t0 + 0.45)) / 0.3)) * uiK;
        if (k <= 0) continue;
        const rc = panelRect(p.i, p.j);
        const [x, y] = this.worldToScreen(t, rc.x, rc.y, L);
        const w = rc.w * zs, h = rc.h * zs;
        if (x > 1960 || y > 1120 || x + w < -40 || y + h < -60) continue;
        const sp = L === 0 ? isSpecial(p.i, p.j) : -1;
        c.globalAlpha = k;
        c.strokeStyle = sp === 0 && t < SPECIAL[0].tOut ? `rgba(255,59,46,${0.28 + 0.5 * this.cancelK(t)})` : 'rgba(239,233,223,0.28)'; c.lineWidth = 1;
        c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
        const s = zs;
        const ay = y + h + 22 * s;
        c.fillStyle = p.hue; c.beginPath(); c.arc(x + 9 * s, ay, 8 * s, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(239,233,223,0.6)'; c.lineWidth = 1; c.stroke();
        setText(c, { fam: 'mono', px: 14 * s, weight: 400, baseline: 'middle' });
        c.fillStyle = 'rgba(239,233,223,0.82)';
        c.fillText('@' + p.handle, x + 24 * s, ay + 0.5);
        // likes: a tiny heart + count, right aligned (the count ticks up while people watch)
        const live = p.likes + Math.floor(Math.max(0, t - CUE.community) * (2 + (p.likes % 7)));
        const likes = live >= 1000 ? (live / 1000).toFixed(1) + 'k' : String(live);
        setText(c, { fam: 'mono', px: 13 * s, weight: 400, baseline: 'middle', align: 'right' });
        c.fillStyle = 'rgba(143,138,131,0.95)';
        c.fillText(likes, x + w, ay + 0.5);
        const tw = c.measureText(likes).width, hx = x + w - tw - 14 * s, hy = ay;
        const lk = t > CUE.community ? 0.5 + 0.5 * Math.sin((t - p.t0) * 9) ** 8 : 0;
        c.fillStyle = lk > 0.6 ? PAL.line : 'rgba(143,138,131,0.95)';
        c.beginPath();
        const hs = 5 * s;
        c.moveTo(hx, hy + hs * 0.9); c.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.6, hy - hs * 1.3, hx, hy - hs * 0.4);
        c.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.3, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs * 0.9); c.fill();
      }
      // collections: a few groups held by a thin bracket
      const groups: [number, number, number][] = [[-2, 1, 2], [1, 1, 2], [-4, -2, 2], [2, -3, 3]];
      for (const [gi, gj, n] of groups) {
        const k = ease.outCubic(clamp((t - tUi - (CUE.community + 0.3 + (gi + 4) * 0.05)) / 0.35)) * uiK;
        if (k <= 0) continue;
        const rc = panelRect(gi, gj);
        const [x, y] = this.worldToScreen(t, rc.x - 14, rc.y - 14, L);
        const w = (PX * (n - 1) + PW_ + 28) * zs * k, h = (PH_ + 58) * zs;
        c.globalAlpha = 0.9;
        c.strokeStyle = 'rgba(239,233,223,0.35)'; c.setLineDash([3, 5]); c.lineWidth = 1;
        c.beginPath(); c.roundRect(x, y, w, h, 6 * zs); c.stroke(); c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
    // the cancelled artwork: a stamp in the line's red
    const ck = this.cancelK(t) * (1 - smoothstep(1.0, 1.6, cam.Z));
    if (ck > 0 && t < SPECIAL[0].tFull) {
      const [sx, sy] = this.worldToScreen(t, ...this.stampPos());
      const pop = ease.outBack(clamp((t - CUE.cancel - 0.36) / 0.22));
      c.save();
      c.translate(sx, sy); c.rotate(-0.13); c.scale(cam.Z * (1.25 - 0.25 * pop), cam.Z * (1.25 - 0.25 * pop));
      c.globalAlpha = ck;
      setText(c, { fam: 'mono', px: 30, weight: 500, track: 0.16, align: 'center', baseline: 'middle' });
      const tw = c.measureText('CANCELLED').width;
      c.strokeStyle = PAL.line; c.lineWidth = 2.4;
      c.strokeRect(-tw / 2 - 12, -24, tw + 24 - 0.16 * 30, 48);
      c.lineWidth = 1; c.strokeRect(-tw / 2 - 7, -19, tw + 14 - 0.16 * 30, 38);
      c.fillStyle = PAL.line;
      c.fillText('CANCELLED', 2, 1);
      c.restore();
      c.globalAlpha = 1;
    }
    this.ctx.comp.draw(r, this.ui.upload(), out);

    // ---- community: the line becomes the threads between people ----
    const nb = this.net;
    nb.clear();
    const fadeNet = (1 - smoothstep(T_SHRINK, T_SHRINK + 0.2, t)) * zoomFade;
    const tNet = L === 0 ? CUE.community : CUE.ocean + 0.6;
    if (t > tNet && fadeNet > 0) {
      for (const e of this.edges) {
        const g = ease.inOutCubic(clamp((t - tNet - e.t0) / 0.32));
        if (g <= 0) continue;
        const A = this.avatar(e.a), B = this.avatar(e.b);
        const mx = (A[0] + B[0]) / 2 - (B[1] - A[1]) * e.bend, my = (A[1] + B[1]) / 2 + (B[0] - A[0]) * e.bend;
        const N = 22, pts: V2[] = [];
        for (let s = 0; s <= N * g; s++) {
          const q = s / N, u2 = 1 - q;
          const wx = u2 * u2 * A[0] + 2 * u2 * q * mx + q * q * B[0], wy = u2 * u2 * A[1] + 2 * u2 * q * my + q * q * B[1];
          pts.push(this.worldToScreen(t, wx, wy, L));
        }
        nb.polyline(pts, () => 1.25, () => rgba(RED, 0.78 * fadeNet, 1.05));
        // a pulse travelling along each finished thread
        if (g >= 1 && pts.length > 2) {
          const ph = ((t - tNet - e.t0 - 0.32) / 0.7) % 1;
          const pi = Math.floor(ph * (pts.length - 1));
          const [qx, qy] = pts[pi]!;
          nb.dot(qx, qy, 4.5, rgba(RED, fadeNet, 2.2));
        }
      }
      // avatars light up as they connect
      for (let k = 0; k < this.panels.length; k++) {
        const on = this.edges.some((e) => (e.a === k || e.b === k) && t > tNet + e.t0 + 0.3);
        if (!on) continue;
        const [x, y] = this.worldToScreen(t, ...this.avatar(k), L);
        nb.dot(x, y, 20 * zs, rgba(RED, 0.35 * fadeNet, 1));
      }
    }
    nb.render(r, out);

    // ---- the line's head ----
    const m = this.motif;
    m.clear();
    const pts: V2[] = [];
    for (let j = 24; j >= 0; j--) {
      const tj = Math.max(CUE.pixels, t - (0.28 * j) / 24);
      if (this.fullFrame(tj) >= 0) continue;
      pts.push(this.headScreen(tj));
    }
    m.trail(pts, 2.2, 1.4);
    const hp = this.headScreen(t);
    m.head(hp[0], hp[1], 1.15, 1);
    m.render(r, out);

    if (f.under && f.tin < 1) this.ctx.comp.draw(r, f.under, out, { mode: 'normal', opacity: 1 - ease.inOutCubic(f.tin), premult: true });
    // the grade follows the panel the camera is entering
    let post: PostOverrides = { bloom: 0.5, bloomThreshold: 0.9, vignette: 0.35, grain: 0.04, warmth: 0.05 };
    for (let k = 0; k < 3; k++) {
      const w = smoothstep(Z_FILL * 0.45, Z_FILL, cam.Z) * (this.widen(k, t) > 0 ? 1 : 0);
      const sp = this.subPost[k];
      if (w > 0 && sp) {
        const mix: PostOverrides = { ...post };
        for (const key of Object.keys(sp) as (keyof PostOverrides)[]) mix[key] = lerp(post[key] ?? 0, sp[key]!, w);
        post = mix;
      }
    }
    return post;
  }

  cancelK(t: number) { return smoothstep(CUE.cancel + 0.3, CUE.cancel + 0.42, t) * (1 - smoothstep(SPECIAL[0].tIn + 0.4, SPECIAL[0].tFull - 0.3, t)); }
}

export const _ = { BONE, TILE_W, TILE_H };
