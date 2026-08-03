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
  ...terrainClassParameters(),
  {
    path: 'terrainProfile.baseHeight',
    label: 'Ground Level',
    group: 'terrain',
    subgroup: 'Ground Level',
    type: 'number',
    min: -5,
    max: 5,
    step: 0.5,
    unit: 'm',
    description: 'Raises or lowers the whole map like adjusting the floor height.',
    requiresRegeneration: true,
  },
  {
    path: 'terrainProfile.heightRange.min',
    label: 'Lowest Ground',
    group: 'terrain',
    subgroup: 'Ground Level',
    type: 'number',
    min: -20,
    max: 0,
    step: 0.5,
    unit: 'm',
    description: 'The lowest the ground is allowed to dip. Very low = dramatic valleys.',
    requiresRegeneration: true,
  },
  {
    path: 'terrainProfile.heightRange.max',
    label: 'Highest Ground',
    group: 'terrain',
    subgroup: 'Ground Level',
    type: 'number',
    min: 0,
    max: 30,
    step: 0.5,
    unit: 'm',
    description: 'The highest the ground is allowed to climb. Higher = bigger hills.',
    requiresRegeneration: true,
  },
  {
    path: 'terrainProfile.maxSlope',
    label: 'Max Steepness',
    group: 'terrain',
    subgroup: 'Steepness',
    type: 'number',
    min: 0.05,
    max: 1,
    step: 0.05,
    unit: 'rise/run',
    description: 'How steep hills may get. Lower keeps the map easy to drive; higher gets wild.',
    requiresRegeneration: true,
  },
  {
    path: 'terrainProfile.smoothingPasses',
    label: 'Smoothing',
    group: 'terrain',
    subgroup: 'Cleanup',
    type: 'number',
    min: 0,
    max: 8,
    step: 1,
    advanced: true,
    description: 'How many times the ground gets sanded down after shaping. More = softer hills.',
    requiresRegeneration: true,
  },
  {
    path: 'terrainProfile.slopeCorrectionIterations',
    label: 'Slope Fixing',
    group: 'terrain',
    subgroup: 'Cleanup',
    type: 'number',
    min: 0,
    max: 200,
    step: 8,
    advanced: true,
    description: 'How hard the generator tries to flatten overly steep spots. Raise it if hills keep failing validation.',
    requiresRegeneration: true,
  },
  {
    path: 'terrainProfile.retryLimit',
    label: 'Retry Limit',
    group: 'terrain',
    subgroup: 'Cleanup',
    type: 'number',
    min: 1,
    max: 16,
    step: 1,
    advanced: true,
    description: 'How many attempts the generator gets before it gives up and uses the safe fallback map.',
    requiresRegeneration: false,
  },
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
    {
      path: `terrainProfile.features.${f}.count`,
      label: 'How Many',
      group: 'terrain',
      subgroup: FEATURE_LABELS[f],
      type: 'number',
      min: 0,
      max: 12,
      step: 1,
      description: `How many ${FEATURE_LABELS[f].toLowerCase()} features appear on the map.`,
      requiresRegeneration: true,
    },
    {
      path: `terrainProfile.features.${f}.minSeparation`,
      label: 'Spacing',
      group: 'terrain',
      subgroup: FEATURE_LABELS[f],
      type: 'number',
      min: 0,
      max: 200,
      step: 5,
      unit: 'm',
      advanced: true,
      description: `Minimum distance between ${FEATURE_LABELS[f].toLowerCase()}s. Higher = more spread out.`,
      requiresRegeneration: true,
    },
    {
      path: `terrainProfile.features.${f}.falloff`,
      label: 'Softness',
      group: 'terrain',
      subgroup: FEATURE_LABELS[f],
      type: 'number',
      min: 0.05,
      max: 0.9,
      step: 0.05,
      advanced: true,
      description: 'How gently the feature blends into the ground. Low = sharp edges, high = soft bumps.',
      requiresRegeneration: true,
    },
  ]),
  ...FEATURES.flatMap<ParameterDescriptor>((f) => {
    const out: ParameterDescriptor[] = [];
    if (f === 'ridge' || f === 'valley') {
      out.push({ path: `terrainProfile.features.${f}.length.min`, label: 'Shortest Length', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 20, max: 300, step: 10, unit: 'm', advanced: true, description: `Shortest possible ${FEATURE_LABELS[f].toLowerCase()} length.`, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.length.max`, label: 'Longest Length', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 20, max: 300, step: 10, unit: 'm', advanced: true, description: `Longest possible ${FEATURE_LABELS[f].toLowerCase()} length.`, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.width.min`, label: 'Narrowest Width', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 6, max: 80, step: 2, unit: 'm', advanced: true, description: `Narrowest possible ${FEATURE_LABELS[f].toLowerCase()} width.`, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.width.max`, label: 'Widest Width', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 6, max: 80, step: 2, unit: 'm', advanced: true, description: `Widest possible ${FEATURE_LABELS[f].toLowerCase()} width.`, requiresRegeneration: true });
    } else {
      out.push({ path: `terrainProfile.features.${f}.radius.min`, label: 'Smallest Radius', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 6, max: 100, step: 2, unit: 'm', advanced: true, description: `Smallest possible footprint for this ${FEATURE_LABELS[f].toLowerCase()}.`, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.radius.max`, label: 'Biggest Radius', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 6, max: 100, step: 2, unit: 'm', advanced: true, description: `Biggest possible footprint for this ${FEATURE_LABELS[f].toLowerCase()}.`, requiresRegeneration: true });
    }
    if (f === 'basin' || f === 'valley') {
      out.push({ path: `terrainProfile.features.${f}.depth.min`, label: 'Shallowest Depth', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, description: `Shallowest possible ${FEATURE_LABELS[f].toLowerCase()} depth.`, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.depth.max`, label: 'Deepest Depth', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, description: `Deepest possible ${FEATURE_LABELS[f].toLowerCase()} depth.`, requiresRegeneration: true });
    } else {
      out.push({ path: `terrainProfile.features.${f}.height.min`, label: 'Lowest Height', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, description: `Lowest possible ${FEATURE_LABELS[f].toLowerCase()} height.`, requiresRegeneration: true });
      out.push({ path: `terrainProfile.features.${f}.height.max`, label: 'Tallest Height', group: 'terrain', subgroup: FEATURE_LABELS[f], type: 'number', min: 0.5, max: 12, step: 0.5, unit: 'm', advanced: true, description: `Tallest possible ${FEATURE_LABELS[f].toLowerCase()} height.`, requiresRegeneration: true });
    }
    return out;
  }),
];

function terrainClassParameters(): ParameterDescriptor[] {
  const p = (field: string, label: string, min: number, max: number, step: number, description: string): ParameterDescriptor => ({
    path: `terrainProfile.slopeRules.${field}`,
    label,
    group: 'terrain',
    subgroup: 'Terrain Classes',
    type: 'number',
    min,
    max,
    step,
    description,
    requiresRegeneration: true,
  });
  return [
    p('driveableMax', 'Driveable Max Slope', 0.05, 1.5, 0.05, 'Steepest ground that counts as normal driveable terrain.'),
    p('riskyMax', 'Risky Max Slope', 0.1, 2, 0.05, 'Steeper than this = risky optional terrain (driveable only as a shortcut).'),
    p('blockedMin', 'Blocked Slope', 0.1, 3, 0.05, 'Steeper than this = blocked for required routes.'),
    p('cliffMin', 'Cliff Minimum Slope', 0.4, 4, 0.05, 'Slope needed for a cell to count as a cliff wall.'),
    p('spawnMax', 'Spawn Max Slope', 0.05, 0.5, 0.01, 'Steepest ground allowed for player spawns.'),
    p('recoveryMax', 'Recovery Max Slope', 0.05, 0.5, 0.01, 'Steepest ground allowed for recovery zones.'),
    p('landingMax', 'Landing Max Slope', 0.05, 0.5, 0.01, 'Steepest ground allowed for ramp landing zones.'),
    p('maxStepUp', 'Max Step Up', 0.1, 2.5, 0.05, 'Highest upward step a tank may climb while grounded.'),
  ];
}

const CLIFF_FEATURES: Array<{ type: 'cliffPlateau' | 'escarpment'; label: string }> = [
  { type: 'cliffPlateau', label: 'Cliff Plateau' },
  { type: 'escarpment', label: 'Escarpment' },
];

export const cliffParameters: ParameterDescriptor[] = CLIFF_FEATURES.flatMap(({ type, label }) => {
  const base = `terrainProfile.features.${type}`;
  const p = (field: string, fieldLabel: string, min: number, max: number, step: number, description: string, advanced = false): ParameterDescriptor => ({
    path: `${base}.${field}`,
    label: fieldLabel,
    group: 'terrain',
    subgroup: label,
    type: 'number',
    min,
    max,
    step,
    advanced,
    description,
    requiresRegeneration: true,
  });
  return [
    { path: `${base}.count`, label: 'Enabled / How Many', group: 'terrain', subgroup: label, type: 'number', min: 0, max: 12, step: 1, description: `How many ${label.toLowerCase()} features to place. 0 turns them off.`, requiresRegeneration: true },
    { path: `${base}.minSeparation`, label: 'Spacing', group: 'terrain', subgroup: label, type: 'number', min: 0, max: 300, step: 5, advanced: true, description: 'Minimum distance from other features.', requiresRegeneration: true },
    p('height.min', 'Lowest Drop', 1, 20, 0.5, `Shortest ${label.toLowerCase()} wall height.`),
    p('height.max', 'Tallest Drop', 1, 20, 0.5, `Tallest ${label.toLowerCase()} wall height.`),
    p('edgeWidth.min', 'Narrowest Edge', 2, 16, 1, 'Thinnest transition band. Narrow = sheer cliff.', true),
    p('edgeWidth.max', 'Widest Edge', 2, 16, 1, 'Widest transition band. Wide = gentle ramp-like edge.', true),
    p('edgeRoughness', 'Edge Roughness', 0, 1, 0.05, 'How jagged the cliff edge looks.', true),
    p('accessCount', 'Access Corridors', 0, 4, 1, 'How many driveable roads lead up to the top. 0 = inaccessible optional high ground.'),
    p('accessWidth', 'Access Width', 4, 24, 1, 'How wide each access road is.', true),
    p('accessMaxSlope', 'Access Max Slope', 0.1, 0.6, 0.05, 'Steepest slope allowed on access roads.', true),
    p('safetyBuffer', 'Edge Safety Buffer', 0, 30, 1, 'Keep-away zone below the wall.', true),
    p('boundaryClearance', 'Boundary Clearance', 10, 80, 5, 'How far cliffs stay from the map edge.', true),
    p('spawnClearance', 'Spawn Clearance', 10, 80, 5, 'How far cliffs stay from spawns.', true),
    ...(type === 'escarpment'
      ? [
          p('length.min', 'Shortest Length', 40, 220, 10, 'Shortest escarpment length.'),
          p('length.max', 'Longest Length', 40, 220, 10, 'Longest escarpment length.'),
          p('width.min', 'Narrowest Width', 10, 60, 2, 'Narrowest escarpment width.'),
          p('width.max', 'Widest Width', 10, 60, 2, 'Widest escarpment width.'),
        ]
      : [
          p('radius.min', 'Smallest Top Radius', 10, 70, 2, 'Smallest cliff plateau top radius.'),
          p('radius.max', 'Biggest Top Radius', 10, 70, 2, 'Biggest cliff plateau top radius.'),
        ]),
  ];
});
