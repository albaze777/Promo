// The edit: one entry per scene module. Windows overlap where a scene composites its predecessor
// itself (handlesTransition) — that is how hand-offs stay continuous instead of cutting.
import type { TimelineEntry } from '../engine/engine';
import { CUE, DURATION } from './cues';

export const TIMELINE: TimelineEntry[] = [
  { id: 'origin', load: () => import('../scenes/sceneOrigin'), start: 0, end: CUE.world + 0.25 },
  { id: 'world', load: () => import('../scenes/sceneWorld'), start: CUE.world - 0.15, end: CUE.human + 0.02 },
  { id: 'human', load: () => import('../scenes/sceneHuman'), start: CUE.human, end: CUE.art0 + 0.3 },
  { id: 'art', load: () => import('../scenes/sceneArtEvolution'), start: CUE.art0, end: CUE.pixels + 0.02 },
  { id: 'digital', load: () => import('../scenes/sceneDigitalArt'), start: CUE.pixels, end: CUE.ored + 0.4 },
  { id: 'ored', load: () => import('../scenes/sceneOred'), start: CUE.ored, end: CUE.collapse + 0.45 },
  { id: 'outro', load: () => import('../scenes/sceneOutro'), start: CUE.collapse, end: DURATION },
];
