export type StatOperation = 'add' | 'multiply' | 'override';
export type StackingRule = 'stack' | 'refresh' | 'replace' | 'highest' | 'lowest';

/**
 * A stat modifier (REFACTOR_02 §12). `priority` is an unbounded number where
 * larger values win (applied later). `durationSeconds` makes the modifier
 * temporary; `min`/`max` clamp the resolved value after overrides.
 */
export interface StatModifier {
  readonly id: string;
  readonly stat: string;
  readonly operation: StatOperation;
  readonly value: number;
  readonly source: string;
  readonly priority: number;
  readonly stacking: StackingRule;
  readonly durationSeconds?: number;
  readonly min?: number;
  readonly max?: number;
  readonly tags?: readonly string[];
}

export interface MutableStatModifier extends StatModifier {
  remaining?: number;
}

export function statModifier(
  id: string,
  stat: string,
  operation: StatOperation,
  value: number,
  overrides: Partial<Omit<StatModifier, 'id' | 'stat' | 'operation' | 'value'>> = {},
): StatModifier {
  return {
    id,
    stat,
    operation,
    value,
    source: overrides.source ?? 'unknown',
    priority: overrides.priority ?? 0,
    stacking: overrides.stacking ?? 'replace',
    ...(overrides.durationSeconds !== undefined ? { durationSeconds: overrides.durationSeconds } : {}),
    ...(overrides.min !== undefined ? { min: overrides.min } : {}),
    ...(overrides.max !== undefined ? { max: overrides.max } : {}),
    ...(overrides.tags ? { tags: overrides.tags } : {}),
  };
}
