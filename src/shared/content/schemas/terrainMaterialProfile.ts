import { z } from 'zod';
import { commonDefinition, positiveNumber } from './common';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be a six-digit hex color like #7d7655');

export const pbrTerrainMaterialProfileSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^terrainMaterial\./, 'id must start with terrainMaterial.'),
    kind: z.literal('pbrTextureSet'),
    baseColorAssetId: z.string().regex(/^texture\./, 'baseColorAssetId must be a semantic texture id'),
    normalAssetId: z.string().regex(/^texture\./).optional(),
    roughnessAssetId: z.string().regex(/^texture\./).optional(),
    tileSizeMeters: positiveNumber,
    tint: hexColor,
    normalScale: z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()]),
    roughness: z.number().finite().min(0).max(1),
    metalness: z.number().finite().min(0).max(1),
    anisotropy: z.number().int().min(1),
    fallbackColor: hexColor,
  })
  .strict();

export const proceduralTerrainMaterialProfileSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^terrainMaterial\./, 'id must start with terrainMaterial.'),
    kind: z.literal('proceduralFallback'),
    tileSizeMeters: positiveNumber,
    baseColor: hexColor,
    gridColor: hexColor,
    patchColor: hexColor,
    roughness: z.number().finite().min(0).max(1),
    metalness: z.number().finite().min(0).max(1),
  })
  .strict();

export const terrainMaterialProfileSchema = z.discriminatedUnion('kind', [
  pbrTerrainMaterialProfileSchema,
  proceduralTerrainMaterialProfileSchema,
]);

export type PbrTerrainMaterialProfile = z.infer<typeof pbrTerrainMaterialProfileSchema>;
export type ProceduralTerrainMaterialProfile = z.infer<typeof proceduralTerrainMaterialProfileSchema>;
export type TerrainMaterialProfileSchema = z.infer<typeof terrainMaterialProfileSchema>;
