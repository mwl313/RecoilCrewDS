import type { RelicDefinition } from '../content/schemas/progression';
import type { MatchState } from '../types';
import type { RelicAcquireResult } from './progressionTypes';

/**
 * Relic inventory with stacks and unique acquisition guards. Capabilities
 * are granted once through the source-safe CapabilitySystem.
 */
export class RelicInventory {
  constructor(
    private readonly state: MatchState,
    private readonly grantCapability: (capabilityId: string, sourceId: string) => void,
  ) {}

  has(relicId: string): boolean {
    return (this.state.teamProgression.relicStacks[relicId] ?? 0) > 0;
  }

  getStack(relicId: string): number {
    return this.state.teamProgression.relicStacks[relicId] ?? 0;
  }

  canAcquire(relic: RelicDefinition): boolean {
    const maximumStacks = relic.stackPolicy === 'unique'
      ? 1
      : (relic.maximumStacks ?? Number.POSITIVE_INFINITY);
    return this.getStack(relic.id) < maximumStacks;
  }

  add(relic: RelicDefinition): RelicAcquireResult {
    const stacks = this.state.teamProgression.relicStacks;
    const current = stacks[relic.id] ?? 0;
    if (!this.canAcquire(relic)) {
      return {
        relicId: relic.id,
        stackCount: current,
        duplicateConverted: false,
        replacementXp: 0,
        capabilityGranted: false,
      };
    }
    stacks[relic.id] = current + 1;
    const acquisitionOrder = this.state.teamProgression.relicAcquisitionOrder ??= [];
    if (current === 0 && !acquisitionOrder.includes(relic.id)) {
      acquisitionOrder.push(relic.id);
    }
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
