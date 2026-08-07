import type { MatchState } from '../types';

/**
 * Generic capability owner (Combat 05 M4). Capabilities are granted by
 * sources (items/relics) with reference counting, so removing one source
 * never removes a capability still granted by another. Lookup is O(1).
 * The authoritative list lives in MatchState.build.capabilities so it
 * replicates, survives reconnect, and resets on a new match.
 */
export class CapabilitySystem {
  private readonly byCapability = new Map<string, Map<string, number>>();

  constructor(private readonly state: MatchState) {
    for (const id of state.build.capabilities) {
      // Default capabilities behave like an implicit source so revoking a
      // relic source never removes a capability the mode grants by default.
      if (!this.byCapability.has(id)) this.byCapability.set(id, new Map([['__default__', 1]]));
    }
  }

  has(id: string): boolean {
    return this.byCapability.has(id);
  }

  /** Read-only diagnostics for authoritative capability ownership. */
  debugSources(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.byCapability.entries()].map(([capabilityId, sources]) => [capabilityId, [...sources.keys()].sort()]),
    );
  }

  grant(id: string, sourceId: string): void {
    let sources = this.byCapability.get(id);
    if (!sources) {
      sources = new Map();
      this.byCapability.set(id, sources);
      this.state.build.capabilities.push(id);
    }
    sources.set(sourceId, (sources.get(sourceId) ?? 0) + 1);
  }

  revokeSource(sourceId: string): void {
    let changed = false;
    for (const [capabilityId, sources] of [...this.byCapability]) {
      const count = sources.get(sourceId);
      if (count === undefined) continue;
      if (count <= 1) sources.delete(sourceId);
      else sources.set(sourceId, count - 1);
      if (sources.size === 0) {
        this.byCapability.delete(capabilityId);
        changed = true;
      }
    }
    if (changed) {
      this.state.build.capabilities = [...this.byCapability.keys()];
    }
  }

  /** Unconditional revoke (tests/future gameplay); removes the capability. */
  revoke(id: string): void {
    if (!this.byCapability.delete(id)) return;
    this.state.build.capabilities = [...this.byCapability.keys()];
  }
}
