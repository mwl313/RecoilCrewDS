/** Recursively freeze plain objects/arrays (definitions must stay immutable). */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const seen = new Set<object>();
  const freeze = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return v;
    seen.add(v);
    for (const key of Object.getOwnPropertyNames(v)) {
      const child = (v as Record<string, unknown>)[key];
      if (typeof child === 'object' && child !== null) freeze(child);
    }
    return Object.freeze(v);
  };
  return freeze(value) as T;
}
