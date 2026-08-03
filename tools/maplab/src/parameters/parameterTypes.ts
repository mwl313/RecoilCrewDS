export type ParameterType = 'number' | 'boolean' | 'select' | 'text' | 'range' | 'readonly';
export type ParameterGroup = 'basic' | 'terrain' | 'routes' | 'objects' | 'validation';

export interface ParameterCondition {
  path: string;
  equals?: unknown;
  notEquals?: unknown;
}

export interface ParameterDescriptor {
  path: string;
  label: string;
  group: ParameterGroup;
  type: ParameterType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
  basic?: boolean;
  advanced?: boolean;
  requiresRegeneration: boolean;
  visibleWhen?: ParameterCondition;
  options?: string[];
  /** Macro controls write through to multiple paths (e.g. Terrain Drama). */
  macro?: 'terrainDrama';
}
