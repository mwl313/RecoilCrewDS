import type { RelicChestSpawnPolicyDefinition } from '../content/schemas/progression';
import type { ArenaWorld } from '../sim/arenaWorld';
import { resolveArenaBounds } from '../sim/groundQuery';

export interface ChestPlacement {
  x: number;
  y: number;
  z: number;
}

export interface ChestSpawnDirectorTelemetry {
  attempt(): void;
  failure(): void;
}

/** Deterministic, map-independent placement for authoritative relic chests. */
export class RelicChestSpawnDirector {
  private readonly bounds;

  constructor(
    private readonly world: ArenaWorld,
    private readonly policy: RelicChestSpawnPolicyDefinition,
    private readonly initialRandom: () => number,
    private readonly periodicRandom: () => number,
    private readonly dropRandom: () => number,
    private readonly telemetry: ChestSpawnDirectorTelemetry,
  ) {
    this.bounds = resolveArenaBounds(world);
  }

  initialPlacements(tankSpawn: { x: number; z: number }): ChestPlacement[] {
    const placements: ChestPlacement[] = [];
    if (this.policy.initialDiscoveryChest.enabled && this.policy.initialMapChestCount > 0) {
      const discovery = this.findInAnnulus(
        tankSpawn,
        this.policy.initialDiscoveryChest.minimumDistanceFromTankSpawn,
        this.policy.initialDiscoveryChest.maximumDistanceFromTankSpawn,
        placements,
        this.initialRandom,
        256,
      );
      if (discovery) placements.push(discovery);
    }

    const inset = 4;
    const width = Math.max(0, this.bounds.maxX - this.bounds.minX - inset * 2);
    const depth = Math.max(0, this.bounds.maxZ - this.bounds.minZ - inset * 2);
    let guard = 0;
    while (placements.length < this.policy.initialMapChestCount && guard++ < 6000) {
      const x = this.bounds.minX + inset + this.initialRandom() * width;
      const z = this.bounds.minZ + inset + this.initialRandom() * depth;
      const placement = this.validateCandidate(x, z, placements, this.policy.initialMinimumChestSpacing);
      if (placement) placements.push(placement);
    }
    // Deterministic exhaustive fallback: authored "10 starting chests" is an
    // invariant, not a best-effort random sample. This only changes seeds for
    // which the random search could not fill the requested count.
    if (placements.length < this.policy.initialMapChestCount) {
      const step = Math.max(2, this.policy.initialMinimumChestSpacing);
      for (let z = this.bounds.minZ + inset; z <= this.bounds.maxZ - inset && placements.length < this.policy.initialMapChestCount; z += step) {
        for (let x = this.bounds.minX + inset; x <= this.bounds.maxX - inset && placements.length < this.policy.initialMapChestCount; x += step) {
          const placement = this.validateCandidate(x, z, placements, this.policy.initialMinimumChestSpacing);
          if (placement) placements.push(placement);
        }
      }
    }
    return placements;
  }

  periodicPlacement(
    tank: { x: number; z: number },
    existing: readonly { x: number; z: number }[],
  ): ChestPlacement | null {
    const inset = 4;
    const width = Math.max(0, this.bounds.maxX - this.bounds.minX - inset * 2);
    const depth = Math.max(0, this.bounds.maxZ - this.bounds.minZ - inset * 2);
    for (let i = 0; i < 512; i++) {
      const x = this.bounds.minX + inset + this.periodicRandom() * width;
      const z = this.bounds.minZ + inset + this.periodicRandom() * depth;
      if (Math.hypot(x - tank.x, z - tank.z) < this.policy.periodic.minimumDistanceFromCurrentTank) {
        this.telemetry.attempt();
        this.telemetry.failure();
        continue;
      }
      const placement = this.validateCandidate(x, z, existing, this.policy.initialMinimumChestSpacing);
      if (placement) return placement;
    }
    return null;
  }

  enemyDropPlacement(
    origin: { x: number; z: number },
    existing: readonly { x: number; z: number }[],
    guaranteed = false,
  ): ChestPlacement | null {
    const startAngle = this.dropRandom() * Math.PI * 2;
    const radii = [0, 2.5, 5, 8, 12, 16];
    for (const radius of radii) {
      const count = radius === 0 ? 1 : 12;
      for (let i = 0; i < count; i++) {
        const angle = startAngle + (i / count) * Math.PI * 2;
        const placement = this.validateCandidate(
          origin.x + Math.cos(angle) * radius,
          origin.z + Math.sin(angle) * radius,
          existing,
          3.5,
        );
        if (placement) return placement;
      }
    }
    if (guaranteed) {
      const inset = 4;
      const width = Math.max(0, this.bounds.maxX - this.bounds.minX - inset * 2);
      const depth = Math.max(0, this.bounds.maxZ - this.bounds.minZ - inset * 2);
      for (let i = 0; i < 2048; i++) {
        const placement = this.validateCandidate(
          this.bounds.minX + inset + this.dropRandom() * width,
          this.bounds.minZ + inset + this.dropRandom() * depth,
          existing,
          3.5,
        );
        if (placement) return placement;
      }
      for (let z = this.bounds.minZ + inset; z <= this.bounds.maxZ - inset; z += 4) {
        for (let x = this.bounds.minX + inset; x <= this.bounds.maxX - inset; x += 4) {
          const placement = this.validateCandidate(x, z, existing, 3.5);
          if (placement) return placement;
        }
      }
    }
    return null;
  }

  isValidPlacement(x: number, z: number, existing: readonly { x: number; z: number }[], spacing: number): boolean {
    return this.validateCandidate(x, z, existing, spacing) !== null;
  }

  private findInAnnulus(
    origin: { x: number; z: number },
    minimum: number,
    maximum: number,
    existing: readonly { x: number; z: number }[],
    random: () => number,
    attempts: number,
  ): ChestPlacement | null {
    for (let i = 0; i < attempts; i++) {
      const angle = random() * Math.PI * 2;
      const radius = minimum + random() * Math.max(0, maximum - minimum);
      const placement = this.validateCandidate(
        origin.x + Math.cos(angle) * radius,
        origin.z + Math.sin(angle) * radius,
        existing,
        this.policy.initialMinimumChestSpacing,
      );
      if (placement) return placement;
    }
    const radialStep = Math.max(2, this.policy.initialMinimumChestSpacing / 3);
    for (let radius = minimum; radius <= maximum; radius += radialStep) {
      const count = Math.max(16, Math.ceil((Math.PI * 2 * radius) / radialStep));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const placement = this.validateCandidate(
          origin.x + Math.cos(angle) * radius,
          origin.z + Math.sin(angle) * radius,
          existing,
          this.policy.initialMinimumChestSpacing,
        );
        if (placement) return placement;
      }
    }
    return null;
  }

  private validateCandidate(
    x: number,
    z: number,
    existing: readonly { x: number; z: number }[],
    spacing: number,
  ): ChestPlacement | null {
    this.telemetry.attempt();
    const inset = 2;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x < this.bounds.minX + inset ||
      x > this.bounds.maxX - inset ||
      z < this.bounds.minZ + inset ||
      z > this.bounds.maxZ - inset ||
      existing.some((chest) => Math.hypot(x - chest.x, z - chest.z) < spacing)
    ) {
      this.telemetry.failure();
      return null;
    }
    const y = this.world.groundHeightAt(x, z);
    const normal = this.world.groundNormalAt(x, z);
    if (
      !Number.isFinite(y) ||
      !Number.isFinite(normal.nx) ||
      !Number.isFinite(normal.ny) ||
      !Number.isFinite(normal.nz) ||
      normal.ny < 0.72 ||
      this.world.isDriveableAt?.(x, z) === false ||
      this.world.isCliffWallAt?.(x, z) === true ||
      this.world.obstacleAt(x, z, y + 0.4) !== undefined ||
      this.world.resolveCircleContacts(x, z, 1.8, y + 0.4).contacts.length > 0
    ) {
      this.telemetry.failure();
      return null;
    }
    return { x, y: y + 0.4, z };
  }
}
