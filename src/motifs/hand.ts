// The hand of 03b Human, shared with 03a Evolution (whose push-in morphs the walking figure's reaching hand
// into exactly this pose). The hand reaches in from the upper left (a mirror of the canonical frame in
// shaders/topo.ts: handFlip = −1), its fingertip settles on the point and draws the first mark.
import { MARK, MARK_START } from './world';
import { HAND_TIP } from '../shaders/topo';
import { CUE } from '../timeline/cues';
import { clamp, ease, TAU } from '../utils/math';

export const HAND_ROT = Math.PI - 2.62;
export const HAND_SCALE = 1.55;
export const HAND_FLIP = -1;
/** Fingertip offset (screen px) at the start of 03b, settling onto the point by the touch. */
export const HOVER: [number, number] = [-26, -18];

/** Stroke progress 0..1 (the finger drawing the circle). */
export const strokeK = (t: number) => ease.inOutSine(clamp((t - CUE.mark) / (CUE.markEnd - CUE.mark)));

/** Angle of the pen on the mark at stroke progress k. */
export const markAngle = (k: number) => MARK.startAngle + MARK.dir * TAU * 0.985 * k;

/** Fingertip on screen. */
export function tip(t: number): [number, number] {
  const k = strokeK(t);
  const a = markAngle(k);
  const onRing: [number, number] = [MARK.cx + Math.cos(a) * MARK.r, MARK.cy + Math.sin(a) * MARK.r];
  const settle = ease.outCubic(clamp((t - CUE.human) / (CUE.touch - CUE.human)));
  const hover: [number, number] = [MARK_START[0] + HOVER[0] * (1 - settle), MARK_START[1] + HOVER[1] * (1 - settle)];
  if (t < CUE.mark) return hover;
  // after the stroke the hand lifts away up-left
  const lift = ease.inOutCubic(clamp((t - CUE.markEnd - 0.05) / 0.5));
  return [onRing[0] - 240 * lift, onRing[1] - 170 * lift];
}

/** Hand placement for the topo shader at t: position of the canonical origin, rotation, scale, flip. */
export function handPose(t: number) {
  const k = strokeK(t);
  const rot = HAND_ROT - 0.16 * Math.sin(k * Math.PI);
  const tp = tip(t);
  const c = Math.cos(rot), sn = Math.sin(rot);
  const tx = HAND_TIP[0] * HAND_SCALE, ty = HAND_TIP[1] * HAND_SCALE * HAND_FLIP;
  const pos: [number, number] = [tp[0] - (c * tx - sn * ty), tp[1] - (sn * tx + c * ty)];
  return { pos, rot, scale: HAND_SCALE, flip: HAND_FLIP, tip: tp };
}
