import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { GENERATED_MAP_PROFILES } from '../../src/generated/mapProfiles.generated';
import { applyProfileBundle, ApplyError } from '../../scripts/apply-maplab-profile';
import { buildArenaExport, buildProfileBundleExport } from '../../tools/maplab/src/io/export';
import { issuesFromValidationReports } from '../../src/shared/mapgen/validationIssues';
import { Heightfield } from '../../src/shared/mapgen/heightfield';
import { computeArenaChecksum } from '../../src/shared/mapgen/terrainFlags';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, 'map.fallbackLegacy');

function tempContentRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'maplab-apply-'));
  cpSync(CONTENT_ROOT, dir, { recursive: true });
  return dir;
}

describe('Map Lab export/apply', () => {
  it('profile export round-trips through the apply CLI (new ids, no conflicts)', () => {
    const exportBundle = buildProfileBundleExport('map.arena400Primary', bundle);
    // Give the map a new id so applying to a copied content root has no conflicts.
    const clone = JSON.parse(JSON.stringify(exportBundle)) as typeof exportBundle;
    const map = clone.bundles.map as { id: string; terrainProfileId: string; validationProfileId: string; furnitureSetId: string; densityProfileId: string };
    map.id = 'map.arenaLab';
    (clone.bundles.terrainProfile as { id: string }).id = 'terrainProfile.lab';
    (clone.bundles.validationProfile as { id: string }).id = 'validationProfile.lab';
    (clone.bundles.furnitureSet as { id: string }).id = 'furnitureSet.lab';
    (clone.bundles.densityProfile as { id: string }).id = 'densityProfile.lab';
    map.terrainProfileId = 'terrainProfile.lab';
    map.validationProfileId = 'validationProfile.lab';
    map.furnitureSetId = 'furnitureSet.lab';
    map.densityProfileId = 'densityProfile.lab';
    const landmarkMap: Record<string, string> = {};
    (clone.bundles.landmarks as Array<{ id: string }>).forEach((l, i) => {
      landmarkMap[l.id] = `landmark.lab${i}`;
      l.id = `landmark.lab${i}`;
    });
    (clone.bundles.furnitureSet as { landmarks: string[] }).landmarks = (clone.bundles.furnitureSet as { landmarks: string[] }).landmarks.map(
      (id) => landmarkMap[id] ?? id,
    );

    const root = tempContentRoot();
    try {
      const { changed, hash } = applyProfileBundle(clone, { contentRoot: root, writeGenerated: false });
      expect(changed).toContain('content/manifest.json');
      expect(existsSync(path.join(root, 'maps/arena_lab.json'))).toBe(true);
      expect(existsSync(path.join(root, 'terrain-profiles/lab.json'))).toBe(true);
      const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as { pack: { files: Record<string, string[]> } };
      expect(manifest.pack.files.maps).toContain('maps/arena_lab.json');
      expect(hash.length).toBe(64);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid bundles and id conflicts without overwrite', () => {
    const root = tempContentRoot();
    try {
      const exportBundle = buildProfileBundleExport('map.arena400Primary', bundle);
      expect(() => applyProfileBundle({ kind: 'generated-arena' } as never, { contentRoot: root, writeGenerated: false })).toThrow(ApplyError);
      expect(() =>
        applyProfileBundle({ ...exportBundle, formatVersion: 99 }, { contentRoot: root, writeGenerated: false }),
      ).toThrow(/formatVersion/);
      // Same id as an existing map -> conflict without --overwrite.
      expect(() => applyProfileBundle(exportBundle, { contentRoot: root, writeGenerated: false })).toThrow(/id conflict/);
      // With overwrite it succeeds.
      const result = applyProfileBundle(exportBundle, { contentRoot: root, overwrite: true, writeGenerated: false });
      expect(result.changed.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('arena export keeps the checksum stable across a round-trip', () => {
    const session = selectArenaSession({ roomCode: 'EXP1', matchIndex: 0, bundle, fallbackBundle, generatorVersion: 1 });
    const issues = issuesFromValidationReports(session.arena);
    const exported = buildArenaExport(session.arena, session.metadata, 1, issues) as {
      heightfield: { samples: number[]; widthMeters: number; depthMeters: number; cellSize: number };
      metadata: { arenaChecksum: number };
    };
    const hf = new Heightfield(
      { widthMeters: exported.heightfield.widthMeters, depthMeters: exported.heightfield.depthMeters, cellSize: exported.heightfield.cellSize },
      Float32Array.from(exported.heightfield.samples),
    );
    expect(hf.checksum()).toBe(session.arena.heightfield.checksum());
    expect(session.metadata.arenaChecksum).toBe(exported.metadata.arenaChecksum);
    expect(computeArenaChecksum(session.arena)).toBe(exported.metadata.arenaChecksum);
  });

  it('the exported profile bundle equals the generated client bundle', () => {
    const exported = buildProfileBundleExport('map.arena400Primary', bundle);
    const generated = GENERATED_MAP_PROFILES['map.arena400Primary'];
    expect(exported.bundles.map).toEqual(generated.map);
    expect(exported.bundles.terrainProfile).toEqual(generated.terrainProfile);
    expect(exported.bundles.furnitureSet).toEqual(generated.furnitureSet);
  });
});
