# Prompt for the next Claude session

> Paste everything below the line into a new Claude Code session on the `albaze777/Promo` repository.

---

You are continuing work on **OredLab — "One Line"**, a code-rendered cinematic promo for OredLab.com (an art community for creators) and Ored (the AI being built from scratch alongside it). The film currently runs **26 s** and is finished, rendered and pushed. Your job is to extend it to **about 1:20 to 2:00 (80 to 120 s)** by adding the new scenes described below, render it, and deliver it.

**I am away from the keyboard. Do everything autonomously. When you have a question or a choice, take the recommended or most sensible option yourself, note the decision in your final summary, and keep going. Do not stop to ask.**

## 0. Ground rules

1. **Do not hallucinate.** Report only what you have verified: read the logs, count frames with `ffprobe`, and look at rendered PNGs and contact sheets with the Read tool. Never estimate an end time as if it were a fact. Give progress as "N of M frames" taken from the log.
2. **Work on the branch that already holds the project.** The last session used `ccr-ccac58bf-i3526t`, which contains everything. If your session names a different development branch, create it from `origin/ccr-ccac58bf-i3526t`, or merge that branch into yours, so you start from the finished 26 s film. Commit and push often: the container is ephemeral and `out/` is gitignored.
3. **Read these first:** `README.md`, `docs/TREATMENT.md` (concept and style bible), `docs/ENGINE.md` (engine guide), `src/timeline/cues.ts` and `src/timeline/timeline.ts`.
4. **Every frame must be animated.** No static holds anywhere, the end card included: use a slow push, breathing light, drifting dust or similar. Static gallery panels must come alive too (see §3.6).
5. **Keep the film's DNA.** One red point and its line (`src/motifs/line.ts`) runs through everything and keeps drawing circles. Use the restrained palette in `src/brand.ts`, crisp type and procedural visuals only: no stock images, no downloaded art and no AI-generated media. New scenes must look like they belong to the same film.
6. Do not access `oredlab.com` (the egress proxy blocks it) or the `Koe458-ui/Ored` repository (cloning it was denied by the permission policy). All brand values live in `src/brand.ts`.

## 1. The current codebase

**Stack:** bun, Vite 7, TypeScript, three.js r180 (WebGL2 through RawShaderMaterial), Canvas2D, and fontsource fonts (Instrument Sans Variable, Instrument Serif, IBM Plex Mono), all bundled locally. Offline rendering uses playwright-core 1.56.1 driving the Chromium in `/opt/pw-browsers` headless, then pipes to ffmpeg. About 4,300 lines of TS.

```
src/main.ts              preview player (keys: space, ←/→ beat, ⇧ ±1 s, ,/. frame, [/] scene, c cue, l loop, s still, m mute, h hide)
                         + export API window.__promo (still / png / stream), all in OUTPUT seconds
src/brand.ts             name, tagline "ART HAS NO LIMITS.", url, the Ored input text, palette, font stacks
src/engine/engine.ts     Engine.render(T): converts output time → story time (storyTime), composites every active
                         timeline entry (each scene renders into its own HalfFloat linear HDR target; overlapping
                         entries either crossfade or the later scene composites f.under itself when
                         handlesTransition = true), averages N motion-blur sub-frames (float ping-pong), then Post
src/engine/post.ts       bloom pyramid, exposure, soft shoulder, vignette, per-frame grain, sRGB + dither, fade/flash
src/engine/gl.ts         W×H = 1920×1080 logical; ?scale=2 renders a true 4K frame. FSPass (fullscreen GLSL3 with
                         FRAG_PX, PX_SCALE, palette C_*), Layer2D (Canvas2D → sRGB texture), canvasTexture(),
                         Compositor.draw(tex, target, {mode, opacity, scale, rotate, offset, origin, premult}), makeRT, clearRT
src/engine/lines.ts      LineBatch: instanced AA capsules and dots, 2D px or 3D camera. {soft} gaussian glows,
                         {blend:'normal'} for opaque strokes (additive blending double-counts the overlapping joints)
src/engine/scene.ts      Scene API: init(), render(f, out) → post overrides. Frame = {t (story s), lt, p, under, tin, tout}
src/timeline/cues.ts     CUE (story-clock seconds, 120 BPM), TIME_SCALE = 1.25, OUTPUT_DURATION = 26,
                         DURATION = 20.8 (story), storyTime() / outputTime()
src/timeline/timeline.ts the seven scene windows (story clock)
src/scenes/              sceneOrigin   point → ignition → 40k-particle cosmic web → accretion → sphere
                         sceneWorld    contour-drawn planet, falling sea level, the line orbits and touches down on the
                                       coast, life spreads, exponential dive
                         sceneHuman    the terrain field becomes a topographic hand; the red coast drains into the
                                       fingertip; the finger draws the first mark (an ochre circle); stone wall
                         sceneArtEvolution  six eras of ONE composition (circle/sun + a figure on a hill), each
                                       growing from the pen along a radial front: cave → pottery → sketch → ink →
                                       painting → vector
                         sceneDigitalArt    pixel steps → vector dots → grid → 63 panels that develop from the dots
                                       (13 original pieces) → handles, avatars, likes, collections → red community
                                       network → panels fly into the character cells
                         sceneOred     chars → tokens [art][ has][ no][ limits] with IDs → 10-value vectors → points →
                                       5 layers built bottom to top (with attention arcs) → top view → times-table
                                       pattern on a ring → "ORED" built on typographic guides + BUILT FROM SCRATCH
                         sceneOutro    collapse into the point → the point draws the O → OredLab wordmark (the O is
                                       the ring, the red dot sits on it) → tagline → url → hold
src/motifs/              line.ts (THE LINE: head() + trail()), orbit.ts (Origin→World geometry), world.ts (rotation,
                         touchdown exactly on the coast, dive(), MARK circle), ored.ts (charPos)
src/shaders/             common.ts (hash, value noise, fbm, SDFs, pxLine, isoLine), topo.ts (planet/terrain/hand/stone
                         shader shared by World and Human; terrain() has a float32 CPU replica in utils/noise32.ts)
src/art/                 paint.ts (dabStroke, dryBrush, splatter, wobblyCircle, paintFirstMark), eras.ts (the six eras,
                         painted at init), gallery.ts (atlas 4×4 tiles of 600×450; pieces 0–12 used, slots 13–15 FREE),
                         plates.ts (shared texture cache + artCam)
src/typography/fonts.ts  loadFonts, setText(ctx, {fam, px, weight, track(em), align, baseline}), measure
src/utils/math.ts        ease.*, keys(t, [[t, v, ease]]), prog, Rng / mulberry32 / hash, noise, catmull, hexLin
scripts/render.ts        stills | sheet (--cuts) | scene <id> | video (--from --to --fps --samples --shutter --crf
                         --preset --jobs --scale --noaudio --url) | perf | gpu   — all times in OUTPUT seconds
scripts/audio.ts         deterministic procedural sound design built from the cue sheet, laid out on the output clock
                         → public/audio/promo.wav
renders/                 oredlab-promo.mp4 (43 MB, CRF 21) and oredlab-promo_share.mp4 (26 MB, ≤ 30 MiB for chat upload)
```

**Determinism.** Every frame is a pure function of time. Use seeded RNG only; never use `Math.random()`, `Date.now()` or `performance.now()` for visuals. Sub-frames render in any order. Static art is painted once in `init()` into textures, and per-frame animation happens in shaders or cheap draws.

**Hand-offs.** Scene boundaries are solved with shared geometry rather than crossfade guesses: the orbit, the touchdown point, the `MARK` circle, `artCam`, `charPos`. Keep that standard for every new boundary.

## 2. What to build: the new edit (target about 105 s; 80 to 120 s is acceptable)

Recommended structure in output seconds. Adjust if it reads better, but stay within 80 to 120 s.

| # | output s | scene | notes |
|---|---|---|---|
| 01 | 0–5 | Origin | existing, slightly more breathing room |
| 02 | 5–9.5 | World | existing |
| **03a** | **9.5–20** | **Evolution (NEW)** | first an ape, then the ape turns into a human (see §3.1) |
| 03b | 20–25 | Human hand + first mark | existing |
| 04 | 25–33 | Art evolution | existing, eras about 1.2 s each |
| 05 | 33–39 | Digital art: pixels → gallery | existing; one panel is a "cancelled" artwork |
| **05a** | **39–57** | **Dino era (NEW)** | zoom into the cancelled panel; grazing, hunting, meteor, boom; zoom out on the boom frame |
| **05b** | **57–70** | **Wheel + drawing (NEW)** | zoom into another panel; the wheel is invented, people draw art; zoom out |
| **05c** | **70–83** | **Toward AI (NEW)** | zoom into the last panel; human progress → computation → robots; zoom out |
| **05d** | **83–89** | **Infinite gallery (NEW)** | everything zooms in: panels inside panels, a flood of artworks; the community network |
| 06 | 89–99 | Ored | existing (characters → tokens → layers → pattern → ORED) |
| 07 | 99–106 | OredLab end card | existing, with a living hold (no static frames) |

### Timing system (recommended)

Inserting about 80 s into the middle breaks absolute cue numbers. **Refactor `cues.ts` into a sequential builder** (each segment declared with a duration, and cues computed by accumulation), so inserting or lengthening a scene shifts everything after it automatically. Then either set `TIME_SCALE = 1` and author in output seconds, or keep 1.25. Either way, `outputTime`, `storyTime`, `OUTPUT_DURATION`, the timeline and `scripts/audio.ts` must stay consistent. Move to a beat grid of 96 BPM in output time, or keep 120 on the story clock.

These numbers are **hard-coded story-clock seconds**. Rewrite them relative to cues when you shift anything:
- `sceneOrigin.ts`: `smoothstep(2.1, 2.8)` in headPos, `smoothstep(2.2, 3.0)` toC, `smoothstep(2.6, 3.1)` reveal, `smoothstep(2.72, 3.0)` sphereK
- `sceneDigitalArt.ts`: `T_DOTS = 10.98`, `T_DEV = 11.32`; `devStart()` and the GLSL `devOf()` must stay identical
- `sceneOred.ts` and `sceneOutro.ts` use offsets from cues; check them after the refactor

## 3. New scene specs

General style for all new scenes: the film's language, meaning contour lines, silhouettes, fine bone hairlines, a restrained palette, the red line as the causal thread, strong eases, and transformations rather than cuts. Characters are **original procedural designs**: SDF silhouettes, contour or line drawings and capsule rigs, animated with deterministic procedural walk and run cycles (sin/cos limb angles from time). No clip art and no copied designs. Every new scene needs its own sound cues in `scripts/audio.ts`.

### 3.1 Evolution: an ape becomes a human (in the Human chapter, before the hand)
- After the dive lands on the topographic map, the contour field forms a **walking figure in the same contour-relief style as the hand** (`HAND_GLSL` and `sdHand` in `shaders/topo.ts` show the technique: a capsule SDF rig plus dome contours, an outline and echo rings).
- **Sequence:** a quadruped ape knuckle-walking → a hunched hominid → an upright human, all as **one continuous SDF morph** while the figure walks left to right across the terrain. Interpolate the rig's joint positions between poses; the contours re-flow continuously. Optionally show 2–3 ghost silhouettes trailing behind as fading contour echoes (a progression, not a static lineup).
- The red line rides with the figure, as the spark travelling at its feet or in its hand. At the end the human's hand fills the frame and becomes the existing hand shot (camera push into the hand), and the first mark proceeds as now.

### 3.2 The cancelled artwork → the dino era
- In the gallery, one panel is a **cancelled artwork**: its frame is crossed out with a red stroke, or a CANCELLED stamp in the mono voice, in the line's red. Inside it a dinosaur silhouette is visible. The line's head travels to it.
- **Zoom in.** The camera pushes into the panel until its image fills the screen. Use the panel's art as a full-screen procedural scene, rendered by a dedicated scene module (e.g. `sceneDinoEra.ts`) that is texture-matched to the panel thumbnail at the moment of the hand-off. The thumbnail for the atlas can be painted from the same drawing code, so both match.
- **Inside:** a prehistoric landscape in the film's style (contour hills, ferns, layered parallax planes). A long-necked herbivore grazing, with neck and head animation; then a predator (a T-rex-like original design) stalking and lunging in a hunt. Then a **meteor**: a red streak across the sky, using THE LINE as the meteor so the motif stays alive. Then **impact**: a shockwave ring (rhyming with the ignition at 0:01), light, dust.
- **Exactly on the boom frame, zoom out.** The full-screen image freezes into the panel at peak impact and the camera pulls back out to the gallery. The panel keeps the frozen boom frame as its thumbnail from then on.

### 3.3 The wheel and people drawing
- The line moves to another panel. **Zoom in** to an early-human scene: a figure shapes a disc, the disc becomes a **wheel** (a circle again: the motif), and a cart rolls. Nearby, people **draw on a wall**, with strokes appearing via `art/paint.ts` brushes. Then **zoom out** to the gallery.

### 3.4 Toward AI
- The line moves to the last panel. **Zoom in**: a fast evolution of human making. Tools → gears and machines → circuits and computation (a few 1s and 0s rendered as geometry, not code rain) → **robots**: 2–3 original robot designs in the film's line and blueprint style, bone hairlines with red joints, built part by part on construction guides. These robots are requested explicitly, so they are allowed, but they must be elegant, original and **not** blue/cyan sci-fi cliché. End on a robot hand that echoes the human hand and the first mark: it draws a circle. **Zoom out.**

### 3.5 The infinite gallery
- After the third zoom-out, **everything zooms in**: the camera dives into the gallery, every panel contains a smaller gallery, and those contain more (a self-similar infinite zoom; reuse the atlas with recursive UVs in the gallery shader). It becomes an ocean of artworks with the red community threads, then resolves into the existing panel → character hand-off into Ored.

### 3.6 "Every frame has animation"
- Gallery panels must be **alive**: give each piece subtle motion (flow strokes advancing, the moiré rotating, truchet tiles flipping, the halftone sphere rotating, the bloom breathing). Recommended: per-panel animated UV, hue and offset effects in the gallery shader, plus animated redraws for the few panels that are large on screen. Keep performance in mind.
- The end card hold needs gentle life: a slow push, the red dot breathing, faint drifting dust. It must stay clean and readable.
- The art-evolution eras and every other hold need micro-motion too: the pen keeps moving, and the camera drifts with intent.

## 4. Rendering (read this; it cost hours last time)

- This container has **no GPU**: WebGL is SwiftShader and Canvas2D runs on the CPU. The script already passes `--use-angle=swiftshader --disable-accelerated-2d-canvas`. With 8 motion-blur sub-frames a 1080p frame takes about **1–8 s**; the origin (40k particles) and the art scenes are the heaviest. **A 105 s film at 60 fps and 8 samples is roughly 6,300 frames, or many hours.**
- **Recommended:** build a **resumable segment renderer.** Split the film into fixed chunks of about 5–10 s; render each to `out/segments/NNN.mp4` with the same x264 settings; skip chunks that already exist and pass a frame-count check (`ffprobe -count_frames`); run 2 chunks in parallel; then losslessly concat (`-f concat -c copy`) and mux the audio. A dead browser then costs only one chunk. The existing `video --jobs` mode is not resumable.
- If it is still too slow, use 60 fps with `--samples 4`, or 30 fps with `--samples 8`, for the final. Write down which you chose. Always render a fast draft first (`--samples 1 --fps 30 --preset veryfast`) and check the motion from extracted frames before the long render.
- Gotchas from last time:
  - The retry logic restarts a job when its browser closes, so to stop a job you must `kill -9` the bun process.
  - `pgrep -f "<pattern>"` also matches your own waiter shell. Put waiters in a script file and use exact PIDs.
  - Never run extra stills or sheets while a long render runs, or you'll compete for CPU and memory.
  - Leftover renders: the 404 in browser logs is only the favicon.
- **Delivery:**
  - Make a ≤ 30 MiB share copy with a two-pass encode at a target bitrate, e.g. 29 MiB × 8 / duration. Send it to me with the SendUserFile tool, which has a 30 MiB limit. A 105 s 1080p film needs about 2.2 Mbit/s, so also consider a 720p share copy if 1080p looks too compressed.
  - Commit a higher-quality copy in `renders/` under 100 MB (GitHub's limit).

## 5. Gotchas in this codebase

- Line quads need `side: DoubleSide` (the y-down mapping flips winding); this is already done in LineBatch.
- GLSL `const float X = 300;` fails to compile. Always emit floats with `.toFixed(2)`. A shader that fails to compile leaves the previous frame in the target, so you'll see the wrong scene rather than an error. Check the browser log with `grep -a -i error`.
- Small linear values become very visible after sRGB: a flash of 0.02 turns black into gray. Keep flashes at 0.006 or below.
- Additive LineBatch strokes double-count overlapping joints. Use `{ blend: 'normal' }` for opaque white strokes such as the logo ring.
- Watch for TDZ bugs: a scene that throws renders **dark red**, so red frames in a sheet mean a JS error in that scene.
- `art/plates.ts` caches textures across scenes. Paint new art in `init()`, never per frame.
- The camera/zoom pattern for "zoom into a panel": compute the panel's screen rect from the gallery camera, scale the camera so the rect fills 1920×1080, and hand off to the full-screen scene when the rect matches the screen (the same trick as `artCam` → Digital, and the panels → `charPos`).

## 6. Workflow (do all of it)

1. Branch setup (§0.2), `bun install`, `bun run typecheck`, `bun scripts/render.ts gpu`.
2. Update `docs/TREATMENT.md` with the new structure and beat map before coding, then refactor the timing (§2).
3. Implement the scenes in order (3.1 → 3.6). After each one: `bun scripts/render.ts sheet --only <ids> --from a --to b --n 12` and full-res `stills`. **Look at them**, critique composition, continuity and readability, and fix them. Check every new hand-off with `sheet --cuts`.
4. Update the audio cues, `bun run audio`, and check the loudness: about −16 to −18 LUFS, without the peaks dominating.
5. Do a full-film contact sheet, then a fast draft render with frames checked.
6. Final render with the resumable segment renderer; verify the frame count and duration with ffprobe and inspect frames from the final file, especially around the splices.
7. Update README, ENGINE and TREATMENT; commit `renders/`; push.
8. Send me the share MP4 with SendUserFile. Finish with a short factual summary: what you built, the final duration, the render settings, the decisions you made on my behalf, and anything that is not done.
