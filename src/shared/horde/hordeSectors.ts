import type { EnemyState } from '../types';
import type { SystemContext } from '../sim/systems/systemContext';
import type { PopulationClass } from './spawnOwnership';
import { enemyThreat } from '../enemies/monsterCompat';
import { isPersistentThreat } from '../enemies/enemyClassification';

/**
 * Core Loop 06 M10: aggregate distant populations. Far (tier 3) ordinary
 * enemies that meet demotion requirements are merged into sector records —
 * no individual HP/collision/attack — and materialize back into active
 * enemies before they enter interaction range. Wave-owned sectors collapse
 * on leader death; ambient sectors survive.
 */
export interface HordeSectorState {
  sectorId: number;
  enemyDefId: string;
  count: number;
  threat: number;
  centerX: number;
  centerZ: number;
  flowDx: number;
  flowDz: number;
  populationClass: PopulationClass;
  waveId: number | null;
  leaderId?: number | null;
  purgeOnLeaderDeath?: boolean;
  maintenanceSummon?: boolean;
  rewardSuppressed?: boolean;
  presentationSeed: number;
}

export interface RecyclableSectorSlice {
  sectorId: number;
  enemyDefId: string;
  count: number;
  threat: number;
  populationClass: PopulationClass;
  waveId: number | null;
  leaderId: number | null;
  purgeOnLeaderDeath: boolean;
  maintenanceSummon: boolean;
  rewardSuppressed: boolean;
}

export interface HordeSectorMovementTelemetry {
  updateHz: number;
  movedMeters: number;
  relocatedSectors: number;
  stuckRecoveries: number;
}

interface SectorRuntime {
  stuckSeconds: number;
  lastDistance: number;
  alternateAttempts: number;
}

const SECTOR_CELL = 40;

export class HordeSectorAggregator {
  readonly sectors = new Map<number, HordeSectorState>();
  private nextSectorId = 1;
  private lastAggregateAt = 0;
  private lastMoveAt = 0;
  private readonly runtime = new Map<number, SectorRuntime>();
  private movement: HordeSectorMovementTelemetry = {
    updateHz: 1.5,
    movedMeters: 0,
    relocatedSectors: 0,
    stuckRecoveries: 0,
  };

  constructor(private readonly ctx: SystemContext) {}

  /**
   * Periodically merge eligible tier-3 enemies into sectors. Enemies are
   * removed directly (no kill hooks/rewards), preserving count, threat,
   * ownership, and wave id.
   */
  update(dt: number, tankX: number, tankZ: number): void {
    this.lastMoveAt += dt;
    const sectorHz = Math.max(1.5, Math.min(2, this.ctx.horde?.resolved.policies.replication.sectorHz ?? 1.5));
    this.movement.updateHz = sectorHz;
    const moveInterval = 1 / sectorHz;
    if (this.lastMoveAt >= moveInterval) {
      const elapsed = this.lastMoveAt;
      this.lastMoveAt = 0;
      this.advanceSectors(elapsed, tankX, tankZ);
    }
    this.lastAggregateAt += dt;
    const policy = this.ctx.horde?.resolved.policies.lod;
    const aggregationHz = policy ? policy.tier3Hz : 1.5;
    if (this.lastAggregateAt < 1 / Math.max(0.5, aggregationHz)) return;
    this.lastAggregateAt = 0;
    const demoteDistance = policy ? policy.tier2Leave : 165;
    const eligible = this.ctx.state.enemies.filter(
      (e) =>
        e.alive &&
        Math.hypot(e.x - tankX, e.z - tankZ) > demoteDistance &&
        this.canDemote(e),
    );
    if (eligible.length === 0) return;
    const byKey = new Map<string, EnemyState[]>();
    for (const e of eligible) {
      const ownership = e.ownership;
      const key = [
        this.cell(e.x),
        this.cell(e.z),
        e.defId ?? '',
        ownership?.populationClass ?? 'ambient',
        ownership?.waveId ?? 0,
        ownership?.leaderId ?? 0,
        ownership?.maintenanceSummon ? 1 : 0,
        ownership?.rewardSuppressed ? 1 : 0,
      ].join(':');
      let list = byKey.get(key);
      if (!list) {
        list = [];
        byKey.set(key, list);
      }
      list.push(e);
    }
    const ids = new Set(eligible.map((e) => e.id));
    for (const list of byKey.values()) {
      const first = list[0];
      const flow = this.ctx.flowField?.direction(first.x, first.z);
      const sector: HordeSectorState = {
        sectorId: this.nextSectorId++,
        enemyDefId: first.defId ?? '',
        count: list.length,
        threat: list.reduce((sum, e) => sum + enemyThreat(this.ctx.enemies.defFor(e)), 0),
        centerX: list.reduce((sum, e) => sum + e.x, 0) / list.length,
        centerZ: list.reduce((sum, e) => sum + e.z, 0) / list.length,
        flowDx: flow?.x ?? 0,
        flowDz: flow?.z ?? 0,
        populationClass: (first.ownership?.populationClass ?? 'ambient') as PopulationClass,
        waveId: first.ownership?.waveId ?? null,
        leaderId: first.ownership?.leaderId ?? null,
        purgeOnLeaderDeath: first.ownership?.purgeOnLeaderDeath ?? false,
        maintenanceSummon: first.ownership?.maintenanceSummon ?? false,
        rewardSuppressed: first.ownership?.rewardSuppressed ?? false,
        presentationSeed: first.id,
      };
      this.sectors.set(sector.sectorId, sector);
      this.runtime.set(sector.sectorId, {
        stuckSeconds: 0,
        lastDistance: Math.hypot(sector.centerX - tankX, sector.centerZ - tankZ),
        alternateAttempts: 0,
      });
    }
    this.ctx.enemies.purge((e) => ids.has(e.id));
  }

  /**
   * Materialize sectors whose center enters the active band. Re-spawns the
   * exact defId with preserved ownership before interaction range.
   */
  materialize(tankX: number, tankZ: number): void {
    const policy = this.ctx.horde?.resolved.policies.lod;
    const materializeDistance = policy ? policy.tier2Enter + 10 : 155;
    for (const [id, sector] of [...this.sectors]) {
      const d = Math.hypot(sector.centerX - tankX, sector.centerZ - tankZ);
      if (d >= materializeDistance) continue;
      const def = this.ctx.enemies.defById(sector.enemyDefId);
      if (def) {
        for (let i = 0; i < sector.count; i++) {
          const angle = (i / Math.max(1, sector.count)) * Math.PI * 2;
          const x = sector.centerX + Math.sin(angle) * (2 + (i % 6));
          const z = sector.centerZ + Math.cos(angle) * (2 + (i % 6));
          this.ctx.enemies.spawnEnemyDef(def, x, z, {
            populationClass: sector.populationClass,
            waveId: sector.waveId,
            leaderId: sector.leaderId ?? null,
            packInstanceId: sector.sectorId,
            spawnAnchorId: null,
            purgeOnLeaderDeath: sector.purgeOnLeaderDeath ?? false,
            ...(sector.maintenanceSummon
              ? { maintenanceSummon: true, summonedByLeaderId: sector.leaderId ?? undefined }
              : {}),
            ...(sector.rewardSuppressed ? { rewardSuppressed: true } : {}),
          });
        }
      }
      this.sectors.delete(id);
      this.runtime.delete(id);
    }
  }

  /** Collapse wave-owned sectors on leader death (no rewards, ambient stays). */
  purgeWave(waveId: number): number {
    return this.purgeWaveDetailed(waveId).entities;
  }

  /** Detailed collapse result lets wave live counters retain threat parity. */
  purgeWaveDetailed(waveId: number): { entities: number; threat: number } {
    let removed = 0;
    let threat = 0;
    for (const [id, sector] of [...this.sectors]) {
      if (sector.waveId === waveId) {
        this.sectors.delete(id);
        this.runtime.delete(id);
        removed += sector.count;
        threat += sector.threat;
      }
    }
    return { entities: removed, threat };
  }

  /** Purge renewable summons owned by one defeated co-leader. */
  purgeLeaderDetailed(leaderId: number): { entities: number; threat: number } {
    let entities = 0;
    let threat = 0;
    for (const [id, sector] of [...this.sectors]) {
      if (!sector.maintenanceSummon || sector.leaderId !== leaderId) continue;
      this.sectors.delete(id);
      this.runtime.delete(id);
      entities += sector.count;
      threat += sector.threat;
    }
    return { entities, threat };
  }

  /**
   * Remove bounded, far, off-camera ordinary slices for equivalent pressure
   * re-entry. The callback must accept the replacement before the source is
   * decremented, keeping population accounting lossless.
   */
  recycleFar(
    maximumUnits: number,
    tankX: number,
    tankZ: number,
    relocate: (slice: RecyclableSectorSlice) => boolean,
  ): number {
    let remaining = Math.max(0, Math.floor(maximumUnits));
    let recycled = 0;
    const candidates = [...this.sectors.values()]
      .filter((sector) => {
        if (sector.populationClass === 'boss' || sector.populationClass === 'special') return false;
        const distance = Math.hypot(sector.centerX - tankX, sector.centerZ - tankZ);
        return distance >= 145 && this.ctx.spawnPlanner.isOffCamera(sector.centerX, sector.centerZ);
      })
      .sort((a, b) =>
        Math.hypot(b.centerX - tankX, b.centerZ - tankZ) -
          Math.hypot(a.centerX - tankX, a.centerZ - tankZ) ||
        a.sectorId - b.sectorId,
      );
    for (const sector of candidates) {
      if (remaining <= 0) break;
      const count = Math.min(remaining, sector.count);
      const threat = sector.threat * (count / Math.max(1, sector.count));
      const slice: RecyclableSectorSlice = {
        sectorId: sector.sectorId,
        enemyDefId: sector.enemyDefId,
        count,
        threat,
        populationClass: sector.populationClass,
        waveId: sector.waveId,
        leaderId: sector.leaderId ?? null,
        purgeOnLeaderDeath: sector.purgeOnLeaderDeath ?? false,
        maintenanceSummon: sector.maintenanceSummon ?? false,
        rewardSuppressed: sector.rewardSuppressed ?? false,
      };
      if (!relocate(slice)) continue;
      sector.count -= count;
      sector.threat = Math.max(0, sector.threat - threat);
      remaining -= count;
      recycled += count;
      if (sector.count <= 0) {
        this.sectors.delete(sector.sectorId);
        this.runtime.delete(sector.sectorId);
      }
    }
    return recycled;
  }

  maintenanceCount(leaderId?: number): number {
    let count = 0;
    for (const sector of this.sectors.values()) {
      if (!sector.maintenanceSummon) continue;
      if (leaderId !== undefined && sector.leaderId !== leaderId) continue;
      count += sector.count;
    }
    return count;
  }

  movementTelemetry(): HordeSectorMovementTelemetry {
    return { ...this.movement };
  }

  /** Sector count + threat for population accounting. */
  tally(): { entities: number; threat: number; byClass: Record<PopulationClass, { entities: number; threat: number }> } {
    let entities = 0;
    let threat = 0;
    const byClass: Record<PopulationClass, { entities: number; threat: number }> = {
      ambient: { entities: 0, threat: 0 },
      wave: { entities: 0, threat: 0 },
      boss: { entities: 0, threat: 0 },
      special: { entities: 0, threat: 0 },
    };
    for (const s of this.sectors.values()) {
      entities += s.count;
      threat += s.threat;
      byClass[s.populationClass].entities += s.count;
      byClass[s.populationClass].threat += s.threat;
    }
    return { entities, threat, byClass };
  }

  reset(): void {
    this.sectors.clear();
    this.runtime.clear();
    this.nextSectorId = 1;
    this.lastAggregateAt = 0;
    this.lastMoveAt = 0;
    this.movement = { updateHz: 1.5, movedMeters: 0, relocatedSectors: 0, stuckRecoveries: 0 };
  }

  private advanceSectors(elapsed: number, tankX: number, tankZ: number): void {
    const navigation = this.ctx.horde?.resolved.policies.navigation;
    const flowWeight = navigation?.nearWeight ?? 0.7;
    const directWeight = navigation?.directWeight ?? 0.2;
    const stuckTime = navigation?.stuckTimeSeconds ?? 2.5;
    for (const sector of this.sectors.values()) {
      const dx = tankX - sector.centerX;
      const dz = tankZ - sector.centerZ;
      const distance = Math.hypot(dx, dz) || 1;
      const directX = dx / distance;
      const directZ = dz / distance;
      const flow = this.ctx.flowField?.direction(sector.centerX, sector.centerZ);
      let moveX = flow ? flow.x * flowWeight + directX * directWeight : directX;
      let moveZ = flow ? flow.z * flowWeight + directZ * directWeight : directZ;
      const length = Math.hypot(moveX, moveZ) || 1;
      moveX /= length;
      moveZ /= length;
      const speed = this.sectorSpeed(sector.enemyDefId);
      const step = speed * elapsed;
      let candidateX = sector.centerX + moveX * step;
      let candidateZ = sector.centerZ + moveZ * step;
      let moved = false;
      if (this.validSectorPoint(candidateX, candidateZ)) {
        moved = true;
      } else {
        // Deterministic alternate around a coarse obstruction.
        const side = sector.sectorId % 2 === 0 ? 1 : -1;
        candidateX = sector.centerX + -moveZ * side * step;
        candidateZ = sector.centerZ + moveX * side * step;
        moved = this.validSectorPoint(candidateX, candidateZ);
      }

      const state = this.runtime.get(sector.sectorId) ?? {
        stuckSeconds: 0,
        lastDistance: distance,
        alternateAttempts: 0,
      };
      this.runtime.set(sector.sectorId, state);
      if (moved) {
        const oldX = sector.centerX;
        const oldZ = sector.centerZ;
        sector.centerX = candidateX;
        sector.centerZ = candidateZ;
        sector.flowDx = moveX;
        sector.flowDz = moveZ;
        const newDistance = Math.hypot(candidateX - tankX, candidateZ - tankZ);
        const progress = state.lastDistance - newDistance;
        this.movement.movedMeters += Math.hypot(candidateX - oldX, candidateZ - oldZ);
        state.stuckSeconds = progress < Math.max(0.05, step * 0.08) ? state.stuckSeconds + elapsed : 0;
        state.lastDistance = newDistance;
      } else {
        state.stuckSeconds += elapsed;
        state.alternateAttempts++;
      }

      if (state.stuckSeconds < stuckTime * 2) continue;
      const preferredSector = angleToSector(Math.atan2(sector.centerX - tankX, sector.centerZ - tankZ));
      const recovery = this.ctx.spawnPlanner.pressurePoint(sector.count, {
        minDistance: 140,
        maxDistance: 165,
        preferredDistance: 152,
        preferredSector,
        forceOffCamera: true,
      });
      if (!recovery) continue;
      sector.centerX = recovery.anchor.x;
      sector.centerZ = recovery.anchor.z;
      sector.flowDx = 0;
      sector.flowDz = 0;
      state.stuckSeconds = 0;
      state.alternateAttempts = 0;
      state.lastDistance = Math.hypot(sector.centerX - tankX, sector.centerZ - tankZ);
      this.movement.relocatedSectors++;
      this.movement.stuckRecoveries++;
    }
  }

  private validSectorPoint(x: number, z: number): boolean {
    const world = this.ctx.world;
    const bounds = world.bounds ?? { minX: -world.half, maxX: world.half, minZ: -world.half, maxZ: world.half };
    if (x < bounds.minX + 2 || x > bounds.maxX - 2 || z < bounds.minZ + 2 || z > bounds.maxZ - 2) return false;
    if (world.isCliffWallAt?.(x, z)) return false;
    if (world.obstacleAt(x, z, world.groundHeightAt(x, z))) return false;
    if (this.ctx.flowField && !Number.isFinite(this.ctx.flowField.costAt(x, z))) return false;
    return true;
  }

  private sectorSpeed(enemyDefId: string): number {
    const def = this.ctx.enemies.defById(enemyDefId);
    if (!def) return 2.7;
    if (def.type === 'gunTower') return 2.2;
    if (def.type !== 'monster') return 2.9;
    if (def.tier === 'specialist') return 2.6;
    if (def.attack.type === 'ranged') return 2.5;
    if (def.attack.type === 'mixed') return 2.6;
    return 2.9;
  }

  private canDemote(e: EnemyState): boolean {
    if (isPersistentThreat(e)) return false;
    if (e.telegraph > 0 || e.flash > 0) return false;
    if (e.state === 'lock' || e.state === 'telegraph' || e.state === 'charge' || e.state === 'fire') return false;
    const lastImpulse = e.lastImpulseT ?? -9;
    if (lastImpulse > 0 && lastImpulse > this.ctx.state.time - 0.5) return false;
    return true;
  }

  private cell(v: number): number {
    return Math.floor(v / SECTOR_CELL);
  }
}

function angleToSector(angle: number): number {
  const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
  return Math.round(normalized / (Math.PI / 4)) % 8;
}
