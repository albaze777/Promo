# OredLab — "One Line" · treatment & style bible

An 18-second identity film for **OredLab** (an art community for creators) and **Ored** (the AI being built from scratch alongside it), followed by a 1.5 s held end card. The film is rendered entirely by code. No footage, images, artwork or media from outside the repository are used.

## The idea in one paragraph

Everything in the film is drawn by **one line**. At t = 0.5 s it is a single red point in the dark, and from then on it never leaves the frame. It ignites the universe. It orbits the matter that becomes a world, then runs along that world's first coastline, where life starts. It is lifted by a human fingertip and becomes the first mark a person ever made: a circle. Every era of art redraws that same circle: ochre on stone, a symbol on clay, a construction circle in graphite, an ink ensō, a painted sun, a vector path with four anchors. It breaks into pixels, the pixels become a gallery, and the gallery connects into a community, with the line as the threads between people. Then the line becomes the construction path of a system built from first principles: characters, tokens, vectors, layers, and finally a pattern made purely from a rule on a circle. That pattern collapses back into the point it came from, and the point draws one last circle: the **O** of **OredLab**.

> The universe, the world, the first mark, the sun in a painting, the ring of a model and the O of the logo are the same circle drawn by the same line.

This is the film's DNA. The audience should never consciously notice it, but they should feel it.

## Tone

- **Studio identity film, not a tech ad.** Composition first, generous negative space, a few large shapes, hairline detail, restraint.
- **Visual causality over sequence.** Nothing just appears and nothing just disappears: each image grows *out of* the previous one, almost always from the line's current position. New eras are revealed by a growth front that radiates from the pen point.
- **Motion has intent.** Strong eases (`outExpo` for arrivals, `inExpo` for collapses, `inOutCubic` for camera moves), holds, then snaps on the beat. No floating screensaver drift: when something drifts it is the slow camera between beats, and the camera always has a destination.
- **Never:** purple nebulae, cyan/blue "AI" glow, glowing brains, code rain, humanoid robots, lens-flare soup, fake holograms, floating UI cards, random particle explosions, screen shake, outlined or glowing type.

## Beat grid

The edit sits on a **120 BPM** grid (beat = 0.5 s, bar = 2 s). Every scene boundary lands on a beat, and the big transformations land on beats as well. `src/timeline/cues.ts` holds the cue sheet that both the visuals and the procedural sound design read, so a licensed track can be cut to the same grid later.

| t (s) | cue | what happens |
|---|---|---|
| 0.00 | `black` | true black, faint grain |
| 0.50 | `point` | the point appears: a 2 px red-white core |
| 0.90 | `inhale` | the point's halo contracts (anticipation) |
| 1.00 | `ignite` | one hairline shockwave ring; matter expands out of the point |
| 2.40 | `converge` | matter spirals into an accretion disc |
| 3.00 | `world` | the disc closes into a sphere; the line becomes its orbit |
| 3.50 | `land` | sea level falls and continents rise as contour lines |
| 4.00 | `life` | the line strikes the coast; warmth spreads along it |
| 4.00–5.00 | `dive` | exponential zoom into the topography |
| 5.00 | `human` | terrain contours re-form around a hand |
| 5.75 | `touch` | the fingertip lifts the line |
| 6.00–6.60 | `mark` | the first mark: a circle in ochre |
| 7.00 | `art.0` | primitive marks on stone |
| 7.50 | `art.1` | geometric symbols on clay |
| 8.00 | `art.2` | graphite sketch, construction geometry |
| 8.50 | `art.3` | ink, ensō and seal |
| 9.00 | `art.4` | colour: a full painting (the richest frame of the film) |
| 10.00 | `art.5` | digital vector form, anchors and handles |
| 10.50 | `pixels` | the image quantises into pixels |
| 11.00 | `vectors` | pixels round into vector dots that align into a grid |
| 11.50 | `gallery` | the grid becomes a wall of original artworks |
| 12.50 | `community` | profiles, follows, collections: the line becomes the threads |
| 13.50 | `ored` | panels shrink into characters |
| 14.00 | `tokens` | characters group into tokens |
| 14.50 | `vectors` | tokens become vectors, then points in space |
| 15.00 | `layers` | layers are built one by one along a red path |
| 15.50 | `pattern` | a rule on a circle: the emergent pattern |
| 15.75 | `ORED` | name constructed on typographic guides |
| 16.50 | `collapse` | everything returns to the point |
| 16.90 | `ring` | the point draws the O |
| 17.30 | `wordmark` | OredLab |
| 17.70 | `tagline` | ART HAS NO LIMITS. |
| 18.00 | `url` | oredlab.com, hold to 19.5 |

## Palette

The palette is one signature colour plus a neutral axis. A small pigment set is allowed **only inside the artworks** (scenes 04–05), which is what lets the art section bloom with colour against an otherwise disciplined film.

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

### 01 Origin (0.0–3.0)
True black. A point fades in at screen centre and breathes once. Its halo contracts, and on **1.0** a single hairline ring expands and dies while ~40k points of matter fly *out* of the point with an `outExpo` velocity profile. That matter is not random: it is distributed along a procedurally generated **cosmic web** (nodes and filaments). The camera, which started almost inside the point, is overtaken by the expansion and then chases the line as it travels through the web. Filaments resolve as faint hairlines, while near stars pass with parallax and far ones stay fixed. On **2.4** everything feels a pull: matter spirals into an accretion disc ahead of the line, the camera settles, and the disc closes into a sphere.

### 02 World (3.0–5.0)
A procedural planet drawn as **topography**: iso-height contour hairlines on a dark sphere, lit from upper left, with a thin warm atmosphere rim and no texture maps. Sea level falls and continents rise as nested contours. The line, which has been orbiting, tightens its orbit and touches down on a coastline. From that contact point warmth spreads along the coast: the red coastline grows, and tiny warm specks of life appear on the land. On **4.0** the camera dives with an exponential zoom straight into the topography. Contour octaves are added as the zoom deepens, so the landscape keeps revealing finer contours, like an infinite map.

### 03 Human (5.0–7.0)
The terrain field is re-shaped, in the same contour language, into the relief of a **human hand** reaching in from the upper right with its index finger extended. The hand is not drawn: it emerges as a mountain in the topography and is lit by the same hillshade. The grade warms. On **5.75** the line contracts into a point at the fingertip, and the finger draws the **first mark**, a single circle of ochre-red pigment. The hand's contours release and the terrain settles into a stone wall. Matter → human → expression.

### 04 Art evolution (7.0–10.5)
The circle survives, and the world around it is re-made on every beat. Each era grows out of the previous one along a front that radiates from the pen point:
1. **Primitive** (7.0): ochre marks, finger lines and a negative hand stencil on stone.
2. **Geometric** (7.5): concentric rings, friezes and meanders on terracotta.
3. **Sketch** (8.0): graphite construction geometry on paper, with a gesture figure built from circles.
4. **Ink** (8.5): a dry-brush ensō, splatter, and a red seal.
5. **Colour** (9.0): a full original painting in which the circle becomes a vermilion sun over layered fields of brushwork, with a small figure standing in it. This is the richest frame of the film.
6. **Digital** (10.0): the painting resolves into flat vector shapes, and the sun becomes a perfect vector circle with four anchors and handles.

### 05 Digital art & creators (10.5–13.5)
The vector image quantises into pixels. The pixels round into vector dots, align, and draw a grid. The grid opens into a wall of **original procedural artworks**, each with a distinct personality: flow-field brushwork, op-art moiré, a suprematist composition, an ink ensō, dusk strata, a one-line portrait, truchet arcs, a radial bloom, a halftone world, a colour field, a pixel-sort, and a wire mountain. Each piece develops in its own stroke order. Small handles and avatars appear under the pieces (people). The line becomes the **threads** between them: follows, likes and collections, a network over a gallery. The camera pulls back until the network dominates.

### 06 Ored, built from scratch (13.5–16.5)
The visual language changes to ink, bone hairlines, IBM Plex Mono and red construction lines. The panels collapse into **characters**: `a r t   h a s   n o   l i m i t s`. Brackets close around groups of characters to make **tokens**, each with an ID. Every token unfolds into a column vector, and the vectors lift off as **points in space**. The camera tilts into perspective, and **layers** are built one by one, bottom to top, each traced by the red line and joined to the layer below. The camera then rises over the axis of the stack, the nodes fall onto a ring, and a rule as simple as *connect n to k·n* draws an **emergent pattern**: order from arithmetic. Over it, **ORED** is constructed on its typographic guides, with **BUILT FROM SCRATCH** beneath it.

### 07 OredLab (16.5–19.5)
Everything collapses back into the point, in the same position and at the same size as at t = 0.5. The film rhymes with its own first frame. The point draws one circle, which slides into place as the **O of OredLab** while the rest of the wordmark is revealed from behind it. Then **ART HAS NO LIMITS.** appears, then **oredlab.com**. The card holds, clean, for 1.5 s.

## Sound

The film works silently. A deterministic procedural sound design (`scripts/audio.ts`, rendered to `public/audio/promo.wav`) is generated from the same cue sheet: a sub swell, the point's tick, the ignition boom, an evolving pad that warms at the human, rising plucks on each era, digital ticks, precise mono blips for the tokens, a reverse-suck into the collapse and a final chord at the logo. Replace it with music by cutting to the 120 BPM grid.
