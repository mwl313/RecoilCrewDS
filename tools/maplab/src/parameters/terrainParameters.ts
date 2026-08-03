import type { ParameterDescriptor } from './parameterTypes';

const FEATURES = ['basin', 'ridge', 'plateau', 'valley', 'hill'] as const;
const FEATURE_LABELS: Record<string, string> = {
  basin: 'Basin',
  ridge: 'Ridge',
  plateau: 'Plateau',
  valley: 'Valley',
  hill: 'Hill',
};

export const terrainParameters: ParameterDescriptor[] = [
  { path: 'terrainProfile.baseHeight', label: 'Base Height', group: 'terrain', type: 'number', min: -5, max: 5, step: 0.5, unit: 'm', requiresRegeneration: true },
  { path: 'terrainProfile.heightRange.min', label: 'Height Min', group: 'terrain', type: 'number', min: -20, max: 0, step: 0.5, unit: 'm', requiresRegeneration: true },
  { path: 'terrainProfile.heightRange.max', label: 'Height Max', group: 'terrain', type: 'number', min: 0, max: 30, step: 0.5, unit: 'm', requiresRegeneration: true },
  { path: 'terrainProfile.maxSlope', label: 'Max Slope', group: 'terrain', type: 'number', min: 0.05, max: 1, step: 0.05, unit: 'rise/run', requiresRegeneration: true },
  { path: 'terrainProfile.smoothingPasses', label: 'Smoothing', group: 'terrain', type: 'number', min: 0, max: 8, step: 1, advanced: true, requiresRegeneration: true },
  { path: 'terrainProfile.slopeCorrectionIterations', label: 'Slope Correction', group: 'terrain', type: 'number', min: 0, max: 200, step: 8, advanced: true, requiresRegeneration: true },
  { path: 'terrainProfile.retryLimit', label: 'Retry Limit', group: 'terrain', type: 'number', min: 1, max: 16, step: 1, advanced: true, requiresRegeneration: false },
  {
    path: 'maplab.macro.terrainDrama',
    label: 'Terrain Drama',
    group: 'basic',
    type: 'range',
    min: 0.3,
    max: 2,
    step: 0.05,
    description: 'Scales hill/ridge/plateau heights and basin/valley depths.',
    requiresRegeneration: true,
    macro: 'terrainDrama',
  },
  ...FEATURES.flatMap<ParameterDescriptor>((f) => [
    { path: `terrainProfile.features.${f}.count`, label: `${FEATURE_LABELS[f]} Count`, group: 'terrain', type: 'number', min: 0, max: 12, step: 1, requiresRegeneration: true },
    { path: `terrainProfile.features.${f}.minSeparation`, label: `${FEATURE_LABELS[f]} Spacing`, group: 'terrain', type: 'number', min: 0, max: 200, step: 5, unit: 'm', advanced: true, requiresRegeneration: true },
    { path: `terrainProfile.features.${f}.falloff`, label: `${FEATURE_LABELS[f]} Falloff`, group: 'terrain', type: 'number', min: 0.05, max: 0.9, step: 0.05, advanced: true, requiresRegeneration: true },
  ]),
  ...FEATURES.flatMap<ParameterDescriptor>((f) => {
    const out: ParameterDescriptor[] = [];
    if (f === 'ridge' || f === 'valley') {
      out.push({ path: `terrainProfile.features.${f}.length.min`, label: `${FEATURE_LABELS[f]} Length Min`, group: 'terrain', type: 'number', min: 20, max: 300, step: 10, unit: 'm', advanced: true, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.length.max`, label: `${FEATURE_LABELS[f]} Length Max`, group: 'terrain', type: 'number', min: 20, max: 300, step: 10, unit: 'm', advanced: true, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.width.min`, label: `${FEATURE_LABELS[f]} Width Min`, group: 'terrain', type: 'number', min: 6, max: 80, step: 2, unit: 'm', advanced: true, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.width.max`, label: `${FEATURE_LABELS[f]} Width Max`, group: 'terrain', type: 'number', min: 6, max: 80, step: 2, unit: 'm', advanced: true, requiresRegeneration: true });
    } else {
      out.push({ path: `terrainProfile.features.${f}.radius.min`, label: `${FEATURE_LABELS[f]} Radius Min`, group: 'terrain', type: 'number', min: 6, max: 100, step: 2, unit: 'm', advanced: true, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.radius.max`, label: `${FEATURE_LABELS[f]} Radius Max`, group: 'terrain', type: 'number', min: 6, max: 100, step: 2, unit: 'm', advanced: true, requiresRegeneration: true });
    }
    if (f === 'basin' || f === 'valley') {
      out.push({ path: `terrainProfile.features.${f}.depth.min`, label: `${FEATURE_LABELS[f]} Depth Min`, group: 'terrain', type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.depth.max`, label: `${FEATURE_LABELS[f]} Depth Max`, group: 'terrain', type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, requiresRegeneration: true });
    } else {
      out.push({ path: `terrainProfile.features.${f}.height.min`, label: `${FEATURE_LABELS[f]} Height Min`, group: 'terrain', type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.height.max`, label: `${FEATURE_LABELS[f]} Height Max`, group: 'terrain', type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, requiresRegeneration: true });
    }
    return out;
  }),
];
