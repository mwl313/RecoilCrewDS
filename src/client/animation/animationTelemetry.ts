/**
 * Animation lifecycle counters. Cleanup paths update these so soak tests,
 * the preview tool, and benchmarks can prove mixers/roots/materials do not
 * grow across rounds.
 */
export const animationTelemetry = {
  liveMixers: 0,
  liveSkinnedRoots: 0,
  liveRigidFarRoots: 0,
  ownedMaterialClones: 0,
  animationActionCount: 0,
  warnings: 0,
};

export function resetAnimationTelemetry(): void {
  animationTelemetry.liveMixers = 0;
  animationTelemetry.liveSkinnedRoots = 0;
  animationTelemetry.liveRigidFarRoots = 0;
  animationTelemetry.ownedMaterialClones = 0;
  animationTelemetry.animationActionCount = 0;
  animationTelemetry.warnings = 0;
}
