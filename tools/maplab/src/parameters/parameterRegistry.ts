import type { ParameterDescriptor } from './parameterTypes';
import { mapParameters } from './mapParameters';
import { terrainParameters } from './terrainParameters';
import { validationParameters } from './validationParameters';
import { routeParameters } from './routeParameters';
import { furnitureParameters, entryParameters } from './furnitureParameters';
import type { MapGenerationBundle } from '@app/shared/mapgen/profiles';
import { getPath, setPath } from '../mapLabState';

export type { ParameterDescriptor, ParameterGroup, ParameterType } from './parameterTypes';

export function buildParameterRegistry(bundle: MapGenerationBundle): ParameterDescriptor[] {
  return [
    ...mapParameters,
    ...terrainParameters,
    ...validationParameters,
    ...routeParameters,
    ...furnitureParameters,
    ...entryDescriptorGroups(bundle),
  ];
}

const KIND_LABELS: Record<string, string> = {
  largeObstacle: 'Large Obstacles',
  barrel: 'Barrels',
  crate: 'Crates',
  medium: 'Medium Props',
  decoration: 'Decorations',
  ramp: 'Ramps',
  lightPole: 'Light Poles',
};

function assetLabel(assetId: string): string {
  const short = assetId.split('.').pop() ?? assetId;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** Group furniture entries by kind, then name each folder by kind + asset. */
function entryDescriptorGroups(bundle: MapGenerationBundle): ParameterDescriptor[] {
  const byKind = new Map<string, Array<{ index: number; assetId: string }>>();
  bundle.furnitureSet.entries.forEach((entry, index) => {
    const list = byKind.get(entry.kind) ?? [];
    list.push({ index, assetId: entry.assetId });
    byKind.set(entry.kind, list);
  });
  const out: ParameterDescriptor[] = [];
  for (const [kind, entries] of byKind) {
    const base = KIND_LABELS[kind] ?? kind;
    for (const { index, assetId } of entries) {
      const folder = entries.length > 1 ? `${base} · ${assetLabel(assetId)}` : base;
      out.push(...entryParameters(index, folder, assetLabel(assetId)));
    }
  }
  return out;
}

export function readParameter(bundle: MapGenerationBundle, descriptor: ParameterDescriptor): unknown {
  return getPath(bundle, descriptor.path);
}

export function writeParameter(bundle: MapGenerationBundle, descriptor: ParameterDescriptor, value: unknown): void {
  if (descriptor.macro === 'terrainDrama') {
    applyTerrainDrama(bundle, Number(value));
    return;
  }
  setPath(bundle as unknown as Record<string, unknown>, descriptor.path, value);
}

/** Terrain Drama macro: scales feature heights/depths around the bundle. */
export function applyTerrainDrama(bundle: MapGenerationBundle, factor: number): void {
  const features = bundle.terrainProfile.features;
  for (const raw of Object.values(features)) {
    const f = raw as { height?: { min: number; max: number }; depth?: { min: number; max: number } };
    if (f.height) {
      f.height = { min: round1(f.height.min * factor), max: round1(f.height.max * factor) };
    }
    if (f.depth) {
      f.depth = { min: round1(f.depth.min * factor), max: round1(f.depth.max * factor) };
    }
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
