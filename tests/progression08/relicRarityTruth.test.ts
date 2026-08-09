import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentLoader } from '../../src/shared/content/contentLoader';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';
import { claimChest } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT_ROOT = path.join(ROOT, 'content');

function commonOnlyPack() {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.name.endsWith('.json')) files[relative] = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  (files['relic-pools/main.json'] as { relicIds: string[] }).relicIds = ['relic.magnet_core'];
  return new ContentLoader().loadFromRecords(manifest, files);
}

describe('relic rarity truth', () => {
  it('uses the selected relic rarity in offer, result, reveal, telemetry, and fallback debug', () => {
    const m = MatchRuntime.fromContentPack(commonOnlyPack(), 'rarity-fallback', 'none', 'mode.singlePlayerScoreAttack');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const offer = claimChest(m, chest, 1_000);
    expect(offer.candidates[0]).toEqual({ relicId: 'relic.magnet_core', rarity: 'common' });
    m.checkProgressionTimeout(1_401);
    expect(m.state.teamProgression.lastRelicResult).toMatchObject({ relicId: 'relic.magnet_core', rarity: 'common' });
    expect(m.state.teamProgression.activeSelection?.relicResult?.rarity).toBe('common');
    expect(m.systems.progression.telemetry.rarityDistribution.common).toBe(1);
    expect(m.systems.progression.telemetry.relicRarityResolutions).toEqual([
      expect.objectContaining({ resolvedRarity: 'common', fallbackUsed: true }),
    ]);
    expect(['epic', 'legendary']).toContain(
      m.systems.progression.telemetry.relicRarityResolutions[0]?.requestedRarity,
    );
  });
});
