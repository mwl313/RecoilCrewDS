import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveNumber } from './common';

export const mapSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^map\./, 'map id must start with map.'),
  widthMeters: positiveNumber,
  depthMeters: positiveNumber,
  cellSize: positiveNumber,
  terrainProfileId: z.string().regex(/^terrainProfile\./, 'terrain profile ref must start with terrainProfile.'),
  terrainMaterialProfileId: z.string().regex(/^terrainMaterial\./, 'terrain material ref must start with terrainMaterial.'),
  validationProfileId: z.string().regex(/^validationProfile\./, 'validation profile ref must start with validationProfile.'),
  fallbackMapId: z.string().regex(/^map\./, 'fallback map ref must start with map.').nullable().optional(),
  furnitureSetId: z.string().regex(/^furnitureSet\./, 'furniture set ref must start with furnitureSet.'),
  densityProfileId: z.string().regex(/^densityProfile\./, 'density profile ref must start with densityProfile.'),
  urbanPrototypeId: z.enum(['urban200', 'urban400']).optional(),
  isFallback: z.boolean().default(false),
});

export type MapDefinition = z.infer<typeof mapSchema>;
