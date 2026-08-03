import type { ArenaMetadata } from '@app/shared/mapgen/arenaSession';
import type { GeneratedArena } from '@app/shared/mapgen/generator';
import type { MapGenerationBundle } from '@app/shared/mapgen/profiles';
import { issuesFromValidationReports, type MapValidationIssue } from '@app/shared/mapgen/validationIssues';
import { serializeArena } from '../generatorAdapter';

export const MAP_LAB_EXPORT_FORMAT = 1;

export interface ProfileBundleExport {
  formatVersion: number;
  kind: 'profile-bundle';
  sourceProfileId: string;
  bundles: {
    map: MapGenerationBundle['map'];
    terrainProfile: MapGenerationBundle['terrainProfile'];
    validationProfile: MapGenerationBundle['validationProfile'];
    furnitureSet: MapGenerationBundle['furnitureSet'];
    densityProfile: MapGenerationBundle['densityProfile'];
    landmarks: MapGenerationBundle['landmarks'];
  };
}

export function buildProfileBundleExport(
  sourceProfileId: string,
  bundle: MapGenerationBundle,
): ProfileBundleExport {
  return {
    formatVersion: MAP_LAB_EXPORT_FORMAT,
    kind: 'profile-bundle',
    sourceProfileId,
    bundles: {
      map: JSON.parse(JSON.stringify(bundle.map)),
      terrainProfile: JSON.parse(JSON.stringify(bundle.terrainProfile)),
      validationProfile: JSON.parse(JSON.stringify(bundle.validationProfile)),
      furnitureSet: JSON.parse(JSON.stringify(bundle.furnitureSet)),
      densityProfile: JSON.parse(JSON.stringify(bundle.densityProfile)),
      landmarks: JSON.parse(JSON.stringify(bundle.landmarks)),
    },
  };
}

export function buildArenaExport(
  arena: GeneratedArena,
  metadata: ArenaMetadata,
  generationMs: number,
  issues: MapValidationIssue[],
): Record<string, unknown> {
  const serialized = serializeArena(arena);
  return {
    formatVersion: MAP_LAB_EXPORT_FORMAT,
    kind: 'generated-arena',
    metadata,
    generationMs,
    issues,
    heightfield: {
      samples: Array.from(serialized.arena.heightfield.samples),
      widthMeters: serialized.arena.heightfield.widthMeters,
      depthMeters: serialized.arena.heightfield.depthMeters,
      cellSize: serialized.arena.heightfield.cellSize,
    },
    layout: JSON.parse(JSON.stringify(arena.layout ?? null)),
    validation: arena.validation,
    terrainFlags: Array.from(serialized.arena.terrainFlags),
    cliffEdges: JSON.parse(JSON.stringify(arena.cliffEdges)),
    accessCorridors: JSON.parse(JSON.stringify(arena.accessCorridors ?? [])),
    terrainMetrics: arena.terrainMetrics,
  };
}

export function buildValidationExport(
  metadata: ArenaMetadata,
  arena: GeneratedArena,
  issues: MapValidationIssue[],
  generationMs: number,
): Record<string, unknown> {
  return {
    formatVersion: MAP_LAB_EXPORT_FORMAT,
    kind: 'validation-report',
    metadata,
    generationMs,
    issues,
    metrics: arena.validation.metrics,
    terrainMetrics: arena.terrainMetrics,
    phase2: arena.layout ? validationMetricsFromLayout(arena) : null,
  };
}

function validationMetricsFromLayout(arena: GeneratedArena): Record<string, unknown> {
  const layout = arena.layout!;
  return {
    gates: layout.gates.length,
    spawns: layout.spawns.length,
    recovery: layout.recovery.length,
    ramps: layout.ramps.length,
    objects: layout.objects.length,
    colliders: layout.objects.filter((o) => o.collider).length,
    loops: layout.graph.loops,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function issuesFor(arena: GeneratedArena): MapValidationIssue[] {
  return issuesFromValidationReports(arena);
}
