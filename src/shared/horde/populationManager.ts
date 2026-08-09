import type { SystemContext } from '../sim/systems/systemContext';
import type { PopulationLimitsDefinition } from '../content/schemas/horde';
import type { PopulationClass } from './spawnOwnership';
import { enemyThreat } from '../enemies/monsterCompat';
import { isOrdinaryPressure } from '../enemies/enemyClassification';

export interface PopulationTally {
  entities: number;
  threat: number;
  ordinary: { entities: number; threat: number };
  persistent: { entities: number; threat: number };
  byClass: Record<PopulationClass, { entities: number; threat: number }>;
}

export interface NearbyPressureTally {
  ordinary45: number;
  ordinary70: number;
  maintenanceSummons: number;
}

/**
 * Single-pass population accounting (Core Loop 06 M3). Recomputes counts
 * and weighted threat from authoritative state; used by the HordeDirector
 * to decide whether packs may spawn under the data-driven caps.
 */
export class PopulationManager {
  constructor(private readonly ctx: SystemContext) {}

  refresh(): PopulationTally {
    const tally: PopulationTally = {
      entities: 0,
      threat: 0,
      ordinary: { entities: 0, threat: 0 },
      persistent: { entities: 0, threat: 0 },
      byClass: {
        ambient: { entities: 0, threat: 0 },
        wave: { entities: 0, threat: 0 },
        boss: { entities: 0, threat: 0 },
        special: { entities: 0, threat: 0 },
      },
    };
    for (const e of this.ctx.state.enemies) {
      if (!e.alive) continue;
      const def = this.ctx.enemies.defFor(e);
      const threat = enemyThreat(def);
      tally.entities++;
      tally.threat += threat;
      const layer = isOrdinaryPressure(e) ? tally.ordinary : tally.persistent;
      layer.entities++;
      layer.threat += threat;
      const cls = (e.ownership?.populationClass ?? 'ambient') as PopulationClass;
      tally.byClass[cls].entities++;
      tally.byClass[cls].threat += threat;
    }
    const sectors = this.ctx.hordeSectors?.tally();
    if (sectors) {
      tally.entities += sectors.entities;
      tally.threat += sectors.threat;
      tally.ordinary.entities += sectors.entities;
      tally.ordinary.threat += sectors.threat;
      for (const cls of Object.keys(tally.byClass) as PopulationClass[]) {
        tally.byClass[cls].entities += sectors.byClass[cls].entities;
        tally.byClass[cls].threat += sectors.byClass[cls].threat;
      }
    }
    return tally;
  }

  /** Nearby ordinary pressure includes live entities and aggregate sectors. */
  nearbyPressure(tankX: number, tankZ: number): NearbyPressureTally {
    const tally: NearbyPressureTally = { ordinary45: 0, ordinary70: 0, maintenanceSummons: 0 };
    for (const enemy of this.ctx.state.enemies) {
      if (!isOrdinaryPressure(enemy)) continue;
      const distance = Math.hypot(enemy.x - tankX, enemy.z - tankZ);
      if (distance <= 45) tally.ordinary45++;
      if (distance <= 70) tally.ordinary70++;
      if (enemy.ownership?.maintenanceSummon) tally.maintenanceSummons++;
    }
    for (const sector of this.ctx.hordeSectors?.sectors.values() ?? []) {
      const distance = Math.hypot(sector.centerX - tankX, sector.centerZ - tankZ);
      if (distance <= 45) tally.ordinary45 += sector.count;
      if (distance <= 70) tally.ordinary70 += sector.count;
      if (sector.maintenanceSummon) tally.maintenanceSummons += sector.count;
    }
    return tally;
  }

  /** Ambient spawn capacity: below soft caps, leaving reserves untouched. */
  ambientCapacity(limits: PopulationLimitsDefinition, tally: PopulationTally): { entities: boolean; threat: boolean } {
    return {
      entities: tally.byClass.ambient.entities < limits.ambientSoftEntityCap,
      threat: tally.byClass.ambient.threat < limits.ambientSoftThreatCap,
    };
  }

  hardCapacity(limits: PopulationLimitsDefinition, tally: PopulationTally, packEntities: number, packThreat: number): boolean {
    const reserve = limits.eliteAndBossReserve + limits.technicalEmergencyReserve;
    return tally.entities + packEntities <= limits.hardEntityCap - reserve;
  }
}
