import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import {
  DEFAULT_MAP_PROFILE_ID,
  GENERATED_MAP_PROFILES,
  MAP_PROFILE_SOURCE_HASH,
} from '../../src/generated/mapProfiles.generated';
import { resolveDefaultMapProfileId } from '../../src/shared/mapgen/profiles';
import {
  computeMapProfileSourceHash,
  readGeneratedSourceHash,
} from '../../scripts/generate-map-profile-bundle';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

describe('Map Lab single source of truth', () => {
  it('generated client bundles deep-equal server-resolved bundles', () => {
    for (const mapId of pack.ids('maps')) {
      expect(GENERATED_MAP_PROFILES[mapId], mapId).toEqual(resolveMapBundle(pack, mapId));
    }
  });

  it('detects a stale generated bundle', () => {
    expect(readGeneratedSourceHash()).toBe(MAP_PROFILE_SOURCE_HASH);
    expect(computeMapProfileSourceHash(CONTENT_ROOT)).toBe(MAP_PROFILE_SOURCE_HASH);
  });

  it('the default map profile id matches the server-resolved mode value', () => {
    expect(DEFAULT_MAP_PROFILE_ID).toBe(resolveDefaultMapProfileId(pack));
    expect(GENERATED_MAP_PROFILES[DEFAULT_MAP_PROFILE_ID]).toBeDefined();
  });

  it('no manual profile mirror remains in the client path', () => {
    const profiles = readFileSync(path.join(CONTENT_ROOT, '../src/shared/mapgen/profiles.ts'), 'utf8');
    const phase2 = readFileSync(path.join(CONTENT_ROOT, '../src/shared/mapgen/phase2Profiles.ts'), 'utf8');
    expect(profiles).not.toContain('LEGACY_MAP_DEFINITIONS');
    expect(phase2).not.toContain('LEGACY_MAP_LAYOUT_DEFINITIONS');
  });

  it('the generated module is plain data with no functions', () => {
    const moduleText = readFileSync(path.join(CONTENT_ROOT, '../src/generated/mapProfiles.generated.ts'), 'utf8');
    expect(moduleText).not.toMatch(/function /);
    expect(moduleText).toContain('AUTO-GENERATED');
  });
});
