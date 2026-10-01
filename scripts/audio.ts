#!/usr/bin/env bun
// Procedural sound design → public/audio/promo.wav (48 kHz, 16-bit stereo).
// Deterministic (seeded), built from the same cue sheet as the picture (src/timeline/cues.ts), so the
// sound can never drift from the edit. Replace with music by cutting to the 120 BPM grid.
//
//   bun scripts/audio.ts [--out public/audio/promo.wav]
import { CUE, DURATION, BEAT } from '../src/timeline/cues';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SR = 48000;
const N = Math.ceil(DURATION * SR);
const L = new Float32Array(N), R = new Float32Array(N), VERB = new Float32Array(N);
const TAU = Math.PI * 2;
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1]! : 'public/audio/promo.wav');

let seed = 20261001;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

type Env = (u: number, tl: number) => number; // u = 0..1 through the voice, tl = seconds since start
const perc = (decay: number, attack = 0.002): Env => (_u, tl) => (tl < attack ? tl / attack : Math.exp(-(tl - attack) / decay));
const swell = (a: number, r: number, curve = 2): Env => (u) => (u < a ? (u / a) ** curve : Math.max(0, 1 - (u - a) / (1 - a)) ** r);

interface Voice { t0: number; dur: number; amp: number; pan?: number; verb?: number }

function write(i: number, s: number, pan: number, verb: number) {
  if (i < 0 || i >= N) return;
  const p = (pan + 1) / 2;
  L[i]! += s * Math.cos(p * Math.PI / 2);
  R[i]! += s * Math.sin(p * Math.PI / 2);
  VERB[i]! += s * verb;
}

/** Oscillator voice. freq may vary with time (seconds since start). */
function tone(v: Voice & { freq: number | ((tl: number) => number); env: Env; wave?: 'sine' | 'tri' | 'saw' | 'square'; detune?: number; lp?: number }) {
  const i0 = Math.floor(v.t0 * SR), n = Math.floor(v.dur * SR);
  let ph = rnd(), ph2 = rnd(), lpz = 0;
  const a = v.lp ? 1 - Math.exp(-TAU * v.lp / SR) : 1;
  for (let k = 0; k < n; k++) {
    const tl = k / SR, f = typeof v.freq === 'number' ? v.freq : v.freq(tl);
    ph += f / SR; ph2 += (f * (1 + (v.detune ?? 0))) / SR;
    const osc = (p: number) => {
      const x = p - Math.floor(p);
      switch (v.wave ?? 'sine') {
        case 'tri': return 4 * Math.abs(x - 0.5) - 1;
        case 'saw': return 2 * x - 1;
        case 'square': return x < 0.5 ? 1 : -1;
        default: return Math.sin(TAU * x);
      }
    };
    let s = v.detune ? (osc(ph) + osc(ph2)) * 0.5 : osc(ph);
    lpz += (s - lpz) * a; s = v.lp ? lpz : s;
    write(i0 + k, s * v.amp * v.env(k / n, tl), v.pan ?? 0, v.verb ?? 0.2);
  }
}

/** Filtered noise voice: band-pass (two one-poles) with a moving centre. */
function noise(v: Voice & { env: Env; lo: number | ((u: number) => number); hi: number | ((u: number) => number) }) {
  const i0 = Math.floor(v.t0 * SR), n = Math.floor(v.dur * SR);
  let lp = 0, hp = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const hi = typeof v.hi === 'number' ? v.hi : v.hi(u), lo = typeof v.lo === 'number' ? v.lo : v.lo(u);
    const x = rnd() * 2 - 1;
    lp += (x - lp) * (1 - Math.exp(-TAU * hi / SR));
    hp += (lp - hp) * (1 - Math.exp(-TAU * lo / SR));
    write(i0 + k, (lp - hp) * v.amp * v.env(u, k / SR), v.pan ?? 0, v.verb ?? 0.25);
  }
}

const kick = (t: number, amp = 0.5, f0 = 95, f1 = 42) =>
  tone({ t0: t, dur: 0.6, amp, freq: (tl) => f1 + (f0 - f1) * Math.exp(-tl / 0.05), env: perc(0.16), verb: 0.05 });
const pluck = (t: number, m: number, amp = 0.18, pan = 0, decay = 0.6) => {
  tone({ t0: t, dur: decay * 4, amp, freq: midi(m), env: perc(decay), wave: 'tri', lp: 3200, pan, verb: 0.45 });
  tone({ t0: t, dur: decay * 2, amp: amp * 0.35, freq: midi(m + 12), env: perc(decay * 0.5), pan, verb: 0.5 });
};
const tink = (t: number, amp = 0.12) => {
  tone({ t0: t, dur: 1.2, amp, freq: 1760, env: perc(0.22), verb: 0.7 });
  tone({ t0: t, dur: 0.8, amp: amp * 0.4, freq: 2640, env: perc(0.12), verb: 0.7 });
};
const pad = (t0: number, dur: number, notes: number[], amp: number, lp: number, a = 0.3, r = 1.5, wave: 'saw' | 'tri' | 'sine' = 'saw') =>
  notes.forEach((m, i) => tone({ t0, dur, amp: amp / notes.length, freq: midi(m), env: swell(a, r), wave, detune: 0.004 + 0.002 * i, lp, pan: (i / Math.max(1, notes.length - 1)) * 1.2 - 0.6, verb: 0.55 }));

// =============================================================================================
// 01 origin
tone({ t0: 0.3, dur: 3.2, amp: 0.26, freq: 41.2, env: swell(0.22, 2.2), detune: 0.003, verb: 0.1 });       // sub swell
tink(CUE.point, 0.1);
noise({ t0: CUE.point + 0.1, dur: CUE.ignite - CUE.point - 0.1, amp: 0.22, lo: 200, hi: (u) => 300 + 5000 * u ** 3, env: (u) => u ** 3, verb: 0.2 }); // inhale
tone({ t0: CUE.ignite, dur: 2.6, amp: 0.42, freq: (tl) => 30 + 70 * Math.exp(-tl / 0.18), env: perc(0.7, 0.003), verb: 0.35 }); // ignition boom
noise({ t0: CUE.ignite, dur: 1.6, amp: 0.26, lo: 40, hi: (u) => 6000 * Math.exp(-u * 5) + 300, env: perc(0.25), verb: 0.6 });
pad(CUE.ignite, 4.2, [40, 47, 52, 54, 59], 0.16, 900, 0.25, 1.8);                                          // cosmic pad (E)
for (let i = 0; i < 18; i++) tone({ t0: CUE.ignite + 0.2 + rnd() * 1.8, dur: 1.2, amp: 0.025, freq: midi(83 + [0, 2, 4, 7, 9][i % 5]!), env: swell(0.3, 2), pan: rnd() * 2 - 1, verb: 0.9 }); // star glints
noise({ t0: CUE.converge, dur: CUE.world - CUE.converge, amp: 0.16, lo: (u) => 200 + 2000 * u, hi: (u) => 600 + 7000 * u ** 2, env: (u) => u ** 2, verb: 0.3 }); // riser
tone({ t0: CUE.converge, dur: CUE.world - CUE.converge, amp: 0.05, freq: (tl) => 200 * 2 ** (tl * 3.4), env: (u) => u ** 2, wave: 'tri', verb: 0.3 });
// 02 world
kick(CUE.world, 0.45, 80, 38); pluck(CUE.world, 64, 0.14, 0.2, 0.9);
pad(CUE.world, 2.4, [40, 47, 56, 59], 0.11, 1400, 0.3, 1.5, 'tri');
noise({ t0: CUE.land - 0.2, dur: 0.8, amp: 0.08, lo: 100, hi: 900, env: swell(0.6, 2), verb: 0.4 });
kick(CUE.life, 0.5, 90, 40); pluck(CUE.life, 76, 0.13, 0.3, 0.7); tink(CUE.life + 0.02, 0.06);
noise({ t0: CUE.dive, dur: 1.05, amp: 0.3, lo: 80, hi: (u) => 7000 * (1 - u) ** 2 + 300, env: swell(0.55, 1.5, 1.5), verb: 0.25 }); // dive whoosh
// 03 human
pad(CUE.human, 2.4, [45, 52, 61, 59, 64], 0.13, 1100, 0.25, 1.2);                                          // warmer (A add9)
kick(CUE.touch, 0.35, 70, 38); pluck(CUE.touch, 68, 0.12, -0.2, 0.8);
noise({ t0: CUE.mark, dur: CUE.markEnd - CUE.mark, amp: 0.12, lo: 600, hi: 2600, env: (u) => Math.sin(Math.PI * u) ** 0.6 * (0.7 + 0.3 * Math.sin(u * 40)), pan: 0.2, verb: 0.2 }); // pigment scrape
// 04 art evolution: a pulse on every beat, a note per era rising through the scale
const eras = [CUE.art0, CUE.art1, CUE.art2, CUE.art3, CUE.art4, CUE.art5];
const eraNotes = [64, 66, 68, 71, 73, 76];
for (let t = CUE.art0; t < CUE.pixels - 1e-6; t += BEAT) kick(t, 0.32 + 0.1 * ((t - CUE.art0) / 3.5));
eras.forEach((t, i) => { pluck(t, eraNotes[i]!, 0.16, (i % 2 ? 0.3 : -0.3), 0.5); noise({ t0: t - 0.04, dur: 0.3, amp: 0.07, lo: 1500, hi: 9000, env: perc(0.08), verb: 0.3 }); });
for (let t = CUE.art0 + BEAT / 2; t < CUE.pixels; t += BEAT) noise({ t0: t, dur: 0.08, amp: 0.035, lo: 5000, hi: 12000, env: perc(0.02), pan: 0.4, verb: 0.1 }); // off-beat ticks
pad(CUE.art4, 1.6, [52, 59, 64, 66, 68, 71], 0.16, 2400, 0.15, 1.4);                                       // colour bloom
// 05 digital
for (let k = 0; k < 6; k++) noise({ t0: CUE.pixels + k * 0.08, dur: 0.04, amp: 0.1, lo: 1000, hi: 8000, env: perc(0.01), pan: rnd() - 0.5, verb: 0.05 }); // pixel steps
const pent = [64, 66, 68, 71, 73];
for (let i = 0, t = CUE.vectors; t < CUE.ored - 0.01; i++, t += BEAT / 4) {
  const m = pent[(i * 3 + (i >> 2)) % 5]! + (i % 8 < 4 ? 12 : 0);
  tone({ t0: t, dur: 0.18, amp: 0.035, freq: midi(m), env: perc(0.05), wave: 'square', lp: 2500, pan: (i % 4) / 1.5 - 1, verb: 0.3 });
}
for (let t = CUE.vectors; t < CUE.ored; t += BEAT) kick(t, 0.22, 70, 40);
pad(CUE.gallery, 2.2, [52, 59, 63, 66], 0.09, 1800, 0.3, 1.5, 'tri');
for (let i = 0; i < 14; i++) tink(CUE.community + i * 0.07 + rnd() * 0.03, 0.025);
// 06 ored — precise
for (let i = 0; i < 17; i++) tone({ t0: CUE.ored + 0.12 + i * 0.016, dur: 0.06, amp: 0.05, freq: 2000 + (i % 3) * 300, env: perc(0.012), pan: (i / 16) * 1.6 - 0.8, verb: 0.15 });
for (let i = 0; i < 4; i++) noise({ t0: CUE.tokens + 0.1 * (i + 1), dur: 0.05, amp: 0.12, lo: 1800, hi: 6000, env: perc(0.012), pan: i / 2 - 1, verb: 0.1 });
for (let i = 0; i < 10; i++) tone({ t0: CUE.embed + i * 0.025, dur: 0.08, amp: 0.035, freq: midi(88 - i), env: perc(0.02), verb: 0.2 });
for (let l = 0; l < 5; l++) { const t = CUE.layers - 0.12 + l * 0.1; tone({ t0: t, dur: 0.4, amp: 0.07, freq: midi(52 + l * 5), env: perc(0.12), wave: 'tri', verb: 0.35 }); kick(t, 0.18, 80, 45); }
pad(CUE.pattern, 1.1, [64, 71, 76, 80], 0.12, 5000, 0.4, 1, 'sine');                                        // glassy swell
kick(CUE.oredName, 0.5, 90, 36); pad(CUE.oredName, 0.9, [40, 52, 59, 64, 68], 0.15, 1800, 0.06, 1);
// 07 collapse → silence → the point → the O → the chord
noise({ t0: CUE.collapse, dur: 0.36, amp: 0.3, lo: (u) => 200 + 3000 * u, hi: (u) => 800 + 9000 * u ** 2, env: (u) => u ** 3, verb: 0.15 }); // reverse suck
tone({ t0: CUE.collapse, dur: 0.36, amp: 0.12, freq: (tl) => 120 * 2 ** (tl * 6), env: (u) => u ** 2, wave: 'tri' });
tink(CUE.collapse + 0.36, 0.1);                                                                            // the same tink as t = 0.5
tone({ t0: CUE.ring, dur: 0.5, amp: 0.05, freq: (tl) => midi(76) * (1 + tl * 0.05), env: swell(0.8, 3), wave: 'sine', verb: 0.6 });
kick(CUE.wordmark, 0.55, 85, 36);
pad(CUE.wordmark, DURATION - CUE.wordmark, [40, 52, 59, 63, 66, 71], 0.3, 2200, 0.04, 2.2);              // final chord (E add9)
tone({ t0: CUE.wordmark, dur: 2.2, amp: 0.08, freq: midi(88), env: perc(0.6), verb: 0.8 });                // bell
tone({ t0: CUE.wordmark, dur: 2.2, amp: 0.05, freq: midi(95), env: perc(0.45), verb: 0.8 });
tone({ t0: CUE.wordmark, dur: DURATION - CUE.wordmark, amp: 0.3, freq: 41.2, env: swell(0.05, 2.5), verb: 0.1 });
for (let i = 0; i < 5; i++) tone({ t0: CUE.tagline + i * 0.05, dur: 1.2, amp: 0.02, freq: midi(83 + [0, 4, 7, 11, 14][i]!), env: perc(0.4), pan: i / 2 - 1, verb: 0.9 });
tone({ t0: CUE.url, dur: 0.1, amp: 0.04, freq: 2400, env: perc(0.015), verb: 0.4 });

// ---- reverb (Schroeder: 4 combs + 2 all-passes per channel) ----
function reverb(input: Float32Array, combs: number[], aps: number[], fb = 0.82, damp = 0.25) {
  const out = new Float32Array(N);
  for (const d of combs) {
    const buf = new Float32Array(d); let idx = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx]!; lp = y * (1 - damp) + lp * damp;
      buf[idx] = input[i]! + lp * fb; idx = (idx + 1) % d;
      out[i]! += y / combs.length;
    }
  }
  for (const d of aps) {
    const buf = new Float32Array(d); let idx = 0;
    for (let i = 0; i < N; i++) { const b = buf[idx]!, x = out[i]!; const y = -x + b; buf[idx] = x + b * 0.5; idx = (idx + 1) % d; out[i] = y; }
  }
  return out;
}
const vl = reverb(VERB, [1557, 1617, 1491, 1422].map((x) => Math.round(x * SR / 44100)), [225, 556]);
const vr = reverb(VERB, [1277, 1356, 1188, 1116].map((x) => Math.round(x * SR / 44100)), [341, 441]);

// ---- master: sum, gentle saturation, normalise, fade ----
let peak = 0;
const mixL = new Float32Array(N), mixR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  mixL[i] = Math.tanh((L[i]! + vl[i]! * 0.55) * 1.1);
  mixR[i] = Math.tanh((R[i]! + vr[i]! * 0.55) * 1.1);
  peak = Math.max(peak, Math.abs(mixL[i]!), Math.abs(mixR[i]!));
}
const gain = 0.89 / Math.max(peak, 1e-6);
const fadeN = Math.floor(0.35 * SR);
const pcm = new Int16Array(N * 2);
for (let i = 0; i < N; i++) {
  const f = i > N - fadeN ? (N - i) / fadeN : 1;
  pcm[i * 2] = Math.round(clamp(mixL[i]! * gain * f, -1, 1) * 32767);
  pcm[i * 2 + 1] = Math.round(clamp(mixR[i]! * gain * f, -1, 1) * 32767);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.byteLength, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.byteLength, 40);
mkdirSync(path.dirname(OUT), { recursive: true });
await Bun.write(OUT, Buffer.concat([header, Buffer.from(pcm.buffer)]));
console.log(`wrote ${OUT} (${DURATION}s, peak gain ${gain.toFixed(2)})`);
