/** Match-scoped entity registry keyed by stable ids. */
export class EntityRegistry {
  private readonly entities = new Map<string, unknown>();

  create<T>(id: string, initial: T): T {
    if (this.entities.has(id)) {
      throw new Error(`entity id already exists: ${id}`);
    }
    this.entities.set(id, initial);
    return initial;
  }

  get<T>(id: string): T | undefined {
    return this.entities.get(id) as T | undefined;
  }

  remove(id: string): boolean {
    return this.entities.delete(id);
  }

  has(id: string): boolean {
    return this.entities.has(id);
  }

  ids(): readonly string[] {
    return Object.freeze([...this.entities.keys()]);
  }

  clear(): void {
    this.entities.clear();
  }

  get size(): number {
    return this.entities.size;
  }
}
