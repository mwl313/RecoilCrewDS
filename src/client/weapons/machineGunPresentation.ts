import type { AudioManager } from '../audio';
import type { CameraManager } from '../app/cameraManager';
import type { VfxSystem } from '../vfx';

export const MACHINE_GUN_PRESENTATION_LIMITS = Object.freeze({
  muzzleFlashSize: 1.1,
  muzzleFlashLifeSeconds: 0.055,
  muzzleSparkCount: 4,
  tracerCoreWidth: 0.035,
  tracerGlowWidth: 0.1,
  tracerLifeSeconds: 0.07,
  impactSparkCount: 10,
  recoilPerShot: 0.028,
  recoilWindowMs: 100,
  recoilWindowCap: 0.12,
});

export interface MachineGunPoint {
  x: number;
  y: number;
  z: number;
}

export interface MachineGunMuzzlePose {
  origin: MachineGunPoint;
  direction: MachineGunPoint;
}

export interface MachineGunAuthoritativeRay extends MachineGunMuzzlePose {
  distance: number;
}

export interface MachineGunVisualRay {
  origin: MachineGunPoint;
  endpoint: MachineGunPoint;
  alignedToRenderedMuzzle: boolean;
}

export const MACHINE_GUN_ALIGNMENT_LIMITS = Object.freeze({
  maximumOriginCorrectionMeters: 3,
  maximumDirectionErrorRadians: 6 * Math.PI / 180,
});

/**
 * Hitscan equivalent of the Cannon presenter correction. The gameplay
 * endpoint never moves. Small render-delay differences may re-anchor to the
 * latest visible muzzle; large flicks retain the authoritative historical
 * ray because no honest extrapolation exists for an instantaneous hit.
 */
export function resolveMachineGunVisualRay(
  authoritative: MachineGunAuthoritativeRay,
  rendered: MachineGunMuzzlePose | null,
): MachineGunVisualRay {
  const endpoint = {
    x: authoritative.origin.x + authoritative.direction.x * authoritative.distance,
    y: authoritative.origin.y + authoritative.direction.y * authoritative.distance,
    z: authoritative.origin.z + authoritative.direction.z * authoritative.distance,
  };
  if (!rendered) return { origin: authoritative.origin, endpoint, alignedToRenderedMuzzle: false };

  const originError = Math.hypot(
    rendered.origin.x - authoritative.origin.x,
    rendered.origin.y - authoritative.origin.y,
    rendered.origin.z - authoritative.origin.z,
  );
  const ex = endpoint.x - rendered.origin.x;
  const ey = endpoint.y - rendered.origin.y;
  const ez = endpoint.z - rendered.origin.z;
  const endpointDistance = Math.hypot(ex, ey, ez);
  const renderedDirectionLength = Math.hypot(rendered.direction.x, rendered.direction.y, rendered.direction.z);
  if (endpointDistance <= 0.0001 || renderedDirectionLength <= 0.0001) {
    return { origin: authoritative.origin, endpoint, alignedToRenderedMuzzle: false };
  }
  const cosine = Math.max(-1, Math.min(1, (
    ex * rendered.direction.x + ey * rendered.direction.y + ez * rendered.direction.z
  ) / (endpointDistance * renderedDirectionLength)));
  const directionError = Math.acos(cosine);
  const aligned = originError <= MACHINE_GUN_ALIGNMENT_LIMITS.maximumOriginCorrectionMeters
    && directionError <= MACHINE_GUN_ALIGNMENT_LIMITS.maximumDirectionErrorRadians;
  return {
    origin: aligned ? rendered.origin : authoritative.origin,
    endpoint,
    alignedToRenderedMuzzle: aligned,
  };
}

export interface MachineGunAcceptedShot {
  origin: MachineGunPoint;
  endpoint: MachineGunPoint;
  seed?: number;
  /** The local prediction already supplied muzzle/audio/recoil. */
  confirmedPrediction?: boolean;
}

/**
 * Machine-Gun-only orchestration over generic bounded VFX/audio systems.
 * Gameplay never depends on this module and no shot is throttled here.
 */
export class MachineGunPresentation {
  private recoilWindowStartedAt = Number.NEGATIVE_INFINITY;
  private recoilUsedInWindow = 0;
  private acceptedShots = 0;
  private predictedShots = 0;
  private impacts = 0;

  constructor(
    private readonly vfx: VfxSystem,
    private readonly audio: AudioManager,
    private readonly camera: CameraManager,
    private readonly now: () => number = () => performance.now(),
    private readonly reducedMotion: () => boolean = () =>
      typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ) {}

  presentPredictedShot(origin: MachineGunPoint, seed?: number): void {
    this.predictedShots++;
    this.presentImmediate(origin, seed);
  }

  presentAcceptedShot(shot: MachineGunAcceptedShot): void {
    this.acceptedShots++;
    if (!shot.confirmedPrediction) this.presentImmediate(shot.origin, shot.seed);
    this.vfx.spawnStreak(
      shot.origin.x, shot.origin.y, shot.origin.z,
      shot.endpoint.x, shot.endpoint.y, shot.endpoint.z,
      0xffd27a,
      MACHINE_GUN_PRESENTATION_LIMITS.tracerGlowWidth,
      MACHINE_GUN_PRESENTATION_LIMITS.tracerLifeSeconds,
      0.32,
    );
    this.vfx.spawnStreak(
      shot.origin.x, shot.origin.y, shot.origin.z,
      shot.endpoint.x, shot.endpoint.y, shot.endpoint.z,
      0xfff4cf,
      MACHINE_GUN_PRESENTATION_LIMITS.tracerCoreWidth,
      MACHINE_GUN_PRESENTATION_LIMITS.tracerLifeSeconds,
      0.95,
    );
  }

  presentImpact(position: MachineGunPoint, seed?: number): void {
    this.impacts++;
    this.vfx.spawnBurst(
      position.x, position.y, position.z,
      0xffd27a,
      MACHINE_GUN_PRESENTATION_LIMITS.impactSparkCount,
      5.5,
      0.075,
      0.18,
      6,
      0.75,
    );
    this.vfx.spawnFlash(position.x, position.y, position.z, 0xfff1c2, 0.48, 0.045);
    this.vfx.spawnBurst(position.x, position.y, position.z, 0x36322d, 1, 0.8, 0.12, 0.22, -0.8, 0.25);
    this.audio.playWorld('playerMgImpact', {
      x: position.x,
      y: position.y,
      z: position.z,
      seed,
    });
  }

  reset(): void {
    this.recoilWindowStartedAt = Number.NEGATIVE_INFINITY;
    this.recoilUsedInWindow = 0;
    this.acceptedShots = 0;
    this.predictedShots = 0;
    this.impacts = 0;
  }

  diagnostics(): { acceptedShots: number; predictedShots: number; impacts: number; recoilUsedInWindow: number } {
    return {
      acceptedShots: this.acceptedShots,
      predictedShots: this.predictedShots,
      impacts: this.impacts,
      recoilUsedInWindow: this.recoilUsedInWindow,
    };
  }

  private presentImmediate(origin: MachineGunPoint, seed?: number): void {
    this.vfx.spawnFlash(
      origin.x,
      origin.y,
      origin.z,
      0xfff0b0,
      MACHINE_GUN_PRESENTATION_LIMITS.muzzleFlashSize,
      MACHINE_GUN_PRESENTATION_LIMITS.muzzleFlashLifeSeconds,
    );
    this.vfx.spawnBurst(
      origin.x,
      origin.y,
      origin.z,
      0xffd27a,
      MACHINE_GUN_PRESENTATION_LIMITS.muzzleSparkCount,
      4.2,
      0.055,
      0.11,
      0,
      0.45,
    );
    this.audio.playLocal('playerMg', { seed });
    this.requestRecoilFeedback();
  }

  private requestRecoilFeedback(): void {
    if (this.reducedMotion()) return;
    const now = this.now();
    if (now - this.recoilWindowStartedAt >= MACHINE_GUN_PRESENTATION_LIMITS.recoilWindowMs) {
      this.recoilWindowStartedAt = now;
      this.recoilUsedInWindow = 0;
    }
    const remaining = MACHINE_GUN_PRESENTATION_LIMITS.recoilWindowCap - this.recoilUsedInWindow;
    const impulse = Math.max(0, Math.min(MACHINE_GUN_PRESENTATION_LIMITS.recoilPerShot, remaining));
    if (impulse <= 0) return;
    this.recoilUsedInWindow += impulse;
    this.camera.addImpulse(impulse);
  }
}
