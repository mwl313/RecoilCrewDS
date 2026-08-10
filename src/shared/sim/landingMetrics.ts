export interface LandingMetrics {
  fallDistance: number;
  impactSpeed: number;
}

export type LandingPresentationTier = 'none' | 'light' | 'heavy' | 'massive';

export const LANDING_FEEDBACK_MIN_FALL = 2.5;
export const LANDING_HEAVY_MIN_FALL = 5.5;
export const LANDING_MASSIVE_MIN_FALL = 10;

/** Shared semantic thresholds; fall distance, not impact speed, owns the tier. */
export function classifyLandingTier(fallDistance: number): LandingPresentationTier {
  const fall = finiteNonNegative(fallDistance);
  if (fall < LANDING_FEEDBACK_MIN_FALL) return 'none';
  if (fall < LANDING_HEAVY_MIN_FALL) return 'light';
  if (fall < LANDING_MASSIVE_MIN_FALL) return 'heavy';
  return 'massive';
}

export interface FallTrackerSnapshot {
  wasGrounded: boolean;
  airborneStartedY: number | null;
  airbornePeakY: number | null;
}

/**
 * Match-scoped authoritative airborne tracker. It samples both sides of each
 * simulation step so a landing clamp cannot erase the last airborne pose.
 */
export class AuthoritativeFallTracker {
  private wasGrounded: boolean;
  private airborneStartedY: number | null = null;
  private airbornePeakY: number | null = null;

  constructor(grounded: boolean, y: number) {
    this.wasGrounded = grounded;
    if (!grounded) this.initializeAirborne(y, y);
  }

  update(sample: {
    grounded: boolean;
    previousY: number;
    y: number;
    preLandingVy: number;
  }): LandingMetrics | null {
    const previousY = finiteOr(sample.previousY, sample.y);
    const y = finiteOr(sample.y, previousY);

    if (this.wasGrounded && !sample.grounded) {
      this.initializeAirborne(previousY, y);
    } else if (!sample.grounded) {
      if (this.airbornePeakY === null) this.initializeAirborne(previousY, y);
      else this.airbornePeakY = Math.max(this.airbornePeakY, previousY, y);
    }

    let landing: LandingMetrics | null = null;
    if (!this.wasGrounded && sample.grounded) {
      const peak = Math.max(this.airbornePeakY ?? previousY, previousY);
      landing = {
        fallDistance: stableMetric(Math.max(0, peak - y)),
        impactSpeed: stableMetric(Math.max(0, -finiteOr(sample.preLandingVy, 0))),
      };
      this.airborneStartedY = null;
      this.airbornePeakY = null;
    }

    this.wasGrounded = sample.grounded;
    return landing;
  }

  /** Spawn, rematch, teleport, and authority initialization must not land. */
  reset(grounded: boolean, y: number): void {
    this.wasGrounded = grounded;
    this.airborneStartedY = null;
    this.airbornePeakY = null;
    if (!grounded) this.initializeAirborne(y, y);
  }

  snapshot(): FallTrackerSnapshot {
    return {
      wasGrounded: this.wasGrounded,
      airborneStartedY: this.airborneStartedY,
      airbornePeakY: this.airbornePeakY,
    };
  }

  private initializeAirborne(startY: number, currentY: number): void {
    this.airborneStartedY = finiteOr(startY, currentY);
    this.airbornePeakY = Math.max(this.airborneStartedY, finiteOr(currentY, this.airborneStartedY));
  }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function stableMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
