// Fonts are bundled (fontsource, SIL OFL) — no network at render time. Canvas2D type helpers.
import { BRAND } from '../brand';

export async function loadFonts() {
  const specs = [
    `600 100px ${BRAND.fonts.display}`, `500 100px ${BRAND.fonts.display}`, `400 100px ${BRAND.fonts.display}`,
    `300 40px ${BRAND.fonts.mono}`, `400 40px ${BRAND.fonts.mono}`, `500 40px ${BRAND.fonts.mono}`,
    `italic 400 40px ${BRAND.fonts.serif}`,
  ];
  await Promise.all(specs.map((s) => document.fonts.load(s, 'OredLab ART HAS NO LIMITS. oredlab.com 0123456789 @#')));
  await document.fonts.ready;
}

export type Family = 'display' | 'mono' | 'serif';

export function font(fam: Family, px: number, weight = 400, italic = false) {
  return `${italic ? 'italic ' : ''}${weight} ${px}px ${BRAND.fonts[fam]}`;
}

export interface TextStyle {
  fam: Family;
  px: number;
  weight?: number;
  italic?: boolean;
  /** Tracking in em. */
  track?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

export function setText(c: CanvasRenderingContext2D, s: TextStyle) {
  c.font = font(s.fam, s.px, s.weight ?? 400, s.italic);
  c.letterSpacing = `${((s.track ?? 0) * s.px).toFixed(2)}px`;
  c.textAlign = s.align ?? 'left';
  c.textBaseline = s.baseline ?? 'alphabetic';
  c.fontKerning = 'normal';
}

/** Width of a string in a style (tracking included, trailing tracking removed). */
export function measure(c: CanvasRenderingContext2D, text: string, s: TextStyle) {
  c.save();
  setText(c, { ...s, align: 'left' });
  const w = c.measureText(text).width - (s.track ?? 0) * s.px;
  c.restore();
  return w;
}
