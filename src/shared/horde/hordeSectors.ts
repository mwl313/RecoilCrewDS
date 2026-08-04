import type { EnemyState } from '../types';
import type { SystemContext } from '../sim/systems/systemContext';
import type { PopulationClass } from './spawnOwnership';

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
  presentationSeed: number;
}

const SECTOR_CELL = 40;

export class HordeSectorAggregator {
  readonly sectors = new Map<number, HordeSectorState>();
  private nextSectorId = 1;
  private lastAggregateAt = 0;

  constructor(private readonly ctx: SystemContext) {}

  /**
   * Periodically merge eligible tier-3 enemies into sectors. Enemies are
   * removed directly (no kill hooks/rewards), preserving count, threat,
   * ownership, and wave id.
   */
  update(dt: number, tankX: number, tankZ: number): void {
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
      const key = `${this.cell(e.x)}:${this.cell(e.z)}:${e.defId ?? ''}`;
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
        threat: list.reduce((sum, e) => sum + (this.ctx.enemies.defFor(e).threat ?? 1), 0),
        centerX: list.reduce((sum, e) => sum + e.x, 0) / list.length,
        centerZ: list.reduce((sum, e) => sum + e.z, 0) / list.length,
        flowDx: flow?.x ?? 0,
        flowDz: flow?.z ?? 0,
        populationClass: (first.ownership?.populationClass ?? 'ambient') as PopulationClass,
        waveId: first.ownership?.waveId ?? null,
        presentationSeed: first.id,
      };
      this.sectors.set(sector.sectorId, sector);
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
            leaderId: null,
            packInstanceId: sector.sectorId,
            spawnAnchorId: null,
            purgeOnLeaderDeath: sector.waveId !== null,
          });
        }
      }
      this.sectors.delete(id);
    }
  }

  /** Collapse wave-owned sectors on leader death (no rewards, ambient stays). */
  purgeWave(waveId: number): number {
    let removed = 0;
    for (const [id, sector] of [...this.sectors]) {
      if (sector.waveId === waveId) {
        this.sectors.delete(id);
        removed += sector.count;
      }
    }
    return removed;
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
    this.nextSectorId = 1;
    this.lastAggregateAt = 0;
  }

  private canDemote(e: EnemyState): boolean {
    if (e.ownership?.populationClass === 'boss') return false;
    if (e.ownership?.leaderId === e.id) return false;
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
