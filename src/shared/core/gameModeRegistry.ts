/**
 * Registry of game modes. Phase 1 registers mode definitions from the loaded
 * content pack; factories arrive with the mode runtimes in later phases.
 */
export class GameModeRegistry<TMode extends { id: string }> {
  private readonly modes = new Map<string, { definition: TMode; factory?: () => unknown }>();

  register(definition: TMode, factory?: () => unknown): this {
    if (this.modes.has(definition.id)) {
      throw new Error(`game mode already registered: ${definition.id}`);
    }
    this.modes.set(definition.id, { definition, factory });
    return this;
  }

  get(id: string): TMode | undefined {
    return this.modes.get(id)?.definition;
  }

  require(id: string): TMode {
    const mode = this.modes.get(id);
    if (!mode) throw new Error(`unknown game mode: ${id}`);
    return mode.definition;
  }

  has(id: string): boolean {
    return this.modes.has(id);
  }

  ids(): readonly string[] {
    return Object.freeze([...this.modes.keys()]);
  }

  load(id: string): unknown {
    const mode = this.modes.get(id);
    if (!mode) throw new Error(`unknown game mode: ${id}`);
    if (!mode.factory) throw new Error(`game mode has no factory: ${id}`);
    return mode.factory();
  }
}
