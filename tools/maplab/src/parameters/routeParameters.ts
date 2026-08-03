import type { ParameterDescriptor } from './parameterTypes';

export const routeParameters: ParameterDescriptor[] = [
  { path: 'furnitureSet.routeClearance', label: 'Route Clearance', group: 'routes', type: 'number', min: 6, max: 40, step: 1, unit: 'm', requiresRegeneration: true },
  { path: 'furnitureSet.routeMinHalfWidth', label: 'Min Route Width', group: 'routes', type: 'number', min: 4, max: 40, step: 1, unit: 'm', requiresRegeneration: true },
  { path: 'furnitureSet.maxRouteSlope', label: 'Max Route Slope', group: 'routes', type: 'number', min: 0.05, max: 1, step: 0.05, requiresRegeneration: true },
  { path: 'furnitureSet.ramps.enabled', label: 'Ramps Enabled', group: 'objects', type: 'boolean', requiresRegeneration: true },
  { path: 'furnitureSet.ramps.count', label: 'Ramp Count', group: 'routes', type: 'number', min: 0, max: 12, step: 1, requiresRegeneration: true },
  { path: 'furnitureSet.ramps.length.0', label: 'Ramp Length Min', group: 'routes', type: 'number', min: 4, max: 30, step: 1, unit: 'm', advanced: true, requiresRegeneration: true },
  { path: 'furnitureSet.ramps.length.1', label: 'Ramp Length Max', group: 'routes', type: 'number', min: 4, max: 30, step: 1, unit: 'm', advanced: true, requiresRegeneration: true },
  { path: 'furnitureSet.ramps.rise.0', label: 'Ramp Rise Min', group: 'routes', type: 'number', min: 0.3, max: 5, step: 0.1, unit: 'm', advanced: true, requiresRegeneration: true },
  { path: 'furnitureSet.ramps.rise.1', label: 'Ramp Rise Max', group: 'routes', type: 'number', min: 0.3, max: 5, step: 0.1, unit: 'm', advanced: true, requiresRegeneration: true },
];
