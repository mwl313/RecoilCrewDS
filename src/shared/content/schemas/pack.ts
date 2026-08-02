import { z } from 'zod';

export const packManifestSchema = z.object({
  pack: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'pack id must be lowercase with dashes'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver-like (x.y.z)'),
    mode: z.string().regex(/^mode\./, 'manifest mode must reference a mode definition'),
    files: z.object({
      modes: z.array(z.string()),
      objectives: z.array(z.string()),
      tanks: z.array(z.string()),
      loadouts: z.array(z.string()),
      weapons: z.array(z.string()),
      projectiles: z.array(z.string()),
      enemies: z.array(z.string()),
      dropTables: z.array(z.string()),
      pickups: z.array(z.string()),
      items: z.array(z.string()),
      statusEffects: z.array(z.string()),
      spawnDirectors: z.array(z.string()),
      scoring: z.array(z.string()),
      results: z.array(z.string()),
      difficulties: z.array(z.string()),
      presentation: z.array(z.string()),
    }),
  }),
});

export type PackManifest = z.infer<typeof packManifestSchema>;
