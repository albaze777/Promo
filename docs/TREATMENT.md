# OredLab — "One Line" · treatment & style bible

A 95.6-second identity film for **OredLab** (an art community for creators) and **Ored** (the AI being built from scratch alongside it): about 90 s of story, then a living end card. The film is rendered entirely by code. No footage, images, artwork or media from outside the repository are used.

## The idea in one paragraph

Everything in the film is drawn by **one line**. At t = 0.9 s it is a single red point in the dark, and from then on it never leaves the frame. It ignites the universe. It orbits the matter that becomes a world, then runs along that world's first coastline, where life starts. The ground itself learns to walk: a contour figure rises out of the terrain, an ape that becomes a hominid that becomes a human, carrying the point in its hand. The human sets it down, and a fingertip makes the first mark a person ever made: a circle. Every era of art redraws that same circle: ochre on stone, a symbol on clay, a construction circle in graphite, an ink ensō, a painted sun, a vector path with four anchors. It breaks into pixels, the pixels become a gallery, and the gallery connects into a community, with the line as the threads between people. Then the gallery opens: the camera enters three of its artworks. In a cancelled panel the line hangs over grazing dinosaurs like a red star, then heats white and falls on them as a real meteor. In the next, it becomes the first wheel's axle. In the third it draws the history of making, from a hand axe to a robot whose hand draws the circle again. Then every panel turns out to hold a whole gallery, and those galleries hold more. Then the line becomes the construction path of a system built from first principles: characters, tokens, vectors, layers, and finally a pattern made purely from a rule on a circle. That pattern collapses back into the point it came from, and the point draws one last circle: the **O** of **OredLab**.

> The universe, the world, the first mark, the sun in a painting, the wheel, the circle a robot draws, the ring of a model and the O of the logo are the same circle drawn by the same line.

This is the film's DNA. The audience should never consciously notice it, but they should feel it.

## Tone

- **Studio identity film, not a tech ad.** Composition first, generous negative space, a few large shapes, hairline detail, restraint.
- **Visual causality over sequence.** Nothing just appears and nothing just disappears: each image grows *out of* the previous one, almost always from the line's current position. New eras are revealed by a growth front that radiates from the pen point.
- **Motion has intent.** Strong eases (`outExpo` for arrivals, `inExpo` for collapses, `inOutCubic` for camera moves), holds, then snaps on the beat. No floating screensaver drift: when something drifts it is the slow camera between beats, and the camera always has a destination.
- **Never:** purple nebulae, cyan/blue "AI" glow, glowing brains, code rain, chrome sci-fi robots (the three robots of 05c are blueprint drawings in the film's relief language, with red joints), lens-flare soup, fake holograms, floating UI cards, random particle explosions, screen shake, outlined or glowing type.

## Beat grid

Scenes and cues are authored on a **story clock** with a 120 BPM grid. The film plays that clock **1.25× slower** (`TIME_SCALE` in `src/timeline/cues.ts`), so the output sits on a **96 BPM** grid (beat = 0.625 s, bar = 2.5 s). The cue sheet is a **sequence of segments**, each declared with its story duration and its cues as offsets from the segment's start; cue times are computed by accumulation, so lengthening or inserting a segment shifts everything after it — picture, timeline windows and sound — automatically. Segment boundaries sit on beats. The cue sheet is read by both the visuals and the procedural sound design, so a licensed track can be cut to the same grid later.

Times below are output seconds.

| t (s) | cue | what happens |
|---|---|---|
| 0.00 | `black` | true black, faint grain |
| 0.94 | `point` | the point appears: a 2 px red-white core |
| 1.75 | `inhale` | the point's halo contracts (anticipation) |
| 1.88 | `ignite` | one hairline shockwave ring; matter expands out of the point |
| 4.06 | `converge` | matter spirals into an accretion disc |
| 5.00 | `world` | the disc closes into a sphere; the line becomes its orbit |
| 5.75 | `land` | sea level falls and continents rise as contour lines |
| 6.63 | `life` | the line strikes the coast; warmth spreads along it |
| 7.19–8.75 | `dive` | exponential zoom into the topography |
| 8.75 | `evo` | the dive lands; the terrain keeps scrolling |
| 9.06 | `evoForm` | the contour field rises into a figure; the point flies to its hand |
| 9.69 | `ape` | a knuckle-walking ape, the spark at its knuckles |
| 12.50 | `hominid` | the same rig, hunched and upright-ish; its earlier forms trail as echoes |
| 14.88 | `sapiens` | an upright human, carrying the point |
| 16.25 | `reach` | it stops, reaches forward and down, sets the point on the coast |
| 16.88–18.75 | `push` | the camera pushes into the reaching hand, which re-forms into the hand of 03b |
| 18.75 | `human` | the hand; the red coast drains into the point |
| 19.69 | `touch` | the fingertip touches the point |
| 20.00–20.88 | `mark` | the first mark: a circle in ochre, drawn counter-clockwise |
| 21.88 | `art.0` | primitive marks on stone (each era holds two beats) |
| 23.13 | `art.1` | geometric symbols on clay |
| 24.38 | `art.2` | graphite sketch, construction geometry |
| 25.63 | `art.3` | ink, ensō and seal |
| 26.88 | `art.4` | colour: a full painting (holds three beats) |
| 28.75 | `art.5` | digital vector form, anchors and handles |
| 30.00 | `pixels` | the image quantises into pixels |
| 30.63 | `vectors` | pixels round into vector dots that align into a grid |
| 31.25 | `gallery` | the grid becomes a wall of living artworks |
| 32.50 | `community` | profiles, follows, likes: the line becomes the threads |
| 33.44 | `cancel` | the line strikes a panel: CANCELLED |
| 34.38–36.25 | `dinoIn` → `dino` | the camera pushes into the cancelled panel; its frame opens to 16:9 |
| 36.25 | `dino` | a long-necked herbivore grazes; the point hangs in the sky like a red star |
| 39.06 | `stalk` | a predator stalks in from the left |
| 41.88 | `lunge` | the lunge; the herbivore flinches |
| 42.19 | `meteor` | the star heats from red to white and falls: a real meteor, fire tail and smoke trail |
| 45.00 | `impact` | impact beyond the ridge: flash, fireball, burning debris, a mushroom column, a dust surge, the hairline shockwave |
| 46.88 | `boom` | the frame freezes at the boom; the camera pulls back out to the gallery |
| 50.00 | `wheelIn` | the line leaves the boom panel for the next one; push in at 50.75 |
| 52.50 | `wheel` | warm paper: a kneeling maker strikes stone; painters at a rock face |
| 53.13 | `disc` | the line draws a circle; it becomes a disc of wood |
| 55.63 | `axle` | the point drops into the centre: the axle; four spokes are cut |
| 56.88 | `cart` | a second wheel, a platform: the maker pushes the first cart |
| 60.94 | `wheelOut` | freeze; pull back out |
| 63.13 | `aiIn` | the line moves on; push into the third panel at 63.88 |
| 65.63 | `ai` | a drawing board: a hand axe, a hammer, a pulley |
| 67.19 | `gears` | three gears are drawn and mesh |
| 68.75 | `circuits` | a chip; traces carry ones and zeros (bars and rings) |
| 70.31 | `robots` | three robots built part by part on construction guides |
| 73.13 | `robotHand` | the robot arm's hand draws the circle of the first mark |
| 74.69 | `aiOut` | freeze; pull back out |
| 76.88 | `infinite` | everything zooms in: every panel holds a gallery, which holds more |
| 79.38 | `ocean` | an ocean of artworks threaded by the community; it resolves |
| 82.50 | `ored` | panels shrink into characters |
| 83.44 | `tokens` | characters group into tokens |
| 84.38 | `embed` | tokens become vectors, then points in space |
| 85.00 | `layers` | layers are built one by one along a red path |
| 85.94 | `pattern` | a rule on a circle: the emergent pattern |
| 86.56 | `ORED` | name constructed on typographic guides |
| 88.13 | `collapse` | everything returns to the point |
| 88.75 | `ring` | the point draws the O |
| 89.31 | `wordmark` | OredLab |
| 89.81 | `tagline` | ART HAS NO LIMITS. |
| 90.13 | `url` | oredlab.com; a living hold to 95.63 (slow push, breathing dot, drifting dust) |

## Palette

The palette is one signature colour plus a neutral axis. A small pigment set is allowed **only inside the artworks** (scenes 04–05c), which is what lets the art section bloom with colour against an otherwise disciplined film.

| token | sRGB | use |
|---|---|---|
| `ink` | `#08080A` | space, background |
| `ink2` | `#121215` | panels, deep shadow |
| `graphite` | `#3B3A3F` | hairlines at rest |
| `ash` | `#8F8A83` | secondary type, dim structure |
| `bone` | `#EFE9DF` | primary lines and type; never blooms |
| **`line`** | `#FF3B2E` | **the line**: the point, the thread, the O's origin dot, connections. The only colour that glows. |
| `ember` | `#FFB08A` | the hot core of the point |
| warm grade (human) | `#1A120D` / `#E8D3B8` | background and line tint while the human is on screen |
| pigments (art only) | ochre `#C98A2E`, ultramarine `#26389B`, vermilion `#E2412B`, rose `#E8A9A0`, viridian `#2E6B58`, terracotta `#B5563A`, paper `#EDE6D8` | eras and gallery pieces |

The red is the "red" in O·red: OredLab's name carries its own signature colour. The grade progresses from **deep/cold neutral** (space) to **warm** (human), **rich** (art), **clean** (digital, on paper white and bone), **technical** (Ored: ink, bone and red only), and back to **minimal** (brand: ink, bone and one red dot).

Only the `line` colour and the point's core exceed the bloom threshold. Bone type is always crisp.

## Typography

- **Instrument Sans** (variable weight and width), set tight and confident: the wordmark and the tagline.
- **IBM Plex Mono**, the voice of the machine: characters, token IDs, labels in the Ored scene, handles in the gallery, the URL.
- **Instrument Serif Italic** appears once, as a whisper: the gallery's piece titles.
- Text appears only where it carries meaning: artist handles (they mean *people*), the characters and tokens (they *are* the material of Ored), **ORED**, **BUILT FROM SCRATCH**, and the end card. There are no captions and no explanatory copy.
- No outlines, no glow, no 3D letters. Hairline construction guides (cap height, baseline, side bearings) are drawn around ORED to show the name being *built*, and then they retract.

## Brand

The live site (oredlab.com) could not be reached from the build environment because the egress proxy blocks it. Public information available at build time: the site title is "Ored – the art community", OredLab is a curated platform for digital artists (gallery, portfolios, following, communities), and the AI is "built from scratch and trained by the creators and their friends". The end card is therefore built from first principles and **every brand value lives in one file, `src/brand.ts`** (name, tagline, URL, colours, fonts and logo construction), so the real logo or palette can be dropped in without touching scene code.

The end card wordmark: **OredLab** in Instrument Sans SemiBold, whose **O is the ring the line just drew**, with the red origin point resting on it at one o'clock. Below it are the tagline and the URL.

## The motif: the point and its line

- **Head:** a 2 px ember-white core inside a tight red halo and a wide, faint red bloom. It is always the brightest thing in frame.
- **Line:** a red hairline, 1.2–2.5 px, that tapers and fades towards its tail. Its length tells you its speed.
- **Circle:** whatever the line draws closes into a circle when it settles.
- The head is never hidden by a hard cut: at every scene boundary its screen position is handed over (`src/motifs/line.ts`, cues `handoff.*`).

## Scenes

### 01 Origin (0.00–5.00)
True black. A point fades in at screen centre and breathes. Its halo contracts, and on **1.88** a single hairline ring expands and dies while ~40k points of matter fly *out* of the point with an `outExpo` velocity profile. That matter is not random: it is distributed along a procedurally generated **cosmic web** (nodes and filaments). The camera, which started almost inside the point, is overtaken by the expansion and then chases the line as it travels through the web. On **4.06** everything feels a pull: matter spirals into an accretion disc ahead of the line, the camera settles, and the disc closes into a sphere.

### 02 World (5.00–8.75)
A procedural planet drawn as **topography**: iso-height contour hairlines on a dark sphere, lit from upper left, with a thin warm atmosphere rim. Sea level falls and continents rise as nested contours. The line tightens its orbit and touches down on a coastline; warmth spreads along the coast, which turns red. On **7.19** the camera dives with an exponential zoom straight into the topography, adding contour octaves as it goes, and lands with the touchdown point to the right of frame.

### 03a Evolution (8.75–18.75)
The dive's motion carries on as a slow scroll of the terrain. The contour field rises — the same relief language as the hand that follows (a dark dome sculpted by concentric hairlines, a bone outline, echo rings around it) — into a **figure**: one rig of about forty parts (deltoids, calves, heels and toes, palms, fingers and a thumb, a face with jaw, brow, nose, ear and eye) whose proportions, posture and gait morph continuously from a knuckle-walking ape (long arms, short bent legs, a heavy chest, a muzzle) through a hunched hominid to an upright human, while it walks left to right. Its fur thins continuously to bare skin; the upright form gains hair and a loincloth. The walk cycle is driven by the distance walked over the ground, so the feet roughly plant. The point flies from the coast to the forming figure's hand and rides there: at the ape's knuckles, then carried in the human's hand. From the hominid on, two **ghosts** — the figure as it was 1.1 and 2.25 s earlier, left where it stood on the scrolling ground — trail behind as fading contour echoes. The human stops, reaches forward and down at 30° and sets the point on the coast. The camera pushes ×6 into the reaching hand (about the point); during the push the figure's arm re-forms, as a distance-field morph, into the big hand of 03b. The hand of 03b is therefore a mirror of the original: it reaches in from the upper left, and the first mark is drawn counter-clockwise from its lower left.

### 03b Human (18.75–21.88)
The hand hovers over the point. The red coast drains into the point; on **19.69** the fingertip touches it and draws the **first mark**, a circle of ochre pigment. The hand's contours release and the terrain settles into a stone wall.

### 04 Art evolution (21.88–30.00)
The circle survives, and the world around it is re-made every two beats, each era growing out of the previous one along a front that radiates from the pen point; the pen keeps redrawing the circle once per beat (primitive → geometric → sketch → ink → colour, which holds longest → digital vector).

### 05 Digital art & creators (30.00–34.38)
The vector image quantises into pixels; the pixels round into vector dots, align, and draw a grid; the grid opens into a wall of **original procedural artworks** (flow-field brushwork, op-art moiré, a suprematist composition, an ink ensō, dusk strata, a one-line portrait, truchet arcs, a radial bloom, a halftone world, a colour field, a pixel-sort, a wire mountain, the film's own sunset) and three panels that are windows into the next scenes. **Every piece is alive**: the flow strokes advance, the moiré's second ring system orbits, truchet tiles flip, the halftone sphere turns under a moving light, the bloom breathes, the strata undulate, the pixel-sort's columns slide. Handles, avatars and like-counts appear (people); the line becomes the threads between them. Then the line strikes one panel — a dark dusk landscape with a long-necked silhouette — with a red **CANCELLED** stamp in the mono voice.

The gallery is now the film's stage. A panel shows the central 4:3 crop of a full 16:9 frame; as the camera arrives the frame opens to 16:9, so the zoom ends with the panel's frame exactly filling the screen, and the camera pulls back out on a frozen frame that stays in the panel as its thumbnail.

### 05a The cancelled artwork (34.38–50.00)
Inside: a prehistoric dusk — contour-hatched ridges and a smoking volcano with a parallax drift, a ground of perspective contours, ferns as swaying hairlines. Two original creatures, each built from ~60–80 capsule parts with materials (`shaders/relief.ts`): a **long-necked herbivore** (columnar legs with clawed feet, shoulder and hip masses, a neck of ten segments, a small skull with a chewing jaw, an amber eye and a nostril, a long tail) grazes on ferns; a **predator** (a muscular thigh, shin and three-toed clawed feet, a heavy skull with a brow ridge, eye and nostril, a jaw that opens on a dark mouth and rows of teeth, two-fingered clawed arms, dorsal scutes, a balancing tail) stalks in from the left and lunges; the herbivore flinches up. Their skin is scaled (cells that stick to each limb), paler underneath, the predator striped; each limb is lit as the volume it is. The red point has hung in the sky the whole time like a red star. Then it heats — red to white — and falls as a **real meteor**: a white-hot head, a flickering fire tail that runs from yellow through orange to red, longer as it speeds up, a smoke trail that lingers and widens, sparks shed along the way; its light warms the sky and the creatures, who look up. **Impact** beyond the ridge: a flash; a turbulent **fireball** whose temperature falls from a white core through yellow and orange to smoke, rising behind the mountains, which stand black against it with glowing ridge lines; **burning debris** thrown in ballistic arcs (hidden where it falls behind the ridge); a **mushroom column** of dark smoke lit orange from below; a **dust surge** rolling out along the horizon; the film's hairline shockwave as the pressure front; the creatures lit by the fire. On the boom frame the image freezes and the camera pulls back out to the gallery; the panel keeps the boom as its thumbnail. The joke is quiet: the cancelled artwork is the one where the line cancelled the dinosaurs.

### 05b The wheel (50.00–63.13)
The line travels to a second panel: a drawing on warm paper, a low graphite sun. A kneeling **maker** strikes a stone tool (chips fly). The people are the same detailed rig as the human of 03a: skin, hair, a loincloth, hands with fingers and a thumb, feet with toes, a face with an eye. The line draws a circle on the ground and the circle becomes a disc of wood whose growth rings are contour lines. The point drops into the centre and becomes the **axle**; four spokes are cut; a second wheel and a platform are drawn; the maker stands and pushes the first **cart**. Behind them two people paint on a rock face — an aurochs, three runners, a row of dots, a wheel sign — the strokes painted with the `art/paint.ts` brushes and revealed in painting order while each painter's arm reaches for the point being painted. Freeze; pull back.

### 05c Toward AI (63.13–76.88)
A third panel: a drawing board (ink, a faint engineering grid, a ticked baseline). The camera travels along it while the line, as a pen, draws the history of making: a hand axe with its flake scars, a hammer, a pulley; **gears** that mesh at their pitch circles and begin to turn; a **chip** whose traces route out at 45° and carry ones and zeros drawn as geometry (a bar, a ring); then **three robots**, each built part by part on dashed construction guides, in brushed steel with panel seams and rivets and red joint discs: a slender biped (plated limbs with pistons, a segmented spine, a chest plate with a red core, a glass visor), a wheeled sphere (a tyred wheel with a turning hub, a sensor dome with one eye, a gripper arm) and an industrial arm (a bolted base, a turret, links with a hydraulic piston and cables, a hand with jointed fingers). The arm's hand, an echo of the human hand, holds the point and draws the circle of the first mark (same start angle, same direction). Freeze; pull back.

### 05d The infinite gallery (76.88–82.50)
Everything zooms in. Each panel holds a whole gallery eight times smaller (the same layout, the same living pieces, recursively), and a panel that grows past ~420 px on screen dissolves into the gallery it holds. The camera dives two levels (×64) while the community's red threads light up at every level: an ocean of artworks. It resolves into one gallery, whose creators reappear with their handles and threads — and the panels shrink into Ored's characters.

### 06 Ored, built from scratch (82.50–88.13)
The visual language changes to ink, bone hairlines, IBM Plex Mono and red construction lines. Characters → tokens `[art] [has] [no] [limits]` with IDs → column vectors → points in space → layers built bottom to top along the red path → the camera rises over the stack, the nodes fall onto a ring and *connect n to k·n* draws an emergent pattern → **ORED** is constructed on its guides with **BUILT FROM SCRATCH** beneath it.

### 07 OredLab (88.13–95.63)
Everything collapses back into the point, in the same position and at the same size as at t = 0.9. The point draws one circle, which slides into place as the **O of OredLab** while the rest of the wordmark is revealed from behind it. Then **ART HAS NO LIMITS.**, then **oredlab.com**. The hold is alive: the card drifts in with a slow push (4.5 %), the red dot breathes, faint dust drifts up through the dark.

## Sound

The film works silently. A deterministic procedural sound design (`scripts/audio.ts`, rendered to `public/audio/promo.wav`) is generated from the same cue sheet: a sub swell, the point's tick, the ignition boom, footsteps on the beat under the evolving figure, a swell for each new form, an evolving pad that warms at the human, rising plucks on each era, digital ticks, an inhale of air into each panel and an exhale out, dusk wind and insects, heavy steps, a roar, the falling star's whistle and an impact that rhymes with the ignition, stone strikes and a rising tone for the drawn wheel, gear ticks, data blips and servo snaps for the robots, an accelerating shimmer into the infinite gallery, precise mono blips for the tokens, a reverse-suck into the collapse and a final chord at the logo. It is normalised (two-pass EBU R128, linear gain) to −17 LUFS integrated with −1.5 dBTP. Replace it with music by cutting to the 96 BPM output grid.
