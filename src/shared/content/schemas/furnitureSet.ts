import { z } from 'zod';
import { ZONE_TAGS } from '../../mapgen/zones';
import { commonDefinition, nonNegativeInt, nonNegativeNumber, positiveInt, positiveNumber } from './common';

const tuple2 = z.tuple([positiveNumber, positiveNumber]);

const furnitureEntrySchema = z.object({
  kind: z.enum(['largeObstacle', 'barrel', 'crate', 'ramp', 'medium', 'decoration']),
  assetId: z.string().min(1),
  obstacleType: z
    .enum(['container', 'barrier', 'wall', 'tires', 'factory', 'crusher', 'towerBase', 'scrapPile'])
    .optional(),
  count: nonNegativeInt,
  minSpacing: positiveNumber,
  clearance: nonNegativeNumber,
  zoneTags: z.array(z.enum(ZONE_TAGS)).min(1),
  slopeMax: positiveNumber,
  collider: z.boolean().default(true),
});

export const furnitureSetSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^furnitureSet\./, 'furniture set id must start with furnitureSet.'),
  routeClearance: positiveNumber,
  routeMinHalfWidth: positiveNumber,
  maxRouteSlope: positiveNumber,
  landmarks: z.array(z.string().regex(/^landmark\./, 'landmark ref must start with landmark.')).default([]),
  ramps: z.object({
    count: nonNegativeInt,
    length: tuple2,
    width: tuple2,
    rise: tuple2,
    minSpacing: positiveNumber,
  }),
  barrel: z.object({
    count: nonNegativeInt,
    minSpacing: positiveNumber,
    chainRadius: positiveNumber,
    maxChain: positiveInt,
  }),
  entries: z.array(furnitureEntrySchema).default([]),
});

export type FurnitureSetDefinition = z.infer<typeof furnitureSetSchema>;
