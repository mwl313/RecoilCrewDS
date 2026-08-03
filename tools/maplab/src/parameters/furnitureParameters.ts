import type { ParameterDescriptor } from './parameterTypes';

export const furnitureParameters: ParameterDescriptor[] = [
  { path: 'furnitureSet.objectPlacement.enabled', label: 'Objects Enabled', group: 'objects', type: 'boolean', requiresRegeneration: true },
  { path: 'furnitureSet.barrel.enabled', label: 'Barrels Enabled', group: 'objects', type: 'boolean', requiresRegeneration: true },
  { path: 'furnitureSet.barrel.count', label: 'Barrel Count', group: 'objects', type: 'number', min: 0, max: 60, step: 1, requiresRegeneration: true },
  { path: 'furnitureSet.barrel.minSpacing', label: 'Barrel Spacing', group: 'objects', type: 'number', min: 4, max: 30, step: 1, unit: 'm', requiresRegeneration: true },
  { path: 'furnitureSet.barrel.chainRadius', label: 'Barrel Chain Radius', group: 'objects', type: 'number', min: 2, max: 20, step: 1, unit: 'm', advanced: true, requiresRegeneration: true },
  { path: 'furnitureSet.barrel.maxChain', label: 'Max Barrel Chain', group: 'objects', type: 'number', min: 1, max: 8, step: 1, advanced: true, requiresRegeneration: true },
  { path: 'furnitureSet.lightPoles.enabled', label: 'Light Poles Enabled', group: 'objects', type: 'boolean', requiresRegeneration: true },
  { path: 'furnitureSet.lightPoles.count', label: 'Light Pole Count', group: 'objects', type: 'number', min: 0, max: 40, step: 1, advanced: true, requiresRegeneration: true },
  { path: 'densityProfile.budgets.maxObjects', label: 'Max Objects', group: 'objects', type: 'number', min: 0, max: 400, step: 10, requiresRegeneration: true },
  { path: 'densityProfile.budgets.maxColliders', label: 'Max Colliders', group: 'objects', type: 'number', min: 0, max: 300, step: 10, requiresRegeneration: true },
  { path: 'densityProfile.budgets.maxBarrelChain', label: 'Max Barrel Chain Budget', group: 'objects', type: 'number', min: 1, max: 8, step: 1, advanced: true, requiresRegeneration: true },
];

export function entryParameters(entryIndex: number): ParameterDescriptor[] {
  const p = (suffix: string, label: string, type: ParameterDescriptor['type'], extra: Partial<ParameterDescriptor> = {}): ParameterDescriptor => ({
    path: `furnitureSet.entries.${entryIndex}.${suffix}`,
    label: `${label} (Entry ${entryIndex})`,
    group: 'objects',
    type,
    requiresRegeneration: true,
    ...extra,
  });
  return [
    p('enabled', 'Enabled', 'boolean'),
    p('count', 'Count', 'number', { min: 0, max: 100, step: 1 }),
    p('minSpacing', 'Spacing', 'number', { min: 1, max: 60, step: 1, unit: 'm' }),
    p('clearance', 'Clearance', 'number', { min: 0, max: 20, step: 0.5, unit: 'm' }),
    p('slopeMax', 'Slope Max', 'number', { min: 0.05, max: 1, step: 0.05 }),
    p('collider', 'Collider', 'boolean'),
    p('assetId', 'Asset ID', 'text'),
    p('obstacleType', 'Obstacle Type', 'select', {
      options: ['container', 'barrier', 'tires', 'factory', 'crusher', 'towerBase', 'scrapPile', 'wall'],
    }),
  ];
}
