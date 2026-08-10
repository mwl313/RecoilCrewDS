import { clamp, lerp } from '../../shared/math';
import { classifyLandingTier, type LandingPresentationTier } from '../../shared/sim/landingMetrics';
import type { SimEvent } from '../../shared/types';
import type { ProceduralSoundRecipe } from '../audio/procedural/proceduralSoundTypes';

export interface LandingPresentationPlan {
  tier: LandingPresentationTier;
  recipe: ProceduralSoundRecipe;
  audioIntensity: number;
  cameraImpulse: number;
  groundPound: boolean;
}

export function landingCameraImpulse(fallDistance: number): number {
  const normalized = clamp((finiteNonNegative(fallDistance) - 2.5) / 10, 0, 1);
  return lerp(0.12, 0.65, normalized);
}

export function resolveLandingPresentation(
  event: Pick<SimEvent, 'fallDistance' | 'impactSpeed' | 'value' | 'groundPound'>,
  reducedMotion = false,
): LandingPresentationPlan | null {
  const fallDistance = finiteNonNegative(event.fallDistance ?? 0);
  const impactSpeed = finiteNonNegative(event.impactSpeed ?? event.value ?? 0);
  const tier = classifyLandingTier(fallDistance);
  const groundPound = event.groundPound === true;
  if (tier === 'none' && !groundPound) return null;

  const recipe: ProceduralSoundRecipe = groundPound
    ? 'groundPoundImpact'
    : tier === 'massive'
      ? 'landingMassive'
      : tier === 'heavy'
        ? 'landingHeavy'
        : 'landingLight';
  const distanceIntensity = clamp((fallDistance - 1.5) / 10, 0, 1);
  const speedIntensity = clamp(impactSpeed / 20, 0, 1);
  const audioIntensity = clamp(0.68 + distanceIntensity * 0.5 + speedIntensity * 0.12, 0.68, 1.3);
  const groundPoundPulse = groundPound ? (tier === 'heavy' || tier === 'massive' ? 0.08 : 0.04) : 0;
  const fullImpulse = Math.min(0.72, (tier === 'none' ? 0.08 : landingCameraImpulse(fallDistance)) + groundPoundPulse);

  return {
    tier,
    recipe,
    audioIntensity,
    cameraImpulse: fullImpulse * (reducedMotion ? 0.28 : 1),
    groundPound,
  };
}

export function presentLanding(
  event: SimEvent,
  deps: {
    audio: { playLocal(recipe: ProceduralSoundRecipe, options?: object): unknown };
    camera: { addLandingImpulse(shake: number): void };
    seed: number;
    reducedMotion?: boolean;
  },
): LandingPresentationPlan | null {
  const plan = resolveLandingPresentation(event, deps.reducedMotion ?? false);
  if (!plan) return null;
  deps.audio.playLocal(plan.recipe, {
    seed: deps.seed,
    intensity: plan.audioIntensity,
    fallDistance: event.fallDistance,
    impactSpeed: event.impactSpeed ?? event.value,
  });
  deps.camera.addLandingImpulse(plan.cameraImpulse);
  return plan;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
