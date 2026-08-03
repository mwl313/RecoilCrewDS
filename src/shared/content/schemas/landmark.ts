import { z } from 'zod';
import { ZONE_TAGS } from '../../mapgen/zones';
import { commonDefinition, nonNegativeInt, positiveInt } from './common';

export const landmarkSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^landmark\./, 'landmark id must start with landmark.'),
  zoneTag: z.enum(ZONE_TAGS),
  source: z.enum(['basin', 'plateau', 'ridge', 'valley', 'hill', 'center', 'edge', 'spawn', 'recovery']),
  count: positiveInt,
  priority: nonNegativeInt,
  assetId: z.string().optional(),
});

export type LandmarkDefinition = z.infer<typeof landmarkSchema>;
