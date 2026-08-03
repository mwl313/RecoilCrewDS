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
  const entries = bundle.furnitureSet.entries.map((_, i) => entryParameters(i));
  return [...mapParameters, ...terrainParameters, ...validationParameters, ...routeParameters, ...furnitureParameters, ...entries.flat()];
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
