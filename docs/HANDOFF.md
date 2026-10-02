# Handoff: where the OredLab film stands (checkpoint)

Written at a checkpoint where the session was paused on request. Everything below was checked in this
session; nothing here is an estimate unless it says so.

## Prompt for the next session

> You are continuing **OredLab — "One Line"**, a code-rendered promo film (bun, Vite, TypeScript, three.js;
> offline rendering through headless Chromium on SwiftShader, piped to ffmpeg). Read `README.md`,
> `docs/TREATMENT.md`, `docs/ENGINE.md` and `docs/HANDOFF.md` first. All code is committed. **Your job is to
> render the current version of the film, verify it, encode the delivery copies, commit them to `renders/`
> and send the share copy.** Do not change the film unless asked. Report only what you have verified
> (ffprobe frame counts, frames you have looked at); never estimate an end time as fact.
>
> 1. `bun install`, `bun run typecheck`, `bun scripts/render.ts gpu` (expect SwiftShader).
> 2. `bun run audio` (writes `public/audio/promo.wav`; check about −17.5 LUFS with ffmpeg `ebur128`).
> 3. Quick check: `bun scripts/render.ts stills --only digital --t 43.4,46.85 --out out/stills/check` and look
>    at them (meteor with a fire tail, explosion behind the ridge, detailed dinosaurs).
> 4. Render: `scripts/run_claim.sh out/segments_v2 out/oredlab-promo_master2.mp4 2 --fps 60 --samples 4
>    --shutter 0.5 --crf 16 --preset slow --chunk 5` (run it detached with `setsid nohup … &`). It starts two
>    renderer processes that share one queue of 5 s chunks (resumable: finished chunks are skipped), then
>    concatenates them and muxes the audio; `out/logs/concat.log` ends with `DONE`. If `out/segments_v2/`
>    already holds chunks from the previous session (only if the same container survived), they are reused.
> 5. Verify: `ffprobe -count_frames` on `out/oredlab-promo_master2.mp4` must report 5738 video frames
>    (95.633 s) and a 95.625 s audio stream. Extract frames on both sides of chunk boundaries (every 300
>    frames) and look at them.
> 6. Encode: `scripts/encode_delivery.sh oredlab-promo_master2.mp4` → `out/repo.mp4` (two-pass 7.8 Mbps,
>    must stay under 100 MB) and `out/share1080.mp4` (2.3 Mbps, must stay under 30 MiB = 31,457,280 bytes).
>    Copy them to `renders/oredlab-promo.mp4` and `renders/oredlab-promo_share.mp4`, commit, push, and send
>    the share copy to the user with SendUserFile.

## What the film is now

- 95.625 s (story clock 76.5 s × `TIME_SCALE` 1.25), 1080p60. Cue sheet: `src/timeline/cues.ts` (segments
  with durations; cue times are computed by accumulation). Beat map: `docs/TREATMENT.md`.
- Structure (output seconds): 01 Origin 0–5 · 02 World 5–8.75 · 03a Evolution 8.75–18.75 · 03b Human
  18.75–21.88 · 04 Art evolution 21.88–30 · 05 Digital/gallery 30–34.38 · 05a Dino era 34.38–50 · 05b Wheel
  50–63.13 · 05c Toward AI 63.13–76.88 · 05d Infinite gallery 76.88–82.5 · 06 Ored 82.5–88.13 · 07 OredLab
  end card 88.13–95.63.

## Done (committed on branch `ccr-197b92ef-9sjl8b`)

- All scenes above, the gallery host that zooms into panel scenes (`src/scenes/sceneDigitalArt.ts`), the
  resumable renderer (`bun scripts/render.ts segments`, with `--shard i/n` and `--claim`), procedural sound
  (`scripts/audio.ts`, two-pass R128 to −17 LUFS), docs.
- Second round, after user feedback:
  - **Detailed models.** `src/shaders/relief.ts` has a body system: capsule parts with materials (scales,
    skin, horn, eye, fur, metal, joint, cloth, hair, dark, glass, rubber), bone-local textures, normals
    blended across parts, decals. Dinosaurs (`sceneDinoEra.ts`): ~55 and ~80 parts (skull, jaw, teeth,
    mouth, eyes, nostrils, toes, claws, scutes, scaled skin with a paler belly). Humans
    (`src/motifs/figure.ts`): ~40 parts (hands with fingers and thumb, feet with toes, face, ear, eye, hair,
    loincloth); fur thins from ape to human (`furK`), used by 03a (in `src/shaders/topo.ts`) and by the
    people of 05b. Robots (`sceneTowardAI.ts`): steel with panel seams and rivets, pistons, cables, glass
    visor, red joint discs, jointed fingers.
  - **Real meteor.** The red star heats to white and falls with a white-hot head, a fire tail (yellow →
    orange → red), a lingering smoke trail and sparks.
  - **Impact explosion.** Flash, a turbulent fireball behind the ridge, burning debris in ballistic arcs,
    a mushroom column lit from below, a dust surge along the horizon, the hairline shockwave, fire-lit
    creatures. Dino cues changed for this: meteor 42.19 s, impact 45.00 s, boom (freeze) 46.88 s.
  - Performance fixes in the body shader (each body walks only its own part range; creatures split into
    boxed groups; no panel mips while a panel fills the screen).

## Not done / remaining

1. **The current version has not been fully rendered.** At the pause, `out/segments_v2/` (gitignored, only
   in that container) held 19 of 20 chunks (chunk 015, 75–80 s, was missing). In a new container `out/` is
   empty, so the whole film must be rendered (step 4 above).
2. **`renders/` still holds the previous version** (committed earlier, 95.3 MB and 28.8 MB): same 96 s edit
   but with the simpler relief models, the red meteor and the short impact. Replace it after rendering.
3. Optional polish noted but not done: the grazing/stalk section before the meteor is long; the opening
   "tools" stage of 05c is sparse; the gallery chunks render slowly.

## Measured render costs (this container: 4 cores, no GPU, SwiftShader)

- Warm per-frame times at 60 fps × 4 sub-frames, one process: dino full-screen ≈ 5.1 s, evolution ≈ 2.9 s,
  zoom into the dino panel ≈ 10 s. Two renderer processes saturate the 4 cores (≈ 200 % CPU each).
- The previous full render of all 20 chunks (before the detail work) took about 3.8 h with two processes;
  re-rendering chunks 001–015 of the current version had been running for about 4 h 45 min when paused.
  A full render of the current version will take longer than that.

## Gotchas (all hit in practice)

- Two renderer *workers inside one process* wedge each other's browser: use separate processes
  (`--shard` or `--claim`, as the scripts do).
- Stop renders with `kill -9` on exact PIDs (`ps -eo pid,args`); `pkill -f`/`pgrep -f` also match your own
  shell. Kill the orphaned `chrome` and `vite` processes too.
- Don't run extra stills or sheets during a long render (CPU contention).
- The 404 in browser logs is only the favicon.
- Single-frame `perf` timings include first-use shader compilation; time a few frames and use the later ones.
- In `relief.ts` decals (negative smoothing) must not claim pixels outside themselves (fixed; keep it so).
- WebGL limits: SwiftShader reports 4096 fragment uniform vectors; the dino shader uses ~300.
