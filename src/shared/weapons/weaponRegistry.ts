import type { WeaponDefinition } from './weaponDefinition';

/** Read-only registry of weapon definitions for a loadout. */
export class WeaponRegistry {
  private readonly defs = new Map<string, WeaponDefinition>();

  register(definition: WeaponDefinition): this {
    if (this.defs.has(definition.id)) throw new Error(`weapon already registered: ${definition.id}`);
    this.defs.set(definition.id, definition);
    return this;
  }

  get(id: string): WeaponDefinition | undefined {
    return this.defs.get(id);
  }

  require(id: string): WeaponDefinition {
    const def = this.defs.get(id);
    if (!def) throw new Error(`unknown weapon: ${id}`);
    return def;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  ids(): readonly string[] {
    return Object.freeze([...this.defs.keys()]);
  }
}
