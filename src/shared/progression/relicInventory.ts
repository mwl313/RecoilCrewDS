import type { RelicDefinition } from '../content/schemas/progression';
import type { MatchState } from '../types';
import type { ProgressionDefinition } from '../content/schemas/progression';
import type { RelicAcquireResult } from './progressionTypes';

/**
 * Relic inventory with stacks and unique-duplicate conversion. Capabilities
 * are granted once through the source-safe CapabilitySystem.
 */
export class RelicInventory {
  constructor(
    private readonly state: MatchState,
    private readonly definition: ProgressionDefinition,
    private readonly grantCapability: (capabilityId: string, sourceId: string) => void,
  ) {}

  has(relicId: string): boolean {
    return (this.state.teamProgression.relicStacks[relicId] ?? 0) > 0;
  }

  getStack(relicId: string): number {
    return this.state.teamProgression.relicStacks[relicId] ?? 0;
  }

  add(relic: RelicDefinition): RelicAcquireResult {
    const stacks = this.state.teamProgression.relicStacks;
    const current = stacks[relic.id] ?? 0;
    if (relic.stackPolicy === 'unique' && current > 0) {
      return {
        relicId: relic.id,
        stackCount: current,
        duplicateConverted: true,
        replacementXp: this.definition.duplicateUniqueRelicXp,
        capabilityGranted: false,
      };
    }
    stacks[relic.id] = current + 1;
    let capabilityGranted = false;
    if (relic.capabilityId && current === 0) {
      this.grantCapability(relic.capabilityId, `relic:${relic.id}`);
      capabilityGranted = true;
    }
    return {
      relicId: relic.id,
      stackCount: stacks[relic.id],
      duplicateConverted: false,
      replacementXp: 0,
      capabilityGranted,
    };
  }
}
