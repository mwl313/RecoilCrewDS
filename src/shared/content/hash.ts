import { createHash } from 'node:crypto';

/** Stable canonical JSON: sorted keys, no undefined, deterministic output. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return value === undefined ? 'null' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')}}`;
}

/** Deterministic sha256 hex hash of canonicalized content. */
export function contentHash(input: unknown): string {
  return createHash('sha256').update(canonicalStringify(input)).digest('hex');
}
