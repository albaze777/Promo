#!/usr/bin/env bun
// Offline renderer. Drives the SAME app as the preview in headless Chromium (?export=1).
//
//   bun scripts/render.ts stills --t 0.5,1.2,9 [--only origin,world] [--out out/stills] [--samples 1]
//   bun scripts/render.ts sheet  --from 0 --to 3 [--n 12] [--cols 4] [--only origin] [--out out/sheet.png]   (or --times a,b,c | --cuts)
//   bun scripts/render.ts scene  <id> [video options]           render one scene's window
//   bun scripts/render.ts video  [--from 0] [--to 19.5] [--fps 60] [--samples 8] [--shutter 0.5]
//                                [--crf 16] [--preset slow] [--jobs 2] [--noaudio] [--out out/oredlab-promo.mp4]
//   --scale 2 (any mode): true 3840×2160.   --angle <backend>: ANGLE backend (default swiftshader on Linux,
//   metal on macOS; use "default" for a real GPU).   --url: use a running dev server.
//
// Motion blur: --samples N averages N sub-frames over shutter × (1/fps) per frame (temporal supersampling).
import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const ROOT = path.resolve(import.meta.dir, '..');
const SCALE = Math.max(1, +opt('scale', '1')!);
const OW = Math.round(1920 * SCALE), OH = Math.round(1080 * SCALE);
const SAMPLES = Math.max(1, Math.round(+opt('samples', mode === 'video' || mode === 'scene' ? '8' : '1')!));
const SHUTTER = +opt('shutter', '0.5')!;
const FPS = +opt('fps', '60')!;

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const cand = [path.join(pw, 'chromium-1194/chrome-linux/chrome'), path.join(pw, 'chromium/chrome-linux/chrome')];
  return cand.find((p) => existsSync(p));
}

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  const given = opt('url');
  if (given && (await reachable(given))) return { url: given, stop: () => {} };
  const port = 5400 + (process.pid % 500);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdout: 'ignore', stderr: 'inherit', env: { ...process.env, PROMO_NO_HMR: '1' },
  });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 300 && !(await reachable(u)); i++) await Bun.sleep(100);
  if (!(await reachable(u))) throw new Error('vite dev server did not start');
  return { url: u, stop: () => proc.kill() };
}

async function openPage(url: string, only?: string): Promise<{ browser: Browser; page: Page; logs: string[] }> {
  const angle = opt('angle', os.platform() === 'darwin' ? 'metal' : 'swiftshader')!;
  const args = ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--enable-unsafe-swiftshader'];
  if (angle !== 'default') args.push(`--use-angle=${angle}`);
  // Skia-on-SwiftShader is ~10× slower than Skia's CPU raster for Canvas2D
  if (angle === 'swiftshader') args.push('--disable-accelerated-2d-canvas');
  const exe = chromePath();
  const browser = await chromium.launch({ headless: !flag('headed'), args, ...(exe ? { executablePath: exe } : { channel: 'chrome' }) });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${url}/?export=1${only ? `&only=${only}` : ''}${SCALE !== 1 ? `&scale=${SCALE}` : ''}`);
  await page.waitForFunction(() => (window as any).__promo?.ready || (window as any).__promo?.error, null, { timeout: 300000 });
  const err = await page.evaluate(() => (window as any).__promo.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const errs: string[] = await page.evaluate(() => (window as any).__promo.errors);
  if (errs.length) console.error('SCENE ERRORS:\n' + errs.join('\n'));
  return { browser, page, logs };
}

async function savePng(page: Page, file: string) {
  await Bun.write(file, Buffer.from(await page.evaluate(() => (window as any).__promo.png()), 'base64'));
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  for (const t of times) {
    const a = performance.now();
    await page.evaluate(([t, s, sh]) => (window as any).__promo.still(t, s, sh), [t, SAMPLES, SHUTTER] as const);
    const f = path.join(outDir, `f_${t.toFixed(3).padStart(7, '0')}.png`);
    await savePng(page, f);
    console.log(`${f}  (${(performance.now() - a).toFixed(0)} ms)`);
  }
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols, samples, shutter }) => {
    const P = (window as any).__promo;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t, samples, shutter);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols, samples: SAMPLES, shutter: SHUTTER });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  console.log(out);
}

/** Encode frames [from,to) to a video-only H.264 file. */
async function encodeSegment(url: string, from: number, to: number, out: string, label: string, only?: string) {
  const { browser, page, logs } = await openPage(url, only);
  const crf = opt('crf', '16')!;
  const ff = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(FPS), '-i', 'pipe:0',
    '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'grain',
    '-x264-params', opt('x264', 'aq-mode=3')!, '-movflags', '+faststart', out], { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  let frames = 0;
  const total = Math.round(to * FPS) - Math.round(from * FPS);
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: OW * OH * 4 + 1024,
      async message(ws, msg) {
        if (typeof msg === 'string') return;
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames));
        if (frames % 10 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          console.log(`[${label}] ${frames}/${total}  ${(frames / el).toFixed(2)} fps  eta ${((total - frames) / Math.max(1e-6, frames / el)).toFixed(0)}s`);
        }
      },
    },
  });
  // a crashed renderer or a stalled pipeline must fail loudly (and be retried), never hang
  let lastFrames = -1, lastChange = performance.now();
  const crashed = new Promise<never>((_, rej) => {
    page.on('crash', () => rej(new Error(`[${label}] page crashed`)));
    browser.on('disconnected', () => rej(new Error(`[${label}] browser disconnected`)));
  });
  const watchdog = new Promise<never>((_, rej) => {
    const iv = setInterval(() => {
      if (frames !== lastFrames) { lastFrames = frames; lastChange = performance.now(); }
      else if (performance.now() - lastChange > 180000) { clearInterval(iv); rej(new Error(`[${label}] no frame for 180 s`)); }
      if (frames >= total) clearInterval(iv);
    }, 1000);
  });
  crashed.catch(() => {}); watchdog.catch(() => {}); // (they may settle after the race is decided)
  try {
    await Promise.race([
      (async () => {
        await page.evaluate((o) => (window as any).__promo.stream(o), { from, to, fps: FPS, ws: `ws://localhost:${server.port}`, samples: SAMPLES, shutter: SHUTTER });
        while (frames < total) await Bun.sleep(20);
      })(),
      crashed, watchdog,
    ]);
  } finally {
    ff.stdin.end();
    await ff.exited;
    server.stop();
    await browser.close().catch(() => {});
    if (logs.length) console.error(`[${label}] BROWSER LOG:\n` + logs.slice(0, 20).join('\n'));
  }
}

async function video(url: string, from: number, to: number, out: string, only?: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const jobs = Math.max(1, Math.round(+opt('jobs', '1')!));
  const tmp = path.join(path.dirname(out), `.segments_${path.basename(out, '.mp4')}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
  const segs: { a: number; b: number; f: string }[] = [];
  for (let j = 0; j < jobs; j++) {
    const a = n0 + Math.round(((n1 - n0) * j) / jobs), b = n0 + Math.round(((n1 - n0) * (j + 1)) / jobs);
    if (b > a) segs.push({ a: a / FPS, b: b / FPS, f: path.join(tmp, `seg${j}.mp4`) });
  }
  const t0 = performance.now();
  await Promise.all(segs.map(async (s, j) => {
    for (let attempt = 1; ; attempt++) {
      try { await encodeSegment(url, s.a, s.b, s.f, `job${j}`, only); return; }
      catch (e) { if (attempt >= 3) throw e; console.error(`${(e as Error).message} — retrying (attempt ${attempt + 1})`); }
    }
  }));
  const list = path.join(tmp, 'list.txt');
  writeFileSync(list, segs.map((s) => `file '${s.f}'`).join('\n'));
  const audio = path.join(ROOT, 'public/audio/promo.wav');
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  const withAudio = !flag('noaudio') && existsSync(audio);
  if (withAudio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  args.push('-c:v', 'copy');
  if (withAudio) args.push('-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
  args.push('-movflags', '+faststart', out);
  const mux = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' });
  await mux.exited;
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${out}  (${n1 - n0} frames, ${SAMPLES} sub-frames each, ${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}

const { url, stop } = await ensureServer();
try {
  if (mode === 'video' || mode === 'scene') {
    let from = +opt('from', '0')!, to = opt('to') ? +opt('to')! : NaN, only = opt('only');
    if (mode === 'scene') {
      const id = argv[1]!;
      const { browser, page } = await openPage(url, id);
      const tl: { id: string; start: number; end: number }[] = await page.evaluate(() => (window as any).__promo.timeline);
      await browser.close();
      const e = tl.find((x) => x.id === id);
      if (!e) throw new Error(`no timeline entry '${id}' (have: ${tl.map((x) => x.id).join(', ')})`);
      from = e.start; to = e.end; only = undefined;
    }
    if (Number.isNaN(to)) {
      const { browser, page } = await openPage(url, 'none');
      to = await page.evaluate(() => (window as any).__promo.duration) as number;
      await browser.close();
      if (!Number.isFinite(to) || to <= 0) to = 19.5;
    }
    const out = path.resolve(opt('out', path.join(ROOT, mode === 'scene' ? `out/scene_${argv[1]}.mp4` : 'out/oredlab-promo.mp4'))!);
    await video(url, from, to, out, only);
  } else {
    const { browser, page, logs } = await openPage(url, opt('only'));
    try {
      if (mode === 'stills') {
        await stills(page, (opt('t') ?? '0').split(',').map(Number), path.resolve(opt('out', path.join(ROOT, 'out/stills'))!));
      } else if (mode === 'sheet') {
        const from = +opt('from', '0')!, to = +opt('to', '19.5')!, n = +opt('n', '12')!;
        let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
        if (opt('times')) times = opt('times')!.split(',').map(Number);
        if (flag('cuts')) {
          const tl: { start: number }[] = await page.evaluate(() => (window as any).__promo.timeline);
          times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start, e.start + 0.1, e.start + 0.25]);
        }
        await sheet(page, times, +opt('cols', '4')!, path.resolve(opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!));
      } else if (mode === 'gpu') {
        console.log(await page.evaluate(() => {
          const gl = document.createElement('canvas').getContext('webgl2')!;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        }));
      } else if (mode === 'perf') {
        const from = +opt('from', '0')!, to = +opt('to', '2')!, step = +opt('step', '0.25')!;
        const r = await page.evaluate(({ from, to, step, s, sh }) => {
          const P = (window as any).__promo; const out: string[] = [];
          for (let t = from; t <= to + 1e-6; t += step) {
            const a = performance.now(); P.still(t, s, sh); P.engine.readPixels();
            out.push(`${t.toFixed(2)}s ${(performance.now() - a).toFixed(0)}ms`);
          }
          return out.join('\n');
        }, { from, to, step, s: SAMPLES, sh: SHUTTER });
        console.log(r);
      } else throw new Error(`unknown mode ${mode}`);
    } finally {
      if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
      await browser.close();
    }
  }
} finally {
  stop();
}
