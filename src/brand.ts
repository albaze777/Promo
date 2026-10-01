// Every brand value in one place. Swap these to update the identity without touching scene code.
// (oredlab.com was unreachable from the build environment; see docs/TREATMENT.md → Brand.)

export const BRAND = {
  name: 'OredLab',
  /** The wordmark is drawn as `ring` + `rest`: the O is the circle the line draws. */
  wordmark: { ring: 'O', rest: 'redLab' },
  ai: 'ORED',
  aiLine: 'BUILT FROM SCRATCH',
  tagline: 'ART HAS NO LIMITS.',
  url: 'oredlab.com',
  /** Raw characters fed to Ored in scene 06 (they foreshadow the tagline). */
  oredInput: 'art has no limits',
  fonts: {
    display: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
    serif: '"Instrument Serif", Georgia, serif',
  },
};

/** Palette (sRGB hex). See docs/TREATMENT.md → Palette. */
export const PAL = {
  ink: '#08080A',
  ink2: '#121215',
  graphite: '#3B3A3F',
  ash: '#8F8A83',
  bone: '#EFE9DF',
  line: '#FF3B2E',
  ember: '#FFB08A',
  warmInk: '#1A120D',
  warmBone: '#E8D3B8',
  // pigments — artworks only
  ochre: '#C98A2E',
  ultramarine: '#26389B',
  vermilion: '#E2412B',
  rose: '#E8A9A0',
  viridian: '#2E6B58',
  terracotta: '#B5563A',
  paper: '#EDE6D8',
  charcoal: '#1C1A18',
} as const;

export type PalKey = keyof typeof PAL;
