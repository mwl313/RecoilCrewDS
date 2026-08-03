import type { ParameterDescriptor } from './parameterTypes';

export const mapParameters: ParameterDescriptor[] = [
  { path: 'map.widthMeters', label: 'Width', group: 'basic', type: 'number', min: 100, max: 1000, step: 100, unit: 'm', requiresRegeneration: true },
  { path: 'map.depthMeters', label: 'Depth', group: 'basic', type: 'number', min: 100, max: 1000, step: 100, unit: 'm', requiresRegeneration: true },
  { path: 'map.cellSize', label: 'Cell Size', group: 'terrain', type: 'number', min: 2, max: 8, step: 1, unit: 'm', advanced: true, requiresRegeneration: true },
];
