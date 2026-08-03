/**
 * UI contract for validation results. The validator algorithms stay the
 * authoritative source of truth (string errors/warnings); this module
 * converts those reports into stable, focusable issues without duplicating
 * any generation or validation logic.
 */
import type { GeneratedArena } from './generator';

export type ValidationIssueCategory =
  | 'terrain'
  | 'cliffs'
  | 'routes'
  | 'spawns'
  | 'furniture'
  | 'ramps'
  | 'performance'
  | 'determinism';

export interface MapValidationIssue {
  id: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  category: ValidationIssueCategory;
  position?: { x: number; y: number; z: number };
  entityId?: string;
  layerId?: string;
  parameterPaths?: string[];
}

export function issuesFromValidationReports(arena: GeneratedArena): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  let next = 0;
  const add = (
    severity: 'error' | 'warning',
    message: string,
    category: ValidationIssueCategory,
    position?: { x: number; y: number; z: number },
    entityId?: string,
    layerId?: string,
  ) => {
    const code = message.split(':')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'validation';
    issues.push({
      id: `issue.${next++}`,
      code,
      message,
      severity,
      category,
      position,
      entityId,
      layerId,
    });
  };

  for (const error of arena.validation.errors) {
    const parsed = parseIssue(error, arena, 'error');
    if (parsed) {
      add('error', error, parsed.category, parsed.position, parsed.entityId, parsed.layerId);
    } else {
      add('error', error, categoryFor(error));
    }
  }
  for (const warning of arena.validation.warnings) {
    add('warning', warning, categoryFor(warning));
  }
  return issues;
}

function categoryFor(message: string): ValidationIssueCategory {
  if (/^cliff/.test(message)) return 'cliffs';
  if (/^(route|corridor|width|slope|loop|dead-end|gate)/.test(message)) return 'routes';
  if (/^(spawn|spacing)/.test(message)) return 'spawns';
  if (/^(furniture|barrel|budget|object|decoration|collider)/.test(message)) return 'furniture';
  if (/^ramp/.test(message)) return 'ramps';
  if (/^(time|generation)/.test(message)) return 'performance';
  if (/^determinism/.test(message)) return 'determinism';
  return 'terrain';
}

function parseIssue(
  message: string,
  arena: GeneratedArena,
  severity: 'error' | 'warning',
): { category: ValidationIssueCategory; position?: { x: number; y: number; z: number }; entityId?: string; layerId?: string } | null {
  const layout = arena.layout;
  const worldX = (x: number) => x - arena.widthMeters / 2;
  const worldZ = (z: number) => z - arena.depthMeters / 2;
  const pos = (x: number, z: number, y = 0) => ({ x: worldX(x), y, z: worldZ(z) });

  const feature = message.match(/feature\.(\w+)\.(\d+)/);
  if (feature) {
    const rec = arena.macroFeatures.find((f) => f.id === `${feature[1]}.${feature[2]}`);
    return rec
      ? { category: 'terrain', position: pos(rec.x, rec.z), entityId: rec.id, layerId: 'features' }
      : { category: 'terrain' };
  }
  const objectId = message.match(/furniture: ([a-zA-Z]+\.\d+)/) ?? message.match(/barrel: ([a-zA-Z]+\.\d+)/);
  if (objectId && layout) {
    const obj = layout.objects.find((o) => o.id === objectId[1]);
    return obj
      ? { category: 'furniture', position: pos(obj.x, obj.z), entityId: obj.id, layerId: 'furniture' }
      : { category: 'furniture' };
  }
  const rampId = message.match(/ramp: (ramp\.\d+)/);
  if (rampId && layout) {
    const ramp = layout.ramps.find((r) => r.id === rampId[1]);
    return ramp
      ? { category: 'ramps', position: pos(ramp.x, ramp.z), entityId: ramp.id, layerId: 'ramps' }
      : { category: 'ramps' };
  }
  const spawnId = message.match(/spawn: (spawn\.\d+)/);
  if (spawnId && layout) {
    const spawn = layout.spawns.find((s) => s.id === spawnId[1]);
    return spawn
      ? { category: 'spawns', position: pos(spawn.x, spawn.z), entityId: spawn.id, layerId: 'spawns' }
      : { category: 'spawns' };
  }
  const gateId = message.match(/gate: (gate\.\d+)/);
  if (gateId && layout) {
    const gate = layout.gates.find((g) => g.id === gateId[1]);
    return gate
      ? { category: 'routes', position: pos(gate.x, gate.z), entityId: gate.id, layerId: 'gates' }
      : { category: 'routes' };
  }
  if (/^height:/.test(message)) {
    const hf = arena.heightfield;
    let worst = severity === 'error' ? hf.minHeight() : hf.maxHeight();
    let xi = 0;
    let zi = 0;
    for (let zi2 = 0; zi2 < hf.samplesZ; zi2++) {
      for (let xi2 = 0; xi2 < hf.samplesX; xi2++) {
        const h = hf.getSample(xi2, zi2);
        const isWorse = severity === 'error' ? h < worst : h > worst;
        if (isWorse) {
          worst = h;
          xi = xi2;
          zi = zi2;
        }
      }
    }
    return { category: 'terrain', position: pos(xi * hf.cellSize, zi * hf.cellSize, worst), layerId: 'terrain' };
  }
  if (/^slope:/.test(message)) {
    const hf = arena.heightfield;
    const slopes = hf.slopeGrid();
    let bestI = 0;
    for (let i = 1; i < slopes.length; i++) {
      if (slopes[i] > slopes[bestI]) bestI = i;
    }
    const xi = bestI % hf.samplesX;
    const zi = Math.floor(bestI / hf.samplesX);
    return { category: 'terrain', position: pos(xi * hf.cellSize, zi * hf.cellSize, hf.getSample(xi, zi)), layerId: 'slope' };
  }
  if (/^zone:/.test(message)) {
    const zoneId = message.match(/zone: (zone\.[\w.]+)/);
    if (zoneId && layout) {
      const zone = layout.zones.regions.find((z) => z.id === zoneId[1]);
      return zone
        ? { category: 'routes', position: pos(zone.x, zone.z), entityId: zone.id, layerId: 'zones' }
        : { category: 'routes' };
    }
  }
  if (/^recovery:/.test(message)) {
    return { category: 'spawns', layerId: 'recovery' };
  }
  if (/^route:/.test(message)) {
    return { category: 'routes', layerId: 'routes' };
  }
  if (/^time:/.test(message)) return { category: 'performance' };
  if (/^determinism:/.test(message)) return { category: 'determinism' };
  return null;
}
