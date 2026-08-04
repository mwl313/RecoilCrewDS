import type { SystemContext } from '../sim/systems/systemContext';
import type { PopulationLimitsDefinition } from '../content/schemas/horde';
import type { PopulationClass } from './spawnOwnership';

export interface PopulationTally {
  entities: number;
  threat: number;
  byClass: Record<PopulationClass, { entities: number; threat: number }>;
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
      const threat = def.threat ?? 1;
      tally.entities++;
      tally.threat += threat;
      const cls = (e.ownership?.populationClass ?? 'ambient') as PopulationClass;
      tally.byClass[cls].entities++;
      tally.byClass[cls].threat += threat;
    }
    const sectors = this.ctx.hordeSectors?.tally();
    if (sectors) {
      tally.entities += sectors.entities;
      tally.threat += sectors.threat;
      for (const cls of Object.keys(tally.byClass) as PopulationClass[]) {
        tally.byClass[cls].entities += sectors.byClass[cls].entities;
        tally.byClass[cls].threat += sectors.byClass[cls].threat;
      }
    }
    return tally;
  }

  /** Ambient spawn capacity: below soft caps, leaving reserves untouched. */
  ambientCapacity(limits: PopulationLimitsDefinition, tally: PopulationTally): { entities: boolean; threat: boolean } {
    return {
      entities: tally.byClass.ambient.entities + tally.byClass.wave.entities < limits.ambientSoftEntityCap,
      threat: tally.byClass.ambient.threat + tally.byClass.wave.threat < limits.ambientSoftThreatCap,
    };
  }

  hardCapacity(limits: PopulationLimitsDefinition, tally: PopulationTally, packEntities: number, packThreat: number): boolean {
    const reserve = limits.eliteAndBossReserve + limits.technicalEmergencyReserve;
    return tally.entities + packEntities <= limits.hardEntityCap - reserve;
  }
}
