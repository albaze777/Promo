// Entry: the preview player (default) or the export API (?export=1, driven by scripts/render.ts).
// Both call the same Engine.render(t): the preview is the renderer, not an approximation of it.
import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource/ibm-plex-mono/300.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/instrument-serif/400-italic.css';
import { Engine } from './engine/engine';
import { PW, PH, SCALE } from './engine/gl';
import { TIMELINE } from './timeline/timeline';
import { CUE, BEAT } from './timeline/cues';
import { loadFonts } from './typography/fonts';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const ONLY = params.get('only');
const FROM = params.get('t') ? parseFloat(params.get('t')!) : null;

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = PW;
canvas.height = PH;
const engine = new Engine(canvas, TIMELINE);

declare global { interface Window { __promo: any } }

async function boot() {
  await loadFonts();
  const onlySet = ONLY ? new Set(ONLY.split(',')) : null;
  await engine.init(onlySet ? (e) => onlySet.has(e.id) : undefined);
  if (EXPORT) setupExport();
  else setupPlayer();
}

function setupExport() {
  document.body.classList.add('export');
  window.__promo = {
    engine, scale: SCALE, width: PW, height: PH, errors: engine.errors, duration: engine.duration,
    timeline: engine.timeline.map(({ id, start, end }) => ({ id, start, end })),
    cues: CUE,
    still(t: number, samples = 1, shutter = 0.5) { engine.render(t, samples, shutter); return true; },
    /** Full-resolution PNG of the last frame (base64). */
    async png() {
      const px = engine.readPixels(), row = PW * 4;
      const img = new ImageData(PW, PH);
      for (let y = 0; y < PH; y++) img.data.set(px.subarray((PH - 1 - y) * row, (PH - y) * row), y * row);
      const oc = new OffscreenCanvas(PW, PH);
      oc.getContext('2d')!.putImageData(img, 0, 0);
      const b = new Uint8Array(await (await oc.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    },
    /** Render frames [n0, n1) and stream raw RGBA (bottom-up rows) over a WebSocket with ack backpressure. */
    async stream(o: { from: number; to: number; fps: number; ws: string; samples: number; shutter: number }) {
      const ws = new WebSocket(o.ws);
      ws.binaryType = 'arraybuffer';
      let acked = 0;
      ws.onmessage = (e) => { if (typeof e.data === 'string') acked = Math.max(acked, +e.data || 0); };
      await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = (e) => rej(e); });
      const n0 = Math.round(o.from * o.fps), n1 = Math.round(o.to * o.fps);
      const buf = new Uint8Array(PW * PH * 4);
      for (let n = n0; n < n1; n++) {
        engine.render(n / o.fps, o.samples, o.shutter, o.fps, false);
        engine.readPixels(buf);
        while (n - n0 - acked >= 3) await new Promise((r) => setTimeout(r, 2));
        ws.send(buf);
      }
      while (acked < n1 - n0) await new Promise((r) => setTimeout(r, 5));
      ws.close();
      return n1 - n0;
    },
  };
  window.__promo.ready = true;
}

function setupPlayer() {
  const audio = new Audio('audio/promo.wav');
  audio.preload = 'auto';
  const ui = document.getElementById('ui')!;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const info = document.getElementById('info')!;
  const marks = document.getElementById('marks')!;
  const cues = document.getElementById('cues')!;
  const errs = document.getElementById('errs')!;
  const D = engine.duration;
  scrub.max = String(D);
  scrub.step = '0.001';
  if (engine.errors.length) { errs.textContent = engine.errors.join('\n\n'); errs.style.display = 'block'; }
  for (const e of engine.timeline) {
    const m = document.createElement('div');
    m.className = 'mark';
    m.style.left = `${(e.start / D) * 100}%`;
    m.style.width = `${((e.end - e.start) / D) * 100}%`;
    m.title = `${e.id} ${e.start.toFixed(2)}–${e.end.toFixed(2)}`;
    m.textContent = e.id;
    m.onclick = () => seek(e.start);
    marks.appendChild(m);
  }
  for (const [name, ct] of Object.entries(CUE)) {
    const c = document.createElement('div');
    c.className = 'cue';
    c.style.left = `${(ct / D) * 100}%`;
    c.title = `${name} @ ${ct}s`;
    cues.appendChild(c);
  }

  let t = FROM ?? 0, playing = false, loop: [number, number] | null = null, muted = false;
  let clock0 = 0, t0 = 0;
  const seek = (x: number) => {
    t = Math.max(0, Math.min(D - 1e-3, x));
    if (playing) { clock0 = performance.now(); t0 = t; audio.currentTime = t; }
  };
  const toggle = () => {
    playing = !playing;
    if (playing) { clock0 = performance.now(); t0 = t; audio.currentTime = t; if (!muted) audio.play().catch(() => {}); }
    else audio.pause();
  };
  const saveStill = () => {
    engine.render(t);
    const a = document.createElement('a');
    a.download = `oredlab_${t.toFixed(3)}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  canvas.onclick = toggle;
  scrub.oninput = () => seek(parseFloat(scrub.value));
  window.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (k === ' ') { ev.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') seek(t + (ev.shiftKey ? 1 : BEAT));
    else if (k === 'ArrowLeft') seek(t - (ev.shiftKey ? 1 : BEAT));
    else if (k === '.') seek(t + 1 / 60);
    else if (k === ',') seek(t - 1 / 60);
    else if (k === 'Home') seek(0);
    else if (k === ']') { const e = engine.timeline.find((x) => x.start > t + 0.01); if (e) seek(e.start); }
    else if (k === '[') { const es = engine.timeline.filter((x) => x.start < t - 0.2); const e = es[es.length - 1]; seek(e ? e.start : 0); }
    else if (k === 'c') { const cs = Object.values(CUE).filter((c) => c > t + 0.01).sort((a, b) => a - b); if (cs.length) seek(cs[0]!); }
    else if (k === 'l') { const e = engine.timeline.find((x) => t >= x.start && t < x.end); loop = loop ? null : e ? [e.start, e.end] : null; }
    else if (k === 'm') { muted = !muted; if (muted) audio.pause(); else if (playing) audio.play().catch(() => {}); }
    else if (k === 'h') ui.classList.toggle('hidden');
    else if (k === 's') saveStill();
  });
  let frames = 0, fpsT = performance.now(), fps = 0;
  const tick = () => {
    if (playing) {
      t = t0 + (performance.now() - clock0) / 1000;
      if (loop && t >= loop[1]) seek(loop[0]);
      if (t >= D) { t = D - 1e-3; playing = false; audio.pause(); }
    }
    engine.render(t);
    scrub.value = String(t);
    frames++;
    const now = performance.now();
    if (now - fpsT > 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    const e = engine.timeline.filter((x) => t >= x.start && t < x.end).map((x) => x.id).join(' + ');
    const cue = Object.entries(CUE).filter(([, c]) => c <= t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    info.innerHTML = `<b>${t.toFixed(3)}s</b>  beat ${(t / BEAT).toFixed(2)}  [${e || '—'}]  cue: ${cue}  ${fps.toFixed(0)} fps${loop ? '  LOOP' : ''}${muted ? '  MUTED' : ''}   ·  space play  ←/→ beat  ⇧ ±1s  ,/. frame  [/] scene  c next cue  l loop  s still  m mute  h hide`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  if (import.meta.hot) {
    import.meta.hot.on('vite:afterUpdate', (payload: { updates?: { path?: string }[] }) => {
      for (const u of payload.updates ?? []) {
        const m = /scenes\/(scene\w+)\.ts/.exec(u.path ?? '');
        if (!m) continue;
        for (const e of engine.timeline) if (e.load.toString().includes(m[1]!)) engine.reload(e.id);
      }
    });
  }
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;position:fixed;top:0;left:0">${String(e?.stack ?? e)}</pre>`);
  window.__promo = { error: String(e?.stack ?? e) };
});
