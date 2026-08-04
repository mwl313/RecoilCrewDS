import { describe, expect, it } from 'vitest';
import { computeContentPackSourceHash, readContentPackSourceHash } from '../../scripts/generate-content-pack';

describe('generated content pack freshness', () => {
  it('src/generated/contentPack.generated.ts matches the validated content tree', () => {
    expect(readContentPackSourceHash()).toBe(computeContentPackSourceHash());
  });
});
