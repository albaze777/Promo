// 01 ORIGIN — from nothing to something.
// A point in true black; an inhale; ignition: one hairline shockwave while matter expands out of the point
// along a procedural cosmic web (nodes + filaments). The camera chases the line through the web, then
// everything spirals into an accretion disc and closes into the sphere that World picks up.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LineMotif, BONE, ASH, rgba, arc } from '../motifs/line';
import { C, RP, CAM_END, makeCamera, project, orbitPoint, occluded } from '../motifs/orbit';
import { CUE } from '../timeline/cues';
import { Rng, clamp, ease, keys, lerp, smoothstep, TAU } from '../utils/math';
import { SPACE_GLSL, spaceDrift } from '../shaders/space';

const IGN = CUE.ignite;
const W0 = CUE.world; // the hand-off to World: the line joins its orbit and the disc closes into the sphere
const N_NODES = 80;
const N_STARS = 40000;

interface Edge { a: number; b: number; sag: THREE.Vector3; delay: number }

export default class SceneOrigin extends Scene {
  cam = makeCamera();
  stars = new LineBatch(N_STARS + 64, { soft: true });
  flat = new LineBatch(2048);
  motif = new LineMotif();
  bg = new FSPass(/* glsl */ `
    uniform float reveal, t; uniform vec2 drift;
    ${SPACE_GLSL}
    void main() {
      vec2 p = FRAG_PX / RES.y + drift;
      vec3 c = C_INK * 0.55 + spaceBg(p, reveal, t);
      fragColor = vec4(c, 1.0);
    }`, { reveal: { value: 0 }, t: { value: 0 }, drift: { value: new THREE.Vector2() } });

  // star data
  P = new Float32Array(N_STARS * 3);      // final (expanded) position
  S = new Float32Array(N_STARS * 3);      // sphere target (unit) for convergence
  B = new Float32Array(N_STARS);          // brightness
  Z = new Float32Array(N_STARS);          // size
  D = new Float32Array(N_STARS);          // emission delay
  R = new Float32Array(N_STARS * 2);      // disc radius / phase
  K = new Float32Array(N_STARS * 3);      // colour
  nodes: THREE.Vector3[] = [];
  edges: Edge[] = [];

  override init() {
    const rng = new Rng(20261001);
    // cosmic web: nodes in a long box ahead of the camera; filaments to nearest neighbours
    for (let i = 0; i < N_NODES; i++) {
      this.nodes.push(new THREE.Vector3(rng.range(-240, 240), rng.range(-140, 140), rng.range(-1000, 30)));
    }
    const seen = new Set<string>();
    this.nodes.forEach((n, i) => {
      const near = this.nodes.map((m, j) => ({ j, d: n.distanceTo(m) })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d).slice(0, 3);
      for (const { j, d } of near) {
        if (d > 260) continue;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push({ a: i, b: j, sag: new THREE.Vector3(rng.gauss(), rng.gauss(), rng.gauss()).multiplyScalar(d * 0.08), delay: rng.range(0, 0.5) });
      }
    });
    const fib = (i: number, n: number) => {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    };
    for (let i = 0; i < N_STARS; i++) {
      const u = rng.next();
      let p: THREE.Vector3;
      if (u < 0.62 && this.edges.length) {
        // along a filament (curved), with a tight gaussian spread
        const e = rng.pick(this.edges), t = rng.next();
        const a = this.nodes[e.a]!, b = this.nodes[e.b]!;
        p = a.clone().lerp(b, t).addScaledVector(e.sag, 4 * t * (1 - t));
        p.add(new THREE.Vector3(rng.gauss(), rng.gauss(), rng.gauss()).multiplyScalar(1.6 + 2.2 * rng.next() ** 2));
      } else if (u < 0.8) {
        const n = rng.pick(this.nodes);
        p = n.clone().add(new THREE.Vector3(rng.gauss(), rng.gauss(), rng.gauss()).multiplyScalar(7 + rng.next() * 6));
      } else {
        p = new THREE.Vector3(rng.range(-700, 700), rng.range(-420, 420), rng.range(-1400, 40));
      }
      this.P.set([p.x, p.y, p.z], i * 3);
      this.S.set(fib(i, N_STARS), i * 3);
      const pw = rng.next();
      this.B[i] = 0.10 + 1.1 * pw ** 6 + 0.12 * rng.next();
      this.Z[i] = 0.9 + 1.4 * rng.next() ** 3;
      this.D[i] = rng.next() ** 2 * 0.22;
      this.R[i * 2] = Math.sqrt(rng.next());
      this.R[i * 2 + 1] = rng.next() * TAU;
      // colour: mostly bone, with blue-white, gold, orange and a few red stars; some filament gas glows
      // terracotta or viridian
      const c = rng.next();
      const col = c < 0.07 ? [1.0, 0.74, 0.52] : c < 0.16 ? [0.7, 0.8, 1.0] : c < 0.21 ? [1.0, 0.86, 0.55] : c < 0.24 ? [1.0, 0.5, 0.38]
        : c < 0.3 && u < 0.62 ? [0.9, 0.45, 0.32] : c < 0.35 && u < 0.62 ? [0.4, 0.75, 0.66] : [BONE[0], BONE[1], BONE[2]];
      this.K.set(col, i * 3);
    }
  }

  /** Camera position at t: near the point, overtaken by the expansion, chasing the line, settling at CAM_END. */
  camPos(t: number, out = new THREE.Vector3()) {
    const z = keys(t, [[0, 60], [IGN, 52, ease.outCubic], [CUE.world, CAM_END.z, ease.inOutCubic]]);
    const u = clamp((t - IGN) / (CUE.world - IGN));
    const sway = Math.sin(u * Math.PI);
    return out.set(lerp(0, CAM_END.x, u) + 16 * sway * Math.sin(u * 4.1), lerp(0, CAM_END.y, u) + 7 * sway * Math.cos(u * 3.3), z);
  }

  /** The line's head in world space. */
  headPos(t: number, out = new THREE.Vector3()) {
    if (t <= IGN) return out.set(0, 0, 0);
    const u = t - IGN;
    const cz = this.camPos(t).z;
    const lead = 22 * (1 - Math.exp(-u * 2));
    const f = new THREE.Vector3(10 * Math.sin(1.9 * u), -5 * Math.sin(1.3 * u), cz - 52 - lead);
    const b = smoothstep(W0 - 0.9, W0 - 0.2, t);
    if (b <= 0) return out.copy(f);
    return out.copy(f).lerp(orbitPoint(t), b);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer, t = f.t;
    const cam = this.cam;
    const cp = this.camPos(t);
    cam.position.copy(cp);
    const look = cp.clone().add(new THREE.Vector3(0, 0, -1));
    const toC = smoothstep(W0 - 0.8, W0, t);
    look.lerp(C, toC);
    cam.lookAt(look);
    cam.rotateZ(0.05 * Math.sin(clamp((t - IGN) / 2) * Math.PI));
    cam.updateMatrixWorld();
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);

    this.bg.u.reveal!.value = smoothstep(IGN, IGN + 1.2, t) * (1 - smoothstep(W0 - 0.4, W0 + 0.1, t) * 0.5);
    const dr = spaceDrift(cp.x, cp.z);
    (this.bg.u.drift!.value as THREE.Vector2).set(dr[0], dr[1]);
    this.bg.u.t!.value = t;
    this.bg.render(r, out);

    const conv = ease.inOutCubic(clamp((t - CUE.converge) / (CUE.world - CUE.converge)));
    const sphereK = smoothstep(W0 - 0.28, W0, t);

    // ---- matter -----------------------------------------------------------------
    const st = this.stars;
    st.clear();
    if (t > IGN) {
      const v = new THREE.Vector3(), d = new THREE.Vector3(), tg = new THREE.Vector3();
      const spin = (t - CUE.converge) * 3.2;
      for (let i = 0; i < N_STARS; i++) {
        const age = t - IGN - this.D[i]!;
        if (age <= 0) continue;
        const e = 1 - Math.exp(-age * 3.4);
        v.set(this.P[i * 3]! * e, this.P[i * 3 + 1]! * e, this.P[i * 3 + 2]! * e);
        let bright = this.B[i]! * smoothstep(0.03, 0.45, age) * 2.8;
        if (conv > 0) {
          // accretion: disc in the orbital plane spinning differentially, closing into the sphere
          const rr = this.R[i * 2]!, ph = this.R[i * 2 + 1]! + spin / (0.35 + rr);
          const discR = RP * (1.15 + 2.4 * rr) * (1 - sphereK) + RP * sphereK;
          tg.set(Math.cos(ph) * discR, (this.S[i * 3 + 1]! * RP) * sphereK + rr * 0.6 * Math.sin(ph * 3) * (1 - sphereK), Math.sin(ph) * discR);
          tg.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.42 * (1 - sphereK));
          if (sphereK > 0) {
            const sx = this.S[i * 3]! * RP, sy = this.S[i * 3 + 1]! * RP, sz = this.S[i * 3 + 2]! * RP;
            tg.lerp(new THREE.Vector3(sx, sy, sz), sphereK);
          }
          tg.add(C);
          const ci = ease.inOutCubic(clamp((t - CUE.converge - 0.12 * rr) / (CUE.world - CUE.converge - 0.12)));
          v.lerp(tg, ci);
          // only a third of the matter forms the disc; the rest thins away so transit doesn't read as noise
          if (i % 3 !== 0) bright *= 1 - conv;
          else bright *= (0.35 + 0.65 * ci * ci) * (1 + conv * 1.4);
        }
        d.copy(v).sub(cp);
        const w = d.dot(fwd);
        if (w < 1.5) continue;
        const fog = Math.exp(-Math.max(0, w - 420) / 700);
        if (fog < 0.02) continue;
        const px = clamp((this.Z[i]! * 62) / w, 0.9, 7);
        const nearDim = Math.min(1, w / 14);
        const a = bright * fog * nearDim * (1.6 / (1 + px * 0.25));
        const k = i * 3;
        st.seg(v.x, v.y, v.z, v.x, v.y, v.z, px, px, [this.K[k]! * a, this.K[k + 1]! * a, this.K[k + 2]! * a, 1]);
      }
    }
    st.render(r, out, cam);

    // ---- shockwave (2D hairline) -------------------------------------------------
    const fb = this.flat;
    fb.clear();
    for (const [delay, amp] of [[0, 0.75], [0.07, 0.3]] as const) {
      const u = (t - IGN - delay) / 1.1;
      if (u > 0 && u < 1) {
        const rad = 1400 * ease.outExpo(u);
        const al = amp * (1 - u) ** 2.2;
        const pts = arc(960, 540, rad, 0, TAU, 360);
        fb.polyline(pts, () => 1.3, () => rgba(BONE, al));
      }
    }
    fb.render(r, out);

    // ---- the line ------------------------------------------------------------
    const m = this.motif;
    m.clear();
    let inten = 0, size = 1;
    if (t < IGN) {
      inten = ease.outCubic(clamp((t - CUE.point) / 0.35));
      const inh = clamp((t - CUE.inhale) / (IGN - CUE.inhale));
      size = 1 - 0.45 * ease.inCubic(inh);
      inten *= 1 + 0.5 * inh;
      inten *= 1 + 0.06 * Math.sin((t - CUE.point) * 9) * (1 - inh);
    } else {
      inten = 1.1 + 1.4 * Math.exp(-(t - IGN) / 0.12);
      size = 1 + 0.6 * Math.exp(-(t - IGN) / 0.2);
    }
    const hp = this.headPos(t);
    const hs = project(cam, hp);
    if (t >= IGN) {
      const pts: number[][] = [];
      const span = 0.5, NS = 48;
      for (let j = NS; j >= 0; j--) {
        const tj = t - (span * j) / NS;
        if (tj < IGN) continue;
        const p3 = this.headPos(tj);
        if (t > W0 - 0.2 && occluded(p3)) { if (pts.length > 1) m.trail(pts, 2.0, 1.4); pts.length = 0; continue; }
        const s = project(cam, p3);
        if (s[2] < 1) continue;
        pts.push([s[0], s[1]]);
      }
      if (pts.length > 1) m.trail(pts, 2.0, 1.4);
    }
    if (hs[2] > 1 && !(t > W0 - 0.2 && occluded(hp))) m.head(hs[0], hs[1], inten, size);
    m.render(r, out);

    const flash = t >= IGN ? 0.006 * Math.pow(0.5, (t - IGN) / 0.03) : 0;
    return { bloom: 0.7, bloomThreshold: 0.85, vignette: 0.5, grain: 0.05, flash, exposure: 1.0 };
  }
}
