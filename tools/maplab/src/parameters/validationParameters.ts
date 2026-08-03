import type { ParameterDescriptor } from './parameterTypes';

export const validationParameters: ParameterDescriptor[] = [
  { path: 'validationProfile.heightRange.min', label: 'Validate Height Min', group: 'validation', type: 'number', min: -30, max: 0, step: 0.5, unit: 'm', requiresRegeneration: false },
  { path: 'validationProfile.heightRange.max', label: 'Validate Height Max', group: 'validation', type: 'number', min: 0, max: 40, step: 0.5, unit: 'm', requiresRegeneration: false },
  { path: 'validationProfile.maxSlope', label: 'Validate Max Slope', group: 'validation', type: 'number', min: 0.05, max: 1.5, step: 0.05, requiresRegeneration: false },
  { path: 'validationProfile.minFeatureSeparation', label: 'Min Feature Separation', group: 'validation', type: 'number', min: 0, max: 100, step: 1, unit: 'm', requiresRegeneration: false },
  { path: 'validationProfile.maxGenerationMs', label: 'Max Generation ms', group: 'validation', type: 'number', min: 50, max: 5000, step: 50, unit: 'ms', requiresRegeneration: false },
];
