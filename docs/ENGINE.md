# Engine guide

The film is a web app (TypeScript + three.js, run with bun + Vite). It renders any film time `t` deterministically at 1920×1080, or at a true 3840×2160 with `?scale=2`. The browser preview and the offline export call the same `Engine.render(t)`.

## Two clocks

Scenes, cues (`src/timeline/cues.ts`) and the timeline are authored on the **story clock** (0–76.5 s, a 120 BPM grid). `Engine.render(T)` takes **output time** (0–95.625 s, what the viewer sees) and converts it with `storyTime(T) = T / TIME_SCALE` before compositing. Scenes only ever see story time. The export API, the preview UI and `scripts/render.ts` all speak output seconds, and `scripts/audio.ts` lays the sound out on the output clock (cues × `TIME_SCALE`).

The cue sheet is a **sequence of segments** (`SEQUENCE` in `cues.ts`): each segment has a story duration and its cues as offsets from its start, and `CUE`, `SEG`, `DURATION` and `OUTPUT_DURATION` are computed by accumulation. To lengthen or insert a scene, edit its segment: every later cue, timeline window and sound moves with it. Scene code must express times relative to cues (`CUE.world - 0.2`, never `2.8`). To re-time the whole film uniformly, change `TIME_SCALE`.

## Frame pipeline

```
Engine.render(T, samples, shutter)                    T = output time
 ├─ for each sub-frame u in the shutter (samples > 1 only):
 │    composite(storyTime(T + u·shutter/fps))
 │     ├─ every timeline entry active at t renders into its own HDR target (HalfFloat, linear, premultiplied)
 │     ├─ overlapping entries: the later scene either composites `f.under` itself (handlesTransition)
 │     │  or the engine crossfades by f.tin
 │     └─ post parameters returned by scenes are merged (and blended across overlaps)
 │    accumulate (float ping-pong, NaN-safe)
 └─ Post (once per output frame): bloom pyramid · exposure · shoulder · vignette · grain (per frame) · sRGB + dither
```

- **Determinism.** A scene's output must be a pure function of `f.t`. Use `Rng`/`mulberry32`/`hash` from `utils/math.ts` with fixed seeds, and never `Math.random()`, `Date.now()` or `performance.now()` for anything visual. Sub-frames are rendered at arbitrary times, so nothing may integrate state across `render()` calls. Per-frame flicker must key on `frameIdx(t)`, which stays constant over a frame's shutter.
- **Motion blur** is true temporal supersampling: `--samples N` averages N evenly spaced sub-frames across `shutter × 1/fps`, centred on the frame time. There is no fake blur filter.
- **Grain and dither** are applied after accumulation, once per output frame, seeded by the frame index.

## Writing a scene

```ts
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass } from '../engine/gl';

export default class SceneExample extends Scene {
  override handlesTransition = true;            // composite f.under yourself during the incoming overlap
  bg = new FSPass(`void main(){ fragColor = vec4(C_INK, 1.0); }`);
  override init() { /* paint plates, build geometry: runs once */ }
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    this.bg.render(this.ctx.renderer, out);     // must fully overwrite `out`
    if (f.under && f.tin < 1) this.ctx.comp.draw(this.ctx.renderer, f.under, out, { opacity: 1 - f.tin, premult: true });
    return { bloom: 0.5, vignette: 0.4 };       // post overrides (see engine/post.ts)
  }
}
```

Then register it in `src/timeline/timeline.ts` with its window.

### Panel scenes (05a–05c)

The scenes inside gallery panels (`sceneDinoEra`, `sceneWheel`, `sceneTowardAI`) extend `PanelScene` and are **not** timeline entries: the gallery host (`sceneDigitalArt`) owns them, renders each into its own HDR target (plus a mip-mapped 1024×576 copy for when the panel is small) and owns the camera that zooms into and out of them. A panel shows the central 4:3 crop of its 16:9 frame; as the camera arrives the mask opens to 16:9, so at `Z = 1080/225` the frame fills the screen exactly and the host just blits it. The time a panel scene is shown is `clamp(t, tIn, tOut)`: its first frame (the thumbnail) before the zoom, live while entered, frozen after. A frozen frame is a pure function of a constant time, so the host caches it (re-rendering only when the shown time changes). The line is handed over explicitly: while the host carries the head it sets `drawHead = false` and draws it at `headAt(t)` mapped through the panel; full-frame, the panel scene draws it itself.

The infinite gallery (05d) is the same shader descending through nesting levels: a panel holds a whole gallery `K = 8`× smaller about its centre, and a panel larger than ~420 px on screen is replaced by the gallery it holds. The camera zooms two levels (×64); the final hand-off to Ored runs on level 2 (`worldToScreen(t, x, y, level)`). Use cues from `src/timeline/cues.ts`, and never hard-code times that the sound design also depends on.

`Frame`: `t` (film seconds), `lt` / `p` (local time and progress in the window), `under` / `tin` (the previous scene's frame and the overlap progress), `tout`.

## Toolbox

- **`engine/gl.ts`**: `FSPass(frag, uniforms)` is a fullscreen GLSL3 pass that gets `vUv`, `fragColor`, `FRAG_PX` (logical px, y down), `PX_SCALE` and the palette. Also `Layer2D` (a Canvas2D surface in logical px, uploaded as an sRGB texture), `canvasTexture()` (static plates), `Compositor.draw(tex, target, {mode, opacity, scale, rotate, offset, origin, premult})`, `makeRT()` and `clearRT()`.
- **`engine/lines.ts`**: `LineBatch` holds instanced anti-aliased capsule segments and dots, in 2D logical px or 3D with a camera. Widths are screen px and colours are linear (values above ~0.9 bloom). Use `{ soft: true }` for gaussian glows, `{ blend: 'normal' }` for opaque strokes (additive blending double-counts overlapping joints), and `polyline()` for tapered or graded lines.
- **`motifs/line.ts`**: `LineMotif` draws **the line**: `head(x, y, intensity, size)` and `trail(points, width, gain)`. Every scene draws the motif through it so it looks identical everywhere.
- **`shaders/common.ts`**: hashing, value noise and fbm, SDFs (`sdSeg`, `sdCapsule`, `sdBox`, `smin`), `pxLine`, `isoLine`, `toSRGB`, and the palette as `C_*` constants.
- **`shaders/topo.ts`**: the planet, dive, hand and stone shader shared by World and Human. Its terrain has an exact CPU replica in `utils/noise32.ts`, so scene code can find a point that is *exactly* on the coastline.
- **`art/paint.ts`**: a Canvas2D brush kit with `dabStroke` (pigment), `dryBrush` (bristles running dry), `splatter`, `wobblyCircle`, `paintFirstMark`. It is used once at init to paint plates.
- **`art/eras.ts`**: the six eras of the same composition. **`art/gallery.ts`**: the gallery atlas (13 original pieces). **`art/plates.ts`**: the shared texture cache and the art camera.
- **`typography/fonts.ts`**: `setText(ctx, style)` and `measure()`, with tracking in em. Fonts are bundled, so nothing is fetched at render time.
- **`motifs/figure.ts`**: the capsule rig of the walking figure (ape → hominid → human as one parameter, a gait phase, reach, kneel and arm overrides). Used by 03a and by the people of 05b. **`motifs/hand.ts`**: the 03b hand pose, shared with 03a's push-in morph.
- **`shaders/relief.ts`**: detailed bodies. Every capsule part carries a smoothing radius and a material (`MAT`: scales, skin, horn, eye, fur, metal, joint, cloth, hair, dark, glass, rubber). `bodyGLSL(name, n)` evaluates a range of parts as one smooth SDF and returns a `Body` (distance, the nearest part's material, bone-local texture coordinates so scales and panels stick to the limb, and a normal blended across nearby parts so each limb is lit as a volume); a negative smoothing marks a decal (eye, nostril, visor, joint disc) that recolours without changing the silhouette. `bodyShade()` shades it. `PartArray` packs parts for the uniforms; group parts with bounding boxes (as `sceneDinoEra` does) so a pixel only walks the parts near it. `shaders/topo.ts` uses the same bodies for the walking figure and morphs it into the 03b hand.
- **`utils/math.ts`**: `ease.*`, `keys(t, [[t, v, ease], …])`, `prog`, `window01`, `Rng`, `hash`, `noise1/2`, `fbm2`, `catmull`, `hexLin`.

## Hand-offs (continuity)

The line's head is never cut. Each boundary is solved with shared geometry instead of a crossfade guess:

| boundary | shared state |
|---|---|
| Origin → World | `motifs/orbit.ts`: the converge target `C`, the end camera, the planet's apparent radius `R0`, the orbit `orbitPoint(t)` (3D, projected identically by both scenes) |
| World → Human | `motifs/world.ts`: rotation, touchdown point (exactly on the coast), `dive(t)`; Human keeps rendering the same field |
| Human → Art | `MARK`: the first mark's centre and radius; the same `paintFirstMark()` paints it in both scenes; the same stone GLSL |
| Art → Digital | `art/plates.ts`: `artCam(t)`; Digital starts in art space with the art camera and quantises the E5 plate |
| Digital → Ored | `motifs/ored.ts`: `charPos(i)`; assigned panels fly to the exact character cells |
| World → Evolution | `dive(t)` lands with the touchdown point `PAN` px right of the mark and keeps scrolling (`evoPan`); the line's head starts at the landed point |
| Evolution → Human | the figure stops with its fingertip on `MARK_START`; `evoPush` scales the terrain and the figure about it; the figure's SDF morphs into `handPose(CUE.human)` (`motifs/hand.ts`) |
| Gallery → panels | the panel's frame mapping (`subToWorld`), the 4:3 → 16:9 mask, `headAt(t)` of the panel scene |
| Panels → infinite gallery | the same shader, nesting levels about the centre panel; the UI and threads move to level 2 |
| Ored → Outro | Outro scales Ored's frame into the screen centre, the position of the film's first frame |

## Output scale (4K)

Scenes lay out in logical 1920×1080 px. `?scale=2` (`--scale 2`) makes every render target, Canvas2D layer and line width physical (2×). Shaders that need pixel-based widths use `FRAG_PX`, `PX_SCALE` and `pxLine`/`isoLine`, so hairlines stay hairlines and edges get sharper rather than thinner.

## Checking your work

1. `bun run typecheck`
2. `bun scripts/render.ts sheet --only <scene> --from a --to b --n 12`, then look at the PNG.
3. `bun scripts/render.ts stills --only <scene> --t x,y` for full-resolution frames.
4. `bun scripts/render.ts scene <id>` to judge motion (panel scenes: render the `digital` window, or `video --from --to`).

The render script prints `SCENE ERRORS` and the browser console. A scene that throws renders dark red, so the failure is obvious in a sheet.

## Resumable rendering

`bun scripts/render.ts segments` splits the film into fixed chunks (`--chunk`, default 5 s) rendered to `<dir>/NNN.mp4` with identical x264 settings. A chunk that exists with the right frame count (`ffprobe -count_frames`) is skipped, so a killed run resumes where it stopped. `--jobs` workers each keep one browser (started 25 s apart) and take the next pending chunk; a chunk is written to `.part.mp4` and renamed only after its frame count checks out, a dead or stalled browser (watchdog: no frame for 180 s) costs one chunk, which is retried. Then the chunks are concatenated losslessly and the audio is muxed.
