import { z } from 'zod';
import { commonDefinition } from './common';

/**
 * Stage-selective art roster: which presentation profiles (and therefore
 * model assets) a stage/mode should preload and use. Gameplay definitions
 * remain the authority for behavior; rosters only choose art.
 */
export const enemyArtRosterSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^enemyArtRoster\./, 'roster id must start with enemyArtRoster.'),
    commonPresentationProfileIds: z.array(z.string().min(1)),
    elitePresentationProfileIds: z.array(z.string().min(1)),
    bossPresentationProfileIds: z.array(z.string().min(1)),
    preloadAssetIds: z.array(z.string().min(1)),
  })
  .strict();

export type EnemyArtRosterDefinition = z.infer<typeof enemyArtRosterSchema>;
