import { z } from 'zod';

/**
 * Shared schema primitives. All Phase 1 content validation funnels through
 * these so numeric constraints and id conventions stay consistent.
 */

/** Semantic ids: lowercase first segment, dot-namespaced segments. */
export const semanticId = z
  .string()
  .regex(
    /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/,
    'id must be dot-namespaced (e.g. weapon.mainCannon)',
  );

export const finiteNumber = z.number().finite('must be a finite number');
export const positiveNumber = z.number().finite('must be a finite number').positive('must be positive');
export const nonNegativeNumber = z.number().finite('must be a finite number').nonnegative('must be >= 0');
export const probability = z.number().finite('must be a finite number').min(0, 'must be >= 0').max(1, 'must be <= 1');
export const positiveInt = z.number().int('must be an integer').positive('must be positive');
export const nonNegativeInt = z.number().int('must be an integer').nonnegative('must be >= 0');

export const behaviorRefs = z.array(z.string().regex(/^behavior\./, 'behavior refs must start with behavior.')).default([]);

/**
 * Optional per-definition stat records. Keys are validated against the
 * canonical stat id catalog by the ReferenceValidator after parsing.
 */
export const statsField = z.record(z.string(), finiteNumber).optional();

export const commonDefinition = {
  id: semanticId,
  label: z.string().optional(),
  description: z.string().optional(),
  behaviors: behaviorRefs,
  stats: statsField,
};
