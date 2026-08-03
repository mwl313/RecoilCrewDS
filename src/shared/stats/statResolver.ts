import { isKnownStat, statScope, type StatScope } from './statIds';
import type { MutableStatModifier, StatModifier } from './statModifier';
import type { StatBlock } from './statBlock';

/**
 * Match-scoped stat resolver with dirty caching.
 *
 * Evaluation order (REFACTOR_02 §12):
 *   base + Σ(add) × Π(multiply) → highest-priority override → clamp.
 *
 * Stacking is applied per modifier id when a new modifier with the same id
 * arrives. Timed modifiers tick down with `update(dt)` and expire
 * deterministically. Resolved values are cached per stat and invalidated
 * only when that stat's modifiers change.
 */
export class StatResolver {
  private readonly base: StatBlock;
  private readonly modifiers: MutableStatModifier[] = [];
  private readonly cache = new Map<string, number>();
  private readonly dirty = new Set<string>();
  private cacheMisses = 0;
  private expiredCount = 0;

  /** Fired for each stat whose resolved value may have changed. */
  onChange: ((stat: string) => void) | null = null;

  constructor(base: StatBlock) {
    const frozen: StatBlock = {};
    for (const [stat, value] of Object.entries(base)) {
      if (!isKnownStat(stat)) throw new Error(`unknown stat id in base block: ${stat}`);
      frozen[stat] = value;
    }
    this.base = Object.freeze(frozen);
  }

  get baseBlock(): Readonly<StatBlock> {
    return this.base;
  }

  getBase(stat: string): number {
    const value = this.base[stat];
    if (value === undefined) throw new Error(`unknown stat: ${stat}`);
    return value;
  }

  addModifier(modifier: StatModifier): void {
    if (!isKnownStat(modifier.stat)) throw new Error(`unknown stat id: ${modifier.stat}`);
    if (Number.isNaN(modifier.value)) throw new Error(`non-finite modifier value on ${modifier.stat}`);
    const entry: MutableStatModifier = {
      ...modifier,
      ...(modifier.durationSeconds !== undefined ? { remaining: modifier.durationSeconds } : {}),
    };
    this.applyStacking(entry);
    this.invalidate(modifier.stat);
  }

  removeModifier(id: string): boolean {
    const index = this.modifiers.findIndex((m) => m.id === id);
    if (index === -1) return false;
    const [removed] = this.modifiers.splice(index, 1);
    this.invalidate(removed.stat);
    return true;
  }

  removeModifiersBySource(source: string): void {
    const affected = new Set(this.modifiers.filter((m) => m.source === source).map((m) => m.stat));
    const remaining = this.modifiers.filter((m) => m.source !== source);
    this.modifiers.length = 0;
    this.modifiers.push(...remaining);
    for (const stat of affected) this.invalidate(stat);
  }

  clearModifiers(): void {
    const affected = new Set(this.modifiers.map((m) => m.stat));
    this.modifiers.length = 0;
    for (const stat of affected) this.invalidate(stat);
  }

  /** Tick timed modifiers; expired ones are removed deterministically. */
  update(dt: number): void {
    const affected = new Set<string>();
    const remaining: MutableStatModifier[] = [];
    for (const mod of this.modifiers) {
      if (mod.remaining === undefined) {
        remaining.push(mod);
        continue;
      }
      mod.remaining -= dt;
      if (mod.remaining <= 0) {
        affected.add(mod.stat);
        this.expiredCount++;
      } else {
        remaining.push(mod);
      }
    }
    this.modifiers.length = 0;
    this.modifiers.push(...remaining);
    for (const stat of affected) this.invalidate(stat);
  }

  resolve(stat: string): number {
    if (!isKnownStat(stat)) throw new Error(`unknown stat id: ${stat}`);
    const cached = this.cache.get(stat);
    if (cached !== undefined && !this.dirty.has(stat)) return cached;
    this.cacheMisses++;
    const value = this.compute(stat);
    this.cache.set(stat, value);
    this.dirty.delete(stat);
    return value;
  }

  resolveAll(scope?: StatScope | null): StatBlock {
    const out: StatBlock = {};
    for (const stat of Object.keys(this.base)) {
      if (scope && statScope(stat) !== scope) continue;
      out[stat] = this.resolve(stat);
    }
    return out;
  }

  hasModifier(id: string): boolean {
    return this.modifiers.some((m) => m.id === id);
  }

  modifierCount(): number {
    return this.modifiers.length;
  }

  get cacheMissCount(): number {
    return this.cacheMisses;
  }

  get expiredModifierCount(): number {
    return this.expiredCount;
  }

  private applyStacking(entry: MutableStatModifier): void {
    // Stacking applies per (id, stat): one effect may carry several stat
    // modifiers, and they must not replace each other.
    const sameId = this.modifiers.filter((m) => m.id === entry.id && m.stat === entry.stat);
    if (sameId.length === 0) {
      this.modifiers.push(entry);
      return;
    }
    switch (entry.stacking) {
      case 'stack':
        this.modifiers.push(entry);
        break;
      case 'refresh':
      case 'replace': {
        const index = this.modifiers.findIndex((m) => m.id === entry.id);
        this.modifiers.splice(index, 1);
        this.modifiers.push(entry);
        break;
      }
      case 'highest':
      case 'lowest': {
        const isHighest = entry.stacking === 'highest';
        const candidates = [...sameId, entry];
        const winner = candidates.reduce((best, m) =>
          isHighest ? (m.value > best.value ? m : best) : (m.value < best.value ? m : best),
          candidates[0],
        );
        for (const m of sameId) {
          const index = this.modifiers.indexOf(m);
          if (index !== -1) this.modifiers.splice(index, 1);
        }
        this.modifiers.push(winner);
        break;
      }
    }
  }

  private compute(stat: string): number {
    const relevant = this.modifiers.filter((m) => m.stat === stat);
    const adds = relevant.filter((m) => m.operation === 'add');
    const mults = relevant.filter((m) => m.operation === 'multiply');
    const overrides = relevant.filter((m) => m.operation === 'override');

    let value = this.getBase(stat);
    for (const add of adds) value += add.value;
    for (const mult of mults) value *= mult.value;

    if (overrides.length > 0) {
      let best = overrides[0];
      for (const candidate of overrides) {
        if (
          candidate.priority > best.priority ||
          (candidate.priority === best.priority && this.modifiers.indexOf(candidate) > this.modifiers.indexOf(best))
        ) {
          best = candidate;
        }
      }
      value = best.value;
    }

    const clampers = relevant.find((m) => m.min !== undefined || m.max !== undefined);
    if (clampers) {
      if (clampers.min !== undefined) value = Math.max(clampers.min, value);
      if (clampers.max !== undefined) value = Math.min(clampers.max, value);
    }
    return value;
  }

  private invalidate(stat: string): void {
    this.dirty.add(stat);
    this.cache.delete(stat);
    this.onChange?.(stat);
  }
}
