# Monster System Normalization Report

`src/shared/monsters/monsterNormalization.ts` is the single math authority:

- Target base heights: small 1.02 m, medium 1.53 m, large 1.70 m.
- Tier scales: fodder/specialist 1, elite 3, boss 5.
- `normalizationScale = targetHeight / sourceNeutralPoseHeight`;
  `finalScale = normalizationScale × tierScale × optionalVariantScale`.
- Collision: `0.45 × max(width, depth)`; height `0.90 × normalizedHeight`.
  Tier scale propagates to collision, spawn clearance, engagement radius,
  and shadow radius.

Per-model source bounds are available in
`docs/monsterpack10/source-manifests/monster_catalog.json` (hero/common
variants measured, grounded, sockets listed). The generated per-model cache
is the recommended follow-up; no GLB is scanned at spawn.

## Variant family matching

`common-near` (skinned mixer), `common-far` (rigid), and `aggregate`
(instanced) profiles share the pack's normalized 1.2 m target from the
monster pack pipeline; the launch target heights are applied through the
normalization module before tier scale.
