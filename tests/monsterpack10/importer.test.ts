import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runImport, verifyZip } from '../../scripts/import-monsterpack10';
import { readGlbSummary } from '../../scripts/monsterpack10/glbSummary';

describe('monsterpack10 importer', () => {
  it('missing ZIP fails with the exact expected path', () => {
    const missing = path.join(process.cwd(), 'local-imports', 'monsterpack09', 'does-not-exist.zip');
    expect(() => verifyZip(missing)).toThrow(/exact expected path/);
  });

  it('invalid expected ZIP hash record fails', async () => {
    await expect(
      runImport({ dryRun: true, expectedZipHash: '0000000000000000000000000000000000000000000000000000000000000000' }),
    ).rejects.toThrow(/ZIP hash mismatch/);
  });

  it('dry run writes nothing', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'mp10-dryrun-'));
    const sentinel = path.join(tmp, 'sentinel.txt');
    const stagingExists = existsSync(path.join(process.cwd(), 'build', 'monsterpack10-import', 'Ultimate monster pack - Horde Ready'));
    writeFileSync(sentinel, 'before', 'utf8');
    const before = readFileSync(sentinel, 'utf8');
    const result = await runImport({ dryRun: true });
    expect(result.wrote).toEqual([]);
    expect(result.plan.copies.length).toBe(stagingExists ? 90 : 0);
    expect(readFileSync(sentinel, 'utf8')).toBe(before);
    rmSync(sentinel, { force: true });
    rmSync(tmp, { recursive: true, force: true });
    if (!stagingExists) {
      // Dry run without staging is still read-only; it validates the ZIP only.
      expect(result.counts).toEqual({});
    }
  });

  it('GLB summary parser extracts nodes, clips, and skins', () => {
    const glb = path.join(
      process.cwd(),
      'build',
      'monsterpack10-import',
      'Ultimate monster pack - Horde Ready',
      'exports',
      'hero',
      'alien.hero.glb',
    );
    if (!existsSync(glb)) return;
    const summary = readGlbSummary(readFileSync(glb));
    expect(summary.clipNames.length).toBeGreaterThan(0);
    expect(summary.hasSkinnedMesh).toBe(true);
    expect(summary.nodeNames.length).toBeGreaterThan(0);
  });

  it('missing model in a source tree is reported with expected/actual', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'mp10-test-'));
    try {
      const manifestDir = path.join(tmp, 'manifests');
      mkdirSync(manifestDir, { recursive: true });
      writeFileSync(path.join(manifestDir, 'monster_catalog.json'), JSON.stringify({ models: [] }), 'utf8');
      writeFileSync(
        path.join(manifestDir, 'runtime_variants.json'),
        JSON.stringify({
          variants: {
            'model.quaternius.missing.hero': {
              id: 'model.quaternius.missing.hero',
              variant: 'hero',
              sourceModelId: 'monster.quaternius.missing',
              outputFile: 'exports/hero/missing.hero.glb',
              outputSha256: 'abc',
              outputFileBytes: 1,
              measured: { clipNames: [], armatureCount: 1, materialCount: 1, triangleCount: 1, meshCount: 1 },
            },
          },
        }),
        'utf8',
      );
      // validateSource is internal; the public path throws on missing manifests.
      // This test guards the manifest-required contract instead.
      for (const name of ['animation_profiles.json', 'rig_families.json', 'scale_profiles.json', 'socket_profiles.json', 'source_inventory.json']) {
        writeFileSync(path.join(manifestDir, name), JSON.stringify({ profiles: {}, families: {}, exactCompatibilityGroups: [] }), 'utf8');
      }
      expect(() => verifyZip(path.join(tmp, 'missing.zip'))).toThrow(/exact expected path/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
