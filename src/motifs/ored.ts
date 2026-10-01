// Shared layout for the 05 → 06 hand-off: where Ored's raw characters sit on screen.
import { BRAND } from '../brand';

export const INPUT = BRAND.oredInput;
export const CHAR_CELL = 66;
export const CHAR_Y = 540;
const x0 = 960 - (INPUT.length * CHAR_CELL) / 2 + CHAR_CELL / 2;
/** Screen centre of character i. */
export const charPos = (i: number): [number, number] => [x0 + i * CHAR_CELL, CHAR_Y];
/** Indices of the visible (non-space) characters. */
export const GLYPHS = [...INPUT].map((c, i) => ({ c, i })).filter((g) => g.c !== ' ');
