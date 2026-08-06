/**
 * Deterministic melee engagement reservations around the tank.
 *
 * Each melee enemy reserves an angular arc. Only the reservation owner may
 * enter attack-ready state and fire a melee cue. Reservations are released
 * on death, displacement, range escape, grace expiry, or explicit release.
 * Arbitration is deterministic: distance → existing ownership → threat →
 * stable enemy id. No random arbitration and no hidden global DPS cap.
 */
export interface MeleeEngagementProfileData {
  spacingMultiplier: number;
  minimumSlots: number;
  maximumSlots: number;
  reservationGraceSeconds: number;
  releaseDistanceMultiplier: number;
}

export interface MeleeCandidate {
  id: number;
  x: number;
  z: number;
  collisionDiameter: number;
  threat: number;
  alive: boolean;
  attackRange: number;
  distanceToTank: number;
  angleToTank: number;
  lastDamageAt: number;
}

export interface MeleeReservation {
  ownerId: number;
  angle: number;
  halfWidth: number;
  acquiredAt: number;
  lastValidatedAt: number;
  threat: number;
}

export const DEFAULT_MELEE_ENGAGEMENT_PROFILE: MeleeEngagementProfileData = {
  spacingMultiplier: 1.25,
  minimumSlots: 3,
  maximumSlots: 6,
  reservationGraceSeconds: 0.35,
  releaseDistanceMultiplier: 1.35,
};

function normalizeAngle(a: number): number {
  return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function angleDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, Math.PI * 2 - d);
}

export class MeleeReservationManager {
  private readonly slots = new Map<number, MeleeReservation>();

  constructor(private readonly profile: MeleeEngagementProfileData) {}

  hasReservation(ownerId: number): boolean {
    return this.slots.has(ownerId);
  }

  reservation(ownerId: number): MeleeReservation | undefined {
    return this.slots.get(ownerId);
  }

  get size(): number {
    return this.slots.size;
  }

  release(ownerId: number): void {
    this.slots.delete(ownerId);
  }

  releaseAll(): void {
    this.slots.clear();
  }

  /**
   * Refresh reservations and grant/deny arcs deterministically.
   * Call once per authoritative step with the tank position.
   */
  update(
    tankX: number,
    tankZ: number,
    candidates: readonly MeleeCandidate[],
    now: number,
  ): void {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    // Release stale/dead/distant owners first.
    for (const [ownerId, slot] of [...this.slots]) {
      const candidate = byId.get(ownerId);
      if (!candidate || !candidate.alive) {
        this.release(ownerId);
        continue;
      }
      const releaseRadius = candidate.attackRange * this.profile.releaseDistanceMultiplier;
      if (candidate.distanceToTank > releaseRadius) {
        this.release(ownerId);
        continue;
      }
      if (now - slot.lastValidatedAt > this.profile.reservationGraceSeconds) {
        this.release(ownerId);
        continue;
      }
      slot.lastValidatedAt = now;
      slot.threat = candidate.threat;
    }

    // Deterministic tie-break: distance → existing ownership → threat → id.
    const ordered = [...candidates]
      .filter((c) => c.alive && c.distanceToTank <= c.attackRange)
      .sort((a, b) => {
        const ad = a.distanceToTank - b.distanceToTank;
        if (Math.abs(ad) > 1e-9) return ad;
        const ao = Number(this.hasReservation(b.id)) - Number(this.hasReservation(a.id));
        if (ao !== 0) return ao;
        if (b.threat !== a.threat) return b.threat - a.threat;
        return a.id - b.id;
      });

    for (const candidate of ordered) {
      if (this.slots.has(candidate.id)) continue;
      if (this.slots.size >= this.profile.maximumSlots) continue;
      const halfWidth = (candidate.collisionDiameter * this.profile.spacingMultiplier) / 2;
      const angle = this.tryAcquire(candidate, halfWidth, now);
      if (angle !== undefined) {
        this.slots.set(candidate.id, {
          ownerId: candidate.id,
          angle,
          halfWidth,
          acquiredAt: now,
          lastValidatedAt: now,
          threat: candidate.threat,
        });
      }
    }
  }

  /** A melee cue is valid only for the reservation owner within grace. */
  canFireMelee(ownerId: number, now: number): boolean {
    const slot = this.slots.get(ownerId);
    if (!slot) return false;
    return now - slot.lastValidatedAt <= this.profile.reservationGraceSeconds;
  }

  private tryAcquire(
    candidate: MeleeCandidate,
    halfWidth: number,
    now: number,
  ): number | undefined {
    const candidates = [candidate.angleToTank, normalizeAngle(candidate.angleToTank + Math.PI)];
    for (const angle of candidates) {
      if (this.fits(angle, halfWidth, candidate.id)) return angle;
    }
    if (this.slots.size < this.profile.minimumSlots) {
      // Under the minimum fill: step around the ring deterministically.
      const step = (Math.PI * 2) / Math.max(1, this.profile.minimumSlots);
      for (let i = 0; i < this.profile.minimumSlots; i++) {
        const angle = normalizeAngle(i * step + candidate.id * 0.001);
        if (this.fits(angle, halfWidth, candidate.id)) return angle;
      }
    }
    return undefined;
  }

  private fits(angle: number, halfWidth: number, ownerId: number): boolean {
    for (const slot of this.slots.values()) {
      if (slot.ownerId === ownerId) continue;
      if (angleDistance(angle, slot.angle) < halfWidth + slot.halfWidth) return false;
    }
    return true;
  }
}
