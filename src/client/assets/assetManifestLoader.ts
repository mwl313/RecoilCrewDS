import { isValidAssetId } from '../../shared/assetRegistry';

export interface ManifestAssetEntry {
  id: string;
  category: 'model' | 'vfx' | 'ui';
  file?: string;
  color?: number;
  size?: number;
  life?: number;
  count?: number;
  speed?: number;
  gravity?: number;
  primary?: string;
  accent?: string;
  panel?: string;
  /** Optional transform/socket/material metadata for model entries. */
  transform?: {
    position?: { x?: number; y?: number; z?: number };
    rotation?: { x?: number; y?: number; z?: number };
    scale?: number | { x?: number; y?: number; z?: number };
    socket?: string;
  };
  materials?: Array<{ match?: string; color?: number; emissive?: number; emissiveIntensity?: number }>;
}

export interface ManifestLoadResult {
  entries: ManifestAssetEntry[];
  loaded: boolean;
}

/**
 * Loads and validates the optional `/assets/manifest.json`. Unknown ids are
 * skipped with a warning (presentation override file, not authoritative
 * gameplay content); a missing/unreadable manifest yields an empty result so
 * procedural fallbacks remain the runtime path.
 */
export class AssetManifestLoader {
  constructor(private readonly fetchImpl: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (url) => fetch(url)) {}

  async load(url = '/assets/manifest.json'): Promise<ManifestLoadResult> {
    let response: { ok: boolean; json(): Promise<unknown> };
    try {
      response = await this.fetchImpl(url);
    } catch {
      return { entries: [], loaded: false };
    }
    if (!response.ok) return { entries: [], loaded: false };
    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      console.warn(`[assets] manifest ${url} is not valid JSON: ${(err as Error).message}`);
      return { entries: [], loaded: false };
    }
    const raw = data as { assets?: unknown };
    if (!Array.isArray(raw?.assets)) {
      console.warn(`[assets] manifest ${url} has no assets array`);
      return { entries: [], loaded: false };
    }
    const entries: ManifestAssetEntry[] = [];
    for (const entry of raw.assets) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === 'string' ? e.id : '';
      if (!isValidAssetId(id)) {
        console.warn(`[assets] manifest entry skipped: unknown semantic id '${id}'`);
        continue;
      }
      entries.push(e as unknown as ManifestAssetEntry);
    }
    return { entries, loaded: true };
  }
}
