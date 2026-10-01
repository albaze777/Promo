// The cue sheet: one source of truth for visual beats and the procedural sound design (scripts/audio.ts).
// 120 BPM grid: beat = 0.5 s, bar = 2 s. See docs/TREATMENT.md → Beat grid.

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const STORY_END = 18.0;

/**
 * Story clock vs output clock. Scenes, cues and the beat grid are authored on the story clock; the
 * film plays it TIME_SCALE× slower, so every transformation gets more room to read (the output beat
 * grid is BPM / TIME_SCALE = 96 BPM). Change this one number to re-time the whole film.
 */
export const TIME_SCALE = 1.25;
/** Output length of the film (s): the story (18 s → 22.5 s) and a held end card. */
export const OUTPUT_DURATION = 26.0;
/** Story-clock length (the last scene's window ends here). */
export const DURATION = OUTPUT_DURATION / TIME_SCALE;
/** Output time (s) → story time (s). */
export const storyTime = (T: number) => T / TIME_SCALE;
/** Story time (s) → output time (s). */
export const outputTime = (t: number) => t * TIME_SCALE;

export const CUE = {
  black: 0.0,
  point: 0.5,
  inhale: 0.9,
  ignite: 1.0,
  converge: 2.4,
  world: 3.0,
  land: 3.5,
  life: 4.0,
  dive: 4.0,
  human: 5.0,
  touch: 5.75,
  mark: 6.0,
  markEnd: 6.6,
  art0: 7.0,
  art1: 7.5,
  art2: 8.0,
  art3: 8.5,
  art4: 9.0,
  art5: 10.0,
  pixels: 10.5,
  vectors: 11.0,
  gallery: 11.5,
  community: 12.5,
  ored: 13.5,
  tokens: 14.0,
  embed: 14.5,
  layers: 15.0,
  pattern: 15.5,
  oredName: 15.75,
  collapse: 16.5,
  ring: 17.0,
  wordmark: 17.45,
  tagline: 17.85,
  url: 18.1,
  end: DURATION,
} as const;

export type CueName = keyof typeof CUE;

/** Continuous beat index at time t. */
export const beatAt = (t: number) => t / BEAT;
/** Decaying pulse after the most recent cue in `times` (for kicks on beats). */
export function pulse(t: number, times: readonly number[], halfLife = 0.12) {
  let best = Infinity;
  for (const c of times) if (t >= c && t - c < best) best = t - c;
  return best === Infinity ? 0 : Math.pow(0.5, best / halfLife);
}
