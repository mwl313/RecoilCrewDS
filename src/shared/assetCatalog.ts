import { REQUIRED_ASSET_IDS } from './assetRegistry';
import type { AssetCatalogDefinition, ProjectAssetDefinition } from './presentation/schemas';

/**
 * Extensible project asset catalog.
 *
 * Built-in required assets keep their guaranteed fallbacks; project assets
 * (namespaces custom.*, scene.*, environment.*, ui.*) extend the catalog
 * without weakening built-ins. Explicit built-in replacement uses
 * `replacesBuiltIn`, never an accidental duplicate.
 */
const BUILTIN_SET = new Set<string>(REQUIRED_ASSET_IDS);

export function isBuiltInAssetId(id: string): boolean {
  return BUILTIN_SET.has(id);
}

export function isProjectAssetId(id: string, catalog: AssetCatalogDefinition | undefined): boolean {
  if (!catalog) return false;
  return catalog.project.some((p) => p.id === id);
}

export function resolveProjectAsset(
  id: string,
  catalog: AssetCatalogDefinition | undefined,
): ProjectAssetDefinition | undefined {
  return catalog?.project.find((p) => p.id === id);
}

/**
 * Throws unless the id is a built-in required asset or a registered project
 * asset. Presentation content validation uses this at generation time; the
 * runtime uses it before resolving custom assets.
 */
export function assertResolvableAssetId(id: string, catalog: AssetCatalogDefinition | undefined): void {
  if (isBuiltInAssetId(id) || isProjectAssetId(id, catalog)) return;
  throw new Error(`unresolvable asset id '${id}' (not built-in and not in the project catalog)`);
}

/** All resolvable ids (built-ins + project) for diagnostics. */
export function resolvableAssetIds(catalog: AssetCatalogDefinition | undefined): string[] {
  const ids = new Set<string>(REQUIRED_ASSET_IDS);
  for (const p of catalog?.project ?? []) ids.add(p.id);
  return [...ids].sort();
}
