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

- Third round (colour and detail, after "the T-rex looks bad"):
  - `relief.ts` `bodyShade` takes a third colour (back / belly / accent). Scaled skin is counter-shaded (dark back,
    accent flanks, pale belly) with bands and blotches laid out in one frame per body (`Body.p`), so they run
    across the joins between capsules. New materials: MOUTH, PAINT/PAINT2 (enamel in the 2nd/3rd colour), BRASS,
    LAMP, PELT, OCHRE, EYE_H (a human eye); RUBBER now has its own shading (it used to fall through to glass).
    Fixed: short "sphere" capsules and capsule end caps collapsed the texture coordinate into horizontal streaks.
  - T-rex rebuilt: deep skull with nasal ridge, horn and boss over a deep-set eye, a row of teeth that shows with the
    mouth shut, a lip line, jaw muscle and throat, S-curved neck, deep breathing chest, thigh muscle, osteoderms
    down the back and tail. Near-black back, rust flanks with bands, cream belly. Sauropod: olive/sage with
    blotches, dorsal spines, toenails. Ape: near-black fur with auburn tips and a wispy silhouette, a grey-tan face.
    People (`figure.ts` `Look`): hair cap with a ragged hairline, eyebrows, mouth, beard, pelt loincloths, bead
    necklace, red-ochre cheek stripe; each person has their own skin, hair and garment colours. Robots: ivory
    biped, ochre wheeled one with an ivory dome, industrial-ochre arm with hazard bands, amber lamp eyes.
  - Measured cost (4 sub-frames, warm, this container): dino full-screen frames ≈ 7.8–8.1 s, up from ≈ 5.9 s.

- Fourth round (environments, after "more details to every land, water, cart, mountain, space, hand"):
  - Space: `src/shaders/space.ts` (Milky Way band with dust lanes, terracotta/viridian nebulae, stars in five
    temperatures with glints, distant galaxies), used by Origin and continued exactly behind the planet in World.
  - Land and water (`topo.ts`): vegetation that follows life, forests, uplands, snow, polar ice, beaches, rivers;
    sea depth colours, shore foam, a running surf line, wind ripples and glints; clouds, a sun glint, a blue limb.
  - The hand: skin tone, veins, knuckles, joint creases, nails.
  - Dino era: rock with gullies/strata, lava crater and flows, a lit plume, cloud bands, a forest of conifers and
    tree ferns (`tree()` SDF), varied ground with grass and stones, a pond mirroring the sky and the fire.
  - Wheel scene: watercolour washes (sky, sun, hills, ground), grass tufts on perspective rows, pebbles, birds,
    wheel ruts and shadows; the cart is now drawn in the shader (wood deck, rail, rope lashings, push bar, a load
    of firewood, a pot and stones) and the wheels have a felloe, pegs, a hub boss and crisp spokes.
  - Measured cost (4 sub-frames, warm, this container; before → after this round): planet/map frame (9.5 s)
    ≈ 4.3 s → 7.1 s, wheel frame (58.5 s) ≈ 6.0 s → 7.3 s, dino frame (41.9 s) ≈ 8.1 s → 9.4 s.

- Fifth round (more detail on the ape, the human, the Earth, the environment):
  - `figure.ts` (NB 52 → 72): thigh and hamstring muscles, kneecap, heel, a second toe, the ape's grasping big
    toe, four separate fingers, buttocks, chest and shoulder blade on the upright forms; ape face with mouth line
    and nostrils on the muzzle; human nostrils and ear hollow. Fixed: the calf sat on the front of the shin.
    The evolution human now wears the spotted pelt.
  - Earth seen whole: savanna and sand-desert belts, softer contour lines so the colours read, a brighter surface,
    wispy banded clouds with two spiral storms.
  - Close above the ground (03a): tree crowns, shrubs and rocks with shadows, panning and zooming with the map.
  - Measured cost: planet/map frame (9.5 s, 4 sub-frames, warm) ≈ 7.1 s → 8.1 s.

- Sixth round (more environment detail):
  - 05c Toward AI: a warm dark drafting board under a hanging lamp (fibres, stains, a major/minor grid), half
    rubbed-out ghost drawings (construction circles, arcs with radii, dimension lines, a scale bar), registration
    marks, pencil smudges, a workbench below the baseline with a steel edge and seams, contact and cast shadows
    for each robot as it is built, dust drifting in the lamplight.
  - 05a Dino era: three pterosaurs gliding across the dusk glow that flap hard and scatter when the meteor falls
    (their own layer `skyRT`, composited behind the ridges and creatures); fireflies over the ferns that go out
    at the impact.

- Seventh round (details and colour across the whole film):
  - 05/05d gallery: `wallAt()` — a warm charcoal plaster wall with a picture light over each piece, thin dark
    frames with a lit top edge and soft drop shadows, at every nesting level; it fades back to the dark board as
    the panels fly into Ored's characters.
  - 06 Ored: each token carries a pigment of the gallery's art (ochre, ultramarine, vermilion, viridian) through its
    bracket, value cells and points; layers, links and nodes are tinted along the pigment cycle; the chord pattern
    is coloured by position on the ring; soft ultramarine/terracotta/viridian glows behind the board.
  - 07 end card: the same glows, breathing; some dust motes carry pigments. Wordmark, tagline and URL unchanged.
  - The opening black (the point) is left untouched on purpose.

- Eighth round (detail on every model, after "each and every model should have details"):
  - Shared body shading (`relief.ts`, used by the dinosaurs, the ape and people, the robots): every scale is a
    small lit dome (a per-cell normal), speckled scales, transverse belly plates; creases where parts join
    (`Body.ao`, the gap between the hard and the smooth union, only near the outline) are occluded and folded;
    fine wrinkles across limbs; skin with pores and mottling; fur in locks with partings; horn with growth ridges;
    eyes with iris fibres and a limbal ring (slit pupils on the scaled creatures); steel with hex bolts, grime in
    the seams, scratches and a lit bevel; enamel with grimy seams, slotted screws, worn edges, stencilled codes
    and dust; tyres with tread blocks and a sidewall; brass with verdigris; a cool fill light on the shadow side.
  - Robots: a shoulder plate, a hose with brass clamps, chest vents and status lights, a cheek grille, knee caps,
    heel spurs and a thumb (biped); an antenna, a headlamp, an exhaust and a screwed hatch (wheeled); a cable
    loop up the column, a turret ring, a warning plate and a second forearm piston (arm).
  - People: lower lip, navel, toenail, a plaited wristband (with the beads). Hand (03b): tendons, knuckle
    wrinkles, a fine diamond skin texture, freckles, forearm hair. Cart: radial grain in the spokes, felloe
    joints, a worn and dirty tread, an iron hub band with nails; an incised zigzag and a chip on the pot; bark
    fissures and lichen; textured stones; a twisted rope. Pterosaurs: feet, eye glint, lit wing fibres, claws.
  - Performance: SwiftShader runs every branch of the material chain on every pixel, so the cost of `bodyShade`
    scales with its length and with the number of calls. `bodyCommon('scales' | 'organic' | 'mech')` compiles
    only the materials a scene uses; the dino scene and the two painters each use one call (front body wins,
    a flat stand-in under its anti-aliased edge); the robots are three groups with their own boxes. Measured
    (4 sub-frames, warm, one process): dino 41.9 s ≈ 9.1–10.0 s (was 10.8–11.5), wheel 58.5 s ≈ 8.1–8.3 s
    (was 7.9–8.0), robots 74 s ≈ 8.0–8.7 s (was 12.4–13.7).

- Ninth round (legs and hands, after "the legs and hands still not perfect"):
  - T-rex: a knee and an ankle joint, a calf behind a heavier shin, a long metatarsus; three toes in a side view
    (the far one higher and set back, the near one lower), each three segments with pads under the joints and
    a hooked claw in a new dark keratin material (`MAT.CLAW`); arms with a biceps, an elbow, a hand, two
    clawed fingers of two curling segments and the nub of a third. Slots per creature: NR 120 → 170.
  - Figure (`figure.ts`, NB 72 → 112): fingers of three segments that curl by pose (loose when walking, round a
    grip, a fist on the reaching hand, folded under for the ape's knuckle-walk, fanned on the ground), a knuckle
    ridge, a thumb pad, a two-segment thumb, nails (`MAT.NAIL`) on the human hand; feet with an instep, heel,
    sole, ball, three toes, an ankle bone and an Achilles tendon; the upright leg tapers (slim knee and ankle, a
    calf that swells below the knee). The back of the hand and the top of the foot carry the coat, so the ape
    shows only dark fingers, toes and soles (ape skin darkened).
  - Robot biped: a larger hand with a palm plate, three fingers of three segments with knuckle discs and pads,
    a jointed thumb.
  - Measured (4 sub-frames, warm, one process): walker 16 s ≈ 9.9 s, dino 41.9 s ≈ 10.0–11.0 s, wheel 58.5 s
    ≈ 9.4–9.7 s, robots 72 s ≈ 5.5 s.

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
