import { z } from 'zod';
import { commonDefinition, nonNegativeInt, nonNegativeNumber, positiveInt, positiveNumber, probability } from './common';

export const spawnDirectorSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^spawn\./, 'spawn director id must start with spawn.'),
  initialSpawns: z
    .array(
      z.object({
        type: z.string().regex(/^enemy\./, 'initial spawn type must reference an enemy'),
        x: z.number().finite(),
        z: z.number().finite(),
      }),
    )
    .default([]),
  bugPacing: z.object({
    minActive: positiveInt,
    maxActive: positiveInt,
    rampPerSecond: positiveNumber,
    cap: positiveInt,
  }),
  rammerSpawns: z.array(nonNegativeNumber).default([]),
  towerSpawns: z.array(nonNegativeNumber).default([]),
  maxRammers: nonNegativeInt,
  maxTowers: nonNegativeInt,
  finalChaos: z.object({
    start: positiveNumber,
    rammerProbability: probability,
    rammerMax: positiveInt,
    towerProbability: probability,
  }),
  arena: z.object({
    half: positiveNumber,
    maxPickups: positiveInt,
  }),
  props: z.object({
    barrelHp: positiveNumber,
    barrelRadius: positiveNumber,
    barrelChainRadius: positiveNumber,
  }),
});

export type SpawnDirectorDefinition = z.infer<typeof spawnDirectorSchema>;
