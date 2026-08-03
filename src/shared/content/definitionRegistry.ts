import { ContentValidationError } from './errors';
import { deepFreeze } from './freeze';

/** A definition is any content object carrying a stable semantic id. */
export interface ContentDefinition {
  readonly id: string;
  readonly [key: string]: unknown;
}

/**
 * Frozen per-category definition registry. Registers once, rejects
 * duplicates with file context, and exposes read-only lookups.
 */
export class DefinitionRegistry<T extends ContentDefinition> {
  private readonly defs = new Map<string, T>();
  private readonly sources = new Map<string, string>();

  register(def: T, sourceFile?: string): this {
    const existing = this.defs.get(def.id);
    if (existing) {
      const firstSource = this.sources.get(def.id);
      throw new ContentValidationError(
        `duplicate definition id '${def.id}'` +
          (sourceFile ? ` in ${sourceFile}` : '') +
          (firstSource ? ` (already defined in ${firstSource})` : ''),
        [`${sourceFile ?? '(in-memory)'}: id — duplicate definition id '${def.id}'`],
        sourceFile,
        'id',
      );
    }
    this.defs.set(def.id, deepFreeze(def));
    if (sourceFile) this.sources.set(def.id, sourceFile);
    return this;
  }

  get(id: string): T | undefined {
    return this.defs.get(id);
  }

  require(id: string, context?: string): T {
    const def = this.defs.get(id);
    if (!def) {
      throw new ContentValidationError(
        `unknown reference '${id}'${context ? ` (referenced by ${context})` : ''}`,
        [context ? `${context}: unknown reference '${id}'` : `unknown reference '${id}'`],
      );
    }
    return def;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  all(): readonly T[] {
    return Object.freeze([...this.defs.values()]);
  }

  ids(): readonly string[] {
    return Object.freeze([...this.defs.keys()]);
  }

  sourceOf(id: string): string | undefined {
    return this.sources.get(id);
  }

  get size(): number {
    return this.defs.size;
  }
}
