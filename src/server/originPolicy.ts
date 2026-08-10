export function normalizeHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  const entries = (raw || '*')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.includes('*')) return new Set(['*']);
  return new Set(entries.map(normalizeHttpOrigin).filter((origin): origin is string => origin !== null));
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: ReadonlySet<string>): boolean {
  if (!origin) return true;
  if (allowedOrigins.has('*')) return true;
  const normalized = normalizeHttpOrigin(origin);
  return normalized !== null && allowedOrigins.has(normalized);
}
