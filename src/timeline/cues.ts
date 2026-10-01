// The cue sheet: one source of truth for visual beats and the procedural sound design (scripts/audio.ts).
// 120 BPM story grid: beat = 0.5 s, bar = 2 s. See docs/TREATMENT.md → Beat grid.
//
// The film is declared as a SEQUENCE of segments, each with a story-clock duration and its cues as offsets
// from the segment's start. Cue times are computed by accumulation, so lengthening or inserting a segment
// shifts everything after it (picture, timeline windows and sound) automatically.

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

/**
 * Story clock vs output clock. Scenes, cues and the beat grid are authored on the story clock; the
 * film plays it TIME_SCALE× slower, so every transformation gets more room to read (the output beat
 * grid is BPM / TIME_SCALE = 96 BPM). Change this one number to re-time the whole film.
 */
export const TIME_SCALE = 1.25;

type Seg = readonly [segment: string, duration: number, cues: Record<string, number>];

/** The film, in order. Durations and offsets are story seconds (one beat = 0.5). */
const SEQUENCE = [
  // 01 origin: the point, the inhale, ignition, the cosmic web, the accretion disc
  ['origin', 4.0, { black: 0, point: 0.75, inhale: 1.4, ignite: 1.5, converge: 3.25 }],
  // 02 world: the contour planet, sea level falls, the line lands on the coast, the dive
  ['world', 3.0, { world: 0, land: 0.6, life: 1.3, dive: 1.75 }],
  // 03a evolution: the contour field forms a walking figure, ape → hominid → human; push into the hand
  ['evo', 8.0, { evo: 0, evoForm: 0.25, ape: 0.75, hominid: 3.0, sapiens: 4.9, reach: 6.0, push: 6.5 }],
  // 03b human: the hand, the touch, the first mark
  ['human', 2.5, { human: 0, touch: 0.75, mark: 1.0, markEnd: 1.7 }],
  // 04 art evolution: six eras of one composition, one every two beats (the painting holds longer)
  ['art', 6.5, { art0: 0, art1: 1.0, art2: 2.0, art3: 3.0, art4: 4.0, art5: 5.5 }],
  // 05 digital: pixels → vector dots → grid → gallery → community; the line finds the cancelled panel
  ['digital', 3.5, { pixels: 0, vectors: 0.5, gallery: 1.0, community: 2.0, cancel: 2.75 }],
  // 05a the cancelled artwork: zoom in → grazing, the hunt, the meteor (the red star heats white), impact and explosion → zoom out on the boom
  ['dino', 12.5, { dinoIn: 0, dino: 1.5, stalk: 3.75, lunge: 6.0, meteor: 6.25, impact: 8.5, boom: 10.0, dinoOut: 10.0 }],
  // 05b the wheel: a disc is shaped and becomes a wheel; people draw on a wall
  ['wheel', 10.5, { wheelIn: 0, wheel: 2.0, disc: 2.5, axle: 4.5, cart: 5.5, wheelOut: 8.75 }],
  // 05c toward AI: tools → gears → circuits → robots; a robot hand draws the circle
  ['ai', 11.0, { aiIn: 0, ai: 2.0, gears: 3.25, circuits: 4.5, robots: 5.75, robotHand: 8.0, aiOut: 9.25 }],
  // 05d the infinite gallery: panels inside panels, an ocean of artworks
  ['infinite', 4.5, { infinite: 0, ocean: 2.0 }],
  // 06 Ored, built from scratch
  ['ored', 4.5, { ored: 0, tokens: 0.75, embed: 1.5, layers: 2.0, pattern: 2.75, oredName: 3.25 }],
  // 07 OredLab: collapse → the point draws the O → wordmark → tagline → URL → a living hold
  ['outro', 6.0, { collapse: 0, ring: 0.5, wordmark: 0.95, tagline: 1.35, url: 1.6 }],
] as const satisfies readonly Seg[];

type CueKeys<S> = S extends readonly [string, number, infer C] ? keyof C : never;
type SegName = (typeof SEQUENCE)[number][0];

function build() {
  const cue: Record<string, number> = {};
  const seg: Record<string, { start: number; end: number }> = {};
  let t = 0;
  for (const [name, dur, cues] of SEQUENCE as readonly Seg[]) {
    seg[name] = { start: t, end: t + dur };
    for (const [k, off] of Object.entries(cues)) {
      if (k in cue) throw new Error(`duplicate cue ${k}`);
      cue[k] = +(t + off).toFixed(6);
    }
    t += dur;
  }
  cue.end = +t.toFixed(6);
  return { cue, seg, total: t };
}
const B = build();

/** Story-clock length (the last scene's window ends here). */
export const DURATION = B.total;
/** Output length of the film (s). */
export const OUTPUT_DURATION = DURATION * TIME_SCALE;
/** Output time (s) → story time (s). */
export const storyTime = (T: number) => T / TIME_SCALE;
/** Story time (s) → output time (s). */
export const outputTime = (t: number) => t * TIME_SCALE;

export const CUE = B.cue as { readonly [K in CueKeys<(typeof SEQUENCE)[number]> | 'end']: number };
/** Segment windows on the story clock. */
export const SEG = B.seg as { readonly [K in SegName]: { start: number; end: number } };

export type CueName = keyof typeof CUE;

/** Continuous beat index at time t. */
export const beatAt = (t: number) => t / BEAT;
/** Decaying pulse after the most recent cue in `times` (for kicks on beats). */
export function pulse(t: number, times: readonly number[], halfLife = 0.12) {
  let best = Infinity;
  for (const c of times) if (t >= c && t - c < best) best = t - c;
  return best === Infinity ? 0 : Math.pow(0.5, best / halfLife);
}
