import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { resolveDefaultMapProfileId, resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { selectArenaSessionFromPack } from '../../src/shared/mapgen/arenaSession';
import { DEFAULT_MAP_PROFILE_ID } from '../../src/generated/mapProfiles.generated';
import { buildGeneratedMapProfiles } from '../../scripts/generate-map-profile-bundle';
import { validateProfileBundle } from '../../scripts/apply-maplab-profile';
import { handleApplyRequest } from '../../scripts/maplab-apply-server';
import { buildProfileBundleExport } from '../../tools/maplab/src/io/export';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

function tempContentRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'maplab-select-'));
  cpSync(CONTENT_ROOT, dir, { recursive: true });
  return dir;
}

function setModeMap(root: string, mapProfileId: string): void {
  const modePath = path.join(root, 'modes', 'demoScoreAttack.json');
  const mode = JSON.parse(readFileSync(modePath, 'utf8')) as Record<string, unknown>;
  mode.mapProfileId = mapProfileId;
  writeFileSync(modePath, `${JSON.stringify(mode, null, 2)}\n`, 'utf8');
}

describe('map profile selection (mode-driven)', () => {
  it('the default profile comes from the active mode definition', { timeout: 30_000 }, () => {
    expect(DEFAULT_MAP_PROFILE_ID).toBe('map.urban400Prototype');
    expect(resolveDefaultMapProfileId(pack)).toBe(DEFAULT_MAP_PROFILE_ID);
  });

  it('resolves a map from an explicitly selected gameplay mode', () => {
    expect(resolveDefaultMapProfileId(pack, 'mode.mainStage')).toBe('map.urban400Prototype');
    expect(resolveDefaultMapProfileId(pack, 'mode.singlePlayerMainStage')).toBe('map.urban400Prototype');
    const multiplayer = selectArenaSessionFromPack(pack, {
      roomCode: 'MODE-MP',
      matchIndex: 0,
      modeId: 'mode.mainStage',
    });
    const singlePlayer = selectArenaSessionFromPack(pack, {
      roomCode: 'MODE-SP',
      matchIndex: 0,
      modeId: 'mode.singlePlayerMainStage',
    });
    expect(multiplayer.metadata.mapProfileId).toBe('map.urban400Prototype');
    expect(singlePlayer.metadata.mapProfileId).toBe('map.urban400Prototype');
  });

  it('selectArenaSessionFromPack loads the mode mapProfileId', { timeout: 30_000 }, () => {
    const root = tempContentRoot();
    try {
      setModeMap(root, 'map.fallbackLegacy');
      const local = loadContentPackFromFilesystem(root);
      expect(resolveDefaultMapProfileId(local)).toBe('map.fallbackLegacy');
      const session = selectArenaSessionFromPack(local, { roomCode: 'SELT01', matchIndex: 0 });
      expect(session.metadata.mapProfileId).toBe('map.fallbackLegacy');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a brand-new map id resolves through server and generated bundle', { timeout: 30_000 }, () => {
    const root = tempContentRoot();
    try {
      const mapDef = JSON.parse(readFileSync(path.join(root, 'maps', 'arena_400_primary.json'), 'utf8')) as { id: string };
      mapDef.id = 'map.labSel';
      writeFileSync(path.join(root, 'maps', 'lab_sel.json'), `${JSON.stringify(mapDef, null, 2)}\n`, 'utf8');
      const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as { pack: { files: { maps: string[] } } };
      manifest.pack.files.maps.push('maps/lab_sel.json');
      writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      setModeMap(root, 'map.labSel');

      const local = loadContentPackFromFilesystem(root);
      expect(resolveDefaultMapProfileId(local)).toBe('map.labSel');
      const session = selectArenaSessionFromPack(local, { roomCode: 'SELT02', matchIndex: 0 });
      expect(session.metadata.mapProfileId).toBe('map.labSel');
      expect(session.metadata.arenaFallbackUsed).toBe(false);

      const generated = buildGeneratedMapProfiles(root);
      expect(generated.defaultMapProfileId).toBe('map.labSel');
      expect(generated.bundles['map.labSel'].map.id).toBe('map.labSel');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Map Lab apply helper', () => {
  it('validate accepts good bundles and rejects bad ones', { timeout: 30_000 }, () => {
    const bundle = resolveMapBundle(pack, 'map.arena400Primary');
    const exportBundle = buildProfileBundleExport('map.arena400Primary', bundle);
    expect(validateProfileBundle(exportBundle).ok).toBe(true);
    expect(validateProfileBundle({ kind: 'nope' }).ok).toBe(false);
    expect(validateProfileBundle({ ...exportBundle, formatVersion: 99 }).ok).toBe(false);
    expect(validateProfileBundle({ ...exportBundle, bundles: { ...exportBundle.bundles, map: { ...exportBundle.bundles.map, furnitureSetId: 'missing.ref' } } }).ok).toBe(false);
  });

  it('saves a new profile and points the mode at it', { timeout: 30_000 }, () => {
    const root = tempContentRoot();
    try {
      const exportBundle = buildProfileBundleExport('map.arena400Primary', resolveMapBundle(pack, 'map.arena400Primary'));
      exportBundle.bundles.map.id = 'map.labApply';
      const result = handleApplyRequest(
        { kind: 'apply', bundle: exportBundle, overwrite: false, onlyMap: true, setModeMapProfile: true },
        { contentRoot: root, writeGenerated: false },
      );
      expect(result.ok, result.error).toBe(true);
      expect(result.changed).toContain('modes/demoScoreAttack.json');
      expect(result.changed).toContain('maps/lab_apply.json');
      const local = loadContentPackFromFilesystem(root);
      expect(resolveDefaultMapProfileId(local)).toBe('map.labApply');
      expect(local.has('maps', 'map.labApply')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('overwrite apply replaces the current profile', { timeout: 30_000 }, () => {
    const root = tempContentRoot();
    try {
      const exportBundle = buildProfileBundleExport('map.arena400Primary', resolveMapBundle(pack, 'map.arena400Primary'));
      const result = handleApplyRequest({ kind: 'apply', bundle: exportBundle, overwrite: true }, { contentRoot: root, writeGenerated: false });
      expect(result.ok).toBe(true);
      expect(result.changed).toContain('maps/arena_400_primary.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('conflicts are rejected without overwrite', { timeout: 30_000 }, () => {
    const root = tempContentRoot();
    try {
      const exportBundle = buildProfileBundleExport('map.arena400Primary', resolveMapBundle(pack, 'map.arena400Primary'));
      const result = handleApplyRequest({ kind: 'apply', bundle: exportBundle, overwrite: false }, { contentRoot: root, writeGenerated: false });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/conflict|exists/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
